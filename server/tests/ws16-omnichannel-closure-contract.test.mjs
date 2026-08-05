import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertProviderAdapterConformance,
  validateProviderSignedRequest,
} from "../dist/packages/integration-hub/src/adapter.js";
import {
  SHOPEE_MARKETPLACE_ADAPTER,
  LAZADA_MARKETPLACE_ADAPTER,
  TIKTOK_SHOP_MARKETPLACE_ADAPTER,
} from "../dist/packages/integration-hub/src/marketplace-connectors.js";
import {
  calculateExpectedMarketplacePayout,
} from "../dist/packages/social-commerce/src/marketplace-settlement.js";
import {
  normalizeMarketplaceProviderOrderRecord,
} from "../dist/packages/social-commerce/src/provider-order-normalization.js";

const RECEIVED_AT = "2026-08-05T00:00:00.000Z";

function syncContext(config, signed_request, overrides = {}) {
  return {
    tenant_id: "tenant-1",
    connection_id: "conn-1",
    stream: "orders",
    cursor: null,
    limit: 25,
    credential_headers: {},
    config,
    signed_request,
    ...overrides,
  };
}

test("marketplace adapters conform and require secretless signed-request execution", () => {
  for (const adapter of [SHOPEE_MARKETPLACE_ADAPTER, LAZADA_MARKETPLACE_ADAPTER, TIKTOK_SHOP_MARKETPLACE_ADAPTER]) {
    const conformance = assertProviderAdapterConformance(adapter);
    assert.equal(conformance.inbound, true);
    assert.equal(conformance.sync, true);
    assert.equal(conformance.health, false);
  }
  assert.throws(() => validateProviderSignedRequest({
    operation: "bad",
    method: "GET",
    url: "https://example.com/orders",
    headers: { authorization: "Bearer leaked" },
  }), /must not inject credential headers/);
});

test("Shopee sync hydrates item lines before commerce normalization", async () => {
  const calls = [];
  const page = await SHOPEE_MARKETPLACE_ADAPTER.fetchPage(syncContext(
    { shop_id: "9001" },
    async (request) => {
      calls.push(request);
      if (request.operation === "shopee.order.list") {
        return { status: 200, body: JSON.stringify({ response: { order_list: [{ order_sn: "SHP-1" }], more: false } }) };
      }
      assert.equal(request.operation, "shopee.order.detail");
      return { status: 200, body: JSON.stringify({ response: { order_list: [{
        order_sn: "SHP-1",
        order_status: "READY_TO_SHIP",
        create_time: 1785888000,
        update_time: 1785888060,
        buyer_user_id: 44,
        item_list: [{ model_sku: "SKU-RED", model_id: 101, model_quantity_purchased: 2 }],
      }] } }) };
    },
  ));
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\/v2\/order\/get_order_list/);
  assert.match(calls[1].url, /api\/v2\/order\/get_order_detail/);
  const normalized = normalizeMarketplaceProviderOrderRecord("shopee", "shop-shopee", page.records[0]);
  assert.deepEqual(normalized.items, [{ external_sku: "SKU-RED", external_variant_key: "101", quantity: 2 }]);
  assert.equal(normalized.external_order_id, "SHP-1");
});

test("Lazada preserves /rest base path, hydrates order items and aggregates duplicate units", async () => {
  const calls = [];
  const page = await LAZADA_MARKETPLACE_ADAPTER.fetchPage(syncContext(
    { api_base: "https://api.lazada.vn/rest/" },
    async (request) => {
      calls.push(request);
      if (request.operation === "lazada.order.list") {
        assert.match(new URL(request.url).pathname, /^\/rest\/orders\/get$/);
        return { status: 200, body: JSON.stringify({ data: { orders: [{
          order_id: 7001,
          statuses: ["pending"],
          created_at: "2026-08-05T01:00:00+07:00",
          updated_at: "2026-08-05T01:05:00+07:00",
        }] } }) };
      }
      assert.equal(request.operation, "lazada.order.items");
      assert.match(new URL(request.url).pathname, /^\/rest\/order\/items\/get$/);
      return { status: 200, body: JSON.stringify({ data: [
        { shop_sku: "LZ-SKU", sku_id: "V1" },
        { shop_sku: "LZ-SKU", sku_id: "V1" },
      ] }) };
    },
  ));
  assert.equal(calls.length, 2);
  const normalized = normalizeMarketplaceProviderOrderRecord("lazada", "shop-lazada", page.records[0]);
  assert.deepEqual(normalized.items, [{ external_sku: "LZ-SKU", external_variant_key: "V1", quantity: 2 }]);
  assert.equal(normalized.external_order_id, "7001");
});

