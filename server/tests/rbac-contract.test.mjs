import test from "node:test";
import assert from "node:assert/strict";
import {
  assertExactUserPermission,
  evaluatePermissionCapabilities,
  parseUserPermissionIdentity,
  resolveAccessInspectionActor,
  routeFrappeApi,
  userPermissionIdentity,
} from "../dist/packages/frappe-api/src/index.js";

const ADMIN = { user_id: "admin@example.com", roles: ["System Manager"] };
const USER = { user_id: "warehouse@example.com", roles: ["Stock User"] };

function userStore(enabled = true) {
  return {
    async get(tenantId, userId) {
      if (tenantId !== "tenant-a" || userId !== USER.user_id) return null;
      return {
        user_id: USER.user_id,
        full_name: "Warehouse User",
        email: USER.user_id,
        enabled,
        user_type: "System User",
        session_epoch: 0,
        language: "vi",
        time_zone: "Asia/Ho_Chi_Minh",
      };
    },
    async listRoles(tenantId, userId) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(userId, USER.user_id);
      return [...USER.roles];
    },
  };
}

test("access inspection resolves the selected user from the tenant directory", async () => {
  const actor = await resolveAccessInspectionActor({
    requestedUser: USER.user_id,
    caller: ADMIN,
    tenantId: "tenant-a",
    users: userStore(),
  });
  assert.deepEqual(actor, {
    ...USER,
    locale: "vi",
    timezone: "Asia/Ho_Chi_Minh",
  });
});

test("a non-admin cannot inspect another user's access", async () => {
  await assert.rejects(
    resolveAccessInspectionActor({
      requestedUser: USER.user_id,
      caller: { user_id: "sales@example.com", roles: ["Sales User"] },
      tenantId: "tenant-a",
      users: userStore(),
    }),
    /System Manager is required/,
  );
});

test("a disabled user is not silently simulated as an active actor", async () => {
  await assert.rejects(
    resolveAccessInspectionActor({
      requestedUser: USER.user_id,
      caller: ADMIN,
      tenantId: "tenant-a",
      users: userStore(false),
    }),
    /disabled/,
  );
});

test("capabilities and trace are evaluated with the selected actor", async () => {
  const calls = [];
  const permissions = {
    async assert(request) {
      calls.push(request);
      assert.equal(request.actor.user_id, USER.user_id);
      if (["read", "create", "save"].includes(request.action)) return;
      throw new Error(`Role is not allowed to ${request.action}`);
    },
  };
  const meta = {
    name: "Stock Entry",
    module: "Stock",
    fields: [],
    permissions: [{ role: "Stock User", read: true, write: true, create: true }],
    is_submittable: true,
    revision: 1,
  };
  const document = {
    tenant_id: "tenant-a",
    doctype: "Stock Entry",
    name: "STE-1",
    owner: "someone@example.com",
    docstatus: 0,
    status: "Draft",
    version: 1,
    created_at: "2026-07-31T00:00:00.000Z",
    modified_at: "2026-07-31T00:00:00.000Z",
    data: {},
    children: [],
  };

  const result = await evaluatePermissionCapabilities({
    actor: USER,
    tenantId: "tenant-a",
    doctype: "Stock Entry",
    meta,
    document,
    permissions,
  });

  assert.equal(result.capabilities.read, true);
  assert.equal(result.capabilities.write, true);
  assert.equal(result.capabilities.submit, false);
  assert.equal(result.capabilities.delete, true);
  assert.ok(result.trace.some((item) => item.label === "submit: bị từ chối"));
  assert.ok(calls.length >= 6);
  assert.ok(calls.every((request) => request.actor.user_id === USER.user_id));
});

test("user-permission identity is stable, reversible and includes the applicable doctype", () => {
  const base = { user: USER.user_id, allow: "Warehouse", forValue: "KHO-1" };
  assert.equal(userPermissionIdentity(base), userPermissionIdentity(base));
  const scoped = { ...base, applicableFor: "Stock Entry" };
  const id = userPermissionIdentity(scoped);
  assert.notEqual(userPermissionIdentity(base), id);
  assert.deepEqual(parseUserPermissionIdentity(id), scoped);
  assert.throws(() => parseUserPermissionIdentity("broken"), /invalid/);
});

test("hierarchy scope is refused until descendant semantics exist", () => {
  assert.doesNotThrow(() => assertExactUserPermission(false));
  assert.throws(() => assertExactUserPermission(true), /Phạm vi phân cấp chưa được hỗ trợ/);
});


