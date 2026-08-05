import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bi = await readFile(new URL("../packages/social-commerce/src/marketplace-bi.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../packages/social-commerce/src/marketplace-bi-api.ts", import.meta.url), "utf8");
const settlementApi = await readFile(new URL("../packages/social-commerce/src/marketplace-settlement-api.ts", import.meta.url), "utf8");
const insights = await readFile(new URL("../../client/apps/runtime/src/experiences/MarketplaceInsightsPanel.tsx", import.meta.url), "utf8");
const slaQueue = await readFile(new URL("../../client/apps/runtime/src/experiences/MarketplaceSlaQueue.tsx", import.meta.url), "utf8");

test("marketplace BI reads canonical sales, fulfillment, stock and settlement evidence only", () => {
  assert.match(bi, /FROM social_orders/);
  assert.match(bi, /JOIN documents dn/);
  assert.match(bi, /sales_order_fulfillment_entries/);
  assert.match(bi, /stock_ledger_entries/);
  assert.match(bi, /marketplace_settlement_evidence/);
  assert.match(bi, /doctype='Stock Return'/);
  assert.match(bi, /return_against/);
  assert.match(bi, /evaluateMarketplaceFulfillmentSla/);
  assert.doesNotMatch(bi, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(api, /\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test("contribution fails closed when settlement, inventory cost or FX evidence is incomplete", () => {
  assert.match(bi, /canonicalSubmitted\s*&&\s*settlementCovered\s*&&\s*inventoryCostCovered/);
  assert.match(bi, /!inventoryCostAnomaly/);
  assert.match(bi, /!fxUnresolved/);
  assert.match(bi, /companyCurrency !== currency/);
  assert.match(bi, /inventoryCostCurrency !== currency/);
  assert.match(bi, /contribution_covered_orders/);
  assert.match(bi, /fx_unresolved_orders/);
  assert.match(bi, /settlement_gross_mismatch_orders/);
});

test("marketplace BI never creates a cross-currency total", () => {
  assert.match(bi, /const currencyMap = new Map/);
  assert.match(bi, /currencyMap\.get\(observation\.currency\)/);
  assert.match(bi, /providerKey = `\$\{observation\.currency\}/);
  assert.match(bi, /currencies:/);
  assert.doesNotMatch(bi, /grand_total_all_currencies|total_revenue_all_currencies|global_revenue_minor/);
});

test("BI endpoint is GET-only and mounted read-only from the existing SLA queue", () => {
  assert.match(api, /request\.method !== "GET"/);
  assert.match(api, /\/api\/v1\/social\/marketplace\/bi/);
  assert.match(api, /Marketplace BI permission is required/);
  assert.match(settlementApi, /routeMarketplaceBiApi/);
  assert.match(insights, /\/api\/v1\/social\/marketplace\/bi\?days=/);
  assert.match(insights, /Read-only BI/);
  assert.match(insights, /coverage/i);
  assert.match(slaQueue, /MarketplaceInsightsPanel/);
  assert.match(slaQueue, /BI profitability/);
  assert.doesNotMatch(insights, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(insights, /target_minutes|warning_minutes|Date\.now\(\)/);
});
