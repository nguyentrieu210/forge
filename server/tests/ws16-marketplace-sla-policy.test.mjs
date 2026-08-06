import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const metadata = await readFile(new URL("../apps-src/social-commerce/doctypes/marketplace-sla-policy.json", import.meta.url), "utf8");
const controller = await readFile(new URL("../packages/social-commerce/src/marketplace-sla-policy-controller.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../packages/social-commerce/src/registry.ts", import.meta.url), "utf8");
const aggregate = await readFile(new URL("../apps/tenant-worker/src/aggregate-do.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/tenant/0123_marketplace_sla_context.sql", import.meta.url), "utf8");
const providerState = await readFile(new URL("../packages/social-commerce/src/marketplace-provider-order-state.ts", import.meta.url), "utf8");
const ingest = await readFile(new URL("../packages/social-commerce/src/provider-order-ingest.ts", import.meta.url), "utf8");
const operations = await readFile(new URL("../packages/social-commerce/src/marketplace-operations.ts", import.meta.url), "utf8");
const evaluator = await readFile(new URL("../packages/social-commerce/src/marketplace-sla.ts", import.meta.url), "utf8");

test("SLA policy is explicit metadata with no hard-coded business threshold default", () => {
  const parsed = JSON.parse(metadata);
  assert.equal(parsed.name, "Marketplace SLA Policy");
  assert.equal(parsed.autoname, "field:channel_profile");
  const target = parsed.fields.find((field) => field.fieldname === "target_minutes");
  const warning = parsed.fields.find((field) => field.fieldname === "warning_minutes");
  assert.ok(target?.required);
  assert.ok(warning?.required);
  assert.equal(Object.prototype.hasOwnProperty.call(target, "default"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(warning, "default"), false);
  assert.match(metadata, /"options": "order_to_fulfillment"/);
});

test("SLA policy mutation is controller-governed and validates warning before target", () => {
  assert.match(controller, /readonly doctype = "Marketplace SLA Policy"/);
  assert.match(controller, /warningMinutes >= targetMinutes/);
  assert.match(controller, /channel_profile is immutable/);
  assert.match(controller, /metric is immutable/);
  assert.doesNotMatch(controller, /gl_entries:\s*\[[^\]]+\]/);
  assert.doesNotMatch(controller, /stock_entries:\s*\[[^\]]+\]/);
  assert.match(registry, /register\(new MarketplaceSlaPolicyController\(\)\)/);
  assert.match(aggregate, /registerSocialCommerceControllers/);
});

test("provider evidence binds the immutable channel profile needed for policy scope", () => {
  assert.match(migration, /ALTER TABLE marketplace_provider_order_state ADD COLUMN channel_profile TEXT/);
  assert.match(providerState, /channel_profile=COALESCE\(marketplace_provider_order_state\.channel_profile,excluded\.channel_profile\)/);
  assert.match(providerState, /marketplace_provider_order_state\.channel_profile IS NULL/);
  assert.match(providerState, /marketplace_provider_order_state\.channel_profile=excluded\.channel_profile/);
  assert.match(ingest, /channel_profile: resolved\.channel_profile/);
});

test("order SLA projection uses immutable order creation and canonical shipment evidence", () => {
  assert.match(operations, /MIN\(created_at\) AS fulfilled_at/);
  assert.match(operations, /FROM social_shipments/);
  assert.match(operations, /doctype='Marketplace SLA Policy'/);
  assert.match(operations, /evaluateMarketplaceFulfillmentSla/);
  assert.match(evaluator, /order_created_at/);
  assert.match(evaluator, /fulfilled_at/);
  assert.match(evaluator, /if \(!policyPayload\) return null/);
  assert.match(evaluator, /"cancelled" \|\| input\.order_status === "returned"/);
  assert.doesNotMatch(evaluator, /input\.modified_at/);
  assert.doesNotMatch(evaluator, /input\.(?:external_status|latest_external_status)/);
  assert.doesNotMatch(evaluator, /(?:INSERT|UPDATE|DELETE)\s+/i);
});
