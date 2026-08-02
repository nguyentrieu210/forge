import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry, SemanticQueryCompiler } from "../dist/packages/semantic/src/index.js";

const model = {
  id: "finance.entries",
  label: "Finance entries",
  source: { kind: "view", name: "finance_entries", tenantField: "tenant_id" },
  grain: "one posting line",
  permission: { doctype: "Journal Entry", action: "report" },
  dimensions: [
    { id: "account", label: "Account", field: "account", kind: "link", options: "Account" },
    { id: "currency", label: "Currency", field: "currency", kind: "currency" },
  ],
  metrics: [
    { id: "amount_minor", label: "Amount", aggregation: "sum", field: "amount_minor", value: { kind: "currency", scale: 100, exact: true, currencyDimension: "currency" }, additive: "full" },
    { id: "line_count", label: "Lines", aggregation: "count", value: { kind: "integer", exact: true }, additive: "full" },
  ],
  maxRows: 500,
};

const compiler = new SemanticQueryCompiler(new SemanticModelRegistry([model]));

test("currency metric refuses cross-currency aggregation without group or single currency scope", () => {
  assert.throws(() => compiler.compile({
    model: "finance.entries", tenant_id: "tenant-a", dimensions: ["account"], metrics: ["amount_minor"],
  }), (error) => error.code === "VALIDATION_ERROR");

  const grouped = compiler.compile({
    model: "finance.entries", tenant_id: "tenant-a", dimensions: ["account", "currency"], metrics: ["amount_minor"],
  });
  assert.match(grouped.sql, /GROUP BY "account", "currency"/);

  const scoped = compiler.compile({
    model: "finance.entries", tenant_id: "tenant-a", dimensions: ["account"], metrics: ["amount_minor"],
    filters: [{ dimension: "currency", operator: "=", value: "VND" }],
  });
  assert.equal(scoped.params[1], "VND");
});

test("currency IN or multiple conflicting equality values do not create a single-currency scope", () => {
  assert.throws(() => compiler.compile({
    model: "finance.entries", tenant_id: "tenant-a", metrics: ["amount_minor"],
    filters: [{ dimension: "currency", operator: "in", value: ["VND", "USD"] }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => compiler.compile({
    model: "finance.entries", tenant_id: "tenant-a", metrics: ["amount_minor"],
    filters: [
      { dimension: "currency", operator: "=", value: "VND" },
      { dimension: "currency", operator: "=", value: "USD" },
    ],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("all exact averages are refused even with scale one", () => {
  assert.throws(() => new SemanticModelRegistry([{
    ...model,
    id: "finance.bad_average",
    metrics: [{ id: "avg_lines", label: "Average", aggregation: "avg", field: "amount_minor", value: { kind: "integer", scale: 1, exact: true } }],
  }]), (error) => error.code === "VALIDATION_ERROR");
});

test("count and count-distinct contracts are exact unscaled integers", () => {
  assert.throws(() => new SemanticModelRegistry([{
    ...model,
    id: "finance.bad_count",
    metrics: [{ id: "count", label: "Count", aggregation: "count", value: { kind: "number", exact: false } }],
  }]), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => new SemanticModelRegistry([{
    ...model,
    id: "finance.bad_distinct",
    metrics: [{ id: "accounts", label: "Accounts", aggregation: "count_distinct", field: "account", value: { kind: "integer" } }],
  }]), (error) => error.code === "VALIDATION_ERROR");
});

test("link dimensions require an explicit target DocType", () => {
  assert.throws(() => new SemanticModelRegistry([{
    ...model,
    id: "finance.bad_link",
    dimensions: [{ id: "account", label: "Account", field: "account", kind: "link" }],
    metrics: [{ id: "line_count", label: "Lines", aggregation: "count", value: { kind: "integer", exact: true } }],
  }]), (error) => error.code === "VALIDATION_ERROR");
});
