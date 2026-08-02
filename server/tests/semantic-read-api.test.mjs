import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";
import { PermissionAwareSemanticCatalogService } from "../dist/packages/semantic/src/catalog.js";
import { SemanticReadApi } from "../dist/packages/semantic/src/read-api.js";

const semantic = new SemanticModelRegistry([
  {
    id: "sales.summary",
    label: "Sales summary",
    source: { kind: "view", name: "sales_summary", tenantField: "tenant_id" },
    grain: "one submitted order",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" }],
    metrics: [{ id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
    maxRows: 500,
  },
  {
    id: "sales.detail",
    label: "Sales detail",
    source: { kind: "view", name: "sales_detail", tenantField: "tenant_id" },
    grain: "one submitted order line",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [
      { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
      { id: "sales_order", label: "Sales Order", field: "sales_order", kind: "link", options: "Sales Order" },
    ],
    metrics: [{ id: "line_count", label: "Lines", aggregation: "count", value: { kind: "integer", exact: true } }],
    maxRows: 500,
  },
]);

const insights = new SemanticInsightRegistry(semantic, [
  {
    id: "sales.by_branch", label: "Sales by branch", kind: "chart", model: "sales.summary",
    dimensions: ["branch"], metrics: ["order_count"], scopeDimensions: [],
    drillThrough: [{ id: "lines", label: "Order lines", targetInsight: "sales.lines", bindings: [{ sourceDimension: "branch", targetDimension: "branch" }] }],
  },
  {
    id: "sales.lines", label: "Sales lines", kind: "table", model: "sales.detail",
    dimensions: ["sales_order", "branch"], metrics: ["line_count"], scopeDimensions: ["branch"],
  },
]);

const allScope = { mode: "all", actor_user_id: "reader@example.com", user_permissions: [] };

function fixture() {
  const requests = [];
  const executor = {
    async run(request) {
      requests.push(request);
      return { model: request.model, grain: "test", columns: [], result: [], row_count: 0 };
    },
  };
  const access = { async authorize() { return allScope; } };
  const catalog = new PermissionAwareSemanticCatalogService(semantic, access);
  return { requests, api: new SemanticReadApi(executor, catalog, insights) };
}

test("read API injects trusted tenant and external query cannot override it", async () => {
  const { api, requests } = fixture();
  await api.query("trusted-tenant", { model: "sales.summary", metrics: ["order_count"] });
  assert.equal(requests[0].tenant_id, "trusted-tenant");

  await assert.rejects(() => api.query("trusted-tenant", {
    model: "sales.summary", metrics: ["order_count"], tenant_id: "attacker",
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(requests.length, 1);
});

test("insight and drill routes remain semantic and tenant-bound", async () => {
  const { api, requests } = fixture();
  await api.insight("tenant-a", { insight: "sales.by_branch" });
  await api.drill("tenant-a", {
    insight: "sales.by_branch",
    drill: "lines",
    source_values: { branch: "HCM" },
  });
  assert.equal(requests[0].tenant_id, "tenant-a");
  assert.equal(requests[0].model, "sales.summary");
  assert.equal(requests[1].tenant_id, "tenant-a");
  assert.equal(requests[1].model, "sales.detail");
  assert.deepEqual(requests[1].filters, [{ dimension: "branch", operator: "=", value: "HCM" }]);
});

test("drill source values reject nested objects before executor", async () => {
  const { api, requests } = fixture();
  await assert.rejects(() => api.drill("tenant-a", {
    insight: "sales.by_branch",
    drill: "lines",
    source_values: { branch: { injected: true } },
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal(requests.length, 0);
});

test("catalog call uses permission-aware catalog service", async () => {
  const requests = [];
  const executor = { async run(request) { requests.push(request); throw new Error("not used"); } };
  const catalog = new PermissionAwareSemanticCatalogService(semantic, {
    async authorize(request) {
      if (request.model === "sales.detail") throw Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" });
      return allScope;
    },
  });
  const api = new SemanticReadApi(executor, catalog, insights);
  const visible = await api.catalog("tenant-a");
  assert.deepEqual(visible.map((model) => model.id), ["sales.summary"]);
  assert.equal(requests.length, 0);
});
