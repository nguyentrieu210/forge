import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
} from "../dist/packages/integration-hub/src/credential-envelope.js";
import {
  applyMarketplaceRefreshResponse,
  buildMarketplaceCredentialMaterial,
  buildMarketplaceCredentialRefreshState,
  credentialRequiresReauthorization,
  refreshStoredMarketplaceCredential,
} from "../dist/packages/integration-hub/src/marketplace-credential-vault.js";

const key = Buffer.alloc(32, 7).toString("base64");
const NOW = new Date("2026-08-05T05:40:00.000Z");

function httpWith(payload) {
  const calls = [];
  return {
    calls,
    client: {
      async fetch(input, init) {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };
}

test("credential envelope is AES-GCM AAD-bound and never contains plaintext", async () => {
  const secret = JSON.stringify({ provider: "tiktok_shop", app_key: "key", app_secret: "super-secret", access_token: "access-secret" });
  const aad = "marketplace-credential/v1:tenant-1:INT-MKT-00001:tiktok_shop:secret:main";
  const envelope = await encryptCredentialEnvelope(secret, key, aad, "MARKETPLACE_CREDENTIAL_KEK");
  assert.doesNotMatch(envelope, /super-secret|access-secret/);
  assert.equal(await decryptCredentialEnvelope(envelope, key, aad, "MARKETPLACE_CREDENTIAL_KEK"), secret);
  await assert.rejects(
    decryptCredentialEnvelope(envelope, key, `${aad}:wrong`, "MARKETPLACE_CREDENTIAL_KEK"),
  );
});

test("marketplace vault schema contains encrypted envelope and rotation actor only", async () => {
  const migration = await readFile(new URL("../migrations/tenant/0120_marketplace_credential_vault.sql", import.meta.url), "utf8");
  assert.match(migration, /envelope_json TEXT NOT NULL/);
  assert.match(migration, /created_by TEXT NOT NULL/);
  assert.match(migration, /modified_by TEXT NOT NULL/);
  assert.match(migration, /UNIQUE \(tenant_id, connection_id\)/);
  assert.doesNotMatch(migration, /access_token|refresh_token|app_secret|partner_key|private_key/i);
});

test("marketplace vault resolves by tenant, connection, secret_ref and provider scope", async () => {
  const source = await readFile(new URL("../packages/integration-hub/src/marketplace-credential-vault.ts", import.meta.url), "utf8");
  assert.match(source, /credentialAad\(tenantId, connectionId, secretRef, provider\)/);
  assert.match(source, /row\.connection_id !== connectionId \|\| row\.provider !== provider/);
  assert.match(source, /vault_status !== "active"/);
  assert.match(source, /modified_by=excluded\.modified_by/);
  assert.match(source, /SET vault_status='revoked',modified_by=/);
  assert.match(source, /AND vault_status='active' AND envelope_json=\?7/);
  assert.match(source, /system:marketplace-refresh/);
  assert.match(source, /decryptCredentialEnvelope\(/);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
});

test("credential material derives provider and Shopee shop scope outside caller payload", () => {
  const material = buildMarketplaceCredentialMaterial(
    "shopee",
    { shop_id: "9001" },
    { partner_id: "123", partner_key: "partner-secret", access_token: "access-secret", shop_id: "attacker-shop" },
  );
  assert.deepEqual(material, {
    provider: "shopee",
    partner_id: "123",
    partner_key: "partner-secret",
    access_token: "access-secret",
    shop_id: "9001",
  });
});

test("provider token metadata is normalized into encrypted refresh lifecycle", () => {
  const tiktok = buildMarketplaceCredentialRefreshState("tiktok_shop", {
    refresh_token: "tts-refresh",
    access_token_expire_in: Math.floor(NOW.getTime() / 1000) + 3600,
    refresh_token_expire_in: Math.floor(NOW.getTime() / 1000) + 86_400,
  }, NOW);
  assert.equal(tiktok.refresh_token, "tts-refresh");
  assert.equal(tiktok.access_expires_at, new Date(NOW.getTime() + 3_600_000).toISOString());
  assert.equal(tiktok.refresh_expires_at, new Date(NOW.getTime() + 86_400_000).toISOString());

  const lazada = buildMarketplaceCredentialRefreshState("lazada", {
    refresh_token: "lz-refresh",
    expires_in: 7200,
    refresh_expires_in: 172800,
  }, NOW);
  assert.equal(lazada.access_expires_at, new Date(NOW.getTime() + 7_200_000).toISOString());
  assert.equal(lazada.refresh_expires_at, new Date(NOW.getTime() + 172_800_000).toISOString());

  const shopee = buildMarketplaceCredentialRefreshState("shopee", {
    refresh_token: "sp-refresh",
    expire_in: 14400,
  }, NOW);
  assert.equal(shopee.access_expires_at, new Date(NOW.getTime() + 14_400_000).toISOString());
  assert.equal(shopee.refresh_expires_at, undefined);
});

test("TikTok lifecycle refreshes before expiry and rotates access plus refresh token", async () => {
  const http = httpWith({
    code: 0,
    data: {
      access_token: "tts-next-access",
      refresh_token: "tts-next-refresh",
      access_token_expire_in: Math.floor(NOW.getTime() / 1000) + 7 * 86_400,
      refresh_token_expire_in: Math.floor(NOW.getTime() / 1000) + 30 * 86_400,
    },
  });
  const result = await refreshStoredMarketplaceCredential({
    schema_version: 2,
    material: { provider: "tiktok_shop", app_key: "tts-key", app_secret: "tts-secret", access_token: "tts-old-access" },
    refresh: {
      refresh_token: "tts-old-refresh",
      access_expires_at: new Date(NOW.getTime() + 600_000).toISOString(),
      refresh_expires_at: new Date(NOW.getTime() + 40 * 86_400_000).toISOString(),
      refresh_before_seconds: 1800,
    },
  }, { now: NOW, http: http.client });
  assert.equal(result.refreshed, true);
  assert.equal(result.credential.material.access_token, "tts-next-access");
  assert.equal(result.credential.refresh.refresh_token, "tts-next-refresh");
  assert.equal(new URL(http.calls[0].url).pathname, "/api/v2/token/refresh");
});

test("Lazada refresh does not extend the original refresh-token authorization horizon", () => {
  const existingRefreshExpiry = new Date(NOW.getTime() + 86_400_000).toISOString();
  const result = applyMarketplaceRefreshResponse({
    schema_version: 2,
    material: { provider: "lazada", app_key: "lz-key", app_secret: "lz-secret", access_token: "lz-old" },
    refresh: {
      refresh_token: "lz-refresh-old",
      access_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
      refresh_expires_at: existingRefreshExpiry,
      refresh_before_seconds: 1800,
    },
  }, {
    access_token: "lz-new",
    refresh_token: "lz-refresh-new",
    expires_in: 2_592_000,
    refresh_expires_in: 15_552_000,
  }, NOW);
  assert.equal(result.material.access_token, "lz-new");
  assert.equal(result.refresh.refresh_token, "lz-refresh-new");
  assert.equal(result.refresh.refresh_expires_at, existingRefreshExpiry);
});

test("Shopee refresh replaces token with canonical shop scope and new expiry", () => {
  const result = applyMarketplaceRefreshResponse({
    schema_version: 2,
    material: { provider: "shopee", partner_id: "123456", partner_key: "sp-secret", access_token: "sp-old", shop_id: "9001" },
    refresh: {
      refresh_token: "sp-refresh-old",
      access_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
      refresh_before_seconds: 1800,
    },
  }, {
    access_token: "sp-new",
    refresh_token: "sp-refresh-new",
    expire_in: 14400,
  }, NOW);
  assert.equal(result.material.access_token, "sp-new");
  assert.equal(result.material.shop_id, "9001");
  assert.equal(result.refresh.refresh_token, "sp-refresh-new");
  assert.equal(result.refresh.access_expires_at, new Date(NOW.getTime() + 14_400_000).toISOString());
});

test("expired refresh authorization fails closed before provider call", async () => {
  const http = httpWith({ code: 0 });
  const stored = {
    schema_version: 2,
    material: { provider: "tiktok_shop", app_key: "tts-key", app_secret: "tts-secret", access_token: "tts-old" },
    refresh: {
      refresh_token: "tts-refresh",
      access_expires_at: new Date(NOW.getTime() - 1_000).toISOString(),
      refresh_expires_at: new Date(NOW.getTime() - 1_000).toISOString(),
      refresh_before_seconds: 1800,
    },
  };
  assert.equal(credentialRequiresReauthorization(stored, NOW), true);
  await assert.rejects(refreshStoredMarketplaceCredential(stored, { now: NOW, http: http.client }), /requires reauthorization/);
  assert.equal(http.calls.length, 0);
});

test("Facebook credential wrapper delegates to the same envelope primitive", async () => {
  const source = await readFile(new URL("../packages/social-commerce/src/credentials.ts", import.meta.url), "utf8");
  assert.match(source, /encryptCredentialEnvelope/);
  assert.match(source, /decryptCredentialEnvelope/);
  assert.match(source, /SOCIAL_CREDENTIAL_KEK/);
});
