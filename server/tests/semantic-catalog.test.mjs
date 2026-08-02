import test from "node:test";
import assert from "node:assert/strict";
import { SemanticModelRegistry } from "../dist/packages/semantic/src/index.js";
import { PermissionAwareSemanticCatalogService } from "../dist/packages/semantic/src/catalog.js";

const registry = new SemanticModelRegistry([
  {
    id: "sales.orders",
    label: "Sales orders",
    source: { kind: "view", name: "sales_orders_semantic", tenantField: "tenant_id" },
    grain: "one submitted sales order",
    permission: { doctype: "Sales Order", action: "report" },
    dimensions: [{ id: "branch", label: "Branch", field: "branch", kind: "link", options: "Branch" }],
    metrics: [{ id: "order_count", label: "Orders", aggregation: "count", value: { kind: "integer", exact: true } }],
    maxRows: 500,
  },
  {
    id: "payroll.register",
    label: "Payroll register",
    source: { kind: "view", name: "payroll_register", tenantField: "tenant_id" },
    grain: "one submitted salary slip",
    permission: { doctype: "Salary Slip", action: "report" },
    dimensions: [{ id: "employee", label: "Employee", field: "employee", kind: "link", options: "Employee" }],
    metrics: [{ id: "slip_count", label: "Slips", aggregation: "count", value: { kind: "integer", exact: true } }],
    maxRows: 500,
  },
]);

const allScope = { mode: "all", actor_user_id: "reader@example.com", user_permissions: [] };
function denied(code = "PERMISSION_DENIED") { return Object.assign(new Error("denied"), { code }); }

test("catalog omits models denied by the same permission/read-scope boundary", async () => {
  const events = [];
  const service = new PermissionAwareSemanticCatalogService(registry, {
    async authorize(request) {
      events.push(request);
      if (request.permission.doctype === "Salary Slip") throw denied();
      return allScope;
    },
  });
  const visible = await service.list("tenant-a");
  assert.deepEqual(visible.map((model) => model.id), ["sales.orders"]);
  assert.equal(events.length, 2);
  const serialized = JSON.stringify(visible);
  assert.ok(!serialized.includes("sales_orders_semantic"));
  assert.ok(!serialized.includes("tenant_id"));
});

test("direct catalog get fails closed when model permission is denied", async () => {
  const service = new PermissionAwareSemanticCatalogService(registry, {
    async authorize(request) {
      if (request.permission.doctype === "Salary Slip") throw denied("FORBIDDEN");
      return allScope;
    },
  });
  await assert.rejects(() => service.get("tenant-a", "payroll.register"), (error) => error.code === "FORBIDDEN");
});

test("catalog does not disguise infrastructure failure as empty permissions", async () => {
  const service = new PermissionAwareSemanticCatalogService(registry, {
    async authorize() { throw Object.assign(new Error("db unavailable"), { code: "D1_UNAVAILABLE" }); },
  });
  await assert.rejects(() => service.list("tenant-a"), (error) => error.code === "D1_UNAVAILABLE");
});
