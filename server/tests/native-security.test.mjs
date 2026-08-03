import test from "node:test";
import assert from "node:assert/strict";
import {
  createTrustedIdentity,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
} from "../dist/packages/auth/src/index.js";
import {
  assertRecentNativeSecurityAuthentication,
  requiresRecentNativeSecurityAuthentication,
} from "../dist/apps/tenant-worker/src/native-security.js";

const INTERNAL_SECRET = "internal-secret-32-characters-minimum";
const NOW = 1_785_710_000;

const protectedRoutes = [
  ["POST", "/api/v1/social/facebook/oauth/start"],
  ["POST", "/api/v1/setup/provision-standard-metadata"],
  ["PUT", "/api/v1/user-permissions"],
  ["DELETE", "/api/v1/user-permissions"],
  ["PUT", "/api/v1/meta/Sales%20Order"],
  ["PUT", "/api/v1/workflows/Sales%20Order"],
  ["PUT", "/api/v1/print-formats/Standard"],
];

for (const [method, path] of protectedRoutes) {
  test(`native privileged matcher protects ${method} ${path}`, () => {
    assert.equal(requiresRecentNativeSecurityAuthentication(method, path), true);
  });
}

test("native matcher leaves reads and business workflow execution on their existing authorization paths", () => {
  for (const [method, path] of [
    ["GET", "/api/v1/user-permissions"],
    ["GET", "/api/v1/meta/Sales%20Order"],
    ["GET", "/api/v1/workflows/Sales%20Order"],
    ["POST", "/api/v1/workflows/Sales%20Order/apply"],
    ["POST", "/api/v1/commands"],
    ["POST", "/api/v1/import/apply"],
    ["DELETE", "/api/v1/files/file-1"],
  ]) {
    assert.equal(requiresRecentNativeSecurityAuthentication(method, path), false, `${method} ${path}`);
  }
});

test("recent issuer auth_time in a signed trusted identity passes native step-up", async () => {
  const request = await trustedRequest({ auth_time: NOW - 45, amr: ["pwd", "otp"] });
  await assert.doesNotReject(assertRecentNativeSecurityAuthentication(
    request,
    env(),
    "demo",
    "trace-native",
    NOW,
  ));
});

test("fresh trusted-identity issuance without auth_time is not step-up evidence", async () => {
  const request = await trustedRequest();
  await assert.rejects(
    assertRecentNativeSecurityAuthentication(request, env(), "demo", "trace-native", NOW),
    /Recent authentication is required/,
  );
});

test("stale auth_time remains stale even inside a freshly signed trusted identity", async () => {
  const request = await trustedRequest({ auth_time: NOW - 901, amr: ["pwd"] });
  await assert.rejects(
    assertRecentNativeSecurityAuthentication(request, env(), "demo", "trace-native", NOW),
    /Recent authentication is required/,
  );
});

test("native step-up rejects a trusted identity for another tenant", async () => {
  const request = await trustedRequest({ auth_time: NOW - 20 }, "other");
  await assert.rejects(
    assertRecentNativeSecurityAuthentication(request, env(), "demo", "trace-native", NOW),
    /tenant mismatch|signature/i,
  );
});

test("development mode keeps direct local native administration usable", async () => {
  await assert.doesNotReject(assertRecentNativeSecurityAuthentication(
    new Request("https://tenant.local/api/v1/user-permissions", { method: "PUT" }),
    env({ AUTH_MODE: "development" }),
    "demo",
    "trace-native",
    NOW,
  ));
});

function env(extra = {}) {
  return {
    INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
    AUTH_MODE: "production",
    ...extra,
  };
}

async function trustedRequest(authentication, tenantId = "demo") {
  const trusted = await createTrustedIdentity({
    tenantId,
    actor: { user_id: "admin@example.com", roles: ["System Manager"] },
    traceId: "trace-native",
    masterSecret: INTERNAL_SECRET,
    keyId: "k1",
    nowSeconds: NOW,
    ...(authentication ? { authentication } : {}),
  });
  return new Request("https://tenant.internal/api/v1/user-permissions", {
    method: "PUT",
    headers: {
      [IDENTITY_HEADER]: trusted.encoded,
      [IDENTITY_SIGNATURE_HEADER]: trusted.signature,
      "x-cloudforge-tenant": tenantId,
      "x-cloudforge-trace-id": "trace-native",
    },
  });
}
