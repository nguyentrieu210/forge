import test from "node:test";
import assert from "node:assert/strict";
import { D1CommercialReconciliationService } from "../dist/packages/document-kernel/src/index.js";

class FakeStatement {
  constructor(sql, rows) { this.sql = sql; this.rows = rows; }
  bind() { return this; }
  async all() {
    if (this.sql.includes("HAVING SUM(debit_minor)<>SUM(credit_minor)")) return { results: this.rows.gl ?? [] };
    if (this.sql.includes("SUM(base_amount_minor) AS base_outstanding_minor")) return { results: this.rows.receivable ?? [] };
    if (this.sql.includes("gl_balance_minor")) return { results: this.rows.receivableGl ?? [] };
    if (this.sql.includes("expected_posting_at")) return { results: this.rows.posting ?? [] };
    if (this.sql.includes("LEFT JOIN documents")) return { results: this.rows.orphan ?? [] };
    if (this.sql.includes("status='failed'")) return { results: this.rows.outbox ?? [] };
    throw new Error(`Unexpected reconciliation SQL: ${this.sql}`);
  }
}

class FakeD1 {
  constructor(rows = {}) { this.rows = rows; }
  prepare(sql) { return new FakeStatement(sql, this.rows); }
}

test("commercial reconciliation returns a clean bounded report", async () => {
  const report = await new D1CommercialReconciliationService(new FakeD1(), 10).run("demo", "2026-07-25T00:00:00.000Z");
  assert.equal(report.ok, true);
  assert.equal(report.tenant_id, "demo");
  assert.equal(report.findings.length, 0);
  assert.deepEqual(report.counts, {
    gl_imbalance: 0,
    receivable_drift: 0,
    receivable_gl_mismatch: 0,
    posting_date_mismatch: 0,
    orphan_reference: 0,
    outbox_failure: 0,
  });
});

test("commercial reconciliation classifies accounting and delivery drift without mutating data", async () => {
  const db = new FakeD1({
    gl: [{ voucher_type: "Sales Invoice", voucher_no: "SI-1", voucher_revision: 2, debit_minor: 100, credit_minor: 99 }],
    receivable: [{ against_voucher_type: "Sales Invoice", against_voucher_no: "SI-2", outstanding_minor: 0, base_outstanding_minor: 1 }],
    receivableGl: [{ account: "Debtors", party: "CUST-1", gl_balance_minor: 2, ple_base_outstanding_minor: 1 }],
    posting: [{ ledger: "GL", voucher_type: "Payment Entry", voucher_no: "PE-1", posting_at: "2026-07-25", expected_posting_at: "2026-07-20" }],
    orphan: [{ against_voucher_type: "Sales Invoice", against_voucher_no: "SI-MISSING" }],
    outbox: [{ event_id: "evt-1", event_type: "gl.posted", attempts: 5, occurred_at: "2026-07-20" }],
  });
  const report = await new D1CommercialReconciliationService(db, 10).run("demo");
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map((finding) => finding.category), [
    "GL_IMBALANCE",
    "RECEIVABLE_DRIFT",
    "RECEIVABLE_DRIFT",
    "POSTING_DATE_MISMATCH",
    "ORPHAN_REFERENCE",
    "OUTBOX_FAILURE",
  ]);
});
