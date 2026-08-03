import assert from "node:assert/strict";
import test from "node:test";

import {
  CapaController,
  ManufacturingCalibrationRecordController,
  NonConformanceReportController,
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
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
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
      command_id: "cmd-1",
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
    now: "2026-08-03T00:00:00.000Z",
    reader: {
      async hasMasterRecord(_tenant, doctype, value) { return masters.has(`${doctype}:${value}`); },
      async getDocument(_tenant, doctype, value) { return docs[`${doctype}:${value}`] ?? null; },
      async listDocumentsByDoctype(_tenant, doctype) { return lists[doctype] ?? []; },
    },
  };
}

function planInput(overrides = {}) {
  return {
    company: "ACME",
    plan_name: "Incoming aluminium",
    inspection_type: "Incoming",
    item_code: "ITEM-1",
    effective_from: "2026-08-01",
    sampling_method: "Fixed",
    sample_size: 5,
    parameters: [
      { row_id: "P1", specification: "Width", parameter_type: "Numeric", minimum: "9.5", maximum: "10.5" },
      { row_id: "P2", specification: "Surface", parameter_type: "Pass/Fail" },
    ],
    ...overrides,
  };
}

test("Quality Plan normalizes fixed-point limits and evaluates readings deterministically", async () => {
  const controller = new QualityPlanController();
  const normalized = await controller.normalize(context(planInput()));
  assert.equal(normalized.parameters[0].minimum, "9.500000");
  assert.equal(normalized.parameters[0].maximum, "10.500000");
  assert.equal(normalized.parameters[0].mandatory, true);

  const evaluation = evaluateQualityPlan(normalized, [
    { specification: "Width", value: "10.1" },
    { specification: "Surface", accepted: 1 },
  ]);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.failed, 0);

  const failed = evaluateQualityPlan(normalized, [
    { specification: "Width", value: "11" },
    { specification: "Surface", accepted: 1 },
  ]);
  assert.equal(failed.passed, false);
  assert.equal(failed.rows[0].reason, "OUT_OF_LIMITS");
});

test("Quality Plan rejects overlapping submitted active plan for identical scope", async () => {
  const existing = document("Quality Plan", "QP-OLD", {
    ...planInput(),
    effective_from: "2026-07-01",
    effective_to: "2026-12-31",
    is_active: true,
  });
  const controller = new QualityPlanController();
  await assert.rejects(
    () => controller.normalize(context(planInput(), { action: "submit", lists: { "Quality Plan": [existing] } })),
    /overlaps an Active plan/,
  );
});

test("NCR can submit from a rejected Quality Inspection and rejects an accepted source", async () => {
  const controller = new NonConformanceReportController();
  const base = {
    company: "ACME",
    posting_at: "2026-08-03T01:00:00Z",
    source_inspection: "QI-1",
    item_code: "ITEM-1",
    severity: "Major",
    defect_category: "Dimension",
    description: "Outside tolerance",
    disposition: "Hold",
    owner_user: "quality@example.com",
  };
  const rejectedInspection = document("Quality Inspection", "QI-1", { status: "Rejected", item_code: "ITEM-1", readings: [] });
  const normalized = await controller.normalize(context(base, {
    action: "submit",
    docs: { "Quality Inspection:QI-1": rejectedInspection },
  }));
  assert.equal(normalized.severity, "Major");
  assert.equal(normalized.posting_at, "2026-08-03T01:00:00.000Z");

  const acceptedInspection = document("Quality Inspection", "QI-1", { status: "Accepted", item_code: "ITEM-1", readings: [] });
  await assert.rejects(
    () => controller.normalize(context(base, { action: "submit", docs: { "Quality Inspection:QI-1": acceptedInspection } })),
    /must be Rejected/,
  );
});

test("NCR cancellation is blocked while submitted RCA or CAPA dependents exist", async () => {
  const controller = new NonConformanceReportController();
  const rca = document("Root Cause Analysis", "RCA-1", { ncr: "NCR-1" });
  await assert.rejects(
    () => controller.ledgers(context({}, { action: "cancel", name: "NCR-1", lists: { "Root Cause Analysis": [rca] } })),
    /Cancel submitted Root Cause Analysis/,
  );
});

test("RCA submit requires a submitted NCR in the same company", async () => {
  const controller = new RootCauseAnalysisController();
  const input = {
    company: "ACME",
    ncr: "NCR-1",
    analysis_method: "5 Why",
    root_cause: "Fixture drift",
    analyzed_by: "quality@example.com",
    analyzed_at: "2026-08-03T02:00:00Z",
  };
  const ncr = document("Non Conformance Report", "NCR-1", { company: "ACME" });
  const normalized = await controller.normalize(context(input, { action: "submit", docs: { "Non Conformance Report:NCR-1": ncr } }));
  assert.equal(normalized.analysis_method, "5 Why");
});

