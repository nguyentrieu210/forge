import test from "node:test";
import assert from "node:assert/strict";
import { parseSemanticQueryBody } from "../dist/packages/semantic/src/request.js";

test("external semantic query parser accepts only semantic members and scalar filters", () => {
  const parsed = parseSemanticQueryBody({
    model: "sales.orders",
    dimensions: ["branch"],
    metrics: ["revenue_minor"],
    filters: [
      { dimension: "branch", operator: "in", value: ["HCM", "HN"] },
      { dimension: "posting_date", operator: ">=", value: "2026-08-01" },
    ],
    order_by: [{ id: "revenue_minor", direction: "desc" }],
    limit: 100,
  });
  assert.deepEqual(parsed, {
    model: "sales.orders",
    dimensions: ["branch"],
    metrics: ["revenue_minor"],
    filters: [
      { dimension: "branch", operator: "in", value: ["HCM", "HN"] },
      { dimension: "posting_date", operator: ">=", value: "2026-08-01" },
    ],
    order_by: [{ id: "revenue_minor", direction: "desc" }],
    limit: 100,
  });
});

test("external body cannot choose tenant or inject raw SQL keys", () => {
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"], tenant_id: "attacker",
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"], raw_sql: "select * from secrets",
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("nested JSON and non-string LIKE values are refused before compiler/D1", () => {
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"],
    filters: [{ dimension: "branch", operator: "=", value: { injected: true } }],
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"],
    filters: [{ dimension: "branch", operator: "like", value: 123 }],
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("surface-specific limits and offset policy are enforceable", () => {
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"], limit: 201,
  }, { maxLimit: 200 }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticQueryBody({
    model: "sales.orders", metrics: ["revenue_minor"], offset: 1,
  }, { allowOffset: false }), (error) => error.code === "VALIDATION_ERROR");
});
