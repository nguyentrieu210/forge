import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../dist/apps/gateway-worker/src/index.js";
import {
  createTrustedIdentity,
  deriveAppCallKey,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
} from "../dist/packages/auth/src/index.js";

/**
 * The ONE inbound path where the gateway accepts an identity it did not mint.
 *
 * Everywhere else the gateway decides who the caller is — from a JWT, or Guest — and
 * strips whatever identity headers arrived. Here an app Worker asserts "I am acting for
 * this user", and the gateway believes it only after re-verifying. That makes this the
 * one place in the platform where a mistake is privilege escalation rather than a bug,
 * which is why it gets its own suite.
 */
const MASTER = "platform-master-secret-value-0123456789";
const TENANT = "acme";
const HOST = "https://acme.example.com";
const ACTOR = { user_id: "an@example.com", roles: ["HR Manager"] };

function env(overrides = {}) {
  return {
    ROUTES: {
      async get(key) {
        if (key !== "acme.example.com") return null;
        return JSON.stringify({ tenant_id: TENANT, worker_name: "tenant-acme", status: "active", routing_version: 1 });
      },
    },
    DISPATCHER: {
      get: () => ({
        fetch: async (forwarded) => new Response(JSON.stringify({
          // Echoed so a test can see what the TENANT would have been told.
          seen_path: new URL(forwarded.url).pathname,
          seen_identity: forwarded.headers.get(IDENTITY_HEADER),
        }), { status: 200, headers: { "content-type": "application/json" } }),
      }),
    },
    INTERNAL_AUTH_SECRET: MASTER,
    INTERNAL_AUTH_KEY_ID: "k1",
    AUTH_MODE: "production",
    PLATFORM_SUFFIX: "unused.example",
    ...overrides,
  };
}

async function identityFor(tenantId = TENANT, actor = ACTOR, ttlSeconds = 10) {
  return createTrustedIdentity({ tenantId, actor, traceId: "t", masterSecret: MASTER, keyId: "k1", ttlSeconds });
}

async function callback(headers, path = "method/frappe.client.get_list") {
  return gateway.fetch(new Request(`${HOST}/_app/${path}`, { method: "POST", headers }), env());
}

async function validHeaders(overrides = {}) {
  const identity = await identityFor();
  return {
    "x-cloudforge-app": "hrm",
    authorization: `Bearer ${await deriveAppCallKey(MASTER, TENANT, "hrm")}`,
    [IDENTITY_HEADER]: identity.encoded,
    [IDENTITY_SIGNATURE_HEADER]: identity.signature,
    ...overrides,
  };
}

test("a valid app callback reaches the tenant as the user who invoked the app", async () => {
  const response = await callback(await validHeaders());
  assert.equal(response.status, 200);
  const body = await response.json();
  // The `/_app/` prefix is rewritten to the ordinary API path, so an app calls the same
  // methods a client would rather than a parallel surface that could drift.
  assert.equal(body.seen_path, "/api/method/frappe.client.get_list");

  // The tenant is given an identity this GATEWAY minted, never the app's copy.
  const forwarded = JSON.parse(Buffer.from(body.seen_identity, "base64url").toString("utf8"));
  assert.equal(forwarded.actor.user_id, ACTOR.user_id);
  assert.notEqual(body.seen_identity, (await validHeaders())[IDENTITY_HEADER]);
});

test("an app from another tenant cannot reach this one", async () => {
  // The credential is derived per (tenant, app), so a key minted for `beta` is simply
  // not the key this tenant expects — which is the whole point of deriving it.
  const foreign = await deriveAppCallKey(MASTER, "beta", "hrm");
  const response = await callback(await validHeaders({ authorization: `Bearer ${foreign}` }));
  assert.equal(response.status, 401);
});

test("a wrong or missing app credential is refused", async () => {
  assert.equal((await callback(await validHeaders({ authorization: "Bearer nope" }))).status, 401);
  const { authorization: _drop, ...withoutCredential } = await validHeaders();
  assert.equal((await callback(withoutCredential)).status, 401);
});

test("an app cannot name a user it was not invoked by", async () => {
  // The actor is read from the SIGNED identity, never from a header the app chose. An
  // unsigned claim must not become an actor.
  const { [IDENTITY_HEADER]: _e, [IDENTITY_SIGNATURE_HEADER]: _s, ...noIdentity } = await validHeaders();
  const response = await callback({ ...noIdentity, "x-cloudforge-user": "admin@example.com" });
  assert.equal(response.status, 401);
});

test("a tampered identity is refused", async () => {
  const identity = await identityFor();
  const forged = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(identity.encoded, "base64url").toString("utf8")),
    actor: { user_id: "admin@example.com", roles: ["System Manager"] },
  })).toString("base64url");
  // Same signature, different payload: escalating the actor must not survive.
  const response = await callback(await validHeaders({ [IDENTITY_HEADER]: forged }));
  assert.equal(response.status, 401);
});

test("an expired identity is refused, so a captured one is useless", async () => {
  const stale = await createTrustedIdentity({
    tenantId: TENANT, actor: ACTOR, traceId: "t", masterSecret: MASTER, keyId: "k1",
    nowSeconds: Math.floor(Date.now() / 1000) - 600, ttlSeconds: 10,
  });
  const response = await callback(await validHeaders({
    [IDENTITY_HEADER]: stale.encoded,
    [IDENTITY_SIGNATURE_HEADER]: stale.signature,
  }));
  assert.equal(response.status, 401);
});

test("an identity issued for another tenant is refused", async () => {
  const other = await identityFor("beta");
  const response = await callback(await validHeaders({
    [IDENTITY_HEADER]: other.encoded,
    [IDENTITY_SIGNATURE_HEADER]: other.signature,
  }));
  assert.equal(response.status, 401);
});

test("the callback prefix changes nothing for an ordinary request", async () => {
  // A normal Frappe path with no Authorization is still forwarded as Guest, exactly as
  // before: this feature must not alter the path every real user takes.
  const response = await gateway.fetch(
    new Request(`${HOST}/api/method/metaforge.api.get_boot`),
    env(),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.seen_path, "/api/method/metaforge.api.get_boot");
  const identity = JSON.parse(Buffer.from(body.seen_identity, "base64url").toString("utf8"));
  assert.equal(identity.actor.user_id, "Guest");
});
