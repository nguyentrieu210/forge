import test from "node:test";
import assert from "node:assert/strict";
import { prepareMarketplaceSyncRuntime } from "../dist/packages/integration-hub/src/marketplace-runtime.js";

const NOW = 1_765_000_000_123;

function connection(overrides = {}) {
  return {
    schema_version: 1,
    connection_id: "conn-shopee-1",
    tenant_id: "tenant-1",
    connector_key: "shopee-marketplace",
    connector_version: "1.0.0",
    auth_kind: "oauth2",
    secret_ref: "vault://tenant-1/shopee/main",
    status: "active",
    config: { shop_id: "9001" },
    ...overrides,
  };
}

test("runtime resolves secret_ref once and exposes only signed_request to adapter context", async () => {
  const resolved = [];
  const requests = [];
  const runtime = await prepareMarketplaceSyncRuntime(
    connection(),
    null,
    20,
    {
      async resolve(scope) {
        resolved.push(scope);
        return {
          provider: "shopee",
          partner_id: "123456",
          partner_key: "partner-secret",
          access_token: "shop-access",
          shop_id: "9001",
        };
      },
    },
    {
      now: () => NOW,
      http: {
        async fetch(input, init) {
          requests.push({ url: String(input), init });
          return new Response('{"response":{"order_list":[],"more":false}}', { status: 200 });
        },
      },
    },
  );

  assert.deepEqual(resolved, [{
    tenant_id: "tenant-1",
    connection_id: "conn-shopee-1",
    secret_ref: "vault://tenant-1/shopee/main",
    provider: "shopee",
  }]);
  assert.equal(runtime.adapter.manifest.connector_key, "shopee-marketplace");
  assert.equal(runtime.context.credential_headers && Object.keys(runtime.context.credential_headers).length, 0);
  assert.equal(typeof runtime.context.signed_request, "function");
  assert.equal(JSON.stringify(runtime.context.config).includes("partner-secret"), false);
  assert.equal(JSON.stringify(runtime.context.config).includes("shop-access"), false);

  await runtime.adapter.fetchPage(runtime.context);
  assert.equal(requests.length, 1);
  const providerUrl = new URL(requests[0].url);
  assert.equal(providerUrl.searchParams.get("partner_id"), "123456");
  assert.equal(providerUrl.searchParams.get("access_token"), "shop-access");
});

test("runtime rejects inactive connections and credential/provider mismatches", async () => {
  const resolver = {
    async resolve() {
      return { provider: "lazada", app_key: "x", app_secret: "secret", access_token: "access" };
    },
  };
  await assert.rejects(
    () => prepareMarketplaceSyncRuntime(connection({ status: "disabled" }), null, 20, resolver),
    /not active/,
  );
  await assert.rejects(
    () => prepareMarketplaceSyncRuntime(connection(), null, 20, resolver),
    /credential provider does not match/,
  );
});

test("runtime refuses Shopee credential scope that does not match non-secret shop config", async () => {
  await assert.rejects(
    () => prepareMarketplaceSyncRuntime(connection(), null, 20, {
      async resolve() {
        return {
          provider: "shopee",
          partner_id: "123456",
          partner_key: "partner-secret",
          access_token: "shop-access",
          shop_id: "9002",
        };
      },
    }),
    /shop scope does not match/,
  );
});
