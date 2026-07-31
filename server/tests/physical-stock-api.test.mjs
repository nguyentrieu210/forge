import test from "node:test";
import assert from "node:assert/strict";
import { errors } from "../dist/packages/core/src/index.js";
import {
  MetadataPhysicalStockAccessPolicy,
  routePhysicalStockApi,
} from "../dist/apps/tenant-worker/src/physical-stock-api.js";

const actor = { user_id: "warehouse@example.test", roles: ["Warehouse User"] };

function apiRequest(path, body = {}, method = "POST") {
  return new Request(`https://tenant.example${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

function context(overrides = {}) {
  return {
    db: {},
    tenantId: "tenant-a",
    actor,
    traceId: "trace-stock-api",
    permissions: {
      async assert() {},
      async getReadScope() {
        return { mode: "all", actor_user_id: actor.user_id, user_permissions: [] };
      },
    },
    ...overrides,
  };
}

function emptyPage() {
  return {
    rows: [],
    totals: { quantity_micros: 0, value_micros: 0, physical_count_micros: 0 },
    complete: true,
    lineage_redacted: false,
  };
}

test("physical stock route ignores unrelated endpoints", async () => {
  const response = await routePhysicalStockApi(
    apiRequest("/api/v1/whoami"),
    new URL("https://tenant.example/api/v1/whoami"),
    context(),
    { service: { async run() { return emptyPage(); }, async exportCsv() { throw new Error("unused"); } } },
  );
  assert.equal(response, null);
});

test("physical stock report injects authenticated tenant and normalizes filters", async () => {
  const calls = [];
  const service = {
    async run(receivedActor, tenantId, request) {
      calls.push({ receivedActor, tenantId, request });
      return emptyPage();
    },
    async exportCsv() { throw new Error("unused"); },
  };
  const request = apiRequest("/api/v1/reports/physical-stock", {
    company: "  Demo Company  ",
    warehouse: " Main - DEMO ",
    include_lineage: true,
    include_zero: false,
    limit: 25,
  });
  const response = await routePhysicalStockApi(request, new URL(request.url), context(), { service });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-cloudforge-trace-id"), "trace-stock-api");
  assert.deepEqual(calls, [{
    receivedActor: actor,
    tenantId: "tenant-a",
    request: {
      company: "Demo Company",
      warehouse: "Main - DEMO",
      include_lineage: true,
      include_zero: false,
      limit: 25,
    },
  }]);
});

test("physical stock report rejects client-selected tenant and unknown fields", async () => {
  const service = { async run() { return emptyPage(); }, async exportCsv() { throw new Error("unused"); } };
  const tenantRequest = apiRequest("/api/v1/reports/physical-stock", { company: "Demo", tenant_id: "tenant-b" });
  await assert.rejects(
    () => routePhysicalStockApi(tenantRequest, new URL(tenantRequest.url), context(), { service }),
    /tenant scope is controlled by the authenticated server context/,
  );

  const unknownRequest = apiRequest("/api/v1/reports/physical-stock", { company: "Demo", magic_balance: true });
  await assert.rejects(
    () => routePhysicalStockApi(unknownRequest, new URL(unknownRequest.url), context(), { service }),
    /Unknown physical stock report field: magic_balance/,
  );
});

test("physical stock export returns private CSV and forbids pagination controls", async () => {
  const calls = [];
  const service = {
    async run() { throw new Error("unused"); },
    async exportCsv(receivedActor, tenantId, request) {
      calls.push({ receivedActor, tenantId, request });
      return {
        filename: "physical-stock-Demo.csv",
        content_type: "text/csv; charset=utf-8",
        content: "\uFEFFitem_code,quantity_micros\r\nAL-01,1000000",
        row_count: 1,
      };
    },
  };
  const request = apiRequest("/api/v1/reports/physical-stock/export", { company: "Demo", warehouse: "Main" });
  const response = await routePhysicalStockApi(request, new URL(request.url), context(), { service });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), "attachment; filename=\"physical-stock-Demo.csv\"");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "\uFEFFitem_code,quantity_micros\r\nAL-01,1000000");
  assert.deepEqual(calls, [{ receivedActor: actor, tenantId: "tenant-a", request: { company: "Demo", warehouse: "Main" } }]);

  const paged = apiRequest("/api/v1/reports/physical-stock/export", { company: "Demo", limit: 20 });
  await assert.rejects(
    () => routePhysicalStockApi(paged, new URL(paged.url), context(), { service }),
    /export does not accept cursor, limit or include_lineage/,
  );
});

test("physical stock access policy derives company and warehouse User Permission scope", async () => {
  const actions = [];
  const permissions = {
    async assert(request) {
      actions.push(request.action);
      if (request.action === "export") throw errors.permission("no export");
    },
    async getReadScope(receivedActor, tenantId, doctype) {
      assert.equal(receivedActor, actor);
      assert.equal(tenantId, "tenant-a");
      assert.equal(doctype, "Stock Entry");
      return {
        mode: "all",
        actor_user_id: actor.user_id,
        user_permissions: [
          { allow_doctype: "Company", fields: ["company"], allowed_values: ["Demo", "Demo"] },
          { allow_doctype: "Warehouse", fields: ["source_warehouse", "target_warehouse"], allowed_values: ["Main", "Quarantine"] },
          { allow_doctype: "Warehouse Role", fields: ["warehouse_role"], allowed_values: ["Kho chính"] },
        ],
      };
    },
  };

  const scope = await new MetadataPhysicalStockAccessPolicy(permissions).getScope(actor, "tenant-a");
  assert.deepEqual(scope, {
    companies: ["Demo"],
    warehouses: ["Main", "Quarantine"],
    warehouse_roles: ["Kho chính"],
    max_rows: 200,
    can_view_lineage: true,
    can_export: false,
  });
  assert.deepEqual(actions, ["report", "export"]);
});

test("physical stock access policy refuses owner or share-only document scope", async () => {
  const permissions = {
    async assert() {},
    async getReadScope() {
      return { mode: "owner_or_shared", actor_user_id: actor.user_id, user_permissions: [] };
    },
  };
  await assert.rejects(
    () => new MetadataPhysicalStockAccessPolicy(permissions).getScope(actor, "tenant-a"),
    /requires unrestricted Stock Entry read scope/,
  );
});

test("physical stock route responds 405 without invoking a service", async () => {
  const request = apiRequest("/api/v1/reports/physical-stock", {}, "GET");
  const response = await routePhysicalStockApi(request, new URL(request.url), context(), {
    service: {
      async run() { throw new Error("must not run"); },
      async exportCsv() { throw new Error("must not run"); },
    },
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});
