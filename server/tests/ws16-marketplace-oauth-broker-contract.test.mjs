import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const broker = await readFile(new URL("../apps/social-ingress-worker/src/marketplace-oauth.ts", import.meta.url), "utf8");
const ingress = await readFile(new URL("../apps/social-ingress-worker/src/index.ts", import.meta.url), "utf8");
const descriptor = await readFile(new URL("../apps/tenant-worker/src/marketplace-oauth-internal.ts", import.meta.url), "utf8");
const startBridge = await readFile(new URL("../apps/tenant-worker/src/marketplace-oauth-start.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/control/0004_marketplace_oauth.sql", import.meta.url), "utf8");

test("marketplace OAuth reuses the control-plane transaction authority without storing seller secrets", () => {
  assert.match(migration, /provider IN \('facebook','tiktok','shopee','lazada','tiktok_shop'\)/);
  assert.match(migration, /connection_id TEXT/);
  assert.match(migration, /INSERT INTO oauth_transactions_next/);
  assert.match(migration, /DROP TABLE oauth_transactions/);
  assert.match(migration, /ALTER TABLE oauth_transactions_next RENAME TO oauth_transactions/);
  assert.doesNotMatch(migration, /access_token|refresh_token|app_secret|partner_key/i);
});

test("broker binds single-use state to canonical tenant worker and connection", () => {
  assert.match(broker, /\/internal\/oauth\/marketplace\/start/);
  assert.ok(broker.includes('const callback = url.pathname.match(/^\\/oauth\\/marketplace\\/(shopee|lazada|tiktok_shop)\\/callback$/);'));
  assert.match(broker, /stateHash = await sha256\(state\)/);
  assert.match(broker, /connection_id\n\s*\) VALUES/);
  assert.match(broker, /consumed_at IS NULL/);
  assert.match(broker, /UPDATE oauth_transactions SET consumed_at=/);
  assert.match(broker, /fetchDescriptor\(/);
  assert.match(broker, /descriptor\.provider !== provider/);
  assert.match(broker, /descriptor\.connection_id !== transaction\.connection_id/);
});

test("provider code exchange stays server-side and writes only to tenant encrypted credential route", () => {
  assert.match(broker, /exchangeShopeeAuthorizationCode/);
  assert.match(broker, /exchangeLazadaAuthorizationCode/);
  assert.match(broker, /exchangeTikTokShopAuthorizationCode/);
  assert.match(broker, /callbackShop !== expectedShop/);
  assert.match(broker, /\/internal\/marketplace\/connections\/\$\{encodeURIComponent\(transaction\.connection_id\)\}\/credential/);
  assert.match(broker, /SHOPEE_PARTNER_KEY/);
  assert.match(broker, /LAZADA_APP_SECRET/);
  assert.match(broker, /TIKTOK_SHOP_APP_SECRET/);
  assert.doesNotMatch(broker, /console\.(?:log|warn|error)/);
});

test("tenant descriptor derives provider and shop scope from canonical Marketplace Connection", () => {
  assert.match(descriptor, /assertInternalService\(request, env\.INTERNAL_SERVICE_TOKEN\)/);
  assert.match(descriptor, /resolveMarketplaceConnection\(env\.DB, tenantId, connectionId\)/);
  assert.match(descriptor, /resolved\.connection\.config\.shop_id/);
  assert.match(descriptor, /resolved\.connection\.config\.shop_cipher/);
  assert.doesNotMatch(descriptor, /access_token|refresh_token|partner_key|app_secret/i);
});

test("browser start accepts only connection id after canonical manager authorization", () => {
  assert.match(startBridge, /\/api\/v1\/social\/marketplace\/oauth\/start/);
  assert.match(startBridge, /new URL\("\/api\/v1\/whoami"/);
  assert.match(startBridge, /canManageMarketplaceConnections\(identity\)/);
  assert.match(startBridge, /identity\.actor_id === "Administrator"/);
  assert.match(startBridge, /identity\.roles\.includes\("Administrator"\)/);
  assert.match(startBridge, /identity\.roles\.includes\("System Manager"\)/);
  assert.match(startBridge, /const connectionId = text\(body\.connection_id/);
  assert.match(startBridge, /tenant_id: identity\.tenant_id/);
  assert.match(startBridge, /actor_id: identity\.actor_id/);
  assert.doesNotMatch(startBridge, /body\.(?:tenant_id|actor_id|provider|shop_id|secret_ref)/);
});

test("manager connection list exposes only canonical connection and non-secret credential health", () => {
  assert.match(startBridge, /\/api\/v1\/social\/marketplace\/connections/);
  assert.match(startBridge, /doctype='Marketplace Connection'/);
  assert.match(startBridge, /resolveMarketplaceConnection\(env\.DB, tenantId, row\.name\)/);
  assert.match(startBridge, /new D1MarketplaceCredentialVault\(env\.DB, env\.MARKETPLACE_CREDENTIAL_KEK\)/);
  assert.match(startBridge, /const secretRef = resolved\.connection\.secret_ref/);
  assert.match(startBridge, /vault && secretRef/);
  assert.match(startBridge, /reauthorization_required/);
  assert.match(startBridge, /access_expires_at/);
  assert.match(startBridge, /refresh_expires_at/);
  assert.doesNotMatch(startBridge, /credential\.material|access_token|refresh_token|partner_key|app_secret/);
});

test("social ingress mounts marketplace OAuth before existing Facebook webhook routing", () => {
  assert.match(ingress, /routeMarketplaceOAuth\(request, url, env\)/);
  assert.match(ingress, /if \(marketplaceOAuthResponse\) return marketplaceOAuthResponse/);
  assert.match(ingress, /\/internal\/oauth\/facebook\/start/);
});
