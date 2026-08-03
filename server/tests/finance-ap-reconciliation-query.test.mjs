import test from "node:test";
import assert from "node:assert/strict";
import { AccountsPayableQueryCompiler } from "../dist/packages/query/src/ap-reconciliation.js";

const compiler = new AccountsPayableQueryCompiler();
const asOf = { field: "as_of_date", operator: "=", value: "2026-08-03" };
const company = { field: "company", operator: "=", value: "Demo Company" };

test("supplier statement is tenant/company scoped and uses AP debit-credit polarity", () => {
  const compiled = compiler.compile({
    report: "Supplier Statement",
    tenant_id: "tenant-a",
    filters: [
      company,
      { field: "party", operator: "=", value: "SUP-1' OR 1=1 --" },
      { field: "account", operator: "=", value: "2110-AP" },
      { field: "currency", operator: "=", value: "VND" },
      { field: "from_date", operator: "=", value: "2026-07-01" },
      { field: "to_date", operator: "=", value: "2026-08-03" },
    ],
  });

  assert.match(compiled.sql, /payment_ledger_entries p/);
  assert.match(compiled.sql, /p\.tenant_id=\?1/);
  assert.match(compiled.sql, /json_extract\(d\.payload_json,'\$\.company'\)=\?2/);
  assert.match(compiled.sql, /p\.party_type='Supplier'/);
  assert.match(compiled.sql, /p\.account_type='Payable'/);
  assert.match(compiled.sql, /period\.amount_minor<0 THEN -period\.amount_minor/);
  assert.match(compiled.sql, /period\.amount_minor>0 THEN period\.amount_minor/);
  assert.match(compiled.sql, /Payment Allocation/);
  assert.match(compiled.sql, /Debit Note/);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.deepEqual(compiled.params.slice(0, 7), [
    "tenant-a", "Demo Company", "SUP-1' OR 1=1 --", "2110-AP", "VND", "2026-07-01", "2026-08-03",
  ]);
});

test("supplier reconciliation compares canonical base payable ledger with Supplier GL control", () => {
  const compiled = compiler.compile({
    report: "Supplier Reconciliation",
    tenant_id: "tenant-a",
    filters: [
      asOf,
      company,
      { field: "party", operator: "=", value: "SUP-1" },
      { field: "status", operator: "=", value: "Mismatch" },
    ],
  });

  assert.match(compiled.sql, /SUM\(p\.base_amount_minor\) AS payable_ledger_balance_minor/);
  assert.match(compiled.sql, /SUM\(g\.credit_minor-g\.debit_minor\) AS gl_control_balance_minor/);
  assert.match(compiled.sql, /payment_ledger_entries p/);
  assert.match(compiled.sql, /gl_entries g/);
  assert.match(compiled.sql, /p\.tenant_id=\?1/);
  assert.match(compiled.sql, /g\.tenant_id=\?1/);
  assert.match(compiled.sql, /json_extract\(d\.payload_json,'\$\.company'\)=\?3/);
  assert.match(compiled.sql, /company_currency_scale/);
  assert.match(compiled.sql, /CASE keys\.currency_scale WHEN 0 THEN 1/);
  assert.match(compiled.sql, /THEN 'Reconciled'/);
  assert.match(compiled.sql, /ELSE 'Mismatch'/);
  assert.deepEqual(compiled.params.slice(0, 5), ["tenant-a", "2026-08-03", "Demo Company", "SUP-1", "Mismatch"]);
});

test("AP controls fail closed on missing scope, unsafe filters and invalid dates", () => {
  assert.throws(() => compiler.compile({
    report: "Supplier Statement",
    tenant_id: "tenant-a",
    filters: [
      { field: "party", operator: "=", value: "SUP-1" },
      { field: "account", operator: "=", value: "2110-AP" },
      { field: "currency", operator: "=", value: "VND" },
      { field: "from_date", operator: "=", value: "2026-07-01" },
      { field: "to_date", operator: "=", value: "2026-08-03" },
    ],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Supplier Reconciliation",
    tenant_id: "tenant-a",
    filters: [asOf, company, { field: "payload_json", operator: "like", value: "%x%" }],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    report: "Supplier Reconciliation",
    tenant_id: "tenant-a",
    filters: [{ field: "as_of_date", operator: "=", value: "2026-02-31" }, company],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("AP compiler preserves existing finance aging reports", () => {
  const compiled = compiler.compile({
    report: "Accounts Payable Aging",
    tenant_id: "tenant-a",
    filters: [asOf, company],
  });
  assert.match(compiled.sql, /p\.account_type='Payable'/);
  assert.match(compiled.sql, /t\.voucher_type='Purchase Invoice'/);
});
