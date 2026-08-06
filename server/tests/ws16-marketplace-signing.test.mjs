import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildLazadaAuthorizationUrl,
  createLazadaSignedRequestExecutor,
  createShopeeSignedRequestExecutor,
  createTikTokShopSignedRequestExecutor,
  exchangeLazadaAuthorizationCode,
  exchangeTikTokShopAuthorizationCode,
  refreshLazadaAccessToken,
  refreshTikTokShopAccessToken,
} from "../dist/packages/integration-hub/src/marketplace-signing.js";

const NOW = 1_765_000_000_123;

function captureHttp(body = "{}") {
  const calls = [];
  return {
    calls,
    client: {
      async fetch(input, init) {
        calls.push({ url: String(input), init });
        return new Response(body, { status: 200, headers: { "content-type": "application/json", "x-request-id": "req-1" } });
      },
    },
  };
}

function sortedParameterText(url, excluded = new Set(["sign"])) {
  return [...url.searchParams.entries()]
    .filter(([key]) => !excluded.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${value}`)
    .join("");
}

test("Lazada executor signs LAZOP request without exposing app secret to adapter headers", async () => {
  const http = captureHttp('{"code":"0"}');
  const executor = createLazadaSignedRequestExecutor({
    app_key: "app-123",
    app_secret: "lazada-secret-456",
    access_token: "lazada-access-789",
  }, { http: http.client, now: () => NOW });

  await executor({
    operation: "lazada.order.get",
    method: "GET",
    url: "https://api.lazada.vn/rest/order/get?order_id=1234",
    headers: { accept: "application/json" },
  });

  assert.equal(http.calls.length, 1);
  const url = new URL(http.calls[0].url);
  assert.equal(url.searchParams.get("app_key"), "app-123");
  assert.equal(url.searchParams.get("access_token"), "lazada-access-789");
  assert.equal(url.searchParams.get("timestamp"), String(NOW));
  assert.equal(url.searchParams.get("sign_method"), "sha256");
  const expected = createHmac("sha256", "lazada-secret-456")
    .update(`/order/get${sortedParameterText(url)}`)
    .digest("hex").toUpperCase();
  assert.equal(url.searchParams.get("sign"), expected);
  assert.doesNotMatch(http.calls[0].url, /lazada-secret-456/);
  assert.equal(new Headers(http.calls[0].init.headers).get("authorization"), null);
});

test("TikTok Shop executor implements official path+sorted-query+body HMAC and token header", async () => {
  const http = captureHttp('{"code":0}');
  const executor = createTikTokShopSignedRequestExecutor({
    app_key: "tts-key",
    app_secret: "tts-secret",
    access_token: "tts-access",
  }, { http: http.client, now: () => NOW });
  const body = JSON.stringify({ sort_field: "update_time", sort_order: "ASC" });

  await executor({
    operation: "tiktok_shop.order.list",
    method: "POST",
    url: "https://open-api.tiktokglobalshop.com/order/202309/orders/search?shop_cipher=cipher-1&page_size=20",
    headers: { "content-type": "application/json", accept: "application/json" },
    body,
  });

  const call = http.calls[0];
  const url = new URL(call.url);
  assert.equal(url.searchParams.get("app_key"), "tts-key");
  assert.equal(url.searchParams.get("timestamp"), String(Math.floor(NOW / 1_000)));
  assert.equal(new Headers(call.init.headers).get("x-tts-access-token"), "tts-access");
  const params = sortedParameterText(url, new Set(["sign", "access_token"]));
  const unsigned = `${url.pathname}${params}${body}`;
  const wrapped = `tts-secret${unsigned}tts-secret`;
  const expected = createHmac("sha256", "tts-secret").update(wrapped).digest("hex");
  assert.equal(url.searchParams.get("sign"), expected);
  assert.doesNotMatch(call.url, /tts-secret|tts-access/);
});

test("Shopee shop executor scopes shop and signs standard v2 shop request in boundary", async () => {
  const http = captureHttp('{"response":{}}');
  const executor = createShopeeSignedRequestExecutor({
    partner_id: "123456",
    partner_key: "partner-secret",
    access_token: "shop-access",
    shop_id: "9001",
  }, { http: http.client, now: () => NOW });

  await executor({
    operation: "shopee.order.list",
    method: "GET",
    url: "https://partner.shopeemobile.com/api/v2/order/get_order_list?shop_id=9001&page_size=20",
    headers: { accept: "application/json" },
  });

  const url = new URL(http.calls[0].url);
  const timestamp = String(Math.floor(NOW / 1_000));
  const expected = createHmac("sha256", "partner-secret")
    .update(`123456${url.pathname}${timestamp}shop-access9001`)
    .digest("hex");
  assert.equal(url.searchParams.get("partner_id"), "123456");
  assert.equal(url.searchParams.get("timestamp"), timestamp);
  assert.equal(url.searchParams.get("access_token"), "shop-access");
  assert.equal(url.searchParams.get("shop_id"), "9001");
  assert.equal(url.searchParams.get("sign"), expected);
  assert.doesNotMatch(http.calls[0].url, /partner-secret/);
});

test("signers fail closed when adapter tries to inject credential parameters or cross-provider hosts", async () => {
  const lazada = createLazadaSignedRequestExecutor({ app_key: "app-1", app_secret: "secret-1", access_token: "access-1" }, { http: captureHttp().client, now: () => NOW });
  await assert.rejects(() => lazada({
    operation: "bad",
    method: "GET",
    url: "https://api.lazada.vn/rest/order/get?access_token=forged",
  }), /reserved parameter access_token/);

  const tiktok = createTikTokShopSignedRequestExecutor({ app_key: "app-1", app_secret: "secret-1", access_token: "access-1" }, { http: captureHttp().client, now: () => NOW });
  await assert.rejects(() => tiktok({
    operation: "bad-host",
    method: "GET",
    url: "https://example.com/order/202309/orders/search",
  }), /host is not allowed/);

  const shopee = createShopeeSignedRequestExecutor({ partner_id: "1", partner_key: "secret-1", access_token: "access-1", shop_id: "9" }, { http: captureHttp().client, now: () => NOW });
  await assert.rejects(() => shopee({
    operation: "wrong-shop",
    method: "GET",
    url: "https://partner.shopeemobile.com/api/v2/order/get_order_list?shop_id=10",
  }), /shop_id does not match credential scope/);
});

test("Lazada OAuth helpers build authorization URL and exchange/refresh only inside credential boundary", async () => {
  const auth = new URL(buildLazadaAuthorizationUrl({
    app_key: "app-123",
    redirect_uri: "https://erp.example.com/oauth/lazada/callback",
    state: "state-1",
  }));
  assert.equal(auth.origin, "https://auth.lazada.com");
  assert.equal(auth.searchParams.get("response_type"), "code");
  assert.equal(auth.searchParams.get("client_id"), "app-123");
  assert.equal(auth.searchParams.get("state"), "state-1");

  const tokenHttp = captureHttp('{"code":"0","access_token":"new-access","refresh_token":"new-refresh"}');
  const created = await exchangeLazadaAuthorizationCode({ app_key: "app-123", app_secret: "secret-123", code: "auth-code" }, { http: tokenHttp.client, now: () => NOW });
  assert.equal(created.access_token, "new-access");
  const createUrl = new URL(tokenHttp.calls[0].url);
  assert.equal(createUrl.pathname, "/rest/auth/token/create");
  assert.equal(createUrl.searchParams.get("code"), "auth-code");
  assert.doesNotMatch(tokenHttp.calls[0].url, /secret-123/);

  const refreshHttp = captureHttp('{"code":"0","access_token":"refresh-access","refresh_token":"refresh-new"}');
  const refreshed = await refreshLazadaAccessToken({ app_key: "app-123", app_secret: "secret-123", refresh_token: "refresh-old" }, { http: refreshHttp.client, now: () => NOW });
  assert.equal(refreshed.access_token, "refresh-access");
  assert.equal(new URL(refreshHttp.calls[0].url).pathname, "/rest/auth/token/refresh");
});

test("TikTok Shop OAuth token exchange and refresh use official auth host without leaking secrets in errors", async () => {
  const createHttp = captureHttp('{"code":0,"data":{"access_token":"tts-new","refresh_token":"tts-refresh"}}');
  const created = await exchangeTikTokShopAuthorizationCode({ app_key: "tts-key", app_secret: "tts-secret", auth_code: "tts-code" }, { http: createHttp.client });
  assert.equal(created.code, 0);
  const createUrl = new URL(createHttp.calls[0].url);
  assert.equal(createUrl.origin, "https://auth.tiktok-shops.com");
  assert.equal(createUrl.pathname, "/api/v2/token/get");
  assert.equal(createUrl.searchParams.get("grant_type"), "authorized_code");

  const refreshHttp = captureHttp('{"code":0,"data":{"access_token":"tts-next","refresh_token":"tts-next-refresh"}}');
  await refreshTikTokShopAccessToken({ app_key: "tts-key", app_secret: "tts-secret", refresh_token: "tts-refresh" }, { http: refreshHttp.client });
  const refreshUrl = new URL(refreshHttp.calls[0].url);
  assert.equal(refreshUrl.pathname, "/api/v2/token/refresh");
  assert.equal(refreshUrl.searchParams.get("grant_type"), "refresh_token");
});