function routeFixture() {
  const permissions = [];
  const permissionCalls = [];
  const administrationCalls = [];
  const meta = {
    name: "Stock Entry",
    module: "Stock",
    fields: [],
    permissions: [{ role: "Stock User", read: true, write: true, create: true }],
    is_submittable: true,
    revision: 1,
  };
  const document = {
    tenant_id: "tenant-a",
    doctype: "Stock Entry",
    name: "STE-1",
    owner: "someone@example.com",
    docstatus: 0,
    status: "Draft",
    version: 1,
    created_at: "2026-07-31T00:00:00.000Z",
    modified_at: "2026-07-31T00:00:00.000Z",
    data: {},
    children: [],
  };
  const context = {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-rbac",
    now: () => "2026-07-31T00:00:00.000Z",
    users: {
      ...userStore(),
      administration: {
        async createUserWithRoles(tenantId, input, roles, auditContext, now) {
          administrationCalls.push({ action: "createUserWithRoles", tenantId, input, roles, auditContext, now });
          return [...new Set(roles)].sort();
        },
        async replaceRoles(tenantId, user, roles, auditContext, now) {
          administrationCalls.push({ action: "replaceRoles", tenantId, user, roles, auditContext, now });
          return [...new Set(roles)].sort();
        },
        async setUserEnabled(tenantId, user, enabled, auditContext, now) {
          administrationCalls.push({ action: "setUserEnabled", tenantId, user, enabled, auditContext, now });
        },
        async revokeSessions(tenantId, user, auditContext, now) {
          administrationCalls.push({ action: "revokeSessions", tenantId, user, auditContext, now });
          return 1;
        },
        async updatePasswordAndRevoke(tenantId, user, passwordHash, eventType, auditContext, now) {
          administrationCalls.push({ action: "updatePasswordAndRevoke", tenantId, user, passwordHash, eventType, auditContext, now });
          return 1;
        },
        async putUserPermission(tenantId, input, auditContext, now) {
          administrationCalls.push({ action: "putUserPermission", tenantId, input, auditContext, now });
          const record = {
            user: input.user,
            allow_doctype: input.allowDoctype,
            allow_name: input.allowName,
            applicable_for_doctype: input.applicableForDoctype ?? "",
            is_default: input.isDefault,
            hide_descendants: input.hideDescendants,
            created_by: input.createdBy,
            created_at: now,
          };
          const index = permissions.findIndex((current) =>
            current.user === record.user
            && current.allow_doctype === record.allow_doctype
            && current.allow_name === record.allow_name
            && current.applicable_for_doctype === record.applicable_for_doctype);
          if (index >= 0) permissions[index] = record;
          else permissions.push(record);
        },
        async removeUserPermission(tenantId, input, auditContext, now) {
          administrationCalls.push({ action: "removeUserPermission", tenantId, input, auditContext, now });
          const index = permissions.findIndex((record) =>
            record.user === input.user
            && record.allow_doctype === input.allowDoctype
            && record.allow_name === input.allowName
            && record.applicable_for_doctype === (input.applicableForDoctype ?? ""));
          if (index < 0) return false;
          permissions.splice(index, 1);
          return true;
        },
      },
    },
    metadata: {
      async getDocType(tenantId, doctype) {
        assert.equal(tenantId, "tenant-a");
        return doctype === "Stock Entry" ? meta : null;
      },
    },
    documents: {
      async getDocument(tenantId, doctype, name) {
        assert.equal(tenantId, "tenant-a");
        return doctype === "Stock Entry" && name === "STE-1" ? document : null;
      },
      async hasMasterRecord(tenantId, doctype, name) {
        return tenantId === "tenant-a" && doctype === "Warehouse" && name === "KHO-1";
      },
    },
    permissions: {
      async getReadScope(actor, tenantId, doctype) {
        assert.equal(tenantId, "tenant-a");
        assert.equal(doctype, "Stock Entry");
        return { mode: "all", actor_user_id: actor.user_id, user_permissions: [] };
      },
      async assert(request) {
        permissionCalls.push(request);
        if (["read", "create", "save"].includes(request.action)) return;
        throw new Error(`Role is not allowed to ${request.action}`);
      },
    },
    access: {
      async listUserPermissions(tenantId, user) {
        assert.equal(tenantId, "tenant-a");
        return permissions.filter((record) => record.user === user);
      },
      async putUserPermission(tenantId, record) {
        assert.equal(tenantId, "tenant-a");
        const index = permissions.findIndex((current) =>
current.user === record.user
&& current.allow_doctype === record.allow_doctype
&& current.allow_name === record.allow_name
&& current.applicable_for_doctype === record.applicable_for_doctype);
        if (index >= 0) permissions[index] = record;
        else permissions.push(record);
        return record;
      },
      async deleteUserPermission(tenantId, user, allow, forValue, applicableFor) {
        assert.equal(tenantId, "tenant-a");
        const index = permissions.findIndex((record) =>
record.user === user
&& record.allow_doctype === allow
&& record.allow_name === forValue
&& record.applicable_for_doctype === applicableFor);
        if (index >= 0) permissions.splice(index, 1);
      },
    },
  };
  return { context, permissionCalls, permissions, administrationCalls };
}

