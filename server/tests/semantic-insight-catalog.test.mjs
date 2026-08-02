import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { SemanticInsightRegistry } from "../dist/packages/semantic/src/insights.js";
import { PermissionAwareSemanticInsightCatalogService } from "../dist/packages/semantic/src/insight-catalog.js";

const semantic = new SemanticModelRegistry([
  {
    id: "sales.summary", label: "Sales", source: { kind: "view", name: "sales_summary", tenantField: "tenant_id" },
    grain: "one submitted order", permission: { doctype: "Sales Order", action: "report" },
    dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" }],
    metrics: [{ id: "count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }], maxRows: 100,
  },
  {
    id: "payroll.summary", label: "Payroll", source: { kind: "view", name: "payroll_summary", tenantField: "tenant_id" },
    grain: "one salary slip", permission: { doctype: "Salary Slip", action: "report" },
    dimensions: [{ id: "employee", label: "Employee", field: "employee", kind: "link", options: "Employee" }],
    metrics: [{ id: "count", label: "Slips", aggregation: "count", value: { kind: "integer", exact: true } }], maxRows: 100,
  },
]);
const insights = new SemanticInsightRegistry(semantic, [
  { id: "sales.kpi", label: "Sales KPI", kind: "kpi", model: "sales.summary", metrics: ["count"], primaryMetric: "count" },
  { id: "payroll.kpi", label: "Payroll KPI", kind: "kpi", model: "payroll.summary", metrics: ["count"], primaryMetric: "count" },
]);

test("insight catalog hides cards whose underlying model report permission is denied", async () => {
  const service = new PermissionAwareSemanticInsightCatalogService(semantic, insights, {
    async assert(request) {
      if (request.permission.doctype === "Salary Slip") throw Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" });
    },
  });
  const visible = await service.list("tenant-a");
  assert.deepEqual(visible.map((item) => item.id), ["sales.kpi"]);
  assert.ok(!JSON.stringify(visible).includes("payroll.summary"));
});

test("insight catalog propagates infrastructure failures instead of pretending no access", async () => {
  const service = new PermissionAwareSemanticInsightCatalogService(semantic, insights, {
    async assert() { throw Object.assign(new Error("db down"), { code: "D1_UNAVAILABLE" }); },
  });
  await assert.rejects(() => service.list("tenant-a"), (error) => error.code === "D1_UNAVAILABLE");
});
