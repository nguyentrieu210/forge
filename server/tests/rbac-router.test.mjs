import test from "node:test";
import assert from "node:assert/strict";
import { routeFrappeApi } from "../dist/packages/frappe-api/src/index.js";

const ADMIN = { user_id: "admin@example.com", roles: ["System Manager"] };
const TARGET = { user_id: "warehouse@example.com", roles: ["Stock User"] };

function userRecord(userId = TARGET.user_id) {
  return {
    user_id: userId,
    full_name: userId === TARGET.user_id ? "Warehouse User" : "Admin User",
    email: userId,
    enabled: true,
    user_type: "System User",
    session_epoch: 0,
    language: "vi",
    time_zone: "Asia/Ho_Chi_Minh",
  };
}

function meta() {
  return {
    name: "Stock Entry",
    module: "Stock",
    fields: [{ fieldname: "warehouse", fieldtype: "Link", options: "Warehouse" }],
    permissions: [{ role: "Stock User", read: true, write: true, create: true }],
    is_submittable: true,
    revision: 1,
  };
}

function context(overrides = {}) {
  const permissionCalls = [];
  const deleted = [];
  const stored = [];
  const base = {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-rbac",
    now: () => "2026-07-31T00:00:00.000Z",
    users: {
      async get(tenantId, userId) {
        assert.equal(tenantId, "tenant-a");
        if (![ADMIN.user_id, TARGET.user_id].includes(userId)) return null;
        return userRecord(userId);
      },
      async listRoles(tenantId, userId) {
        assert.equal(tenantId, "tenant-a");
        return userId === TARGET.user_id ? [...TARGET.roles] : [...ADMIN.roles];
      },
    },
    metadata: {
      async getDocType(tenantId, doctype) {
        assert.equal(tenantId, "tenant-a");
        return doctype === "Stock Entry" ? meta() : null;
      },
    },
    documents: {
      async getDocument() { return null; },
      async hasMasterRecord(tenantId, doctype, name) {
        return tenantId === "tenant-a" && doctype === "Warehouse" && name === "KHO-1";
      },
    },
    permissions: {
      async getReadScope(actor, tenantId, doctype) {
        assert.equal(actor.user_id, TARGET.user_id);
        assert.equal(tenantId, "tenant-a");
        assert.equal(doctype, "Stock Entry");
        return {
          mode: "all",
          actor_user_id: actor.user_id,
          user_permissions: [{
            allow_doctype: "Warehouse",
            fields: ["warehouse"],
            allowed_values: ["KHO-1"],
          }],
        };
      },
      async assert(request) {
        permissionCalls.push(request);
        assert.equal(request.actor.user_id, TARGET.user_id);
        if (["read", "create", "save"].includes(request.action)) return;
        throw new Error(`Role is not allowed to ${request.action}`);
      },
    },
    access: {
      async listUserPermissions() { return []; },
      async putUserPermission(tenantId, record) {
        stored.push({ tenantId, record });
        return record;
      },
      async deleteUserPermission(...args) { deleted.push(args); },
    },
  };
  return { value: { ...base, ...overrides }, permissionCalls, stored, deleted };
}

async function call(method, query = {}, options = {}) {
  const url = new URL(`https://tenant.test/api/method/${method}`);
  let request;
  if (options.method === "POST") {
    request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(query),
    });
  } else {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    request = new Request(url);
  }
  const response = await routeFrappeApi(request, url, options.context);
  assert.ok(response);
  return response;
}

test("explain_permission evaluates the selected user's roles and returns trace", async () => {
  const fixture = context();
  const response = await call("metaforge.api.explain_permission", {
    doctype: "Stock Entry",
    user: TARGET.user_id,
  }, { context: fixture.value });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.user, TARGET.user_id);
  assert.deepEqual(body.message.roles, TARGET.roles);
  assert.equal(body.message.capabilities.read, true);
  assert.equal(body.message.capabilities.submit, false);
  assert.ok(Array.isArray(body.message.trace));
  assert.ok(body.message.trace.some((entry) => entry.source === "user_permission"));
  assert.ok(fixture.permissionCalls.length > 0);
  assert.ok(fixture.permissionCalls.every((entry) => entry.actor.user_id === TARGET.user_id));
});

test("a non-admin receives PermissionError when inspecting another user", async () => {
  const fixture = context({ actor: { user_id: "sales@example.com", roles: ["Sales User"] } });
  const response = await call("metaforge.api.explain_permission", {
    doctype: "Stock Entry",
    user: TARGET.user_id,
  }, { context: fixture.value });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).exc_type, "PermissionError");
});

test("access profile exposes a stable composite scope id", async () => {
  const fixture = context({
    access: {
      async listUserPermissions() {
        return [{
          user: TARGET.user_id,
          allow_doctype: "Warehouse",
          allow_name: "KHO-1",
          applicable_for_doctype: "Stock Entry",
          is_default: false,
          hide_descendants: false,
          created_by: ADMIN.user_id,
          created_at: "2026-07-31T00:00:00.000Z",
        }];
      },
    },
  });
  const response = await call("metaforge.api.get_access_profile", {
    user: TARGET.user_id,
  }, { context: fixture.value });
  const scope = (await response.json()).message.scopes[0].values[0];
  assert.equal(typeof scope.id, "string");
  assert.match(scope.id, /warehouse%40example\.com\|Warehouse\|KHO-1\|Stock%20Entry/);
});

test("add and remove user permission use the same composite contract", async () => {
  const fixture = context();
  const addResponse = await call("metaforge.api.add_user_permission", {
    user: TARGET.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
  }, { method: "POST", context: fixture.value });
  assert.equal(addResponse.status, 200);
  const added = (await addResponse.json()).message;
  assert.equal(fixture.stored.length, 1);
  assert.equal(added.for_value, "KHO-1");

  const removeResponse = await call("metaforge.api.remove_user_permission", {
    user: TARGET.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
  }, { method: "POST", context: fixture.value });
  assert.equal(removeResponse.status, 200);
  const removed = (await removeResponse.json()).message;
  assert.equal(removed.id, added.id);
  assert.deepEqual(fixture.deleted[0], ["tenant-a", TARGET.user_id, "Warehouse", "KHO-1", ""]);
});

test("hide_descendants is rejected instead of stored as a no-op", async () => {
  const fixture = context();
  const response = await call("metaforge.api.add_user_permission", {
    user: TARGET.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
    hide_descendants: 1,
  }, { method: "POST", context: fixture.value });
  assert.equal(response.status, 417);
  assert.equal((await response.json()).exc_type, "ValidationError");
  assert.equal(fixture.stored.length, 0);
});
