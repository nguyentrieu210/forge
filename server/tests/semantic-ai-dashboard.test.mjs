import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";
import { SemanticDashboardRegistry } from "../dist/packages/semantic/src/dashboard.js";
import {
  parseSemanticAssistantDashboardProposal,
  SemanticAssistantDashboardTool,
} from "../dist/packages/semantic/src/ai-dashboard.js";

const semantic = new SemanticModelRegistry([{
  id: "sales.orders",
  label: "Sales orders",
  source: { kind: "view", name: "sales_orders_semantic", tenantField: "tenant_id" },
  grain: "one order aggregate row",
  permission: { doctype: "Sales Order", action: "report" },
  dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "category" }],
  metrics: [{ id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true }, additive: "full" }],
  maxRows: 500,
}]);

const insights = new SemanticInsightRegistry(semantic, [{
  id: "sales.revenue_kpi",
  label: "Revenue",
  kind: "kpi",
  model: "sales.orders",
  metrics: ["revenue_minor"],
  primaryMetric: "revenue_minor",
  scopeDimensions: ["branch"],
}]);

const dashboards = new SemanticDashboardRegistry(insights, [{
  id: "exec.sales",
  label: "Sales executive",
  kind: "executive_cockpit",
  widgets: [{ id: "revenue", insight: "sales.revenue_kpi", x: 0, y: 0, width: 12, height: 4 }],
  filters: [{ id: "branch", label: "Branch", operators: ["=", "in"], bindings: [{ widget: "revenue", dimension: "branch" }] }],
}]);

test("AI dashboard proposal accepts only registered dashboard and declared filters", () => {
  assert.deepEqual(parseSemanticAssistantDashboardProposal(dashboards, {
    dashboard: "exec.sales",
    filters: [{ filter: "branch", operator: "=", value: "HCM" }],
  }), {
    dashboard: "exec.sales",
    filters: [{ filter: "branch", operator: "=", value: "HCM" }],
  });

  assert.throws(() => parseSemanticAssistantDashboardProposal(dashboards, { dashboard: "exec.sales", tenant_id: "attacker" }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticAssistantDashboardProposal(dashboards, { dashboard: "exec.sales", raw_sql: "select * from secrets" }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticAssistantDashboardProposal(dashboards, { dashboard: "exec.sales", filters: [{ filter: "hidden", operator: "=", value: "x" }] }), (error) => error.code === "VALIDATION_ERROR");
  assert.throws(() => parseSemanticAssistantDashboardProposal(dashboards, { dashboard: "exec.sales", filters: [{ filter: "branch", operator: "like", value: "%" }] }), (error) => error.code === "VALIDATION_ERROR");
});

test("AI dashboard tool opens audit intent before permission/data execution", async () => {
  const events = [];
  const tool = new SemanticAssistantDashboardTool(dashboards, {
    async run(tenantId, dashboard, filters) {
      events.push(["run", tenantId, dashboard, filters]);
      return {
        dashboard,
        widgets: [{ widget: "revenue", insight: "sales.revenue_kpi", result: { model: "sales.orders", grain: "aggregate", columns: [], result: [{ revenue_minor: 12300 }], row_count: 1 } }],
      };
    },
  }, {
    async begin(intent) {
      events.push(["begin", intent]);
      return "audit-1";
    },
    async finish(completion) {
      events.push(["finish", completion]);
    },
  });

  const result = await tool.execute({
    tenantId: "tenant-a",
    userId: "alice@example.com",
    question: "Show sales for HCM",
    proposal: { dashboard: "exec.sales", filters: [{ filter: "branch", operator: "=", value: "HCM" }] },
  });
  assert.equal(result.dashboard, "exec.sales");
  assert.equal(events[0][0], "begin");
  assert.equal(events[1][0], "run");
  assert.deepEqual(events[2], ["finish", { auditId: "audit-1", status: "success", widgetCount: 1, rowCount: 1 }]);
  assert.ok(!JSON.stringify(events[0][1].proposal).includes("tenant-a"));
});

test("AI dashboard permission denial is audited as denied", async () => {
  const completions = [];
  const tool = new SemanticAssistantDashboardTool(dashboards, {
    async run() {
      const error = new Error("denied");
      error.code = "PERMISSION_DENIED";
      throw error;
    },
  }, {
    async begin() { return "audit-2"; },
    async finish(completion) { completions.push(completion); },
  });

  await assert.rejects(() => tool.execute({
    tenantId: "tenant-a",
    userId: "alice@example.com",
    question: "Show the executive dashboard",
    proposal: { dashboard: "exec.sales" },
  }), (error) => error.code === "PERMISSION_DENIED");
  assert.deepEqual(completions, [{ auditId: "audit-2", status: "denied", errorCode: "PERMISSION_DENIED" }]);
});

test("AI dashboard does not read data when audit intent cannot be opened", async () => {
  let executed = false;
  const tool = new SemanticAssistantDashboardTool(dashboards, {
    async run() { executed = true; throw new Error("must not run"); },
  }, {
    async begin() { throw new Error("audit unavailable"); },
    async finish() { throw new Error("must not finish"); },
  });
  await assert.rejects(() => tool.execute({
    tenantId: "tenant-a",
    userId: "alice@example.com",
    question: "Show sales",
    proposal: { dashboard: "exec.sales" },
  }), /audit unavailable/);
  assert.equal(executed, false);
});
