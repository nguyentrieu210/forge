import test from "node:test";
import assert from "node:assert/strict";
import { QueryCompiler } from "../dist/packages/query/src/index.js";

test("RC-020 General Ledger and Trial Balance bind tenant/company/branch server-side", () => {
  const compiler = new QueryCompiler();
  for (const report of ["General Ledger", "Trial Balance"]) {
    const compiled = compiler.compile({
      report,
      tenant_id: "tenant-a",
      filters: [
        { field: "company", operator: "=", value: "COMP-A" },
        { field: "branch", operator: "=", value: "BR-A" },
      ],
    }, true);

    assert.match(compiled.sql, /"tenant_id"=\?1/);
    assert.match(compiled.sql, /"company" = \?2/);
    assert.match(compiled.sql, /"branch" = \?3/);
    assert.deepEqual(compiled.params.slice(0, 3), ["tenant-a", "COMP-A", "BR-A"]);
    assert.ok(compiled.columns.some((column) => column.field === "company"));
    assert.ok(compiled.columns.some((column) => column.field === "branch"));
  }
});

test("RC-020 finance GL integrity exceptions are queryable without raw ledger access", () => {
  const compiled = new QueryCompiler().compile({
    report: "Finance GL Integrity Exceptions",
    tenant_id: "tenant-a",
    filters: [
      { field: "severity", operator: "=", value: "CRITICAL" },
      { field: "company", operator: "=", value: "COMP-A" },
      { field: "branch", operator: "=", value: "BR-A" },
    ],
  }, true);

  assert.match(compiled.sql, /finance_gl_integrity_exceptions/);
  assert.deepEqual(compiled.params.slice(0, 4), ["tenant-a", "CRITICAL", "COMP-A", "BR-A"]);
  assert.ok(compiled.columns.some((column) => column.field === "code"));
  assert.ok(compiled.columns.some((column) => column.field === "details"));
});

test("RC-020 report query rejects unapproved raw ledger fields", () => {
  assert.throws(
    () => new QueryCompiler().compile({
      report: "General Ledger",
      tenant_id: "tenant-a",
      filters: [{ field: "dimensions_json", operator: "like", value: "%BR-B%" }],
    }, true),
    (error) => error?.code === "VALIDATION_ERROR",
  );
});
