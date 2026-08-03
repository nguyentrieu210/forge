import test from "node:test";
import assert from "node:assert/strict";
import { assertLoginSecondFactor } from "../dist/packages/frappe-api/src/login-mfa.js";

const BASE = {
  tenantId: "tenant-a",
  userId: "user@example.com",
  traceId: "trace-login-mfa",
  now: "2026-08-03T05:00:00.000Z",
};

test("login preserves password-only behavior when no MFA authority is wired", async () => {
  assert.equal(await assertLoginSecondFactor(BASE, undefined), "password");
});

test("login preserves password-only behavior for users without an enabled factor", async () => {
  const calls = [];
  const mfa = {
    async hasEnabledFactor(...args) { calls.push(["has", ...args]); return false; },
    async verifySecondFactor() { throw new Error("must not verify"); },
  };
  assert.equal(await assertLoginSecondFactor({ ...BASE, mfa }, undefined), "password");
  assert.deepEqual(calls, [["has", "tenant-a", "user@example.com"]]);
});

test("enabled MFA fails closed when the second factor is missing", async () => {
  const mfa = {
    async hasEnabledFactor() { return true; },
    async verifySecondFactor() { throw new Error("must not verify empty input"); },
  };
  await assert.rejects(assertLoginSecondFactor({ ...BASE, mfa }, ""), /code is required/i);
});

test("enabled MFA returns the verified method and binds audit context to the login user", async () => {
  const calls = [];
  const mfa = {
    async hasEnabledFactor() { return true; },
    async verifySecondFactor(...args) { calls.push(args); return { method: "totp" }; },
  };
  assert.equal(await assertLoginSecondFactor({ ...BASE, mfa }, "123456"), "totp");
  assert.equal(calls[0][0], "tenant-a");
  assert.equal(calls[0][1], "user@example.com");
  assert.equal(calls[0][2], "123456");
  assert.deepEqual(calls[0][3], {
    actorUserId: "user@example.com",
    traceId: "trace-login-mfa",
    source: "login",
    reason: "second factor verified for login",
  });
  assert.equal(calls[0][4], BASE.now);
});

test("MFA verifier errors are propagated instead of falling back to password-only login", async () => {
  const mfa = {
    async hasEnabledFactor() { return true; },
    async verifySecondFactor() { throw new Error("MFA encryption key generation is unavailable"); },
  };
  await assert.rejects(
    assertLoginSecondFactor({ ...BASE, mfa }, "123456"),
    /encryption key generation is unavailable/,
  );
});
