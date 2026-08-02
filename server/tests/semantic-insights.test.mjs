import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";

const semantic = new SemanticModelRegistry([
  {
    id: "sales.summary",
    label: "Sales summary",
    source: { kind: "view", name: "sales_summary_view", tenantField: "tenant_id" },
    grain: "one submitted sales order",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [
      { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
      { id: "posting_date", label: "Posting date", field: "posting_date", kind: "date" },
    ],
    metrics: [
      { id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } },
      { id: "revenue_minor", label: "Revenue", aggregation: "sum", field: "revenue_minor", value: { kind: "currency", scale: 100, exact: true } },
    ],
    maxRows: 500,
  },
  {
    id: "sales.detail",
    label: "Sales detail",
    source: { kind: "view", name: "sales_detail_view", tenantField: "tenant_id" },
    grain: "one submitted sales order line",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [
      { id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" },
      { id: "sales_order", label: "Sales order", field: "sales_order", kind: "link", options: "Sales Order" },
      { id: "item_code", label: "Item", field: "item_code", kind: "link", options: "Item" },
    ],
    metrics: [{ id: "line_amount_minor", label: "Line amount", aggregation: "sum", field: "line_amount_minor", value: { kind: "currency", scale: 100, exact: true } }],
    maxRows: 1000,
  },
]);

const insights = new SemanticInsightRegistry(semantic, [
  {
    id: "sales.total_revenue",
    label: "Total revenue",
    kind: "kpi",
    model: "sales.summary",
    metrics: ["revenue_minor"],
    primaryMetric: "revenue_minor",
    scopeDimensions: ["branch", "posting_date"],
    limit: 1,
  },
  {
    id: "sales.revenue_by_branch",
    label: "Revenue by branch",
    kind: "chart",
    model: "sales.summary",
    dimensions: ["branch"],
    metrics: ["revenue_minor"],
    order_by: [{ id: "revenue_minor", direction: "desc" }],
    scopeDimensions: ["posting_date"],
    drillThrough: [{
      id: "orders",
      label: "Open order lines",
      targetInsight: "sales.order_lines",
      bindings: [{ sourceDimension: "branch", targetDimension: "branch" }],
    }],
  },
  {
    id: "sales.order_lines",
    label: "Sales order lines",
    kind: "table",
    model: "sales.detail",
    dimensions: ["sales_order", "item_code", "branch"],
    metrics: ["line_amount_minor"],
    scopeDimensions: ["branch"],
    limit: 200,
  },
]);

test("trusted insight query injects tenant and only declared runtime scope filters", () => {
  const query = insights.query("sales.total_revenue", "tenant-a", [
    { dimension: "branch", operator: "=", value: "HCM" },
  ]);
  assert.equal(query.tenant_id, "tenant-a");
  assert.deepEqual(query.metrics, ["revenue_minor"]);
  assert.deepEqual(query.filters, [{ dimension: "branch", operator: "=", value: "HCM" }]);
  assert.throws(() => insights.query("sales.total_revenue", "tenant-a", [
    { dimension: "unknown", operator: "=", value: "x" },
  ]), (error) => error.code === "VALIDATION_ERROR");
});

test("drill-through maps clicked semantic dimensions into target insight scope", () => {
  const query = insights.drill({
    insight: "sales.revenue_by_branch",
    drill: "orders",
    tenantId: "tenant-a",
    sourceValues: { branch: "HN" },
  });
  assert.equal(query.model, "sales.detail");
  assert.deepEqual(query.dimensions, ["sales_order", "item_code", "branch"]);
  assert.deepEqual(query.metrics, ["line_amount_minor"]);
  assert.deepEqual(query.filters, [{ dimension: "branch", operator: "=", value: "HN" }]);
});

test("insight summaries remain semantic and omit physical view/field names", () => {
  const serialized = JSON.stringify(insights.list());
  assert.match(serialized, /sales\.revenue_by_branch/);
  assert.ok(!serialized.includes("sales_summary_view"));
  assert.ok(!serialized.includes("revenue_minor\"" ) || serialized.includes("revenue_minor"));
  assert.ok(!serialized.includes("tenant_id"));
});

test("registry rejects malformed KPI, unknown members and unsafe drill contracts", () => {
  assert.throws(() => new SemanticInsightRegistry(semantic, [{
    id: "bad.kpi", label: "Bad KPI", kind: "kpi", model: "sales.summary",
    metrics: ["order_count", "revenue_minor"], primaryMetric: "revenue_minor",
  }]), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => new SemanticInsightRegistry(semantic, [{
    id: "bad.chart", label: "Bad chart", kind: "chart", model: "sales.summary",
    dimensions: ["raw_sql"], metrics: ["revenue_minor"],
  }]), (error) => error.code === "VALIDATION_ERROR");

  assert.throws(() => new SemanticInsightRegistry(semantic, [
    {
      id: "source.chart", label: "Source", kind: "chart", model: "sales.summary",
      dimensions: ["branch"], metrics: ["revenue_minor"],
      drillThrough: [{ id: "bad", label: "Bad", targetInsight: "target.table", bindings: [{ sourceDimension: "branch", targetDimension: "branch" }] }],
    },
    {
      id: "target.table", label: "Target", kind: "table", model: "sales.detail",
      dimensions: ["sales_order"], metrics: ["line_amount_minor"], scopeDimensions: [],
    },
  ]), (error) => error.code === "VALIDATION_ERROR");
});
