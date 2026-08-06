import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildShopeeSellerAuthorizationUrl,
  buildTikTokShopSellerAuthorizationUrl,
  exchangeShopeeAuthorizationCode,
  refreshShopeeAccessToken,
} from "../dist/packages/integration-hub/src/marketplace-authorization.js";

const NOW = 1_765_000_000_123;

function captureHttp(body) {
  const calls = [];
  return {
    calls,
    client: {
      async fetch(input, init) {
        calls.push({ url: String(input), init });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };
}

test("TikTok Shop seller authorization uses official ROW/US service domains and CSRF state", () => {
  const row = new URL(buildTikTokShopSellerAuthorizationUrl({ service_id: "7431458374265161478", state: "state-1" }));
  assert.equal(row.origin, "https://services.tiktokshop.com");
  assert.equal(row.pathname, "/open/authorize");
  assert.equal(row.searchParams.get("service_id"), "7431458374265161478");
  assert.equal(row.searchParams.get("state"), "state-1");

  const us = new URL(buildTikTokShopSellerAuthorizationUrl({ service_id: "7369437808455026474", state: "state-us", market: "us" }));
  assert.equal(us.origin, "https://services.us.tiktokshop.com");
});

test("Shopee seller authorization signs partner path without exposing partner key", async () => {
  const url = new URL(await buildShopeeSellerAuthorizationUrl({
    partner_id: "123456",
    partner_key: "partner-secret",
    redirect_uri: "https://erp.example.com/oauth/shopee/callback",
    state: "state-1",
  }, { now: () => NOW }));
  const timestamp = String(Math.floor(NOW / 1_000));
  const expected = createHmac("sha256", "partner-secret")
    .update(`123456/api/v2/shop/auth_partner${timestamp}`)
    .digest("hex");
  assert.equal(url.origin, "https://partner.shopeemobile.com");
  assert.equal(url.pathname, "/api/v2/shop/auth_partner");
  assert.equal(url.searchParams.get("partner_id"), "123456");
  assert.equal(url.searchParams.get("timestamp"), timestamp);
  assert.equal(url.searchParams.get("sign"), expected);
  assert.equal(url.searchParams.get("state"), "state-1");
  assert.doesNotMatch(url.href, /partner-secret/);
});

test("Shopee code exchange signs auth endpoint and keeps partner key out of request", async () => {
  const http = captureHttp('{"access_token":"shop-access","refresh_token":"shop-refresh","expire_in":14400}');
  const result = await exchangeShopeeAuthorizationCode({
    partner_id: "123456",
    partner_key: "partner-secret",
    code: "auth-code",
    shop_id: "9001",
  }, { http: http.client, now: () => NOW });
  assert.equal(result.access_token, "shop-access");
  const call = http.calls[0];
  const url = new URL(call.url);
  const timestamp = String(Math.floor(NOW / 1_000));
  const expected = createHmac("sha256", "partner-secret")
    .update(`123456/api/v2/auth/token/get${timestamp}`)
    .digest("hex");
  assert.equal(url.searchParams.get("sign"), expected);
  assert.doesNotMatch(call.url, /partner-secret/);
  const body = JSON.parse(call.init.body);
  assert.deepEqual(body, { code: "auth-code", shop_id: "9001", partner_id: 123456 });
});

test("Shopee refresh signs access-token endpoint and returns provider payload", async () => {
  const http = captureHttp('{"access_token":"next-access","refresh_token":"next-refresh"}');
  const result = await refreshShopeeAccessToken({
    partner_id: "123456",
    partner_key: "partner-secret",
    refresh_token: "shop-refresh",
    shop_id: "9001",
  }, { http: http.client, now: () => NOW });
  assert.equal(result.access_token, "next-access");
  const call = http.calls[0];
  assert.equal(new URL(call.url).pathname, "/api/v2/auth/access_token/get");
  assert.deepEqual(JSON.parse(call.init.body), { refresh_token: "shop-refresh", shop_id: "9001", partner_id: 123456 });
});
