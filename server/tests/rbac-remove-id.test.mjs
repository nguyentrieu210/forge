import test from "node:test";
import assert from "node:assert/strict";
import {
  parseUserPermissionIdentity,
  routeFrappeApi,
  userPermissionIdentity,
} from "../dist/packages/frappe-api/src/index.js";

const ADMIN = { user_id: "admin@example.com", roles: ["System Manager"] };
const key = {
  user: "warehouse@example.com",
  allow: "Warehouse",
  forValue: "KHO-1",
  applicableFor: "Stock Entry",
};

test("stable User Permission id round-trips reserved characters", () => {
  const special = {
    user: "name+warehouse@example.com",
    allow: "Cost Center",
    forValue: "HN|01 / Main",
    applicableFor: "Journal Entry",
  };
  assert.deepEqual(parseUserPermissionIdentity(userPermissionIdentity(special)), special);
});

test("remove_user_permission accepts the scope id emitted by access profile", async () => {
  const deleted = [];
  const url = new URL("https://tenant.test/api/method/metaforge.api.remove_user_permission");
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: userPermissionIdentity(key) }),
  });
  const response = await routeFrappeApi(request, url, {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-remove",
    access: {
      async deleteUserPermission(...args) { deleted.push(args); },
    },
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(deleted[0], [
    "tenant-a",
    key.user,
    key.allow,
    key.forValue,
    key.applicableFor,
  ]);
  assert.equal((await response.json()).message.id, userPermissionIdentity(key));
});

test("malformed scope id fails closed", async () => {
  const url = new URL("https://tenant.test/api/method/metaforge.api.remove_user_permission");
  const response = await routeFrappeApi(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "not-a-valid-id" }),
  }), url, {
    tenantId: "tenant-a",
    actor: ADMIN,
    traceId: "trace-remove-bad",
    access: {},
  });
  assert.ok(response);
  assert.equal(response.status, 417);
  assert.equal((await response.json()).exc_type, "ValidationError");
});
