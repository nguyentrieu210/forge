import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";
import {
  PermissionAwareSemanticDashboardCatalogService,
  SemanticDashboardRegistry,
  SemanticDashboardService,
} from "../dist/packages/semantic/src/dashboard.js";

const semantic = new SemanticModelRegistry([
  {
    id: "sales.orders",
    label: "Sales orders",
    source: { kind: "view", name: "sales_orders_semantic", tenantField: "tenant_id" },
    grain: "one order aggregate row",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "category" }],
    metrics: [{ id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true }, additive: "full" }],
    maxRows: 500,
  },
  {
    id: "hr.people",
    label: "People",
    source: { kind: "view", name: "hr_people_semantic", tenantField: "tenant_id" },
    grain: "one people aggregate row",
    permission: { doctype: "Employee", action: "report" },
    dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "category" }],
    metrics: [{ id: "headcount", label: "Headcount", aggregation: "sum", field: "headcount", value: { kind: "integer", exact: true }, additive: "full" }],
    maxRows: 500,
  },
]);

const insights = new SemanticInsightRegistry(semantic, [
  {
    id: "sales.revenue_kpi",
    label: "Revenue",
    kind: "kpi",
    model: "sales.orders",
    metrics: ["revenue_minor"],
    primaryMetric: "revenue_minor",
    scopeDimensions: ["branch"],
  },
  {
    id: "hr.headcount_kpi",
    label: "Headcount",
    kind: "kpi",
    model: "hr.people",
    metrics: ["headcount"],
    primaryMetric: "headcount",
    scopeDimensions: ["branch"],
  },
]);

const definition = {
  id: "exec.company_overview",
  label: "Company overview",
  kind: "executive_cockpit",
  widgets: [
    { id: "revenue", insight: "sales.revenue_kpi", x: 0, y: 0, width: 6, height: 4 },
    { id: "headcount", insight: "hr.headcount_kpi", x: 6, y: 0, width: 6, height: 4 },
  ],
  filters: [{
    id: "branch",
    label: "Branch",
    operators: ["=", "in"],
    bindings: [
      { widget: "revenue", dimension: "branch" },
      { widget: "headcount", dimension: "branch" },
    ],
  }],
};

function allowAll() {
  return {
    async authorize() {
      return { mode: "all", actor_user_id: "alice@example.com", user_permissions: [] };
    },
  };
}

test("dashboard materialization binds trusted tenant and declared global filters to each insight", () => {
  const registry = new SemanticDashboardRegistry(insights, [definition]);
  const plans = registry.materialize("exec.company_overview", "tenant-a", [{ filter: "branch", operator: "=", value: "HCM" }]);
  assert.equal(plans.length, 2);
  assert.deepEqual(plans.map((plan) => plan.query.tenant_id), ["tenant-a", "tenant-a"]);
  assert.deepEqual(plans[0].query.filters, [{ dimension: "branch", operator: "=", value: "HCM" }]);
  assert.deepEqual(plans[1].query.filters, [{ dimension: "branch", operator: "=", value: "HCM" }]);
  assert.ok(!JSON.stringify(registry.list()).includes("tenant-a"));
});

test("dashboard rejects overlapping layout and filter bindings outside insight scope", () => {
  assert.throws(() => new SemanticDashboardRegistry(insights, [{
    ...definition,
    id: "exec.overlap",
    widgets: [
      { id: "revenue", insight: "sales.revenue_kpi", x: 0, y: 0, width: 8, height: 4 },
      { id: "headcount", insight: "hr.headcount_kpi", x: 6, y: 0, width: 6, height: 4 },
    ],
  }]), (error) => error.code === "VALIDATION_ERROR");

  const noScopeInsights = new SemanticInsightRegistry(semantic, [{
    id: "sales.no_scope",
    label: "Revenue",
    kind: "kpi",
    model: "sales.orders",
    metrics: ["revenue_minor"],
    primaryMetric: "revenue_minor",
  }]);
  assert.throws(() => new SemanticDashboardRegistry(noScopeInsights, [{
    id: "exec.bad_scope",
    label: "Bad scope",
    kind: "dashboard",
    widgets: [{ id: "revenue", insight: "sales.no_scope", x: 0, y: 0, width: 12, height: 4 }],
    filters: [{ id: "branch", label: "Branch", operators: ["="], bindings: [{ widget: "revenue", dimension: "branch" }] }],
  }]), (error) => error.code === "VALIDATION_ERROR");
});

test("permission-aware dashboard catalog hides the whole cockpit if one widget model is denied", async () => {
  const registry = new SemanticDashboardRegistry(insights, [definition]);
  const access = {
    async authorize(input) {
      if (input.model === "hr.people") {
        const error = new Error("denied");
        error.code = "PERMISSION_DENIED";
        throw error;
      }
      return { mode: "all", actor_user_id: "alice@example.com", user_permissions: [] };
    },
  };
  const catalog = new PermissionAwareSemanticDashboardCatalogService(registry, semantic, access);
  assert.deepEqual(await catalog.list("tenant-a"), []);
});

test("dashboard service preflights all model permissions before any widget data read", async () => {
  const registry = new SemanticDashboardRegistry(insights, [definition]);
  let queryCalls = 0;
  const access = {
    async authorize(input) {
      if (input.model === "hr.people") {
        const error = new Error("denied");
        error.code = "PERMISSION_DENIED";
        throw error;
      }
      return { mode: "all", actor_user_id: "alice@example.com", user_permissions: [] };
    },
  };
  const service = new SemanticDashboardService(registry, semantic, access, {
    async run() {
      queryCalls += 1;
      throw new Error("must not query");
    },
  });
  await assert.rejects(() => service.run("tenant-a", "exec.company_overview"), (error) => error.code === "PERMISSION_DENIED");
  assert.equal(queryCalls, 0);
});

test("dashboard service executes each trusted insight after successful preflight", async () => {
  const registry = new SemanticDashboardRegistry(insights, [definition]);
  const seen = [];
  const service = new SemanticDashboardService(registry, semantic, allowAll(), {
    async run(input) {
      seen.push(input);
      return { model: input.model, grain: "aggregate", columns: [], result: [{ ok: true }], row_count: 1 };
    },
  });
  const result = await service.run("tenant-a", "exec.company_overview", [{ filter: "branch", operator: "in", value: ["HCM", "HN"] }]);
  assert.equal(result.widgets.length, 2);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((request) => request.tenant_id === "tenant-a"));
});
