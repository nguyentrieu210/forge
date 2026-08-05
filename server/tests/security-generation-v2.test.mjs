import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveInternalServiceTokenV2,
  deriveTenantAuthSecretV2,
} from "../dist/packages/auth/src/security-v2.js";
import { resolveSecurityProfile } from "../dist/apps/gateway-worker/src/index-v2.js";
import { withSecurityAwareDispatcher } from "../dist/apps/jobs-worker/src/index-v2.js";
import { removeTenantConfig, writeTenantConfig } from "../scripts/tenant-wrangler.mjs";

const MASTER_A = "a".repeat(43);
const MASTER_B = "b".repeat(43);

test("v2 auth and service derivations are deterministic and tenant scoped", async () => {
  const thuyAuth = await deriveTenantAuthSecretV2(MASTER_A, "thuy");
  assert.equal(thuyAuth, await deriveTenantAuthSecretV2(MASTER_A, "thuy"));
  assert.notEqual(thuyAuth, await deriveTenantAuthSecretV2(MASTER_A, "lan"));
  assert.notEqual(thuyAuth, await deriveTenantAuthSecretV2(MASTER_B, "thuy"));

  const thuyService = await deriveInternalServiceTokenV2(MASTER_A, "thuy");
  assert.equal(thuyService, await deriveInternalServiceTokenV2(MASTER_A, "thuy"));
  assert.notEqual(thuyService, await deriveInternalServiceTokenV2(MASTER_A, "lan"));
  assert.notEqual(thuyService, thuyAuth);
});

test("v2 derivations reject weak masters and unsafe tenant ids", async () => {
  await assert.rejects(() => deriveTenantAuthSecretV2("short", "thuy"), /32 characters/);
  await assert.rejects(() => deriveInternalServiceTokenV2(MASTER_A, "Thúy"), /normalized tenant/);
});

test("gateway profile lookup is opt-in and leaves legacy tenants profile-less", async () => {
  const store = new Map([
    ["alu.kairo.vn", JSON.stringify({ tenant_id: "alu", worker_name: "cloudforge-tenant-alu", status: "active" })],
    ["thuy.kairo.vn", JSON.stringify({ tenant_id: "thuy", worker_name: "cloudforge-tenant-thuy", status: "active" })],
    ["__security__:thuy", JSON.stringify({ tenant_id: "thuy", generation: 2, key_id: "k2", worker_name: "cloudforge-tenant-thuy" })],
  ]);
  const env = {
    ROUTES: { get: async (key) => store.get(key) ?? null },
    PLATFORM_SUFFIX: "example.com",
    AUTH_MODE: "production",
  };
  assert.equal(await resolveSecurityProfile(new Request("https://alu.kairo.vn/api/v1/whoami"), env), null);
  assert.deepEqual(
    await resolveSecurityProfile(new Request("https://thuy.kairo.vn/api/v1/whoami"), env),
    { tenant_id: "thuy", generation: 2, key_id: "k2", worker_name: "cloudforge-tenant-thuy" },
  );
});

test("jobs adapter replaces authorization only for a generation-v2 tenant", async () => {
  const routeStore = new Map([
    ["__security__:thuy", JSON.stringify({ tenant_id: "thuy", generation: 2, key_id: "k2" })],
  ]);
  const observed = [];
  const target = {
    async fetch(input, init) {
      const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
      observed.push({ tenant: request.headers.get("x-cloudforge-tenant"), authorization: request.headers.get("authorization") });
      return new Response("ok");
    },
  };
  const env = withSecurityAwareDispatcher({
    ROUTES: { get: async (key) => routeStore.get(key) ?? null },
    DISPATCHER: { get: () => target },
    INTERNAL_SERVICE_TOKEN: "legacy-token",
    INTERNAL_SERVICE_TOKEN_V2: MASTER_A,
  });

  await env.DISPATCHER.get("cloudforge-tenant-alu").fetch("https://tenant.internal/internal/maintenance", {
    method: "POST",
    headers: { authorization: "Bearer legacy-token", "x-cloudforge-tenant": "alu" },
  });
  await env.DISPATCHER.get("cloudforge-tenant-thuy").fetch("https://tenant.internal/internal/maintenance", {
    method: "POST",
    headers: { authorization: "Bearer legacy-token", "x-cloudforge-tenant": "thuy" },
  });

  assert.equal(observed[0].authorization, "Bearer legacy-token");
  assert.equal(
    observed[1].authorization,
    `Bearer ${await deriveInternalServiceTokenV2(MASTER_A, "thuy")}`,
  );
});

test("generated v2 tenant config contains no platform master and stays in auth-root mode", () => {
  const { configPath } = writeTenantConfig({
    tenant: "thuy",
    databaseId: "00000000-0000-0000-0000-000000000001",
    publicOrigin: "https://thuy.kairo.vn",
    securityGeneration: 2,
  });
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(config.vars.SECURITY_GENERATION, "2");
    assert.equal(config.vars.INTERNAL_AUTH_KEY_ID, undefined);
    assert.equal(config.vars.INTERNAL_AUTH_SECRET_V2, undefined);
    assert.equal(config.vars.INTERNAL_SERVICE_TOKEN_V2, undefined);
    assert.equal(config.vars.PUBLIC_ORIGIN, "https://thuy.kairo.vn");
  } finally {
    removeTenantConfig(configPath);
  }
});