test("TikTok Shop v202309 sync returns line_items ready for metadata mapping", async () => {
  let requestSeen;
  const page = await TIKTOK_SHOP_MARKETPLACE_ADAPTER.fetchPage(syncContext(
    { shop_cipher: "cipher-1" },
    async (request) => {
      requestSeen = request;
      return { status: 200, body: JSON.stringify({ data: { orders: [{
        id: "TT-1",
        status: "AWAITING_SHIPMENT",
        create_time: 1785888000,
        update_time: 1785888060,
        user_id: "buyer-1",
        line_items: [{ seller_sku: "TT-SKU", sku_id: "TT-V1", quantity: 3 }],
      }], next_page_token: "" } }) };
    },
  ));
  assert.equal(requestSeen.operation, "tiktok_shop.order.list");
  assert.equal(new URL(requestSeen.url).pathname, "/order/202309/orders/search");
  const normalized = normalizeMarketplaceProviderOrderRecord("tiktok_shop", "shop-tiktok", page.records[0]);
  assert.deepEqual(normalized.items, [{ external_sku: "TT-SKU", external_variant_key: "TT-V1", quantity: 3 }]);
});

test("provider webhook normalization emits bounded auditable event identities", async () => {
  const lazada = await LAZADA_MARKETPLACE_ADAPTER.normalizeInbound(JSON.stringify({
    data: { trade_order_id: 7001, trade_order_line_id: 8001, order_status: "shipped", status_update_time: 1785888060 },
  }), { tenant_id: "tenant-1", connection_id: "conn-1", received_at: RECEIVED_AT });
  assert.equal(lazada[0].event_type, "lazada.order_status_change");
  assert.match(lazada[0].external_event_id, /^lazada:/);

  const tiktok = await TIKTOK_SHOP_MARKETPLACE_ADAPTER.normalizeInbound(JSON.stringify({
    tts_notification_id: "evt-1", event_type: "ORDER_STATUS_CHANGE", timestamp: 1785888060,
  }), { tenant_id: "tenant-1", connection_id: "conn-1", received_at: RECEIVED_AT });
  assert.equal(tiktok[0].event_type, "tiktok_shop.order_status_change");
});

test("marketplace settlement formula covers fees, vouchers, refunds and subsidies without posting GL", () => {
  assert.equal(calculateExpectedMarketplacePayout({
    gross_minor: 1_000_000,
    commission_minor: 80_000,
    service_fee_minor: 20_000,
    seller_shipping_fee_minor: 10_000,
    seller_voucher_minor: 30_000,
    refund_minor: 100_000,
    other_deductions_minor: 5_000,
    platform_subsidy_minor: 25_000,
    other_credits_minor: 10_000,
  }), 790_000);
  const source = fs.readFileSync(new URL("../packages/social-commerce/src/marketplace-settlement.ts", import.meta.url), "utf8");
  assert.match(source, /accounting_posted: false/);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+(?:gl_entries|payment_ledger_entries)/i);
});

test("generic commercial ATP subtracts reservations from canonical stock and never mutates the physical ledger", () => {
  const source = fs.readFileSync(new URL("../packages/clouderp-stock/src/commercial-reservation.ts", import.meta.url), "utf8");
  assert.match(source, /FROM stock_ledger_entries/);
  assert.match(source, /INSERT OR IGNORE INTO commercial_stock_reservations/);
  assert.match(source, /WHERE \(SELECT ok FROM capacity\)=1/);
  assert.doesNotMatch(source, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+stock_ledger_entries/i);
  assert.doesNotMatch(source, /(?:gl_entries|payment_ledger_entries)/i);
});

test("marketplace lifecycle reserves before canonical submit, releases on failure and commits on Delivery Note", () => {
  const operations = fs.readFileSync(new URL("../packages/social-commerce/src/marketplace-operations.ts", import.meta.url), "utf8");
  assert.ok(operations.indexOf("reserveCommercialStock") < operations.indexOf("ensureCanonicalMarketplaceSalesOrder"));
  assert.match(operations, /catch \(error\)[\s\S]*releaseCommercialStockReservations/);
  const api = fs.readFileSync(new URL("../packages/social-commerce/src/api.ts", import.meta.url), "utf8");
  assert.match(api, /commitMarketplaceReservationForCart/);
  assert.match(api, /\/returns\$/);
  assert.match(api, /routeMarketplaceSettlementApi/);
});

test("reservation and settlement migrations are tenant scoped and commerce preview is manual-only", () => {
  const reservation = fs.readFileSync(new URL("../migrations/tenant/0117_commercial_stock_reservations.sql", import.meta.url), "utf8");
  const settlement = fs.readFileSync(new URL("../migrations/tenant/0118_marketplace_settlement_evidence.sql", import.meta.url), "utf8");
  assert.match(reservation, /PRIMARY KEY\(tenant_id, reservation_id\)/);
  assert.match(settlement, /UNIQUE\(tenant_id, provider, external_settlement_id\)/);
  const workflow = fs.readFileSync(new URL("../../.github/workflows/commerce-preview.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:/);
});
