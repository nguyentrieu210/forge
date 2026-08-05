import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../../client/apps/runtime/src/experiences/MarketplaceSettlementPanel.tsx", import.meta.url), "utf8");
const settlement = await readFile(new URL("../packages/social-commerce/src/marketplace-settlement.ts", import.meta.url), "utf8");
const settlementApi = await readFile(new URL("../packages/social-commerce/src/marketplace-settlement-api.ts", import.meta.url), "utf8");
const socialApi = await readFile(new URL("../packages/social-commerce/src/api.ts", import.meta.url), "utf8");

test("settlement exception UI writes only provider evidence through canonical settlement route", () => {
  assert.match(panel, /\/api\/v1\/social\/marketplace\/settlements\/reconcile/);
  assert.match(panel, /sales_invoice_name: invoice\.trim\(\)/);
  assert.match(panel, /payment_entry_name: payment\.trim\(\)/);
  assert.match(panel, /accounting_posted === false/);
  assert.match(panel, /Finance canonical/);
  assert.doesNotMatch(panel, /\/api\/v1\/(?:gl|ledger|payment-entry)/i);
});

test("settlement backend verifies canonical invoice and payment allocation without posting accounting", () => {
  assert.match(settlementApi, /reconcileMarketplaceSettlement/);
  assert.match(settlement, /verifyCanonicalCashEvidence/);
  assert.match(settlement, /Sales Invoice/);
  assert.match(settlement, /Payment Entry/);
  assert.match(settlement, /reference_doctype === "Sales Invoice"/);
  assert.match(settlement, /allocated !== input\.payout_minor/);
  assert.match(settlement, /accounting_posted: false/);
  assert.match(settlement, /Marketplace fee\/voucher\/refund accounting remains canonical Finance authority/);
});

test("COD reconciliation remains Delivery Note evidence and does not post Finance", () => {
  assert.ok(socialApi.includes('const reconcile = url.pathname.match(/^\\/api\\/v1\\/social\\/shipments\\/([^/]+)\\/cod-reconcile$/);'));
  assert.match(socialApi, /collected !== shipmentRow\.cod_expected_minor/);
  assert.match(socialApi, /resolveCanonicalDeliveryShipment/);
  assert.match(socialApi, /accounting_posted: false/);
  assert.match(socialApi, /canonical Sales Invoice\/Payment Entry allocation/);
});
