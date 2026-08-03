import test from "node:test";
import assert from "node:assert/strict";
import { FinanceStockControlQueryCompiler } from "../dist/packages/query/src/finance-stock-control.js";

const compiler = new FinanceStockControlQueryCompiler();
const asOf = { field: "as_of_date", operator: "=", value: "2026-08-04" };
const company = { field: "company", operator: "=", value: "Demo Company" };

test("stock valuation reconciliation compares immutable Repost Item Valuation Stock Ledger and stock-account GL revisions", () => {
  const compiled = compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [
      asOf,
      company,
      { field: "warehouse", operator: "=", value: "Stores - DC" },
      { field: "status", operator: "=", value: "Mismatch" },
    ],
  });

  assert.match(compiled.sql, /FROM stock_ledger_entries s/);
  assert.match(compiled.sql, /FROM gl_entries g/);
  assert.match(compiled.sql, /s\.voucher_type='Repost Item Valuation'/);
  assert.match(compiled.sql, /g\.voucher_type='Repost Item Valuation'/);
  assert.match(compiled.sql, /json_extract\(d\.payload_json,'\$\.stock_account'\)/);
  assert.match(compiled.sql, /g\.account=json_extract\(d\.payload_json,'\$\.stock_account'\)/);
  assert.match(compiled.sql, /SUM\(s\.stock_value_difference_minor\) AS stock_value_delta_minor/);
  assert.match(compiled.sql, /SUM\(g\.debit_minor-g\.credit_minor\) AS gl_stock_delta_minor/);
  assert.match(compiled.sql, /voucher_revision/);
  assert.match(compiled.sql, /THEN 'Reconciled'/);
  assert.match(compiled.sql, /ELSE 'Mismatch'/);
  assert.deepEqual(compiled.params.slice(0, 5), [
    "tenant-a", "2026-08-04", "Demo Company", "Stores - DC", "Mismatch",
  ]);
});

test("stock valuation reconciliation is company scoped and parameterizes report filters", () => {
  const injection = "RIV-1' OR 1=1 --";
  const compiled = compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [asOf, company, { field: "voucher_no", operator: "=", value: injection }],
  });

  assert.match(compiled.sql, /s\.tenant_id=\?1/);
  assert.match(compiled.sql, /g\.tenant_id=\?1/);
  assert.match(compiled.sql, /json_extract\(d\.payload_json,'\$\.company'\)=\?3/);
  assert.ok(!compiled.sql.includes(injection));
  assert.ok(compiled.params.includes(injection));
});

test("stock valuation reconciliation rejects missing company, invalid date and unsafe filters", () => {
  assert.throws(() => compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [asOf],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [{ field: "as_of_date", operator: "=", value: "2026-02-31" }, company],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [asOf, company, { field: "payload_json", operator: "=", value: "x" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("stock control compiler preserves the finance closure reports", () => {
  const ledger = compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [
      { field: "ledger_date", operator: "=", value: "2026-08-04" },
      company,
    ],
  });
  assert.match(ledger.sql, /FROM gl_entries g/);

  const diagnostics = compiler.compile({
    report: "Finance Reconciliation Diagnostics",
    tenant_id: "tenant-a",
    filters: [asOf, company],
  });
  assert.match(diagnostics.sql, /payment_ledger_entries p/);
});
