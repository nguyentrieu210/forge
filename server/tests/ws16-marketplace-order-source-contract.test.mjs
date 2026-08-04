import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const marketplacePath = new URL("../packages/social-commerce/src/marketplace-order.ts", import.meta.url);
const canonicalPath = new URL("../packages/social-commerce/src/canonical-order.ts", import.meta.url);
const appPath = new URL("../apps-src/social-commerce/app.json", import.meta.url);
const profilePath = new URL("../apps-src/social-commerce/doctypes/commerce-channel-profile.json", import.meta.url);
const mappingPath = new URL("../apps-src/social-commerce/doctypes/marketplace-sku-mapping.json", import.meta.url);

async function sources() {
  const [marketplace, canonical, appRaw, profileRaw, mappingRaw] = await Promise.all([
    readFile(marketplacePath, "utf8"),
    readFile(canonicalPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(profilePath, "utf8"),
    readFile(mappingPath, "utf8"),
  ]);
  return {
    marketplace,
    canonical,
    app: JSON.parse(appRaw),
    profile: JSON.parse(profileRaw),
    mapping: JSON.parse(mappingRaw),
  };
}

test("marketplace order ingestion is provider-neutral and idempotently maps into canonical Sales Order", async () => {
  const { marketplace, canonical } = await sources();
  assert.match(marketplace, /MARKETPLACE_PROVIDERS = \["shopee", "lazada", "tiktok_shop"\]/);
  assert.match(marketplace, /marketplaceOrderSourceKey\(normalized\.provider, normalized\.shop_id, normalized\.external_order_id\)/);
  assert.match(marketplace, /ensureCanonicalSocialSalesOrder\(db, tenantId, actor/);
  assert.match(marketplace, /cart_id: `marketplace:\$\{sourceKey\}`/);
  assert.match(marketplace, /page_id: channelId/);
  assert.match(canonical, /new DocumentKernel\(registry, store, permissions\)/);
  assert.match(canonical, /doctype: "Sales Order"/);
  assert.doesNotMatch(marketplace, /INSERT INTO\s+(?:stock|gl|payment)/i);
  assert.doesNotMatch(marketplace, /UPDATE\s+(?:stock|gl|payment)/i);
});

test("marketplace commercial total is an assertion, never a trusted pricing input", async () => {
  const { marketplace } = await sources();
  assert.match(marketplace, /provider_merchandise_total_minor/);
  assert.match(marketplace, /canonical\.grand_total_minor === normalized\.provider_merchandise_total_minor/);
  assert.match(marketplace, /Marketplace merchandise total does not match canonical Sales Order total/);
  assert.match(marketplace, /selling_price_list: normalized\.selling_price_list/);
  assert.doesNotMatch(marketplace, /rate:\s*item\./);
  assert.doesNotMatch(marketplace, /unit_price/);
});

test("marketplace profile and SKU mapping are metadata-first and secret-free", async () => {
  const { app, profile, mapping } = await sources();
  assert.equal(app.id, "social-commerce");
  assert.equal(app.version, "0.3.0");
  assert.ok(app.nav.some((entry) => entry.key === "Commerce Channel Profile"));
  assert.ok(app.nav.some((entry) => entry.key === "Marketplace SKU Mapping"));
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Item"));
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Warehouse"));

  assert.equal(profile.name, "Commerce Channel Profile");
  assert.equal(mapping.name, "Marketplace SKU Mapping");
  const profileFields = new Map(profile.fields.map((field) => [field.fieldname, field]));
  assert.equal(profileFields.get("company")?.options, "Company");
  assert.equal(profileFields.get("warehouse")?.options, "Warehouse");
  assert.equal(profileFields.get("selling_price_list")?.options, "Price List");
  assert.equal(profileFields.get("connection_id")?.fieldtype, "Data");

  const mappingFields = new Map(mapping.fields.map((field) => [field.fieldname, field]));
  assert.equal(mappingFields.get("channel_profile")?.options, "Commerce Channel Profile");
  assert.equal(mappingFields.get("item_code")?.options, "Item");

  for (const doc of [profile, mapping]) {
    for (const field of doc.fields) {
      assert.doesNotMatch(field.fieldname, /(secret|password|access_token|refresh_token|api_key|private_key)/i);
    }
  }
});

test("marketplace contract rejects malformed duplicate lines and unbounded quantities", async () => {
  const { marketplace } = await sources();
  assert.match(marketplace, /Marketplace order requires 1\.\.500 items/);
  assert.match(marketplace, /Duplicate marketplace SKU\/variant line/);
  assert.match(marketplace, /Number\.isSafeInteger\(item\.quantity\)/);
  assert.match(marketplace, /provider_merchandise_total_minor must be a non-negative safe integer/);
});
