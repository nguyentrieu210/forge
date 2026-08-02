import test from "node:test";
import assert from "node:assert/strict";
import { ConnectorProviderRegistry } from "../dist/packages/integration-hub/src/provider-registry.js";

function manifest(version = "1.0.0", overrides = {}) {
  return {
    schema_version: 1,
    connector_key: "bank-feed",
    version,
    provider: "bank.example",
    display_name: "Bank Feed",
    category: "bank",
    auth_kinds: ["api_key"],
    capabilities: ["poll", "pull_records", "cursor_sync", "health_check"],
    config_schema_version: version === "1.0.0" ? 1 : 2,
    ...overrides,
  };
}

function adapter(version = "1.0.0") {
  return {
    manifest: manifest(version),
    validateConfig() {},
    async fetchPage() { return { records: [], next_cursor: null, has_more: false }; },
    async healthCheck() { return { ok: true, code: "OK" }; },
  };
}

test("provider registry is exact-versioned and rejects duplicate adapter identity", () => {
  const registry = new ConnectorProviderRegistry().register(adapter());
  assert.equal(registry.require("bank-feed", "1.0.0").manifest.provider, "bank.example");
  assert.equal(registry.get("bank-feed", "9.9.9"), null);
  assert.throws(() => registry.register(adapter()), /already registered/);
});

test("provider registry resolves only compatible same-major upgrades", () => {
  const registry = new ConnectorProviderRegistry().register(adapter("1.0.0")).register(adapter("1.1.0"));
  assert.equal(registry.resolveCompatible(manifest("1.0.0"), "1.1.0").manifest.version, "1.1.0");

  const withMajor = new ConnectorProviderRegistry().register(adapter("2.0.0"));
  assert.throws(() => withMajor.resolveCompatible(manifest("1.0.0"), "2.0.0"), /not compatible/);
});

test("provider registry list is deterministic", () => {
  const social = {
    manifest: manifest("1.0.0", {
      connector_key: "facebook-pages", provider: "meta.facebook", display_name: "Facebook Pages", category: "social",
      auth_kinds: ["oauth2"], capabilities: ["oauth_flow", "inbound_webhook", "health_check"],
    }),
    validateConfig() {},
    async normalizeInbound() { return []; },
    async healthCheck() { return { ok: true, code: "OK" }; },
  };
  const registry = new ConnectorProviderRegistry().register(social).register(adapter());
  assert.deepEqual(registry.list().map((item) => item.connector_key), ["bank-feed", "facebook-pages"]);
});
