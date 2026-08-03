import test from "node:test";
import assert from "node:assert/strict";
import {
  establishSession,
  hashPassword,
  mintSession,
  routeFrappeApi,
  routeFrappeAuth,
  routeSessionManagementApi,
  verifySession,
} from "../dist/packages/frappe-api/src/index.js";

const SECRET = "session-registry-secret-at-least-32-chars";
const TENANT = "tenant-a";
const NOW_ISO = "2026-08-03T02:00:00.000Z";
const NOW = Math.floor(Date.parse(NOW_ISO) / 1000);

async function userRecord() {
  return {
    user_id: "user@example.com",
    email: "user@example.com",
    full_name: "User",
    enabled: true,
    user_type: "System User",
    session_epoch: 3,
    language: "vi",
    time_zone: "Asia/Ho_Chi_Minh",
    roles: ["Sales User"],
    password_hash: await hashPassword("strong-password", 1_000),
  };
}

function store(user, sessionHooks = {}) {
  const calls = [];
  const sessions = {
    async register(...args) { calls.push(["register", ...args]); return sessionHooks.register?.(...args); },
    async purgeExpired(...args) { calls.push(["purgeExpired", ...args]); return 0; },
    async assertActive(...args) { calls.push(["assertActive", ...args]); return sessionHooks.assertActive?.(...args); },
    async extend(...args) { calls.push(["extend", ...args]); return sessionHooks.extend?.(...args); },
    async revokeCurrent(...args) { calls.push(["revokeCurrent", ...args]); return sessionHooks.revokeCurrent?.(...args); },
    async list(...args) { calls.push(["list", ...args]); return sessionHooks.list?.(...args) ?? []; },
    async revokeOne(...args) { calls.push(["revokeOne", ...args]); return sessionHooks.revokeOne?.(...args) ?? false; },
    async revokeOthers(...args) { calls.push(["revokeOthers", ...args]); return sessionHooks.revokeOthers?.(...args) ?? 0; },
  };
  return {
    calls,
    sessions,
    administration: {
      async revokeSessions(...args) { calls.push(["revokeSessions", ...args]); return user.session_epoch + 1; },
    },
    async findByLogin(_tenant, login) {
      return login.toLowerCase() === user.email ? { user, passwordHash: user.password_hash } : null;
    },
    async listRoles() { return [...user.roles]; },
    async recordLogin() { calls.push(["recordLogin"]); },
    async get() { return user; },
    async assertSessionStillValid(_tenant, userId, epoch) {
      assert.equal(userId, user.user_id);
      assert.equal(epoch, user.session_epoch);
      return { ...user, roles: [...user.roles] };
    },
  };
}

function authContext(users) {
  return { tenantId: TENANT, users, sessionSecret: SECRET, traceId: "trace-session", now: () => NOW_ISO };
}

function sidFromResponse(response) {
  const cookie = response.headers.get("set-cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  assert.ok(match, cookie);
  return decodeURIComponent(match[1]);
}

test("production-style login registers a revocable opaque session id before returning the cookie", async () => {
  const user = await userRecord();
  const users = store(user);
  const request = new Request("https://tenant.test/api/method/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: user.email, pwd: "strong-password" }),
  });
  const response = await routeFrappeAuth(request, new URL(request.url), authContext(users));
  assert.equal(response.status, 200);

  const session = await verifySession(sidFromResponse(response), TENANT, SECRET, NOW);
  assert.match(session.sessionId, /^[A-Za-z0-9_-]{16,128}$/);
  const register = users.calls.find((call) => call[0] === "register");
  assert.ok(register);
  assert.equal(register[1], TENANT);
  assert.equal(register[2], user.user_id);
  assert.equal(register[3], session.sessionId);
  assert.ok(users.calls.some((call) => call[0] === "recordLogin"));
});

test("legacy auth fixture without a registry still mints a backward-compatible legacy cookie", async () => {
  const user = await userRecord();
  const users = store(user);
  delete users.sessions;
  const request = new Request("https://tenant.test/api/method/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: user.email, pwd: "strong-password" }),
  });
  const response = await routeFrappeAuth(request, new URL(request.url), authContext(users));
  assert.equal(response.status, 200);
  const session = await verifySession(sidFromResponse(response), TENANT, SECRET, NOW);
  assert.equal(session.sessionId, undefined);
});

test("a registered session is rejected immediately when its exact registry row is revoked", async () => {
  const user = await userRecord();
  const sessionId = "session_abcdefghijklmnop";
  const minted = await mintSession({
    tenantId: TENANT,
    userId: user.user_id,
    roles: user.roles,
    epoch: user.session_epoch,
    secret: SECRET,
    now: NOW,
    sessionId,
  });
  const users = store(user, {
    assertActive() { throw Object.assign(new Error("Session has been revoked"), { code: "AUTHENTICATION_REQUIRED", status: 401 }); },
  });
  const request = new Request("https://tenant.test/api/method/ping", {
    headers: { cookie: `sid=${encodeURIComponent(minted.sid)}` },
  });
  await assert.rejects(establishSession(request, authContext(users)), /revoked/);
  assert.ok(users.calls.some((call) => call[0] === "assertActive" && call[3] === sessionId));
});

