import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const resolver = await readFile(new URL("../packages/social-commerce/src/marketplace-profile.ts", import.meta.url), "utf8");
const ingest = await readFile(new URL("../packages/social-commerce/src/provider-order-ingest.ts", import.meta.url), "utf8");
const exceptions = await readFile(new URL("../packages/social-commerce/src/marketplace-mapping-exception.ts", import.meta.url), "utf8");
const bridge = await readFile(new URL("../apps/tenant-worker/src/marketplace-oauth-start.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/tenant/0122_marketplace_mapping_exceptions.sql", import.meta.url), "utf8");

test("mapping exception evidence is tenant-scoped, bounded and contains no buyer/order payload or secrets", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketplace_mapping_exceptions/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, channel_profile, provider, external_sku, external_variant_key\)/);
  assert.match(migration, /reason_code IN \('missing','disabled','channel_mismatch','sku_mismatch','variant_mismatch'\)/);
  assert.match(migration, /resolved_at TEXT/);
  assert.doesNotMatch(migration, /buyer|customer|order_id|payload|access_token|refresh_token|secret/i);
  assert.doesNotMatch(exceptions, /external_buyer_id|raw_body|access_token|refresh_token|partner_key|app_secret/i);
});

test("metadata resolver emits structured exact-SKU mapping failure details for every fail-closed mapping mode", () => {
  for (const reason of ["missing", "disabled", "channel_mismatch", "sku_mismatch", "variant_mismatch"]) {
    assert.match(resolver, new RegExp(`mappingFailureDetails\\(provider, channelProfile, item, "${reason}"\\)`));
  }
  assert.match(resolver, /marketplace_mapping_reason: reason/);
  assert.match(resolver, /external_sku: item\.external_sku/);
  assert.match(resolver, /external_variant_key: item\.external_variant_key/);
});

test("provider ingest records mapping exceptions from structured error details and resolves exact items after metadata succeeds", () => {
  assert.match(ingest, /mappingExceptionFromErrorDetails\(asCloudForgeError\(error\)\.details\)/);
  assert.match(ingest, /recordMarketplaceMappingException\(db, tenantId, mappingException\)/);
  const resolveMetadata = ingest.indexOf("await resolveMarketplaceOrderFromMetadata");
  const resolveInbox = ingest.indexOf("await resolveMarketplaceMappingExceptions");
  const canonical = ingest.indexOf("await ingestResolvedMarketplaceOrder");
  assert.ok(resolveMetadata >= 0 && resolveInbox > resolveMetadata && canonical > resolveInbox);
  assert.match(ingest, /items: normalized\.items/);
});

test("mapping exception store only maintains operator evidence and never creates mappings or canonical ledger state", () => {
  assert.match(exceptions, /INSERT INTO marketplace_mapping_exceptions/);
  assert.match(exceptions, /occurrence_count=marketplace_mapping_exceptions\.occurrence_count\+1/);
  assert.match(exceptions, /resolved_at=NULL/);
  assert.match(exceptions, /UPDATE marketplace_mapping_exceptions[\s\S]*resolved_at=\?6/);
  assert.doesNotMatch(exceptions, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+documents/i);
  assert.doesNotMatch(exceptions, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+social_orders/i);
  assert.doesNotMatch(exceptions, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:stock|gl|payment|ledger)/i);
});

test("manager connection projection exposes open mapping exceptions read-only through the existing authenticated bridge", () => {
  assert.match(bridge, /listOpenMarketplaceMappingExceptions/);
  assert.match(bridge, /listOpenMarketplaceMappingExceptions\(env\.DB, tenantId, 200\)/);
  assert.match(bridge, /jsonResponse\(\{ connections, mapping_exceptions: mappingExceptions \}/);
  assert.doesNotMatch(bridge, /mapping_exceptions[\s\S]{0,200}(?:POST|PUT|DELETE)/);
  assert.doesNotMatch(bridge, /body\.(?:external_sku|external_variant_key|reason_code|resolved_at)/);
});
