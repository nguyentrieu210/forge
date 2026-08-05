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

test("tenant wrapper mounts fulfillment read before base social routing", () => {
  assert.match(core, /routeMarketplaceFulfillmentRead/);
  assert.match(core, /const marketplaceFulfillmentResponse = await routeMarketplaceFulfillmentRead\(request, url, env\)/);
  assert.match(core, /if \(marketplaceFulfillmentResponse\) return marketplaceFulfillmentResponse/);
});

test("fulfillment mutations remain canonical Social Commerce operations", () => {
  assert.match(api, /\/api\/v1\/social\/orders\/\(\[\^\/\]\+\)\\\/cancel/);
  assert.match(api, /\/api\/v1\/social\/orders\/\(\[\^\/\]\+\)\\\/shipments/);
  assert.match(api, /\/api\/v1\/social\/shipments\/\(\[\^\/\]\+\)\\\/status/);
  assert.match(api, /\/api\/v1\/social\/orders\/\(\[\^\/\]\+\)\\\/returns/);
  assert.match(api, /cancelCanonicalSocialSalesOrder/);
  assert.match(api, /resolveCanonicalDeliveryShipment/);
  assert.match(api, /resolveCanonicalSalesStockReturn/);
  assert.match(api, /releaseMarketplaceReservationForCart/);
  assert.match(api, /commitMarketplaceReservationForCart/);
});
