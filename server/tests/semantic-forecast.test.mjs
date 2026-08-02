import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticForecastService } from "../dist/packages/semantic/src/forecast.js";

const registry = new SemanticModelRegistry([{
  id: "sales.daily",
  label: "Daily sales",
  source: { kind: "view", name: "daily_sales", tenantField: "tenant_id" },
  grain: "one sales day",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" }],
  metrics: [{
    id: "revenue_minor",
    label: "Revenue",
    aggregation: "sum",
    field: "revenue_minor",
    value: { kind: "currency", scale: 100, exact: true },
    additive: "full",
  }],
  maxRows: 500,
}]);

const request = {
  model: "sales.daily",
  timeDimension: "posting_date",
  metric: "revenue_minor",
  frequency: "day",
  horizon: 2,
  trainingLimit: 30,
  sourceVersion: "sales-ledger-fingerprint-42",
};

test("forecast source comes through semantic executor and result carries provenance", async () => {
  let semanticRequest;
  let providerInput;
  const service = new SemanticForecastService(registry, {
    async run(input) {
      semanticRequest = input;
      return {
        model: input.model,
        grain: "one sales day",
        columns: [],
        result: [
          { posting_date: "2026-07-30", revenue_minor: 10000 },
          { posting_date: "2026-07-31", revenue_minor: 11000 },
          { posting_date: "2026-08-01", revenue_minor: 12000 },
        ],
        row_count: 3,
      };
    },
  }, {
    async forecast(input) {
      providerInput = input;
      return {
        provider: "test-linear",
        modelVersion: "1.0.0",
        points: [
          { period: "2026-08-02", value: 13000, lower: 12000, upper: 14000 },
          { period: "2026-08-03", value: 14000, lower: 13000, upper: 15000 },
        ],
        diagnostics: { method: "linear" },
      };
    },
  }, () => "2026-08-03T00:00:00.000Z");

  const result = await service.run("tenant-a", request);
  assert.equal(semanticRequest.tenant_id, "tenant-a");
  assert.deepEqual(semanticRequest.dimensions, ["posting_date"]);
  assert.deepEqual(semanticRequest.metrics, ["revenue_minor"]);
  assert.deepEqual(providerInput.series, [
    { period: "2026-07-30", value: 10000 },
    { period: "2026-07-31", value: 11000 },
    { period: "2026-08-01", value: 12000 },
  ]);
  assert.equal(providerInput.value.exact, true);
  assert.equal(result.sourceVersion, "sales-ledger-fingerprint-42");
  assert.equal(result.provider, "test-linear");
  assert.equal(result.modelVersion, "1.0.0");
  assert.equal(result.generatedAt, "2026-08-03T00:00:00.000Z");
  assert.equal(result.trainingPoints, 3);
});

test("forecast fails before provider when permission-visible source is insufficient or invalid", async () => {
  let providerCalled = false;
  const provider = { async forecast() { providerCalled = true; throw new Error("must not run"); } };
  const insufficient = new SemanticForecastService(registry, {
    async run(input) {
      return { model: input.model, grain: "one sales day", columns: [], result: [
        { posting_date: "2026-08-01", revenue_minor: 10000 },
        { posting_date: "2026-08-02", revenue_minor: 11000 },
      ], row_count: 2 };
    },
  }, provider);
  await assert.rejects(() => insufficient.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(providerCalled, false);

  const unordered = new SemanticForecastService(registry, {
    async run(input) {
      return { model: input.model, grain: "one sales day", columns: [], result: [
        { posting_date: "2026-08-02", revenue_minor: 10000 },
        { posting_date: "2026-08-01", revenue_minor: 11000 },
        { posting_date: "2026-08-03", revenue_minor: 12000 },
      ], row_count: 3 };
    },
  }, provider);
  await assert.rejects(() => unordered.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(providerCalled, false);
});

test("exact forecast output must remain safe integer and interval ordered", async () => {
  const executor = {
    async run(input) {
      return { model: input.model, grain: "one sales day", columns: [], result: [
        { posting_date: "2026-07-30", revenue_minor: 10000 },
        { posting_date: "2026-07-31", revenue_minor: 11000 },
        { posting_date: "2026-08-01", revenue_minor: 12000 },
      ], row_count: 3 };
    },
  };
  const fractional = new SemanticForecastService(registry, executor, {
    async forecast() {
      return { provider: "bad", modelVersion: "1", points: [
        { period: "2026-08-02", value: 13000.5 },
        { period: "2026-08-03", value: 14000 },
      ] };
    },
  });
  await assert.rejects(() => fractional.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");

  const inverted = new SemanticForecastService(registry, executor, {
    async forecast() {
      return { provider: "bad", modelVersion: "1", points: [
        { period: "2026-08-02", value: 13000, lower: 14000, upper: 12000 },
        { period: "2026-08-03", value: 14000 },
      ] };
    },
  });
  await assert.rejects(() => inverted.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
});

test("non-additive metrics cannot be forecast without explicit derived-series contract", async () => {
  const nonAdditiveRegistry = new SemanticModelRegistry([{
    ...registry.get("sales.daily"),
    id: "sales.margin",
    metrics: [{ id: "margin_pct", label: "Margin", aggregation: "max", field: "margin_pct", value: { kind: "percent", exact: false }, additive: "non" }],
  }]);
  let executed = false;
  const service = new SemanticForecastService(nonAdditiveRegistry, { async run() { executed = true; throw new Error("must not run"); } }, { async forecast() { throw new Error("must not run"); } });
  await assert.rejects(() => service.run("tenant-a", {
    ...request, model: "sales.margin", metric: "margin_pct",
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(executed, false);
});
