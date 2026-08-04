import assert from "node:assert/strict";
import test from "node:test";

import {
  CapaController,
  NonConformanceReportController,
  QualityInspectionController,
  QualityPlanController,
  RootCauseAnalysisController,
  evaluateQualityPlan,
} from "../dist/packages/clouderp-erpnext/src/index.js";

function document(doctype, name, data, docstatus = 1) {
  return {
    tenant_id: "tenant-a",
    doctype,
    name,
    owner: "quality@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : "Draft",
    version: 1,
    created_at: "2026-08-04T00:00:00.000Z",
    modified_at: "2026-08-04T00:00:00.000Z",
    children: [],
    data,
  };
}

function context(input, {
  action = "create",
  name = "DOC-1",
  docs = {},
  lists = {},
  masters = new Set(["Company:ACME", "Item:ITEM-1"]),
} = {}) {
  return {
    command: {
      schema_version: 1,
      command_id: `cmd-${name}-${action}`,
      tenant_id: "tenant-a",
      aggregate: { doctype: "X", name },
      action,
      expected_version: null,
      payload_hash: "hash",
      document: input,
      actor: { user_id: "quality@example.com", roles: ["Quality Manager"] },
    },
    existing: null,
    nextVersion: 1,
    now: "2026-08-04T00:00:00.000Z",
    reader: {
      async hasMasterRecord(_tenant, doctype, value) { return masters.has(`${doctype}:${value}`); },
      async getDocument(_tenant, doctype, value) { return docs[`${doctype}:${value}`] ?? null; },
      async listDocumentsByDoctype(_tenant, doctype) { return lists[doctype] ?? []; },
    },
  };
}

function qualityPlanInput() {
  return {
    company: "ACME",
    plan_name: "RC4 mixed inspection",
    inspection_type: "Final",
    item_code: "ITEM-1",
    effective_from: "2026-08-01",
    sampling_method: "100%",
    parameters: [
      {
        row_id: "P1",
        specification: "Width",
        parameter_type: "Numeric",
        minimum: "9.5",
        maximum: "10.5",
      },
      {
        row_id: "P2",
        specification: "Surface",
        parameter_type: "Pass/Fail",
      },
      {
        row_id: "P3",
        specification: "Finish",
        parameter_type: "Text",
        accepted_value: "Matte",
      },
    ],
  };
}

test("RC4 A13 evaluates Numeric, Pass/Fail and Text plan evidence deterministically", async () => {
  const controller = new QualityPlanController();
  const plan = await controller.normalize(context(qualityPlanInput(), { action: "submit", name: "QP-1" }));

  const accepted = evaluateQualityPlan(plan, [
    { specification: "Width", value: "10.25" },
    { specification: "Surface", accepted: true },
    { specification: "Finish", text_value: " matte " },
  ]);
  assert.equal(accepted.passed, true);
  assert.equal(accepted.failed, 0);

  const rejected = evaluateQualityPlan(plan, [
    { specification: "Width", value: "10.25" },
    { specification: "Surface", accepted: true },
    { specification: "Finish", text_value: "Gloss" },
  ]);
  assert.equal(rejected.passed, false);
  assert.equal(rejected.failed, 1);
  assert.equal(rejected.rows[2].reason, "TEXT_REJECTED");
});

test("RC4 A13 closes rejected inspection -> NCR -> RCA -> effective CAPA and blocks parent cancellation", async () => {
  const inspectionController = new QualityInspectionController();
  const inspectionData = await inspectionController.normalize(context({
    inspection_type: "In Process",
    item_code: "ITEM-1",
    posting_at: "2026-08-04T01:00:00Z",
    readings: [
      { row_id: "R1", specification: "Width", value: "11", minimum: "9.5", maximum: "10.5" },
    ],
  }, { action: "submit", name: "QI-1" }));
  assert.equal(inspectionData.status, "Rejected");
  const inspection = document("Quality Inspection", "QI-1", inspectionData);

  const ncrController = new NonConformanceReportController();
  const ncrData = await ncrController.normalize(context({
    company: "ACME",
    posting_at: "2026-08-04T01:30:00Z",
    source_inspection: "QI-1",
    item_code: "ITEM-1",
    severity: "Major",
    defect_category: "Dimension",
    description: "Width outside final tolerance",
    disposition: "Hold",
    owner_user: "quality@example.com",
  }, {
    action: "submit",
    name: "NCR-1",
    docs: { "Quality Inspection:QI-1": inspection },
  }));
  const ncr = document("Non Conformance Report", "NCR-1", ncrData);

  const rcaController = new RootCauseAnalysisController();
  const rcaData = await rcaController.normalize(context({
    company: "ACME",
    ncr: "NCR-1",
    analysis_method: "5 Why",
    root_cause: "Fixture drift",
    analyzed_by: "quality@example.com",
    analyzed_at: "2026-08-04T02:00:00Z",
  }, {
    action: "submit",
    name: "RCA-1",
    docs: { "Non Conformance Report:NCR-1": ncr },
  }));
  const rca = document("Root Cause Analysis", "RCA-1", rcaData);

  const capaController = new CapaController();
  const capaData = await capaController.normalize(context({
    company: "ACME",
    ncr: "NCR-1",
    root_cause_analysis: "RCA-1",
    action_type: "Corrective",
    action_description: "Replace fixture and verify three consecutive lots",
    owner_user: "quality@example.com",
    opened_at: "2026-08-04T02:30:00Z",
    due_date: "2026-08-11",
    verification_criteria: "Three consecutive lots within tolerance",
    implemented_at: "2026-08-05T02:30:00Z",
    verified_at: "2026-08-07T02:30:00Z",
    verification_result: "Effective",
    closure_note: "Three consecutive lots passed",
  }, {
    action: "submit",
    name: "CAPA-1",
    docs: {
      "Non Conformance Report:NCR-1": ncr,
      "Root Cause Analysis:RCA-1": rca,
    },
  }));
  assert.equal(capaController.status(context(capaData, { action: "submit", name: "CAPA-1" }), capaData), "Closed");
  const capa = document("CAPA", "CAPA-1", capaData);

  await assert.rejects(
    () => ncrController.ledgers(context(ncrData, {
      action: "cancel",
      name: "NCR-1",
      lists: { CAPA: [capa] },
    })),
    /Cancel submitted CAPA/,
  );
  await assert.rejects(
    () => rcaController.ledgers(context(rcaData, {
      action: "cancel",
      name: "RCA-1",
      lists: { CAPA: [capa] },
    })),
    /Cancel submitted CAPA/,
  );
});

test("RC4 A13 pins the persisted qualitative Quality Inspection residual as fail-closed", async () => {
  const controller = new QualityInspectionController();
  await assert.rejects(() => controller.normalize(context({
    inspection_type: "In Process",
    item_code: "ITEM-1",
    posting_at: "2026-08-04T03:00:00Z",
    readings: [
      { row_id: "R1", specification: "Surface", parameter_type: "Pass/Fail", accepted: true },
    ],
  }, { action: "submit", name: "QI-QUAL-1" })));
});
