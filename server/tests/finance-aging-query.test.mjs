import test from "node:test";
import assert from "node:assert/strict";
import { FinanceQueryCompiler } from "../dist/packages/query/src/finance-aging.js";

const asOf = { field: "as_of_date", operator: "=", value: "2026-07-31" };

test("AR aging compiler binds tenant and cutoff and exposes aging columns", () => {
  const compiled = new FinanceQueryCompiler().compile({
    report: "Accounts Receivable Aging",
    tenant_id: "tenant-a",
    filters: [
      asOf,
      { field: "party", operator: "=", value: "CUST-1' OR 1=1 --" },
      { field: "aging_bucket", operator: "in", value: ["1–30 ngày", "31–60 ngày"] },
    ],
    order_by: [{ field: "days_overdue", direction: "desc" }],
    limit: 50,
  });

  assert.match(compiled.sql, /payment_ledger_entries/);
  assert.match(compiled.sql, /finance_invoice_terms/);
  assert.match(compiled.sql, /p\.tenant_id = \?1/);
  assert.match(compiled.sql, /date\(p\.posting_at\) <= date\(\?2\)/);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.deepEqual(compiled.params.slice(0, 5), [
    "tenant-a",
    "2026-07-31",
    "CUST-1' OR 1=1 --",
    "1–30 ngày",
    "31–60 ngày",
  ]);
  assert.ok(compiled.columns.some((column) => column.field === "days_overdue"));
  assert.ok(compiled.columns.some((column) => column.field === "aging_bucket"));
  assert.equal(compiled.prepared, false);
});

test("AP aging compiler uses payable ledger and purchase invoices", () => {
  const compiled = new FinanceQueryCompiler().compile({
    report: "Accounts Payable Aging",
    tenant_id: "tenant-a",
    filters: [asOf, { field: "company", operator: "=", value: "Demo" }],
  });

  assert.match(compiled.sql, /p\.account_type = 'Payable'/);
  assert.match(compiled.sql, /t\.voucher_type = 'Purchase Invoice'/);
  assert.equal(compiled.params[2], "Demo");
  assert.equal(compiled.columns[0].label, "Supplier");
});

test("aging compiler requires one valid as-of date and whitelisted filters", () => {
  const compiler = new FinanceQueryCompiler();
  assert.throws(() => compiler.compile({
    report: "Accounts Receivable Aging",
    tenant_id: "demo",
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => compiler.compile({
    report: "Accounts Receivable Aging",
    tenant_id: "demo",
    filters: [{ field: "as_of_date", operator: "=", value: "2026-02-31" }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => compiler.compile({
    report: "Accounts Receivable Aging",
    tenant_id: "demo",
    filters: [asOf, { field: "payload_json", operator: "like", value: "%x%" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("finance compiler preserves existing report behavior", () => {
  const compiled = new FinanceQueryCompiler().compile({
    report: "Accounts Receivable",
    tenant_id: "demo",
    filters: [{ field: "party", operator: "=", value: "CUST-1" }],
  });
  assert.match(compiled.sql, /receivable_outstanding/);
  assert.equal(compiled.params[1], "CUST-1");
});
