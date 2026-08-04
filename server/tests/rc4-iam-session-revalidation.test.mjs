import test from "node:test";
import assert from "node:assert/strict";
import {
  establishSession,
  hashPassword,
  mintSession,
} from "../dist/packages/frappe-api/src/index.js";

const TENANT = "tenant-a";
const SECRET = "rc4-a1-session-secret-value-long-enough";
const NOW = "2026-08-04T01:00:00.000Z";
const NOW_SECONDS = Math.floor(Date.parse(NOW) / 1000);
const TEST_ITERATIONS = 1_000;

async function makeUser(overrides = {}) {
  return {
    user_id: "sales@example.com",
    email: "sales@example.com",
    full_name: "Sales Person",
    enabled: true,
    user_type: "System User",
    session_epoch: 1,
    language: "vi",
    time_zone: "Asia/Ho_Chi_Minh",
    roles: ["Sales User"],
    password_hash: await hashPassword("supersecret1", TEST_ITERATIONS),
    ...overrides,
  };
}

function userStore(users) {
  return {
    async get(_tenant, userId) {
      return users.find((user) => user.user_id === userId) ?? null;
    },
    async assertSessionStillValid(tenantId, userId, epoch) {
      const user = await this.get(tenantId, userId);
      if (!user) throw Object.assign(new Error("Session user no longer exists"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      if (!user.enabled) throw Object.assign(new Error("Account is disabled"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      if (user.session_epoch !== epoch) throw Object.assign(new Error("Session has been revoked"), { code: "AUTHENTICATION_REQUIRED", status: 401 });
      return { ...user, roles: [...(user.roles ?? [])] };
    },
  };
}

function context(users) {
  return {
    tenantId: TENANT,
    users,
    sessionSecret: SECRET,
    traceId: "trace-rc4-session-revalidation",
    now: () => NOW,
  };
}

async function legacySessionRequest(user, roles = user.roles) {
  // These regressions deliberately mint a pre-registry cookie. They exercise live user,
  // role and epoch authority independently from exact-session revocation, which is covered
  // by session-registry.test.mjs. Pinning `now` to the request context avoids wall-clock
  // drift turning a valid security test into a future-authentication failure.
  const minted = await mintSession({
    tenantId: TENANT,
    userId: user.user_id,
    roles,
    epoch: 1,
    secret: SECRET,
    now: NOW_SECONDS,
  });
  return new Request("https://tenant.test/api/method/anything", {
    headers: { cookie: `sid=${minted.sid}` },
  });
}

test("live directory roles override stale roles sealed into a valid session", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const request = await legacySessionRequest(user, ["Sales User", "Sales Manager"]);

  user.roles = ["Sales User"];
  const established = await establishSession(request, context(store));

  assert.deepEqual(established.actor.roles, ["Sales User"]);
  assert.equal(established.actor.locale, "vi");
});

test("session epoch remains the all-session kill switch", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const request = await legacySessionRequest(user);

  assert.ok(await establishSession(request, context(store)));
  user.session_epoch = 2;
  await assert.rejects(() => establishSession(request, context(store)), /revoked/i);
});

test("validly signed sessions stop at the live directory when the user is disabled or deleted", async () => {
  const user = await makeUser();
  const store = userStore([user]);
  const request = await legacySessionRequest(user);

  user.enabled = false;
  await assert.rejects(() => establishSession(request, context(store)), /disabled/i);

  const empty = userStore([]);
  await assert.rejects(() => establishSession(request, context(empty)), /no longer exists/i);
});
