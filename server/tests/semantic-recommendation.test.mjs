import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticRecommendationService } from "../dist/packages/semantic/src/recommendation.js";

const registry = new SemanticModelRegistry([{
  id: "sales.branch",
  label: "Branch sales",
  source: { kind: "view", name: "branch_sales_semantic", tenantField: "tenant_id" },
  grain: "one branch aggregate row",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "category" }],
  metrics: [
    { id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true }, additive: "full" },
    { id: "order_count", label: "Orders", aggregation: "sum", field: "order_count", value: { kind: "integer", exact: true }, additive: "full" },
  ],
  maxRows: 500,
}]);

const request = {
  model: "sales.branch",
  objective: "Identify branches that deserve management attention",
  dimensions: ["branch"],
  metrics: ["revenue_minor", "order_count"],
  limit: 20,
  sourceVersion: "sales-snapshot-42",
};

function executor() {
  return {
    async run(input) {
      assert.equal(input.tenant_id, "tenant-a");
      return {
        model: input.model,
        grain: "one branch aggregate row",
        columns: [],
        result: [
          { branch: "HCM", revenue_minor: 1200000, order_count: 20 },
          { branch: "HN", revenue_minor: 300000, order_count: 18 },
        ],
        row_count: 2,
      };
    },
  };
}

test("recommendation provider receives permission-visible semantic rows without tenant or physical schema", async () => {
  let providerInput;
  const service = new SemanticRecommendationService(registry, executor(), {
    async recommend(input) {
      providerInput = input;
      return {
        provider: "test-advisor",
        modelVersion: "1.0.0",
        recommendations: [{
          id: "review_hn_conversion",
          title: "Review HN conversion",
          rationale: "Order volume is close to HCM while revenue is materially lower.",
          confidence: 0.8,
          evidence: [
            { row: 1, member: "revenue_minor" },
            { row: 1, member: "order_count" },
          ],
        }],
      };
    },
  }, () => "2026-08-04T00:00:00.000Z");

  const result = await service.run("tenant-a", request);
  assert.equal(providerInput.model, "sales.branch");
  assert.equal(providerInput.rows.length, 2);
  assert.ok(!("tenantId" in providerInput));
  assert.ok(!JSON.stringify(providerInput).includes("branch_sales_semantic"));
  assert.deepEqual(result.recommendations[0].evidence, [
    { row: 1, member: "revenue_minor", observed: 300000 },
    { row: 1, member: "order_count", observed: 18 },
  ]);
  assert.equal(result.sourceVersion, "sales-snapshot-42");
  assert.equal(result.generatedAt, "2026-08-04T00:00:00.000Z");
});

test("provider cannot cite rows or members outside the permission-visible semantic source", async () => {
  const outsideRow = new SemanticRecommendationService(registry, executor(), {
    async recommend() {
      return {
        provider: "bad",
        modelVersion: "1",
        recommendations: [{ id: "bad_row", title: "Bad", rationale: "Bad", evidence: [{ row: 99, member: "revenue_minor" }] }],
      };
    },
  });
  await assert.rejects(() => outsideRow.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");

  const outsideMember = new SemanticRecommendationService(registry, executor(), {
    async recommend() {
      return {
        provider: "bad",
        modelVersion: "1",
        recommendations: [{ id: "bad_member", title: "Bad", rationale: "Bad", evidence: [{ row: 0, member: "profit_minor" }] }],
      };
    },
  });
  await assert.rejects(() => outsideMember.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
});

test("provider output rejects write/action fields instead of turning recommendation into authority", async () => {
  const service = new SemanticRecommendationService(registry, executor(), {
    async recommend() {
      return {
        provider: "bad",
        modelVersion: "1",
        recommendations: [{
          id: "mutate_price",
          title: "Mutate price",
          rationale: "Should not be executable",
          evidence: [{ row: 0, member: "revenue_minor" }],
          action: { doctype: "Item Price", write: true },
        }],
      };
    },
  });
  await assert.rejects(() => service.run("tenant-a", request), (error) => error.code === "VALIDATION_ERROR");
});

test("permission/query failure prevents provider invocation", async () => {
  let providerCalled = false;
  const service = new SemanticRecommendationService(registry, {
    async run() {
      const error = new Error("denied");
      error.code = "PERMISSION_DENIED";
      throw error;
    },
  }, {
    async recommend() {
      providerCalled = true;
      throw new Error("must not run");
    },
  });
  await assert.rejects(() => service.run("tenant-a", request), (error) => error.code === "PERMISSION_DENIED");
  assert.equal(providerCalled, false);
});
