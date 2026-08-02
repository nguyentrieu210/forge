import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry, SemanticQueryCompiler } from "../dist/packages/semantic/src/index.js";

const financeModel = {
  id: "finance.daily_ledger",
  label: "Daily detailed ledger",
  description: "Trusted daily ledger semantic model",
  source: { kind: "view", name: "daily_detailed_ledger", tenantField: "tenant_id" },
  grain: "one immutable daily-ledger line",
  permission: { doctype: "Journal Entry", action: "report" },
  dimensions: [
    { id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" },
    { id: "account", label: "Account", field: "account", kind: "link", options: "Account" },
    { id: "currency", label: "Currency", field: "currency", kind: "currency" },
  ],
  metrics: [
    {
      id: "debit",
      label: "Debit",
      aggregation: "sum",
      field: "debit_minor",
      value: { kind: "currency", scale: 100, currencyDimension: "currency", exact: true },
      additive: "full",
    },
    {
      id: "credit",
      label: "Credit",
      aggregation: "sum",
      field: "credit_minor",
      value: { kind: "currency", scale: 100, currencyDimension: "currency", exact: true },
      additive: "full",
    },
    {
      id: "line_count",
      label: "Lines",
      aggregation: "count",
      value: { kind: "integer", exact: true },
      additive: "full",
    },
  ],
  maxRows: 5000,
};

const registry = new SemanticModelRegistry([financeModel]);
const compiler = new SemanticQueryCompiler(registry);

test("semantic compiler binds tenant, allowlists members and preserves exact scaled money", () => {
  const compiled = compiler.compile({
    model: "finance.daily_ledger",
    tenant_id: "tenant-a",
    dimensions: ["account", "currency"],
    metrics: ["debit", "credit"],
    filters: [{ dimension: "account", operator: "=", value: "111' OR 1=1 --" }],
    order_by: [{ id: "debit", direction: "desc" }],
    limit: 250,
  });

  assert.match(compiled.sql, /FROM "daily_detailed_ledger" WHERE "tenant_id"=\?1/);
  assert.match(compiled.sql, /COALESCE\(SUM\("debit_minor"\),0\) AS "debit"/);
  assert.match(compiled.sql, /GROUP BY "account", "currency"/);
  assert.doesNotMatch(compiled.sql, /CAST\(.+ AS REAL\)/i);
  assert.ok(!compiled.sql.includes("OR 1=1"));
  assert.equal(compiled.params[1], "111' OR 1=1 --");
  assert.deepEqual(compiled.permission, { doctype: "Journal Entry", action: "report" });
  assert.deepEqual(compiled.columns.find((column) => column.id === "debit"), {
    id: "debit",
    label: "Debit",
    role: "metric",
    valueKind: "currency",
    scale: 100,
    currencyDimension: "currency",
    exact: true,
  });
});

test("semantic catalog exposes business meaning to AI without raw schema names", () => {
  const catalog = registry.describe("finance.daily_ledger");
  const serialized = JSON.stringify(catalog);
  assert.equal(catalog.grain, "one immutable daily-ledger line");
  assert.ok(catalog.metrics.some((metric) => metric.id === "debit"));
  assert.ok(catalog.dimensions.some((dimension) => dimension.id === "account"));
  assert.ok(!serialized.includes("daily_detailed_ledger"));
  assert.ok(!serialized.includes("debit_minor"));
  assert.ok(!serialized.includes("tenant_id"));
});

test("semantic compiler rejects undeclared dimensions, metrics, filters and order members", () => {
  assert.throws(() => compiler.compile({
    model: "finance.daily_ledger",
    tenant_id: "tenant-a",
    dimensions: ["payload_json"],
    metrics: ["debit"],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    model: "finance.daily_ledger",
    tenant_id: "tenant-a",
    dimensions: ["account"],
    metrics: ["gross_margin"],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    model: "finance.daily_ledger",
    tenant_id: "tenant-a",
    metrics: ["line_count"],
    filters: [{ dimension: "debit_minor", operator: ">", value: 0 }],
  }), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => compiler.compile({
    model: "finance.daily_ledger",
    tenant_id: "tenant-a",
    metrics: ["debit"],
    order_by: [{ id: "account", direction: "asc" }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("doctype semantic source is tenant/doctyped/cancel-safe and never accepts a table name from the caller", () => {
  const doctypeRegistry = new SemanticModelRegistry([{
    id: "sales.invoice",
    label: "Sales invoice",
    source: { kind: "doctype", doctype: "Sales Invoice" },
    grain: "one non-cancelled sales invoice",
    permission: { doctype: "Sales Invoice", action: "report" },
    dimensions: [
      { id: "customer", label: "Customer", field: "customer", kind: "link", options: "Customer" },
      { id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" },
    ],
    metrics: [{ id: "invoice_count", label: "Invoices", aggregation: "count", value: { kind: "integer", exact: true } }],
    maxRows: 1000,
  }]);
  const doctypeCompiler = new SemanticQueryCompiler(doctypeRegistry);
  const compiled = doctypeCompiler.compile({
    model: "sales.invoice",
    tenant_id: "tenant-b",
    dimensions: ["customer"],
    metrics: ["invoice_count"],
    filters: [{ dimension: "posting_date", operator: ">=", value: "2026-08-01" }],
  });

  assert.match(compiled.sql, /FROM documents WHERE tenant_id=\?1 AND doctype=\?2 AND docstatus<>2/);
  assert.match(compiled.sql, /json_extract\(payload_json,'\$\.customer'\)/);
  assert.deepEqual(compiled.params.slice(0, 3), ["tenant-b", "Sales Invoice", "2026-08-01"]);
});

test("model validation refuses duplicate semantic members and exact scaled AVG", () => {
  assert.throws(() => new SemanticModelRegistry([{
    ...financeModel,
    id: "broken.duplicate",
    metrics: [{ id: "account", label: "Duplicate", aggregation: "count", value: { kind: "integer" } }],
  }]), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => new SemanticModelRegistry([{
    ...financeModel,
    id: "broken.average",
    metrics: [{
      id: "avg_debit",
      label: "Average debit",
      aggregation: "avg",
      field: "debit_minor",
      value: { kind: "currency", scale: 100, exact: true },
    }],
  }]), (error) => error.code === "VALIDATION_ERROR");
});