test("session inventory is self-scoped to the authenticated cookie user", async () => {
  const user = await userRecord();
  const seen = [];
  const users = store(user, {
    list(...args) {
      seen.push(args);
      return [{
        session_id: "session_abcdefghijklmnop",
        user_id: user.user_id,
        issued_at: NOW_ISO,
        expires_at: "2026-08-03T14:00:00.000Z",
        last_seen_at: NOW_ISO,
        revoked_at: null,
      }];
    },
  });
  const context = {
    tenantId: TENANT,
    actor: { user_id: user.user_id, roles: user.roles },
    traceId: "trace-session-api",
    authenticatedAt: NOW,
    now: () => NOW_ISO,
    users,
  };
  const url = new URL("https://tenant.test/api/method/metaforge.api.list_sessions?limit=20");
  const response = await routeFrappeApi(new Request(url), url, context);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.sessions.length, 1);
  assert.equal(seen[0][0], TENANT);
  assert.equal(seen[0][1], user.user_id);
});

test("session revoke cannot choose another user and emits an audit-context call", async () => {
  const user = await userRecord();
  const calls = [];
  const users = store(user, {
    revokeOne(...args) { calls.push(args); return true; },
  });
  const context = {
    tenantId: TENANT,
    actor: { user_id: user.user_id, roles: user.roles },
    traceId: "trace-session-api",
    authenticatedAt: NOW,
    now: () => NOW_ISO,
    users,
  };
  const url = new URL("https://tenant.test/api/method/metaforge.api.revoke_session");
  const response = await routeFrappeApi(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "session_abcdefghijklmnop", reason: "lost browser" }),
  }), url, context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.revoked, true);
  assert.equal(calls[0][0], TENANT);
  assert.equal(calls[0][1], user.user_id);
  assert.equal(calls[0][2], "session_abcdefghijklmnop");
  assert.deepEqual(calls[0][3], {
    actorUserId: user.user_id,
    traceId: "trace-session-api",
    source: "session-manager",
    reason: "lost browser",
  });
});

test("logout other sessions keeps the registered current session and avoids epoch fallback", async () => {
  const user = await userRecord();
  const calls = [];
  const sessions = {
    async list() { return []; },
    async revokeOne() { return false; },
    async revokeOthers(...args) { calls.push(args); return 3; },
  };
  let fallbackCalls = 0;
  const url = new URL("https://tenant.test/api/method/metaforge.api.logout_other_sessions");
  const response = await routeSessionManagementApi(new Request(url, { method: "POST" }), url, {
    tenantId: TENANT,
    userId: user.user_id,
    traceId: "trace-session-api",
    now: NOW_ISO,
    sessions,
    currentSessionId: "session_abcdefghijklmnop",
    revokeAllSessions: async () => { fallbackCalls += 1; return 9; },
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).message, {
    revoked: true,
    revoked_sessions: 3,
    reauthenticate_required: false,
  });
  assert.equal(calls[0][2], "session_abcdefghijklmnop");
  assert.equal(fallbackCalls, 0);
});

test("legacy logout-others retains epoch revocation fallback", async () => {
  const user = await userRecord();
  let fallbackCalls = 0;
  const url = new URL("https://tenant.test/api/method/metaforge.api.logout_other_sessions");
  const response = await routeSessionManagementApi(new Request(url, { method: "POST" }), url, {
    tenantId: TENANT,
    userId: user.user_id,
    traceId: "trace-session-api",
    now: NOW_ISO,
    sessions: { async list() { return []; }, async revokeOne() { return false; }, async revokeOthers() { return 0; } },
    revokeAllSessions: async () => { fallbackCalls += 1; return 4; },
  });
  assert.deepEqual((await response.json()).message, {
    revoked: true,
    session_epoch: 4,
    reauthenticate_required: true,
  });
  assert.equal(fallbackCalls, 1);
});

test("app-callback style context cannot enumerate browser sessions", async () => {
  const user = await userRecord();
  const context = {
    tenantId: TENANT,
    actor: { user_id: user.user_id, roles: user.roles },
    traceId: "trace-app-callback",
    now: () => NOW_ISO,
    users: store(user),
  };
  const url = new URL("https://tenant.test/api/method/metaforge.api.list_sessions");
  const response = await routeFrappeApi(new Request(url), url, context);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).exc_type, "PermissionError");
});
