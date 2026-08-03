import assert from "node:assert/strict";
import test from "node:test";

import { routeQmsApi } from "../dist/apps/tenant-worker/src/qms-api.js";

const EVALUATE = "https://tenant.test/api/method/metaforge.quality.evaluate_plan";
const KPI = "https://tenant.test/api/method/metaforge.quality.get_qms_kpis";

function doc(doctype, name, data, docstatus = 1, version = 1) {
  return {
    tenant_id: "tenant-a", doctype, name, owner: "quality@example.com", docstatus,
    status: docstatus === 1 ? "Submitted" : "Draft", version,
    created_at: "2026-08-01T00:00:00.000Z", modified_at: "2026-08-03T00:00:00.000Z", children: [], data,
  };
}

function plan() {
  return doc("Quality Plan", "QP-1", {
    company: "ACME", plan_name: "Plan 1", inspection_type: "Incoming", effective_from: "2026-08-01",
    effective_to: "2026-08-31", sampling_method: "100%", is_active: true,
    parameters: [
      { row_id: "P1", specification: "Width", parameter_type: "Numeric", minimum: "9.5", maximum: "10.5", mandatory: true },
      { row_id: "P2", specification: "Surface", parameter_type: "Pass/Fail", mandatory: true },
    ],
  });
}

function request(url, body) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function context({ qualityPlan = plan(), ncr = [], rca = [], capa = [], calibration = [], hidden = new Set() } = {}) {
  const permissionCalls = [];
  return {
    permissionCalls,
    value: {
      tenantId: "tenant-a",
      actor: { user_id: "quality@example.com", roles: ["Quality Manager"] },
      traceId: "trace-qms",
      now: () => "2026-08-20T00:00:00.000Z",
      permissions: {
        async assert(input) { permissionCalls.push(input); },
        async canReadDocument(_actor, _tenant, document) { return !hidden.has(document.name); },
      },
      async loadQualityPlan(name) { return name === "QP-1" ? qualityPlan : null; },
      async listNcr() { return ncr; },
      async listRca() { return rca; },
      async listCapa() { return capa; },
      async listCalibration() { return calibration; },
    },
  };
}

async function json(response) { return response.json(); }

test("QMS plan evaluation uses submitted active effective plan and deterministic limits", async () => {
  const ctx = context();
  const response = await routeQmsApi(request(EVALUATE, {
    quality_plan: "QP-1",
    evaluation_date: "2026-08-15",
    readings: [
      { specification: "Width", value: "10.25" },
      { specification: "Surface", accepted: 1 },
    ],
  }), new URL(EVALUATE), ctx.value);
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.equal(payload.message.passed, true);
  assert.equal(payload.message.failed, 0);
  assert.equal(payload.message.evaluation_date, "2026-08-15");
});

test("QMS plan evaluation rejects inactive, draft or out-of-effectivity plan", async () => {
  const ctx = context();
  await assert.rejects(
    () => routeQmsApi(request(EVALUATE, {
      quality_plan: "QP-1", evaluation_date: "2026-09-01", readings: [],
    }), new URL(EVALUATE), ctx.value),
    /not effective/,
  );

  const draft = plan();
  draft.docstatus = 0;
  const draftCtx = context({ qualityPlan: draft });
  await assert.rejects(
    () => routeQmsApi(request(EVALUATE, { quality_plan: "QP-1", readings: [] }), new URL(EVALUATE), draftCtx.value),
    /must be submitted and active/,
  );
});

test("QMS KPI reports actor-visible NCR CAPA and calibration metrics", async () => {
  const ncr = [
    doc("Non Conformance Report", "NCR-MAJOR", { company: "ACME", posting_at: "2026-08-02T00:00:00Z", severity: "Major" }),
    doc("Non Conformance Report", "NCR-CRITICAL", { company: "ACME", posting_at: "2026-08-03T00:00:00Z", severity: "Critical" }),
    doc("Non Conformance Report", "NCR-HIDDEN", { company: "ACME", posting_at: "2026-08-04T00:00:00Z", severity: "Critical" }),
  ];
  const rca = [doc("Root Cause Analysis", "RCA-1", { company: "ACME", ncr: "NCR-MAJOR", analyzed_at: "2026-08-05T00:00:00Z" })];
  const capa = [
    doc("CAPA", "CAPA-CLOSED", {
      company: "ACME", ncr: "NCR-MAJOR", opened_at: "2026-08-05T00:00:00Z", due_date: "2026-08-10",
      verified_at: "2026-08-08T00:00:00Z", verification_result: "Effective",
    }, 1),
    doc("CAPA", "CAPA-OVERDUE", {
      company: "ACME", ncr: "NCR-CRITICAL", opened_at: "2026-08-06T00:00:00Z", due_date: "2026-08-15",
    }, 0),
    doc("CAPA", "CAPA-INEFFECTIVE", {
      company: "ACME", ncr: "NCR-CRITICAL", opened_at: "2026-08-06T00:00:00Z", due_date: "2026-08-25",
      verified_at: "2026-08-18T00:00:00Z", verification_result: "Ineffective",
    }, 0),
  ];
  const calibration = [
    doc("Calibration Record", "CAL-OLD", { company: "ACME", instrument_id: "C-1", calibration_date: "2025-01-01", next_due_date: "2026-01-01", result: "Pass" }, 1, 1),
    doc("Calibration Record", "CAL-NEW", { company: "ACME", instrument_id: "C-1", calibration_date: "2026-01-02", next_due_date: "2027-01-02", result: "Pass" }, 1, 2),
    doc("Calibration Record", "CAL-FAIL", { company: "ACME", instrument_id: "C-2", calibration_date: "2026-08-10", next_due_date: "2026-08-19", result: "Fail" }),
    doc("Calibration Record", "CAL-SOON", { company: "ACME", instrument_id: "C-3", calibration_date: "2026-08-01", next_due_date: "2026-09-10", result: "Pass" }),
  ];
  const ctx = context({ ncr, rca, capa, calibration, hidden: new Set(["NCR-HIDDEN"]) });
  const response = await routeQmsApi(request(KPI, { company: "ACME", from_date: "2026-08-01", as_of: "2026-08-20" }), new URL(KPI), ctx.value);
  const payload = await json(response);
  assert.equal(payload.message.scope, "ACTOR_VISIBLE");
  assert.equal(payload.message.submitted_ncr_count, 2);
  assert.deepEqual(payload.message.ncr_by_severity, { Minor: 0, Major: 1, Critical: 1 });
  assert.equal(payload.message.submitted_rca_count, 1);
  assert.equal(payload.message.open_capa_count, 2);
  assert.equal(payload.message.overdue_capa_count, 1);
  assert.equal(payload.message.closed_capa_count, 1);
  assert.equal(payload.message.ineffective_verification_count, 1);
  assert.equal(payload.message.capa_effectiveness_pct, 50);
  assert.equal(payload.message.average_capa_close_days, 3);
  assert.equal(payload.message.calibration_fail_count, 1);
  assert.equal(payload.message.calibration_due_count, 1);
  assert.equal(payload.message.calibration_due_within_30_days_count, 1);
  assert.equal(ctx.permissionCalls.filter((call) => call.action === "report").length, 4);
});

test("QMS API rejects client-selected tenant scope", async () => {
  const ctx = context();
  await assert.rejects(
    () => routeQmsApi(request(KPI, { company: "ACME", tenant_id: "other" }), new URL(KPI), ctx.value),
    /tenant scope is controlled/,
  );
});
