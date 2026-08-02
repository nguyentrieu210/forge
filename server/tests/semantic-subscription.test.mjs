import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";
import { SemanticSubscriptionExecutionService, semanticSubscriptionAudit, validateSemanticSubscription } from "../dist/packages/semantic/src/subscription.js";

const semantic = new SemanticModelRegistry([{
  id: "sales.summary",
  label: "Sales summary",
  source: { kind: "view", name: "sales_summary", tenantField: "tenant_id" },
  grain: "one submitted order",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" }],
  metrics: [{ id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
  maxRows: 500,
}]);
const insights = new SemanticInsightRegistry(semantic, [{
  id: "sales.orders_by_branch",
  label: "Orders by branch",
  kind: "table",
  model: "sales.summary",
  dimensions: ["branch"],
  metrics: ["order_count"],
  scopeDimensions: ["branch"],
  limit: 100,
}]);

const subscription = {
  id: "sales.daily_orders",
  label: "Daily orders",
  ownerUserId: "manager@example.com",
  insight: "sales.orders_by_branch",
  scopeFilters: [{ dimension: "branch", operator: "=", value: "HCM" }],
  schedule: { cadence: "daily", timezone: "Asia/Ho_Chi_Minh", localTime: "07:30" },
  delivery: "in_app_owner",
  enabled: true,
};

test("subscription rebinds execution to owner on every run", async () => {
  const events = [];
  let request;
  const service = new SemanticSubscriptionExecutionService(insights, {
    async forOwner(tenantId, ownerUserId) {
      events.push(["factory", tenantId, ownerUserId]);
      return {
        async run(input) {
          events.push(["run"]);
          request = input;
          return { model: input.model, grain: "one submitted order", columns: [], result: [{ branch: "HCM", order_count: 7 }], row_count: 1 };
        },
      };
    },
  }, () => "2026-08-03T00:00:00.000Z");

  const result = await service.execute({ tenantId: "tenant-a", runId: "run-1", subscription });
  assert.deepEqual(events[0], ["factory", "tenant-a", "manager@example.com"]);
  assert.equal(request.tenant_id, "tenant-a");
  assert.deepEqual(request.filters, [{ dimension: "branch", operator: "=", value: "HCM" }]);
  assert.equal(result.ownerUserId, "manager@example.com");
  assert.equal(result.delivery, "in_app_owner");
  assert.equal(result.generatedAt, "2026-08-03T00:00:00.000Z");
});

test("disabled subscription never creates an owner executor", async () => {
  let factoryCalled = false;
  const service = new SemanticSubscriptionExecutionService(insights, {
    async forOwner() { factoryCalled = true; throw new Error("must not run"); },
  });
  await assert.rejects(() => service.execute({
    tenantId: "tenant-a", runId: "run-1", subscription: { ...subscription, enabled: false },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(factoryCalled, false);
});

test("schedule contract rejects ambiguous dates, invalid timezone and shared delivery", () => {
  assert.throws(() => validateSemanticSubscription({
    ...subscription,
    schedule: { cadence: "monthly", timezone: "Asia/Ho_Chi_Minh", localTime: "07:30", dayOfMonth: 31 },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateSemanticSubscription({
    ...subscription,
    schedule: { cadence: "daily", timezone: "Mars/Olympus", localTime: "07:30" },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => validateSemanticSubscription({
    ...subscription,
    delivery: "email_anyone",
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("subscription audit shape carries no semantic physical schema or recipient list", () => {
  const audit = semanticSubscriptionAudit(subscription);
  const serialized = JSON.stringify(audit);
  assert.match(serialized, /sales\.orders_by_branch/);
  assert.match(serialized, /manager@example\.com/);
  assert.ok(!serialized.includes("sales_summary"));
  assert.ok(!serialized.includes("tenant_id"));
  assert.ok(!serialized.includes("recipients"));
});