test("CAPA stays open until implementation and an Effective verification allow final submit", async () => {
  const controller = new CapaController();
  const ncr = document("Non Conformance Report", "NCR-1", { company: "ACME" });
  const rca = document("Root Cause Analysis", "RCA-1", { company: "ACME", ncr: "NCR-1" });
  const base = {
    company: "ACME",
    ncr: "NCR-1",
    root_cause_analysis: "RCA-1",
    action_type: "Corrective",
    action_description: "Replace fixture and retrain operator",
    owner_user: "quality@example.com",
    opened_at: "2026-08-03T03:00:00Z",
    due_date: "2026-08-10",
    verification_criteria: "Three consecutive lots within tolerance",
  };
  await assert.rejects(
    () => controller.normalize(context(base, {
      action: "submit",
      docs: { "Non Conformance Report:NCR-1": ncr, "Root Cause Analysis:RCA-1": rca },
    })),
    /can close only after implementation/,
  );

  const closed = await controller.normalize(context({
    ...base,
    implemented_at: "2026-08-05T03:00:00Z",
    verified_at: "2026-08-07T03:00:00Z",
    verification_result: "Effective",
    closure_note: "Verification passed",
  }, {
    action: "submit",
    docs: { "Non Conformance Report:NCR-1": ncr, "Root Cause Analysis:RCA-1": rca },
  }));
  assert.equal(closed.verification_result, "Effective");
  assert.equal(controller.status(context(closed, { action: "submit" }), closed), "Closed");
});

test("CAPA cannot close on an Ineffective verification", async () => {
  const controller = new CapaController();
  const ncr = document("Non Conformance Report", "NCR-1", { company: "ACME" });
  const input = {
    company: "ACME", ncr: "NCR-1", action_type: "Corrective", action_description: "Adjust process",
    owner_user: "quality@example.com", opened_at: "2026-08-03T03:00:00Z", due_date: "2026-08-10",
    verification_criteria: "No repeat defect", implemented_at: "2026-08-05T03:00:00Z",
    verified_at: "2026-08-07T03:00:00Z", verification_result: "Ineffective", closure_note: "Defect repeated",
  };
  await assert.rejects(
    () => controller.normalize(context(input, { action: "submit", docs: { "Non Conformance Report:NCR-1": ncr } })),
    /can close only after implementation/,
  );
});

test("Calibration requires next due date after calibration and produces Failed status when result fails", async () => {
  const controller = new ManufacturingCalibrationRecordController();
  const input = {
    company: "ACME",
    instrument_id: "CALIPER-01",
    calibration_date: "2026-08-03",
    next_due_date: "2027-08-03",
    standard_reference: "ISO traceable block set",
    result: "Fail",
    performed_by: "quality@example.com",
  };
  const normalized = await controller.normalize(context(input, { action: "submit" }));
  assert.equal(controller.status(context(normalized, { action: "submit" }), normalized), "Failed");
  await assert.rejects(
    () => controller.normalize(context({ ...input, next_due_date: "2026-08-03" })),
    /must be after calibration_date/,
  );
});

test("Calibration validates Asset as a submitted canonical document in the same company", async () => {
  const controller = new ManufacturingCalibrationRecordController();
  const input = {
    company: "ACME",
    instrument_id: "CALIPER-02",
    asset: "ASSET-1",
    calibration_date: "2026-08-03",
    next_due_date: "2027-08-03",
    standard_reference: "Gauge blocks",
    result: "Pass",
    performed_by: "quality@example.com",
  };
  const asset = document("Asset", "ASSET-1", { company: "ACME", asset_name: "Caliper" }, 1);
  const normalized = await controller.normalize(context(input, {
    action: "submit",
    docs: { "Asset:ASSET-1": asset },
  }));
  assert.equal(normalized.asset, "ASSET-1");

  const foreignAsset = document("Asset", "ASSET-1", { company: "OTHER" }, 1);
  await assert.rejects(
    () => controller.normalize(context(input, { action: "submit", docs: { "Asset:ASSET-1": foreignAsset } })),
    /belongs to another company/,
  );

  const draftAsset = document("Asset", "ASSET-1", { company: "ACME" }, 0);
  await assert.rejects(
    () => controller.normalize(context(input, { action: "submit", docs: { "Asset:ASSET-1": draftAsset } })),
    /must be submitted and Active/,
  );
});
