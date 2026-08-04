import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  routeFrappeAuth,
} from "../dist/packages/frappe-api/src/index.js";

const TENANT = "tenant-a";
const SECRET = "rc4-a1-session-secret-value-long-enough";
const NOW = "2026-08-04T01:00:00.000Z";
const TEST_ITERATIONS = 1_000;

async function makeUser() {
  return {
    user_id: "admin@example.com",
    email: "admin@example.com",
    full_name: "Admin",
    enabled: true,
    user_type: "System User",
    session_epoch: 7,
    language: "vi",
    time_zone: "Asia/Ho_Chi_Minh",
    roles: ["System Manager"],
    password_hash: await hashPassword("correct-password", TEST_ITERATIONS),
  };
}

function loginRequest(extra = {}) {
  const url = new URL("https://tenant.test/api/method/login");
  return {
    url,
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        usr: "admin@example.com",
        pwd: "correct-password",
        ...extra,
      }),
    }),
  };
}

function storeFixture(user, { enabled = true, expectedCode = "123456", method = "totp" } = {}) {
  const order = [];
  const calls = { verify: [], registered: [] };
  const store = {
    mfa: {
      async hasEnabledFactor(tenantId, userId) {
        order.push("mfa.has");
        assert.equal(tenantId, TENANT);
        assert.equal(userId, user.user_id);
        return enabled;
      },
      async verifySecondFactor(tenantId, userId, code, audit, now) {
        order.push("mfa.verify");
        calls.verify.push({ tenantId, userId, code, audit, now });
        assert.equal(code, expectedCode);
        return { method };
      },
    },
    sessions: {
      async register(tenantId, userId, sessionId, createdAt, expiresAt) {
        order.push("session.register");
        calls.registered.push({ tenantId, userId, sessionId, createdAt, expiresAt });
      },
      async purgeExpired() {
        order.push("session.purge");
        return 0;
      },
    },
    async findByLogin(tenantId, login) {
      order.push("user.find");
      assert.equal(tenantId, TENANT);
      if (login.trim().toLowerCase() !== user.email) return null;
      return { user, passwordHash: user.password_hash };
    },
    async listRoles(tenantId, userId) {
      order.push("roles.list");
      assert.equal(tenantId, TENANT);
      assert.equal(userId, user.user_id);
      return user.roles;
    },
    async recordLogin(tenantId, userId, now) {
      order.push("login.record");
      assert.equal(tenantId, TENANT);
      assert.equal(userId, user.user_id);
      assert.equal(now, NOW);
    },
  };
  return { store, order, calls };
}

function context(users) {
  return {
    tenantId: TENANT,
    users,
    sessionSecret: SECRET,
    traceId: "trace-rc4-a1",
    now: () => NOW,
  };
}

test("enabled MFA fails closed before login evidence or session issuance when the second factor is missing", async () => {
  const user = await makeUser();
  const fixture = storeFixture(user);
  const { request, url } = loginRequest();

  const response = await routeFrappeAuth(request, url, context(fixture.store));

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.exc_type, "AuthenticationError");
  assert.match(body.message, /multi-factor authentication code is required/i);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(fixture.calls.registered, []);
  assert.deepEqual(fixture.order, ["user.find", "mfa.has"]);
});

test("valid TOTP is verified before login evidence is recorded and before the revocable session is registered", async () => {
  const user = await makeUser();
  const fixture = storeFixture(user, { expectedCode: "123456", method: "totp" });
  const { request, url } = loginRequest({ mfa_code: "123456" });

  const response = await routeFrappeAuth(request, url, context(fixture.store));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "Logged In" });
  assert.match(response.headers.get("set-cookie") ?? "", /^sid=/);
  assert.ok(response.headers.get("x-frappe-csrf-token"));
  assert.equal(fixture.calls.registered.length, 1);
  assert.match(fixture.calls.registered[0].sessionId, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(fixture.order, [
    "user.find",
    "mfa.has",
    "mfa.verify",
    "roles.list",
    "login.record",
    "session.register",
    "session.purge",
  ]);
  assert.equal(fixture.calls.verify[0].audit.actorUserId, user.user_id);
  assert.equal(fixture.calls.verify[0].audit.source, "login");
  assert.equal(fixture.calls.verify[0].now, NOW);
});

test("single-use recovery login follows the same pre-session second-factor boundary", async () => {
  const user = await makeUser();
  const recovery = "ABCD-EFGH-IJKL-MNOP-QRST-UVWX";
  const fixture = storeFixture(user, { expectedCode: recovery, method: "recovery" });
  const { request, url } = loginRequest({ otp: recovery });

  const response = await routeFrappeAuth(request, url, context(fixture.store));

  assert.equal(response.status, 200);
  assert.equal(fixture.calls.verify.length, 1);
  assert.equal(fixture.calls.verify[0].code, recovery);
  assert.equal(fixture.calls.registered.length, 1);
  assert.ok(fixture.order.indexOf("mfa.verify") < fixture.order.indexOf("session.register"));
});

test("accounts without an enabled factor preserve password-only login while still issuing a registered revocable session", async () => {
  const user = await makeUser();
  const fixture = storeFixture(user, { enabled: false });
  const { request, url } = loginRequest();

  const response = await routeFrappeAuth(request, url, context(fixture.store));

  assert.equal(response.status, 200);
  assert.equal(fixture.calls.verify.length, 0);
  assert.equal(fixture.calls.registered.length, 1);
  assert.deepEqual(fixture.order, [
    "user.find",
    "mfa.has",
    "roles.list",
    "login.record",
    "session.register",
    "session.purge",
  ]);
});
