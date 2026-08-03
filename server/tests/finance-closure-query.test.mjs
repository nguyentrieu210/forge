import test from "node:test";
import assert from "node:assert/strict";
import { FinanceClosureQueryCompiler } from "../dist/packages/query/src/finance-closure.js";

const compiler = new FinanceClosureQueryCompiler();
const company = { field: "company", operator: "=", value: "Demo Company" };
const ledgerDate = { field: "ledger_date", operator: "=", value: "2026-08-04" };
const asOf = { field: "as_of_date", operator: "=", value: "2026-08-04" };

test("daily detailed ledger is a tenant/company scoped GL projection with deterministic opening movement closing", () => {
  const compiled = compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [
      ledgerDate,
      company,
      { field: "branch", operator: "=", value: "HN" },
      { field: "account", operator: "=", value: "1110-Cash" },
      { field: "currency", operator: "=", value: "VND" },
    ],
  });

  assert.match(compiled.sql, /FROM gl_entries g/);
  assert.match(compiled.sql, /g\.tenant_id=\?1/);
  assert.match(compiled.sql, /json_extract\(d\.payload_json,'\$\.company'\)=\?2/);
  assert.match(compiled.sql, /date\(g\.posting_at\)<=date\(\?3\)/);
  assert.match(compiled.sql, /date\(posting_at\)<date\(\?3\)/);
  assert.match(compiled.sql, /SUM\(debit_minor-credit_minor\) OVER/);
  assert.match(compiled.sql, /ORDER BY posting_at,voucher_type,voucher_no,voucher_revision,line_key/);
  assert.match(compiled.sql, /0 AS row_order,'Opening' AS row_kind/);
  assert.match(compiled.sql, /1,'Movement'/);
  assert.match(compiled.sql, /2,'Closing'/);
  assert.match(compiled.sql, /opening\.opening_balance_minor\+period\.period_running_minor/);
  assert.match(compiled.sql, /g\.dimensions_json/);
  assert.ok(!compiled.sql.includes("daily_ledger_snapshots"));
  assert.ok(!compiled.sql.includes("daily_ledger_adjustments"));
  assert.deepEqual(compiled.params.slice(0, 6), [
    "tenant-a", "Demo Company", "2026-08-04", "HN", "1110-Cash", "VND",
  ]);
});

test("daily detailed ledger fails closed on missing scope, invalid date and unsafe filters", () => {
  assert.throws(() => compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [ledgerDate],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [{ field: "ledger_date", operator: "=", value: "2026-02-31" }, company],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Daily Detailed Ledger",
    tenant_id: "tenant-a",
    filters: [ledgerDate, company, { field: "payload_json", operator: "like", value: "%x%" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("finance reconciliation diagnostics compares AR/AP Payment Ledger with GL and surfaces GL/bank invariant violations", () => {
  const compiled = compiler.compile({
    report: "Finance Reconciliation Diagnostics",
    tenant_id: "tenant-a",
    filters: [
      asOf,
      company,
      { field: "domain", operator: "in", value: ["AR", "AP", "GL", "BANK"] },
      { field: "status", operator: "=", value: "Mismatch" },
    ],
  });

  assert.match(compiled.sql, /payment_ledger_entries p/);
  assert.match(compiled.sql, /gl_entries g/);
  assert.match(compiled.sql, /finance_gl_reconciliation r/);
  assert.match(compiled.sql, /bank_reconciliation_entries e/);
  assert.match(compiled.sql, /p\.account_type='Receivable' AND p\.party_type='Customer'/);
  assert.match(compiled.sql, /p\.account_type='Payable' AND p\.party_type='Supplier'/);
  assert.match(compiled.sql, /WHEN 'Customer' THEN g\.debit_minor-g\.credit_minor/);
  assert.match(compiled.sql, /ELSE g\.credit_minor-g\.debit_minor/);
  assert.match(compiled.sql, /SUM\(p\.base_amount_minor\) AS source_balance_minor/);
  assert.match(compiled.sql, /LEFT JOIN master_records company_master/);
  assert.match(compiled.sql, /LEFT JOIN master_records currency_master/);
  assert.match(compiled.sql, /r\.difference_minor<>0/);
  assert.match(compiled.sql, /HAVING COALESCE\(SUM\(e\.amount_minor\),0\)<0/);
  assert.deepEqual(compiled.params.slice(0, 3), ["tenant-a", "2026-08-04", "Demo Company"]);
  assert.ok(!compiled.sql.includes("AR' OR 1=1"));
});

test("diagnostic output filters are parameterized and unsupported operators fail closed", () => {
  const injection = "AR' OR 1=1 --";
  const compiled = compiler.compile({
    report: "Finance Reconciliation Diagnostics",
    tenant_id: "tenant-a",
    filters: [asOf, company, { field: "domain", operator: "=", value: injection }],
  });
  assert.ok(!compiled.sql.includes(injection));
  assert.ok(compiled.params.includes(injection));

  assert.throws(() => compiler.compile({
    report: "Finance Reconciliation Diagnostics",
    tenant_id: "tenant-a",
    filters: [asOf, company, { field: "evidence", operator: "like", value: "%GL%" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("closure compiler preserves RC-022 and existing finance reports", () => {
  const supplier = compiler.compile({
    report: "Supplier Reconciliation",
    tenant_id: "tenant-a",
    filters: [asOf, company],
  });
  assert.match(supplier.sql, /payment_ledger_entries p/);
  assert.match(supplier.sql, /gl_entries g/);

  const aging = compiler.compile({
    report: "Accounts Receivable Aging",
    tenant_id: "tenant-a",
    filters: [asOf, company],
  });
  assert.match(aging.sql, /p\.account_type='Receivable'/);
});
