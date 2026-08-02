import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticAnomalyService } from "../dist/packages/semantic/src/anomaly.js";

const registry = new SemanticModelRegistry([{
  id: "sales.daily",
  label: "Daily sales",
  source: { kind: "view", name: "daily_sales", tenantField: "tenant_id" },
  grain: "one sales day",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" }],
  metrics: [{ id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true }, additive: "full" }],
  maxRows: 500,
}]);

const request = {
  model: "sales.daily",
  timeDimension: "posting_date",
  metric: "revenue_minor",
  limit: 30,
  sourceVersion: "sales-fingerprint-42",
};

function executor() {
  return {
    async run(input) {
      return {
        model: input.model,
        grain: "one sales day",
        columns: [],
        result: [
          { posting_date: "2026-07-30", revenue_minor: 10000 },
          { posting_date: "2026-07-31", revenue_minor: 11000 },
          { posting_date: "2026-08-01", revenue_minor: 50000 },
        ],
        row_count: 3,
      };
    },
  };
}

test("anomaly provider receives only semantic series and observed value comes from source", async () => {
  let providerInput;
  const service = new SemanticAnomalyService(registry, executor(), {
    async detect(input) {
      providerInput = input;
      return {
        provider: "test-zscore",
        modelVersion: "1.2.0",
        anomalies: [{ period: "2026-08-01", score: 3.5, direction: "high", explanation: "Large deviation" }],
        diagnostics: { window: 3 },
      };
    },
  }, () => "2026-08-03T00:00:00.000Z");
  const result = await service.run("tenant-a", request);
  assert.deepEqual(providerInput.series, [
    { period: "2026-07-30", value: 10000 },
    { period: "2026-07-31", value: 11000 },
    { period: "2026-08-01", value: 50000 },
  ]);
  assert.equal(result.findings[0].observed, 50000);
  assert.equal(result.sourceVersion, "sales-fingerprint-42");
  assert.equal(result.provider, "test-zscore");
  assert.equal(result.modelVersion, "1.2.0");
});

test("provider cannot invent anomaly periods outside permission-visible source", async () => {
  const service = new SemanticAnomalyService(registry, executor(), {
    async detect() {
      return { provider: "bad", modelVersion: "1", anomalies: [{ period: "2099-01-01", score: 99 }] };
    },
  });
  await assert.rejects(() => service.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
});

test("exact source metrics reject fractional observations before provider", async () => {
  let providerCalled = false;
  const service = new SemanticAnomalyService(registry, {
    async run(input) {
      return {
        model: input.model, grain: "one sales day", columns: [],
        result: [
          { posting_date: "2026-07-30", revenue_minor: 10000 },
          { posting_date: "2026-07-31", revenue_minor: 11000.5 },
          { posting_date: "2026-08-01", revenue_minor: 50000 },
        ], row_count: 3,
      };
    },
  }, { async detect() { providerCalled = true; throw new Error("must not run"); } });
  await assert.rejects(() => service.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(providerCalled, false);
});

test("non-additive metrics require an explicit derived-series contract", async () => {
  const nonAdditive = new SemanticModelRegistry([{
    ...registry.get("sales.daily"),
    id: "sales.margin",
    metrics: [{ id: "margin_pct", label: "Margin", aggregation: "max", field: "margin_pct", value: { kind: "percent", exact: false }, additive: "non" }],
  }]);
  let executed = false;
  const service = new SemanticAnomalyService(nonAdditive, { async run() { executed = true; throw new Error("must not run"); } }, { async detect() { throw new Error("must not run"); } });
  await assert.rejects(() => service.run("tenant-a", { ...request, model: "sales.margin", metric: "margin_pct" }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(executed, false);
});
