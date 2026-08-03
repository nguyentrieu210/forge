import test from "node:test";
import assert from "node:assert/strict";
import { FinanceReportCompiler } from "../dist/packages/query/src/finance-report-compiler.js";

const compiler = new FinanceReportCompiler();
const company = { field: "company", operator: "=", value: "Demo Company" };

test("Finance Daily Detailed Ledger maps to the GL book projection", () => {
  const compiled = compiler.compile({
    report: "Finance Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [
      { field: "ledger_date", operator: "=", value: "2026-08-04" },
      company,
      { field: "branch", operator: "=", value: "HN" },
    ],
  });
  assert.match(compiled.sql, /FROM gl_entries g/);
  assert.match(compiled.sql, /0 AS row_order,'Opening' AS row_kind/);
  assert.match(compiled.sql, /2,'Closing'/);
});

test("generic Query Worker refuses the legacy Daily Detailed Ledger identity", () => {
  assert.throws(() => compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [
      { field: "ledger_date", operator: "=", value: "2026-08-04" },
      company,
    ],
  }), (error) => error.code === "VALIDATION_ERROR" && /tenant-worker snapshot API/.test(error.message));
});

test("public finance compiler preserves diagnostics and stock controls", () => {
  const diagnostics = compiler.compile({
    report: "Finance Reconciliation Diagnostics",
    tenant_id: "tenant-a",
    filters: [
      { field: "as_of_date", operator: "=", value: "2026-08-04" },
      company,
    ],
  });
  assert.match(diagnostics.sql, /payment_ledger_entries p/);

  const stock = compiler.compile({
    report: "Stock Valuation Reconciliation",
    tenant_id: "tenant-a",
    filters: [
      { field: "as_of_date", operator: "=", value: "2026-08-04" },
      company,
    ],
  });
  assert.match(stock.sql, /stock_ledger_entries s/);
});
