import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const marketplacePath = new URL("../packages/social-commerce/src/marketplace-order.ts", import.meta.url);
const resolverPath = new URL("../packages/social-commerce/src/marketplace-profile.ts", import.meta.url);
const operationsPath = new URL("../packages/social-commerce/src/marketplace-operations.ts", import.meta.url);
const canonicalPath = new URL("../packages/social-commerce/src/canonical-order.ts", import.meta.url);
const apiPath = new URL("../packages/social-commerce/src/api.ts", import.meta.url);
const appPath = new URL("../apps-src/social-commerce/app.json", import.meta.url);
const profilePath = new URL("../apps-src/social-commerce/doctypes/commerce-channel-profile.json", import.meta.url);
const mappingPath = new URL("../apps-src/social-commerce/doctypes/marketplace-sku-mapping.json", import.meta.url);

async function sources() {
  const [marketplace, resolver, operations, canonical, api, appRaw, profileRaw, mappingRaw] = await Promise.all([
    readFile(marketplacePath, "utf8"),
    readFile(resolverPath, "utf8"),
    readFile(operationsPath, "utf8"),
    readFile(canonicalPath, "utf8"),
    readFile(apiPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(profilePath, "utf8"),
    readFile(mappingPath, "utf8"),
  ]);
  return {
    marketplace,
    resolver,
    operations,
    canonical,
    api,
    app: JSON.parse(appRaw),
    profile: JSON.parse(profileRaw),
    mapping: JSON.parse(mappingRaw),
  };
}

test("marketplace order ingestion is provider-neutral and maps into canonical Sales Order", async () => {
  const { marketplace, canonical } = await sources();
  assert.match(marketplace, /MARKETPLACE_PROVIDERS = \["shopee", "lazada", "tiktok_shop"\]/);
  assert.match(marketplace, /await marketplaceOrderSourceKey\(normalized\.provider, normalized\.shop_id, normalized\.external_order_id\)/);
  assert.match(marketplace, /sha256Hex\(JSON\.stringify\(\[provider, shop, order\]\)\)/);
  assert.match(marketplace, /ensureCanonicalSocialSalesOrder\(db, tenantId, actor/);
  assert.match(marketplace, /cart_id: `marketplace:\$\{sourceKey\}`/);
  assert.match(marketplace, /page_id: channelId/);
  assert.match(canonical, /new DocumentKernel\(registry, store, permissions\)/);
  assert.match(canonical, /doctype: "Sales Order"/);
  assert.doesNotMatch(marketplace, /INSERT INTO\s+(?:stock|gl|payment)/i);
  assert.doesNotMatch(marketplace, /UPDATE\s+(?:stock|gl|payment)/i);
});

test("canonical marketplace Sales Order persists opaque customer identity lineage, not provider buyer id", async () => {
  const { marketplace } = await sources();
  assert.match(marketplace, /crmCustomerExternalIdentityKey\(\s*normalized\.provider,\s*normalized\.shop_id,\s*normalized\.external_buyer_id/);
  assert.match(marketplace, /marketplaceCustomerIdentityLineage\(/);
  assert.match(marketplace, /external_actor_id: externalActorLineage/);
  assert.match(marketplace, /return `crm-external-identity:\$\{identityKey\}`/);
  assert.doesNotMatch(marketplace, /external_actor_id:\s*normalized\.external_buyer_id/);
});

test("authenticated marketplace ingest resolves metadata then reserves ATP before canonical conversion", async () => {
  const { api, operations } = await sources();
  assert.match(api, /\/api\/v1\/social\/marketplace\/orders\/ingest/);
  assert.match(api, /requireWriter\(actor\)/);
  assert.match(api, /resolveMarketplaceOrderFromMetadata\(\s*db,\s*tenantId/);
  assert.match(api, /ingestResolvedMarketplaceOrder\(db, tenantId, actor, resolved\)/);
  assert.match(api, /stock_reservation: operational\.reservation\.idempotent_replay \? "idempotent" : "active"/);
  assert.ok(operations.indexOf("reserveCommercialStock") < operations.indexOf("ensureCanonicalMarketplaceSalesOrder"));
  assert.match(operations, /catch \(error\)[\s\S]*releaseCommercialStockReservations/);
});

test("marketplace commercial total is reconciled before submit and never trusted as pricing input", async () => {
  const { marketplace, canonical } = await sources();
  assert.match(marketplace, /expected_grand_total_minor: normalized\.provider_merchandise_total_minor/);
  assert.match(marketplace, /reconciledProviderTotal = normalized\.provider_merchandise_total_minor === undefined \? null : true/);
  assert.match(canonical, /assertExpectedCommercialTotal\(name, draft\.data, input\.expected_grand_total_minor\);\n  const submit/);
  assert.match(canonical, /External commercial total does not match canonical Sales Order total/);
  assert.match(marketplace, /selling_price_list: normalized\.selling_price_list/);
  assert.doesNotMatch(marketplace, /rate:\s*item\./);
  assert.doesNotMatch(marketplace, /unit_price/);
});

test("provider input cannot choose ERP master data or canonical Item codes", async () => {
  const { resolver } = await sources();
  assert.match(resolver, /resolveMarketplaceOrderFromMetadata/);
  assert.match(resolver, /Commerce Channel Profile/);
  assert.match(resolver, /Marketplace SKU Mapping/);
  assert.match(resolver, /const company = jsonText\(profile\.company/);
  assert.match(resolver, /const customer = jsonText\(profile\.default_customer/);
  assert.match(resolver, /const currency = jsonText\(profile\.currency/);
  assert.match(resolver, /const sellingPriceList = jsonText\(profile\.selling_price_list/);
  assert.match(resolver, /const warehouse = jsonText\(profile\.warehouse/);
  assert.match(resolver, /item_code: jsonText\(mapping\.item_code/);
  const providerInterface = resolver.slice(resolver.indexOf("export interface MarketplaceProviderOrderInput"), resolver.indexOf("export interface ResolvedMarketplaceOrder"));
  assert.doesNotMatch(providerInterface, /item_code|company|customer|currency|selling_price_list|warehouse/);
});

test("marketplace profile and SKU mapping are metadata-first, unique and secret-free", async () => {
  const { app, profile, mapping } = await sources();
  assert.equal(app.id, "social-commerce");
  assert.equal(app.version, "0.4.0");
  assert.ok(app.nav.some((entry) => entry.key === "Commerce Channel Profile"));
  assert.ok(app.nav.some((entry) => entry.key === "Marketplace SKU Mapping"));
  for (const name of ["Item", "Warehouse", "Sales Order", "Delivery Note", "Stock Return", "Sales Invoice", "Payment Entry"]) {
    assert.ok(app.externalDocTypes.some((entry) => entry.name === name), `missing ${name} dependency`);
  }

  assert.equal(profile.name, "Commerce Channel Profile");
  assert.equal(mapping.name, "Marketplace SKU Mapping");
  assert.equal(mapping.autoname, "format:{channel_profile}:{external_sku}:{external_variant_key}");
  const profileFields = new Map(profile.fields.map((field) => [field.fieldname, field]));
  assert.equal(profileFields.get("company")?.options, "Company");
  assert.equal(profileFields.get("warehouse")?.options, "Warehouse");
  assert.equal(profileFields.get("selling_price_list")?.options, "Price List");
  assert.equal(profileFields.get("connection_id")?.fieldtype, "Data");

  const mappingFields = new Map(mapping.fields.map((field) => [field.fieldname, field]));
  assert.equal(mappingFields.get("channel_profile")?.options, "Commerce Channel Profile");
  assert.equal(mappingFields.get("item_code")?.options, "Item");
  assert.equal(mappingFields.get("external_variant_key")?.required, true);
  assert.equal(mappingFields.get("external_variant_key")?.default, "BASE");

  for (const doc of [profile, mapping]) {
    for (const field of doc.fields) assert.doesNotMatch(field.fieldname, /(secret|password|access_token|refresh_token|api_key|private_key)/i);
  }
});

test("marketplace contract rejects malformed duplicate lines and unbounded quantities", async () => {
  const { marketplace, resolver } = await sources();
  assert.match(marketplace, /Marketplace order requires 1\.\.500 items/);
  assert.match(marketplace, /Duplicate marketplace SKU\/variant line/);
  assert.match(marketplace, /Number\.isSafeInteger\(item\.quantity\)/);
  assert.match(marketplace, /provider_merchandise_total_minor must be a non-negative safe integer/);
  assert.match(resolver, /Marketplace provider order requires 1\.\.500 items/);
  assert.match(resolver, /Duplicate marketplace provider SKU\/variant line/);
});
