import test from "node:test";
import assert from "node:assert/strict";
import { mintSession, routeFrappeAuth } from "../dist/packages/frappe-api/src/index.js";

const SECRET = "logout-failure-contract-secret-at-least-32-chars";
const TENANT = "tenant-a";
const USER = "user@example.com";
const NOW_ISO = "2026-08-03T03:00:00.000Z";
const NOW = Math.floor(Date.parse(NOW_ISO) / 1000);
const SESSION_ID = "session_abcdefghijklmnop";

async function logoutRequest(options = {}) {
  const minted = await mintSession({
    tenantId: TENANT,
    userId: USER,
    roles: ["Sales User"],
    epoch: 4,
    secret: SECRET,
    now: NOW,
    sessionId: SESSION_ID,
  });
  const calls = [];
  const users = options.withRegistry === false
    ? {}
    : {
        sessions: {
          async revokeCurrent(...args) {
            calls.push(args);
            if (options.revokeError) throw options.revokeError;
          },
        },
      };
  const headers = new Headers({ cookie: `sid=${encodeURIComponent(minted.sid)}` });
  if (options.csrf !== false) {
    headers.set("x-frappe-csrf-token", options.csrfToken ?? minted.csrfToken);
  }
  const request = new Request("https://tenant.test/api/method/logout", {
    method: "POST",
    headers,
  });
  const response = await routeFrappeAuth(request, new URL(request.url), {
    tenantId: TENANT,
    users,
    sessionSecret: SECRET,
    traceId: "trace-logout",
    now: () => NOW_ISO,
  });
  return { response, calls };
}

test("logout rejects a valid session when CSRF proof is missing", async () => {
  const { response, calls } = await logoutRequest({ csrf: false });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test("logout does not report success when current-session revocation fails", async () => {
  const { response, calls } = await logoutRequest({
    revokeError: new Error("session registry write failed"),
  });
  assert.equal(response.status, 500);
  assert.equal(calls.length, 1);
});

test("registered logout fails closed when the session registry is unavailable", async () => {
  const { response } = await logoutRequest({ withRegistry: false });
  assert.equal(response.status, 500);
});

test("successful logout revokes the exact current session before clearing the cookie", async () => {
  const { response, calls } = await logoutRequest();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], TENANT);
  assert.equal(calls[0][1], USER);
  assert.equal(calls[0][2], SESSION_ID);
  assert.equal(calls[0][3], NOW_ISO);
  assert.match(response.headers.get("set-cookie") ?? "", /sid=Guest/);
});
