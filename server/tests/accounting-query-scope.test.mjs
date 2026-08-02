import test from "node:test";
import assert from "node:assert/strict";
import { QueryCompiler } from "../dist/packages/query/src/index.js";

const companyScopedReports = [
  "Accounts Receivable",
  "Accounts Payable",
  "General Ledger",
  "Trial Balance",
  "Profit and Loss",
  "Balance Sheet",
  "Cash Flow",
];

test("financial reports expose server-side company and branch scope", () => {
  const compiler = new QueryCompiler();
  for (const report of companyScopedReports) {
    const compiled = compiler.compile({
      report,
      tenant_id: "tenant-a",
      filters: [
        { field: "company", operator: "=", value: "COMP-A" },
        { field: "branch", operator: "=", value: "BR-A" },
      ],
    });
    assert.match(compiled.sql, /"tenant_id"=\?1/);
    assert.match(compiled.sql, /"company" = \?2/);
    assert.match(compiled.sql, /"branch" = \?3/);
    assert.deepEqual(compiled.params.slice(0, 3), ["tenant-a", "COMP-A", "BR-A"]);
    assert.ok(compiled.columns.some((column) => column.field === "company"), `${report} must expose company`);
    assert.ok(compiled.columns.some((column) => column.field === "branch"), `${report} must expose branch`);
  }
});

test("accounting integrity exceptions are queryable without raw ledger access", () => {
  const compiled = new QueryCompiler().compile({
    report: "Accounting Integrity Exceptions",
    tenant_id: "tenant-a",
    filters: [
      { field: "severity", operator: "=", value: "CRITICAL" },
      { field: "company", operator: "=", value: "COMP-A" },
    ],
  });
  assert.match(compiled.sql, /accounting_integrity_exceptions/);
  assert.equal(compiled.params[1], "CRITICAL");
  assert.equal(compiled.params[2], "COMP-A");
  assert.ok(compiled.columns.some((column) => column.field === "code"));
  assert.ok(compiled.columns.some((column) => column.field === "details"));
});

test("financial report scope still rejects unapproved raw fields", () => {
  assert.throws(() => new QueryCompiler().compile({
    report: "General Ledger",
    tenant_id: "tenant-a",
    filters: [{ field: "dimensions_json", operator: "like", value: "%COMP-B%" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});
