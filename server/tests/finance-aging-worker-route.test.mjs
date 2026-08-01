import test from "node:test";
import assert from "node:assert/strict";
import queryWorker from "../dist/apps/query-worker/src/index.js";

function createFakeDatabase(row) {
  const capture = { sql: "", params: [] };
  const statement = {
    bind(...params) {
      capture.params = params;
      return this;
    },
    async all() {
      return { results: [row] };
    },
  };
  return {
    capture,
    db: {
      prepare(sql) {
        capture.sql = sql;
        return statement;
      },
    },
  };
}

test("Query Worker routes AR aging through FinanceQueryCompiler and D1ReportService", async () => {
  const expectedRow = {
    party: "CUST-WORKER",
    company: "Demo Company",
    account: "131-CONG-NO",
    currency: "VND",
    voucher_type: "Sales Invoice",
    voucher_no: "SI-AGING-WORKER-1",
    posting_date: "2026-06-01",
    due_date: "2026-07-10",
    due_date_source: "explicit",
    invoice_total: 1000,
    allocated_amount: 300,
    outstanding_amount: 700,
    days_overdue: 21,
    aging_bucket: "1–30 ngày",
  };
  const { db, capture } = createFakeDatabase(expectedRow);

  const response = await queryWorker.fetch(
    new Request("https://query.test/api/v1/reports/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        report: "Accounts Receivable Aging",
        filters: [
          { field: "as_of_date", operator: "=", value: "2026-07-31" },
          { field: "voucher_no", operator: "=", value: "SI-AGING-WORKER-1" },
        ],
      }),
    }),
    {
      DB: db,
      AUTH_MODE: "development",
      TENANT_ID: "demo",
      DEV_ACTOR_JSON: JSON.stringify({ user_id: "Administrator", roles: ["System Manager"] }),
    },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.prepared, false);
  assert.equal(body.report, "Accounts Receivable Aging");
  assert.equal(body.row_count, 1);
  assert.deepEqual(body.result, [expectedRow]);
  assert.ok(body.columns.some((column) => column.field === "due_date_source"));

  assert.match(capture.sql, /payment_ledger_entries/);
  assert.match(capture.sql, /finance_invoice_terms/);
  assert.match(capture.sql, /p\.tenant_id\s*=\s*\?1/);
  assert.match(capture.sql, /date\(p\.posting_at\)\s*<=\s*date\(\?2\)/);
  assert.deepEqual(capture.params.slice(0, 3), [
    "demo",
    "2026-07-31",
    "SI-AGING-WORKER-1",
  ]);
});

test("Query Worker returns validation error when aging cutoff is missing", async () => {
  const { db } = createFakeDatabase({});
  const response = await queryWorker.fetch(
    new Request("https://query.test/api/v1/reports/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ report: "Accounts Receivable Aging" }),
    }),
    {
      DB: db,
      AUTH_MODE: "development",
      TENANT_ID: "demo",
      DEV_ACTOR_JSON: JSON.stringify({ user_id: "Administrator", roles: ["System Manager"] }),
    },
  );

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, "VALIDATION_ERROR");
});
