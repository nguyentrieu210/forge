import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../dist/apps/gateway-worker/src/index.js";
import {
  assertRecentAuthenticationContext,
  authenticationContextFromJwtClaims,
  deriveIdentityKey,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
  verifyHs256Jwt,
  verifyTrustedIdentity,
} from "../dist/packages/auth/src/index.js";

const JWT_SECRET = "jwt-secret-32-characters-minimum-123456";
const INTERNAL_SECRET = "internal-secret-32-characters-minimum";
const JWT_ISSUER = "https://auth.example.com";
const JWT_AUDIENCE = "cloudforge";

function gatewayEnv(capture) {
  return {
    ROUTES: {
      async get() {
        return JSON.stringify({ tenant_id: "demo", worker_name: "tenant-demo", status: "active", routing_version: 1, plan: "pro" });
      },
    },
    DISPATCHER: {
      get() {
        return {
          async fetch(request) {
            capture.request = request;
            return new Response("ok");
          },
        };
      },
    },
    PLATFORM_SUFFIX: "example.com",
    AUTH_MODE: "production",
    JWT_SECRET,
    JWT_ISSUER,
    JWT_AUDIENCE,
    INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
  };
}

test("verified JWT auth_time/amr/acr become authentication context", async () => {
  const now = 1_785_710_000;
  const token = await signJwt({
    sub: "admin@example.com",
    tenant_id: "demo",
    roles: ["System Manager"],
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: now + 300,
    auth_time: now - 30,
    amr: ["pwd", "otp"],
    acr: "urn:forge:loa:2",
  });
  const claims = await verifyHs256Jwt(token, {
    secret: JWT_SECRET,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    nowSeconds: now,
  });
  assert.deepEqual(authenticationContextFromJwtClaims(claims), {
    auth_time: now - 30,
    amr: ["pwd", "otp"],
    acr: "urn:forge:loa:2",
  });
});

test("JWT iat alone is never promoted to reauthentication evidence", async () => {
  const now = 1_785_710_000;
  const token = await signJwt({
    sub: "admin@example.com",
    tenant_id: "demo",
    roles: ["System Manager"],
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: now + 300,
    iat: now,
  });
  const claims = await verifyHs256Jwt(token, {
    secret: JWT_SECRET,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    nowSeconds: now,
  });
  assert.equal(authenticationContextFromJwtClaims(claims), undefined);
});

test("invalid future auth_time and malformed authentication methods fail closed", async () => {
  const now = 1_785_710_000;
  const future = await signJwt({
    sub: "admin@example.com", tenant_id: "demo", roles: ["System Manager"],
    iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: now + 300, auth_time: now + 31,
  });
  await assert.rejects(
    verifyHs256Jwt(future, { secret: JWT_SECRET, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, nowSeconds: now }),
    /authentication time is invalid/,
  );

  const malformed = await signJwt({
    sub: "admin@example.com", tenant_id: "demo", roles: ["System Manager"],
    iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: now + 300, auth_time: now, amr: [""],
  });
  await assert.rejects(
    verifyHs256Jwt(malformed, { secret: JWT_SECRET, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, nowSeconds: now }),
    /authentication methods are invalid/,
  );
});

test("JWT JSON containers must be objects rather than null or arrays", async () => {
  const now = 1_785_710_000;
  for (const payload of [null, []]) {
    const token = await signJwtValue(payload);
    await assert.rejects(
      verifyHs256Jwt(token, { secret: JWT_SECRET, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, nowSeconds: now }),
      /JWT payload must be a JSON object/,
    );
  }
});

test("recent authentication policy has exact age and future-skew boundaries", () => {
  const now = 20_000;
  assert.doesNotThrow(() => assertRecentAuthenticationContext({ auth_time: now }, now));
  assert.doesNotThrow(() => assertRecentAuthenticationContext({ auth_time: now - 900 }, now));
  assert.doesNotThrow(() => assertRecentAuthenticationContext({ auth_time: now + 60 }, now));
  assert.throws(() => assertRecentAuthenticationContext({ auth_time: now - 901 }, now), /Recent authentication is required/);
  assert.throws(() => assertRecentAuthenticationContext({ auth_time: now + 61 }, now), /Recent authentication is required/);
  assert.throws(() => assertRecentAuthenticationContext(undefined, now), /Recent authentication is required/);
});

test("gateway seals issuer auth_time into the tenant trusted identity", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({
    sub: "admin@example.com",
    tenant_id: "demo",
    roles: ["System Manager"],
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: now + 300,
    auth_time: now - 25,
    amr: ["pwd", "otp"],
    acr: "urn:forge:loa:2",
  });
  const capture = {};
  const response = await gateway.fetch(new Request("https://demo.example.com/api/v1/whoami", {
    headers: { authorization: `Bearer ${token}` },
  }), gatewayEnv(capture));
  assert.equal(response.status, 200);
  assert.ok(capture.request);
  const traceId = capture.request.headers.get("x-cloudforge-trace-id");
  const identity = await verifyTrustedIdentity(capture.request, {
    tenantId: "demo",
    traceId,
    masterSecret: INTERNAL_SECRET,
  });
  assert.deepEqual(identity.authentication, {
    auth_time: now - 25,
    amr: ["pwd", "otp"],
    acr: "urn:forge:loa:2",
  });
});

test("gateway does not synthesize auth_time from a freshly minted JWT", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({
    sub: "admin@example.com",
    tenant_id: "demo",
    roles: ["System Manager"],
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: now + 300,
    iat: now,
  });
  const capture = {};
  const response = await gateway.fetch(new Request("https://demo.example.com/api/v1/whoami", {
    headers: { authorization: `Bearer ${token}` },
  }), gatewayEnv(capture));
  assert.equal(response.status, 200);
  const identity = await verifyTrustedIdentity(capture.request, {
    tenantId: "demo",
    traceId: capture.request.headers.get("x-cloudforge-trace-id"),
    masterSecret: INTERNAL_SECRET,
  });
  assert.equal(identity.authentication, undefined);
});

test("trusted identity rejects a signed null authentication context instead of throwing a TypeError", async () => {
  const now = 1_785_710_000;
  const request = await signedTrustedIdentityRequest({
    tenant_id: "demo",
    actor: { user_id: "admin@example.com", roles: ["System Manager"] },
    trace_id: "trace-malformed-auth",
    issued_at: now,
    expires_at: now + 60,
    key_id: "k1",
    authentication: null,
  });
  await assert.rejects(
    verifyTrustedIdentity(request, {
      tenantId: "demo",
      traceId: "trace-malformed-auth",
      masterSecret: INTERNAL_SECRET,
      nowSeconds: now,
    }),
    /authentication context is invalid/,
  );
});

async function signJwt(payload) {
  return signJwtValue(payload);
}

async function signJwtValue(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${base64urlBytes(signature)}`;
}

async function signedTrustedIdentityRequest(identity) {
  const encoded = base64url(JSON.stringify(identity));
  const derived = await deriveIdentityKey(INTERNAL_SECRET, "demo", identity.key_id);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(derived),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded)));
  return new Request("https://tenant.internal/api/v1/whoami", {
    headers: {
      [IDENTITY_HEADER]: encoded,
      [IDENTITY_SIGNATURE_HEADER]: base64urlBytes(signature),
      "x-cloudforge-trace-id": identity.trace_id,
    },
  });
}

function base64url(value) { return base64urlBytes(new TextEncoder().encode(value)); }
function base64urlBytes(bytes) { return Buffer.from(bytes).toString("base64url"); }