async function callMethod(method, params, context, httpMethod = "GET") {
  const url = new URL(`https://tenant.test/api/method/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await routeFrappeApi(new Request(url, { method: httpMethod }), url, context);
  assert.ok(response);
  const body = await response.json();
  return { response, body };
}

test("explain_permission routes every decision through the selected user's actor", async () => {
  const fixture = routeFixture();
  const { response, body } = await callMethod("metaforge.api.explain_permission", {
    doctype: "Stock Entry",
    name: "STE-1",
    user: USER.user_id,
  }, fixture.context);
  assert.equal(response.status, 200);
  assert.equal(body.message.user, USER.user_id);
  assert.deepEqual(body.message.roles, USER.roles);
  assert.ok(Array.isArray(body.message.trace));
  assert.ok(body.message.trace.length > 0);
  assert.ok(fixture.permissionCalls.length >= 6);
  assert.ok(fixture.permissionCalls.every((request) => request.actor.user_id === USER.user_id));
});

test("User Permission add/profile/remove uses one stable id contract", async () => {
  const fixture = routeFixture();
  const added = await callMethod("metaforge.api.add_user_permission", {
    user: USER.user_id,
    allow: "Warehouse",
    for_value: "KHO-1",
  }, fixture.context, "POST");
  assert.equal(added.response.status, 200);
  const id = added.body.message.id;
  assert.equal(typeof id, "string");

  const profile = await callMethod("metaforge.api.get_access_profile", {
    user: USER.user_id,
  }, fixture.context);
  assert.equal(profile.body.message.scopes[0].values[0].id, id);

  const removed = await callMethod("metaforge.api.remove_user_permission", { id }, fixture.context, "POST");
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.message.id, id);
  assert.equal(fixture.permissions.length, 0);
});

test("admin account mutations use the atomic administration service with audit context", async () => {
  const fixture = routeFixture();
  const created = await callMethod("metaforge.api.create_user", {
    user: "new.user@example.com",
    password: "strong-password",
    roles: JSON.stringify(["Stock User"]),
  }, fixture.context, "POST");
  assert.equal(created.response.status, 200);

  await callMethod("metaforge.api.set_user_roles", {
    user: USER.user_id,
    roles: JSON.stringify(["Stock Manager"]),
    reason: "promotion",
  }, fixture.context, "POST");
  await callMethod("metaforge.api.set_user_enabled", {
    user: USER.user_id,
    enabled: "0",
  }, fixture.context, "POST");
  await callMethod("metaforge.api.logout_other_sessions", {}, fixture.context, "POST");
  await callMethod("frappe.core.doctype.user.user.update_password", {
    user: USER.user_id,
    new_password: "new-strong-password",
  }, fixture.context, "POST");

  assert.deepEqual(
    fixture.administrationCalls.map((entry) => entry.action),
    ["createUserWithRoles", "replaceRoles", "setUserEnabled", "revokeSessions", "updatePasswordAndRevoke"],
  );
  for (const entry of fixture.administrationCalls) {
    assert.equal(entry.tenantId, "tenant-a");
    assert.equal(entry.auditContext.actorUserId, ADMIN.user_id);
    assert.equal(entry.auditContext.traceId, "trace-rbac");
  }
  const serialized = JSON.stringify(fixture.administrationCalls);
  assert.equal(serialized.includes("strong-password"), false);
  assert.equal(serialized.includes("new-strong-password"), false);
  assert.equal(fixture.administrationCalls.at(-1).eventType, "password.reset");
});

test("a non-admin cannot call account administration endpoints", async () => {
  const fixture = routeFixture();
  fixture.context.actor = USER;
  const result = await callMethod("metaforge.api.create_user", {
    user: "blocked@example.com",
    password: "strong-password",
    roles: JSON.stringify(["Stock User"]),
  }, fixture.context, "POST");
  assert.equal(result.response.status, 403);
  assert.equal(fixture.administrationCalls.length, 0);
});
