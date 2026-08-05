import test from "node:test";
import assert from "node:assert/strict";

const moduleUrl = new URL("../dist/packages/integration-hub/src/marketplace-tiktok-shop.js", import.meta.url);
const { createTikTokShopMarketplaceAdapter, TIKTOK_SHOP_MARKETPLACE_MANIFEST } = await import(moduleUrl);

test("TikTok Shop adapter rejects plaintext credential material", () => {
  const adapter = createTikTokShopMarketplaceAdapter();
  assert.equal(TIKTOK_SHOP_MARKETPLACE_MANIFEST.provider, "tiktok_shop");
  assert.equal(TIKTOK_SHOP_MARKETPLACE_MANIFEST.category, "marketplace");
  assert.throws(
    () => adapter.validateConfig({ shop_cipher: "ROW_shop_1", access_token: "plaintext" }),
    /WS11 credential boundary/,
  );
  assert.throws(
    () => adapter.validateConfig({ shop_cipher: "ROW_shop_1", app_secret: "plaintext" }),
    /WS11 credential boundary/,
  );
});

test("TikTok Shop order polling keeps provider auth outside the adapter and advances a high-watermark cursor", async () => {
  let nowMs = 1_800_000_000_000;
  const adapter = createTikTokShopMarketplaceAdapter({ now: () => nowMs });
  const requests = [];
  const responses = [
    {
      code: 0,
      message: "Success",
      data: {
        orders: [{
          id: "576461413038785752",
          status: "AWAITING_SHIPMENT",
          create_time: 1_799_999_000,
          update_time: 1_799_999_900,
          line_items: [{ seller_sku: "SKU-1", sku_id: "SKU-VAR-1", quantity: 1 }],
        }],
        next_page_token: "next/page-1",
      },
    },
    { code: 0, message: "Success", data: { orders: [] } },
    { code: 0, message: "Success", data: { orders: [] } },
  ];
  const signed_request = async (request) => {
    requests.push(request);
    const payload = responses.shift();
    assert.ok(payload, "unexpected extra provider request");
    return { status: 200, body: JSON.stringify(payload) };
  };
  const baseContext = {
    tenant_id: "demo",
    connection_id: "tts-main",
    stream: "orders",
    limit: 50,
    credential_headers: {},
    config: {
      shop_cipher: "ROW_shop_1",
      lookback_seconds: 3600,
      overlap_seconds: 300,
    },
    signed_request,
  };

  const first = await adapter.fetchPage({ ...baseContext, cursor: null });
  assert.equal(first.records.length, 1);
  assert.equal(first.has_more, true);
  assert.ok(first.next_cursor);
  assert.equal(requests.length, 1);
  const firstRequest = requests[0];
  assert.equal(firstRequest.operation, "tiktok_shop.order.list.202309");
  assert.equal(firstRequest.method, "POST");
  const firstUrl = new URL(firstRequest.url);
  assert.equal(firstUrl.origin, "https://open-api.tiktokglobalshop.com");
  assert.equal(firstUrl.pathname, "/order/202309/orders/search");
  assert.equal(firstUrl.searchParams.get("shop_cipher"), "ROW_shop_1");
  assert.equal(firstUrl.searchParams.get("page_size"), "50");
  assert.equal(firstUrl.searchParams.get("sort_field"), "update_time");
  assert.equal(firstUrl.searchParams.get("sort_order"), "ASC");
  assert.equal(firstUrl.searchParams.has("app_key"), false);
  assert.equal(firstUrl.searchParams.has("sign"), false);
  assert.equal(firstUrl.searchParams.has("timestamp"), false);
  assert.equal(Object.keys(firstRequest.headers ?? {}).some((key) => /token|authorization|secret/i.test(key)), false);
  assert.deepEqual(JSON.parse(firstRequest.body), {
    update_time_ge: 1_799_996_400,
    update_time_lt: 1_800_000_000,
  });

  const second = await adapter.fetchPage({ ...baseContext, cursor: first.next_cursor });
  assert.equal(second.records.length, 0);
  assert.equal(second.has_more, false);
  assert.ok(second.next_cursor, "final page must retain a stable high-watermark cursor");
  const secondRequest = requests[1];
  const secondUrl = new URL(secondRequest.url);
  assert.equal(secondUrl.searchParams.get("page_token"), "next/page-1");
  assert.deepEqual(JSON.parse(secondRequest.body), {
    update_time_ge: 1_799_996_400,
    update_time_lt: 1_800_000_000,
  });

  nowMs = 1_800_000_600_000;
  const third = await adapter.fetchPage({ ...baseContext, cursor: second.next_cursor });
  assert.equal(third.has_more, false);
  const thirdRequest = requests[2];
  const thirdUrl = new URL(thirdRequest.url);
  assert.equal(thirdUrl.searchParams.has("page_token"), false);
  assert.deepEqual(JSON.parse(thirdRequest.body), {
    update_time_ge: 1_799_999_700,
    update_time_lt: 1_800_000_600,
  });
});
