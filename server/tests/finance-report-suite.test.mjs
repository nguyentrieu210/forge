import test from "node:test";
import assert from "node:assert/strict";

import { FinanceQueryCompiler } from "../dist/packages/query/src/finance-aging.js";

const compiler = new FinanceQueryCompiler();

test("Party Statement requires bounded party context and emits opening plus running balance", () => {
  const compiled = compiler.compile({
    report: "Party Statement",
    tenant_id: "demo",
    filters: [
      { field: "party", operator: "=", value: "CUST-1" },
      { field: "account", operator: "=", value: "131" },
      { field: "currency", operator: "=", value: "VND" },
      { field: "from_date", operator: "=", value: "2026-07-01" },
      { field: "to_date", operator: "=", value: "2026-07-31" },
      { field: "account_type", operator: "=", value: "Receivable" },
    ],
  });
  assert.match(compiled.sql, /Opening balance/);
  assert.match(compiled.sql, /SUM\(amount_minor\) OVER/);
  assert.match(compiled.sql, /against_voucher_no/);
  assert.deepEqual(compiled.params.slice(0, 7), [
    "demo", "CUST-1", "131", "VND", "2026-07-01", "2026-07-31", "Receivable",
  ]);
  assert.ok(compiled.columns.some((column) => column.field === "running_balance"));
});

test("Debt Summary nets invoice balances with advances at an as-of date", () => {
  const compiled = compiler.compile({
    report: "Debt Summary",
    tenant_id: "demo",
    filters: [
      { field: "as_of_date", operator: "=", value: "2026-07-31" },
      { field: "party", operator: "=", value: "SUP-1' OR 1=1 --" },
      { field: "account_type", operator: "=", value: "Payable" },
    ],
    order_by: [{ field: "net_exposure", direction: "desc" }],
  });
  assert.match(compiled.sql, /invoice_balances/);
  assert.match(compiled.sql, /advances/);
  assert.match(compiled.sql, /net_exposure/);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.equal(compiled.params[0], "demo");
  assert.equal(compiled.params[1], "2026-07-31");
  assert.equal(compiled.params[2], "SUP-1' OR 1=1 --");
});

test("Advance Balance is derived from append-only Payment Ledger rows", () => {
  const compiled = compiler.compile({
    report: "Advance Balance",
    tenant_id: "demo",
    filters: [
      { field: "as_of_date", operator: "=", value: "2026-08-01" },
      { field: "party", operator: "=", value: "CUST-1" },
    ],
  });
  assert.match(compiled.sql, /against_voucher_type='Payment Entry'/);
  assert.match(compiled.sql, /Payment Allocation/);
  assert.ok(compiled.columns.some((column) => column.field === "remaining_advance"));
});

test("finance controls reject missing or invalid dates", () => {
  assert.throws(() => compiler.compile({
    report: "Debt Summary",
    tenant_id: "demo",
    filters: [],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => compiler.compile({
    report: "Party Statement",
    tenant_id: "demo",
    filters: [
      { field: "party", operator: "=", value: "CUST-1" },
      { field: "account", operator: "=", value: "131" },
      { field: "currency", operator: "=", value: "VND" },
      { field: "from_date", operator: "=", value: "2026-02-31" },
      { field: "to_date", operator: "=", value: "2026-03-01" },
    ],
  }), (error) => error.code === "VALIDATION_ERROR");
});
