import test from "node:test";
import assert from "node:assert/strict";
import {
  MFA_BEGIN_TOTP_PATH,
  MFA_CONFIRM_TOTP_PATH,
  MFA_DISABLE_PATH,
  MFA_STATUS_PATH,
  routeMfaApi,
} from "../dist/packages/frappe-api/src/mfa-routes.js";

const NOW = "2026-08-03T04:00:00.000Z";
const NOW_SECONDS = Math.floor(Date.parse(NOW) / 1000);
const ACTOR = { user_id: "user@example.com", roles: ["Sales User"] };

function fixture(authenticatedAt = NOW_SECONDS) {
  const calls = [];
  const mfa = {
    async status(...args) { calls.push(["status", ...args]); return { enabled: true, pending: false, factor_type: "totp", recovery_codes_remaining: 7 }; },
    async beginTotpEnrollment(...args) { calls.push(["begin", ...args]); return { factor_id: "mfa-1", secret_base32: "ABCDEFGHIJKLMNOP", otpauth_uri: "otpauth://totp/test" }; },
    async confirmTotpEnrollment(...args) { calls.push(["confirm", ...args]); return { enabled: true, recovery_codes: ["ABCD-EFGH-IJKL-MNOP-QRST-UVWX"] }; },
    async disable(...args) { calls.push(["disable", ...args]); return true; },
  };
  return {
    calls,
    context: {
      tenantId: "tenant-a",
      actor: ACTOR,
      traceId: "trace-mfa-route",
      authenticatedAt,
      now: NOW,
      mfa,
    },
  };
}

function request(path, method = "GET", body) {
  const url = new URL(`https://tenant.test${path}`);
  return {
    url,
    request: new Request(url, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    }),
  };
}

test("MFA status is self-scoped to the authenticated browser user", async () => {
  const f = fixture();
  const { request: req, url } = request(MFA_STATUS_PATH);
  const response = await routeMfaApi(req, url, f.context);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).message, {
    enabled: true,
    pending: false,
    factor_type: "totp",
    recovery_codes_remaining: 7,
  });
  assert.deepEqual(f.calls[0], ["status", "tenant-a", ACTOR.user_id]);
});

test("begin enrollment requires recent password authentication", async () => {
  const stale = fixture(NOW_SECONDS - 901);
  const { request: req, url } = request(MFA_BEGIN_TOTP_PATH, "POST", {});
  await assert.rejects(routeMfaApi(req, url, stale.context), /sign in again/i);
  assert.equal(stale.calls.length, 0);
});

test("app-callback style actor without browser authentication time cannot manage MFA", async () => {
  const f = fixture(undefined);
  const { request: req, url } = request(MFA_STATUS_PATH);
  await assert.rejects(routeMfaApi(req, url, f.context), /browser session is required/i);
  assert.equal(f.calls.length, 0);
});

test("confirm enrollment returns recovery codes only from the MFA service for the caller", async () => {
  const f = fixture();
  const { request: req, url } = request(MFA_CONFIRM_TOTP_PATH, "POST", { code: "123456", user: "other@example.com" });
  const response = await routeMfaApi(req, url, f.context);
  assert.equal(response.status, 200);
  const message = (await response.json()).message;
  assert.equal(message.enabled, true);
  assert.equal(message.recovery_codes.length, 1);
  assert.equal(f.calls[0][1], "tenant-a");
  assert.equal(f.calls[0][2], ACTOR.user_id);
  assert.equal(f.calls[0][3], "123456");
});

test("disable MFA proves factor possession and cannot target another user", async () => {
  const f = fixture();
  const { request: req, url } = request(MFA_DISABLE_PATH, "POST", {
    code: "ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
    reason: "new phone",
    user: "other@example.com",
  });
  const response = await routeMfaApi(req, url, f.context);
  assert.deepEqual((await response.json()).message, { disabled: true });
  assert.equal(f.calls[0][0], "disable");
  assert.equal(f.calls[0][1], "tenant-a");
  assert.equal(f.calls[0][2], ACTOR.user_id);
  assert.equal(f.calls[0][3], "ABCD-EFGH-IJKL-MNOP-QRST-UVWX");
  assert.equal(f.calls[0][4].reason, "new phone");
});
