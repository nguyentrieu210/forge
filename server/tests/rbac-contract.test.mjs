import test from "node:test";
import assert from "node:assert/strict";
import {
  assertExactUserPermission,
  evaluatePermissionCapabilities,
  resolveAccessInspectionActor,
  userPermissionIdentity,
} from "../dist/packages/frappe-api/src/index.js";

const ADMIN = { user_id: "admin@example.com", roles: ["System Manager"] };
const USER = { user_id: "warehouse@example.com", roles: ["Stock User"] };

function userStore() {
  return {
    async get(tenantId, userId) {
      if (tenantId !== "tenant-a" || userId !== USER.user_id) return null;
      return {
        user_id: USER.user_id,
        full_name: "Warehouse User",
        email: USER.user_id,
        enabled: true,
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

test("user-permission identity is stable and includes the applicable doctype", () => {
  const base = { user: USER.user_id, allow: "Warehouse", forValue: "KHO-1" };
  assert.equal(userPermissionIdentity(base), userPermissionIdentity(base));
  assert.notEqual(
    userPermissionIdentity(base),
    userPermissionIdentity({ ...base, applicableFor: "Stock Entry" }),
  );
});

test("hierarchy scope is refused until descendant semantics exist", () => {
  assert.doesNotThrow(() => assertExactUserPermission(false));
  assert.throws(() => assertExactUserPermission(true), /Phạm vi phân cấp chưa được hỗ trợ/);
});
