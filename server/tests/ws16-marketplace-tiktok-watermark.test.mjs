import test from "node:test";
import assert from "node:assert/strict";
import { TIKTOK_SHOP_MARKETPLACE_ADAPTER } from "../dist/packages/integration-hub/src/marketplace-connectors.js";

function context(cursor, signed_request) {
  return {
    tenant_id: "tenant-1",
    connection_id: "tts-main",
    stream: "orders",
    cursor,
    limit: 25,
    credential_headers: {},
    config: {
      shop_cipher: "cipher-1",
      lookback_seconds: 600,
      overlap_seconds: 60,
    },
    signed_request,
  };
}

test("TikTok Shop order sync freezes pagination window then advances a stable update watermark", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        orders: [{
          id: "TT-1",
          status: "AWAITING_SHIPMENT",
          create_time: 1_800_000_000,
          update_time: 1_800_000_010,
          line_items: [{ seller_sku: "TT-SKU", sku_id: "TT-V1", quantity: 1 }],
        }],
        next_page_token: "next/page-1",
      },
    },
    { data: { orders: [], next_page_token: "" } },
    { data: { orders: [], next_page_token: "" } },
  ];
  const signedRequest = async (request) => {
    calls.push(request);
    const payload = responses.shift();
    assert.ok(payload, "unexpected extra TikTok provider request");
    return { status: 200, body: JSON.stringify(payload) };
  };

  const before = Math.floor(Date.now() / 1_000);
  const first = await TIKTOK_SHOP_MARKETPLACE_ADAPTER.fetchPage(context(null, signedRequest));
  const after = Math.floor(Date.now() / 1_000);
  assert.equal(first.records.length, 1);
  assert.equal(first.has_more, true);
  assert.ok(first.next_cursor);

  const firstRequest = calls[0];
  assert.equal(firstRequest.operation, "tiktok_shop.order.list");
  const firstUrl = new URL(firstRequest.url);
  assert.equal(firstUrl.pathname, "/order/202309/orders/search");
  assert.equal(firstUrl.searchParams.get("shop_cipher"), "cipher-1");
  assert.equal(firstUrl.searchParams.get("page_size"), "25");
  assert.equal(firstUrl.searchParams.get("sort_field"), "update_time");
  assert.equal(firstUrl.searchParams.get("sort_order"), "ASC");
  assert.equal(firstUrl.searchParams.has("page_token"), false);
  assert.equal(firstUrl.searchParams.has("app_key"), false);
  assert.equal(firstUrl.searchParams.has("sign"), false);
  assert.equal(firstUrl.searchParams.has("timestamp"), false);

  const firstBody = JSON.parse(firstRequest.body);
  assert.equal(firstBody.update_time_lt - firstBody.update_time_ge, 600);
  assert.ok(firstBody.update_time_lt >= before && firstBody.update_time_lt <= after);

  const activeCursor = JSON.parse(first.next_cursor);
  assert.deepEqual(activeCursor, {
    schema: "tiktok-orders/v1",
    from: firstBody.update_time_ge,
    to: firstBody.update_time_lt,
    provider_cursor: "next/page-1",
  });

  const second = await TIKTOK_SHOP_MARKETPLACE_ADAPTER.fetchPage(context(first.next_cursor, signedRequest));
  assert.equal(second.has_more, false);
  assert.ok(second.next_cursor, "final page must retain a stable watermark cursor");
  const secondUrl = new URL(calls[1].url);
  assert.equal(secondUrl.searchParams.get("page_token"), "next/page-1");
  assert.deepEqual(JSON.parse(calls[1].body), firstBody, "provider pagination must stay inside one frozen update window");
  assert.deepEqual(JSON.parse(second.next_cursor), {
    schema: "tiktok-orders/v1",
    watermark: firstBody.update_time_lt,
  });

  const third = await TIKTOK_SHOP_MARKETPLACE_ADAPTER.fetchPage(context(second.next_cursor, signedRequest));
  assert.equal(third.has_more, false);
  const thirdUrl = new URL(calls[2].url);
  assert.equal(thirdUrl.searchParams.has("page_token"), false);
  const thirdBody = JSON.parse(calls[2].body);
  assert.equal(thirdBody.update_time_ge, firstBody.update_time_lt - 60, "next run must replay only the configured overlap");
  assert.ok(thirdBody.update_time_lt >= firstBody.update_time_lt, "high-watermark must never move backwards");
});

test("TikTok Shop rejects overlap larger than lookback", () => {
  assert.throws(() => TIKTOK_SHOP_MARKETPLACE_ADAPTER.validateConfig({
    shop_cipher: "cipher-1",
    lookback_seconds: 600,
    overlap_seconds: 601,
  }), /cannot exceed lookback_seconds/);
});
