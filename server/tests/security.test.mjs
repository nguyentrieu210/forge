import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../dist/apps/gateway-worker/src/index.js";
import {
  createTrustedIdentity,
  deriveIdentityKey,
  verifyTrustedIdentity,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
} from "../dist/packages/auth/src/index.js";
import { commandPayloadHash } from "../dist/packages/core/src/index.js";
import { parseMutationCommandInput } from "../dist/packages/contracts/src/index.js";

const JWT_SECRET = "jwt-secret-32-characters-minimum-123456";
const INTERNAL_SECRET = "internal-secret-32-characters-minimum";
const JWT_ISSUER = "https://auth.example.com";
const JWT_AUDIENCE = "cloudforge";

test("gateway ignores forged role headers and forwards a signed server identity", async () => {
  let forwarded;
  const token = await signJwt({ sub: "sales@example.com", tenant_id: "demo", roles: ["Sales User"], iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 300 });
  const response = await gateway.fetch(new Request("https://demo.example.com/api/v1/documents/Sales%20Order/SO-1", {
    headers: {
      authorization: `Bearer ${token}`,
      "x-cloudforge-actor": "Administrator",
      "x-cloudforge-roles": "System Manager",
      "x-cloudforge-identity": "forged",
      "x-cloudforge-identity-signature": "forged",
    },
  }), {
    ROUTES: { async get() { return JSON.stringify({ tenant_id: "demo", worker_name: "tenant-demo", status: "active", routing_version: 1 }); } },
    DISPATCHER: { get() { return { async fetch(request) { forwarded = request; return new Response("ok"); } }; } },
    PLATFORM_SUFFIX: "example.com",
    AUTH_MODE: "production",
    JWT_SECRET,
    JWT_ISSUER,
    JWT_AUDIENCE,
    INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.headers.has("authorization"), false);
  assert.equal(forwarded.headers.has("x-cloudforge-roles"), false);
  const identity = await verifyTrustedIdentity(forwarded, {
    masterSecret: INTERNAL_SECRET,
    tenantId: "demo",
    traceId: forwarded.headers.get("x-cloudforge-trace-id"),
  });
  assert.equal(identity.actor.user_id, "sales@example.com");
  assert.deepEqual(identity.actor.roles, ["Sales User"]);
});

test("trusted identity is signed with a per-tenant derived key that other tenants cannot verify", async () => {
  const { encoded, signature } = await createTrustedIdentity({
    tenantId: "demo",
    actor: { user_id: "sales@example.com", roles: ["Sales User"] },
    traceId: "trace-1",
    masterSecret: INTERNAL_SECRET,
    keyId: "k1",
  });
  const request = new Request("https://tenant.internal", {
    headers: { [IDENTITY_HEADER]: encoded, [IDENTITY_SIGNATURE_HEADER]: signature, "x-cloudforge-trace-id": "trace-1" },
  });
  // A tenant worker provisioned with only its own derived key verifies successfully.
  const demoKey = await deriveIdentityKey(INTERNAL_SECRET, "demo", "k1");
  const identity = await verifyTrustedIdentity(request, {
    tenantId: "demo",
    traceId: "trace-1",
    keys: [{ key_id: "k1", secret: demoKey }],
  });
  assert.equal(identity.actor.user_id, "sales@example.com");
  assert.equal(identity.key_id, "k1");
  // The key derived for another tenant must not verify this envelope.
  const otherKey = await deriveIdentityKey(INTERNAL_SECRET, "other", "k1");
  await assert.rejects(
    verifyTrustedIdentity(request, { tenantId: "demo", traceId: "trace-1", keys: [{ key_id: "k1", secret: otherKey }] }),
    (error) => error.code === "AUTHENTICATION_REQUIRED",
  );
  // An unknown key id is rejected outright.
  await assert.rejects(
    verifyTrustedIdentity(request, { tenantId: "demo", traceId: "trace-1", keys: [{ key_id: "k2", secret: demoKey }] }),
    (error) => error.code === "AUTHENTICATION_REQUIRED",
  );
});

test("a credential for tenant A cannot cross the hostname boundary into tenant B", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tokenA = await signJwt({
    sub: "owner@a.test", tenant_id: "tenant-a", roles: ["System Manager"],
    iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: now + 300,
  });
  const routes = {
    a: { tenant_id: "tenant-a", worker_name: "worker-a", status: "active", routing_version: 1 },
    b: { tenant_id: "tenant-b", worker_name: "worker-b", status: "active", routing_version: 1 },
  };
  const dispatched = [];
  const environment = {
    ROUTES: { async get(key) { return routes[key] ? JSON.stringify(routes[key]) : null; } },
    DISPATCHER: { get(name) { return { async fetch(request) { dispatched.push({ name, request }); return new Response(name); } }; } },
    PLATFORM_SUFFIX: "example.com",
    AUTH_MODE: "production",
    JWT_SECRET,
    JWT_ISSUER,
    JWT_AUDIENCE,
    INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
  };

  const own = await gateway.fetch(new Request("https://a.example.com/api/v1/whoami", {
    headers: { authorization: `Bearer ${tokenA}` },
  }), environment);
  assert.equal(own.status, 200);
  assert.equal(dispatched[0].name, "worker-a");
  const ownIdentity = await verifyTrustedIdentity(dispatched[0].request, {
    masterSecret: INTERNAL_SECRET, tenantId: "tenant-a",
    traceId: dispatched[0].request.headers.get("x-cloudforge-trace-id"),
  });
  assert.equal(ownIdentity.actor.user_id, "owner@a.test");

  const cross = await gateway.fetch(new Request("https://b.example.com/api/v1/whoami", {
    headers: { authorization: `Bearer ${tokenA}` },
  }), environment);
  assert.equal(cross.status, 401);
  assert.equal(dispatched.length, 1, "tenant B worker must never receive tenant A's request");
});

