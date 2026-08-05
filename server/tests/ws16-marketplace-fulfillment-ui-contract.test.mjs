import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projection = await readFile(new URL("../apps/tenant-worker/src/marketplace-fulfillment-read.ts", import.meta.url), "utf8");
const core = await readFile(new URL("../apps/tenant-worker/src/index-core.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../packages/social-commerce/src/api.ts", import.meta.url), "utf8");

test("marketplace fulfillment projection delegates authentication to canonical social order read", () => {
  assert.match(projection, /\/api\/v1\/social\/marketplace\/orders\?limit=1/);
  assert.match(projection, /baseWorker\.fetch/);
  assert.match(projection, /if \(!authorizationProbe\.ok\) return authorizationProbe/);
  assert.match(projection, /cart_id LIKE 'marketplace:%'/);
  assert.match(projection, /FROM social_shipments/);
  assert.match(projection, /cache-control/);
  assert.doesNotMatch(projection, /\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test("fulfillment projection exposes provider event watermark as observational health only", () => {
  assert.match(projection, /SELECT order_id,source_key,sales_order_name,status,currency/);
  assert.match(projection, /FROM marketplace_provider_order_state/);
  assert.match(projection, /WHERE tenant_id=\?1 AND source_key=\?2/);
  assert.match(projection, /provider_event: providerEvent/);
  assert.match(projection, /latest_external_status: providerEvent\.latest_external_status/);
  assert.match(projection, /stale_event_count: Number\(providerEvent\.stale_event_count\)/);
  assert.match(projection, /duplicate_event_count: Number\(providerEvent\.duplicate_event_count\)/);
  assert.match(projection, /conflict_event_count: Number\(providerEvent\.conflict_event_count\)/);
  assert.doesNotMatch(projection, /provider_event[\s\S]{0,500}(?:INSERT|UPDATE|DELETE)/i);
});

test("tenant wrapper mounts fulfillment read before base social routing", () => {
  assert.match(core, /routeMarketplaceFulfillmentRead/);
  assert.match(core, /const marketplaceFulfillmentResponse = await routeMarketplaceFulfillmentRead\(request, url, env\)/);
  assert.match(core, /if \(marketplaceFulfillmentResponse\) return marketplaceFulfillmentResponse/);
});

test("fulfillment mutations remain canonical Social Commerce operations", () => {
  assert.ok(api.includes('const cancelOrder = url.pathname.match(/^\\/api\\/v1\\/social\\/orders\\/([^/]+)\\/cancel$/);'));
  assert.ok(api.includes('const shipment = url.pathname.match(/^\\/api\\/v1\\/social\\/orders\\/([^/]+)\\/shipments$/);'));
  assert.ok(api.includes('const shipmentStatus = url.pathname.match(/^\\/api\\/v1\\/social\\/shipments\\/([^/]+)\\/status$/);'));
  assert.ok(api.includes('const orderReturn = url.pathname.match(/^\\/api\\/v1\\/social\\/orders\\/([^/]+)\\/returns$/);'));
  assert.match(api, /cancelCanonicalSocialSalesOrder/);
  assert.match(api, /resolveCanonicalDeliveryShipment/);
  assert.match(api, /resolveCanonicalSalesStockReturn/);
  assert.match(api, /releaseMarketplaceReservationForCart/);
  assert.match(api, /commitMarketplaceReservationForCart/);
});
