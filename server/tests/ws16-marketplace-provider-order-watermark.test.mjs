import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const state = await readFile(new URL("../packages/social-commerce/src/marketplace-provider-order-state.ts", import.meta.url), "utf8");
const ingest = await readFile(new URL("../packages/social-commerce/src/provider-order-ingest.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/tenant/0121_marketplace_provider_order_state.sql", import.meta.url), "utf8");

test("provider order watermark is orchestration evidence and stores no raw provider payload or buyer identity", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS marketplace_provider_order_state/);
  assert.match(migration, /PRIMARY KEY \(tenant_id, source_key\)/);
  assert.match(migration, /provider IN \('shopee','lazada','tiktok_shop'\)/);
  assert.doesNotMatch(migration, /payload|buyer|customer|access_token|refresh_token|secret/i);
  assert.doesNotMatch(state, /raw_body|external_buyer_id|access_token|refresh_token|partner_key|app_secret/i);
});

test("older and equal-time conflicting provider events cannot overwrite the latest external watermark", () => {
  assert.match(state, /excluded\.latest_occurred_at < marketplace_provider_order_state\.latest_occurred_at/);
  assert.match(state, /excluded\.latest_occurred_at = marketplace_provider_order_state\.latest_occurred_at[\s\S]*excluded\.latest_external_status <> marketplace_provider_order_state\.latest_external_status/);
  assert.match(state, /WHEN excluded\.latest_occurred_at > marketplace_provider_order_state\.latest_occurred_at[\s\S]*THEN excluded\.latest_external_status ELSE marketplace_provider_order_state\.latest_external_status END/);
  assert.match(state, /stale_event_count/);
  assert.match(state, /duplicate_event_count/);
  assert.match(state, /conflict_event_count/);
});

test("provider watermark is recorded only after canonical order acceptance so retry can repair evidence safely", () => {
  const canonicalIndex = ingest.indexOf("await ingestResolvedMarketplaceOrder");
  const watermarkIndex = ingest.indexOf("await observeMarketplaceProviderOrderEvent");
  assert.ok(canonicalIndex >= 0 && watermarkIndex > canonicalIndex);
  assert.match(ingest, /provider_event_state: providerEventState/);
});

test("provider event evidence never mutates canonical order, stock or finance lifecycle", () => {
  assert.doesNotMatch(state, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+social_orders/i);
  assert.doesNotMatch(state, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+social_shipments/i);
  assert.doesNotMatch(state, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+documents/i);
  assert.doesNotMatch(state, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:stock|gl|payment|ledger)/i);
});