test("gateway fails closed when issuer or audience is not configured in production", async () => {
  const token = await signJwt({ sub: "sales@example.com", tenant_id: "demo", roles: ["Sales User"], iss: JWT_ISSUER, aud: JWT_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 300 });
  let forwarded = false;
  const response = await gateway.fetch(new Request("https://demo.example.com/api/v1/documents/Sales%20Order/SO-1", {
    headers: { authorization: `Bearer ${token}` },
  }), {
    ROUTES: { async get() { return JSON.stringify({ tenant_id: "demo", worker_name: "tenant-demo", status: "active", routing_version: 1 }); } },
    DISPATCHER: { get() { return { async fetch() { forwarded = true; return new Response("ok"); } }; } },
    PLATFORM_SUFFIX: "example.com",
    AUTH_MODE: "production",
    JWT_SECRET,
    // JWT_ISSUER and JWT_AUDIENCE intentionally omitted — production must reject.
    INTERNAL_AUTH_SECRET: INTERNAL_SECRET,
  });
  assert.equal(response.status, 500);
  assert.equal(forwarded, false);
});

test("tampered trusted identity and client actor injection are rejected or ignored", async () => {
  const request = new Request("https://tenant.test", { headers: { "x-cloudforge-identity": "e30", "x-cloudforge-identity-signature": "bad" } });
  await assert.rejects(verifyTrustedIdentity(request, { masterSecret: INTERNAL_SECRET, tenantId: "demo" }), (error) => error.code === "AUTHENTICATION_REQUIRED");
  const raw = {
    schema_version: 1, command_id: "cmd-1", tenant_id: "demo", aggregate: { doctype: "Sales Order", name: "SO-1" },
    action: "create", expected_version: null, payload_hash: "a".repeat(64), document: {}, actor: { user_id: "Administrator", roles: ["System Manager"] },
  };
  const parsed = parseMutationCommandInput(raw);
  assert.equal("actor" in parsed, false);
  const withActorA = { ...parsed, actor: { user_id: "a", roles: ["Sales User"] } };
  const withActorB = { ...parsed, actor: { user_id: "b", roles: ["System Manager"] } };
  assert.equal(await commandPayloadHash(withActorA), await commandPayloadHash(withActorB));
});

async function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${base64urlBytes(signature)}`;
}
function base64url(value) { return base64urlBytes(new TextEncoder().encode(value)); }
function base64urlBytes(bytes) { return Buffer.from(bytes).toString("base64url"); }
