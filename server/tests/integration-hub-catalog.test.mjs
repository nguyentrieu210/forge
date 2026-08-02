import test from "node:test";
import assert from "node:assert/strict";
import {
  assertConnectorSupportsAuth,
  assertConnectorSupportsEvent,
  compareConnectorVersions,
  connectorManifestIdentity,
  validateConnectorManifest,
} from "../dist/packages/integration-hub/src/catalog.js";

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    connector_key: "facebook-pages",
    version: "1.2.0",
    provider: "meta.facebook",
    display_name: "Facebook Pages",
    category: "social",
    auth_kinds: ["oauth2"],
    capabilities: ["oauth_flow", "inbound_webhook", "push_events", "health_check"],
    config_schema_version: 2,
    event_patterns: ["facebook.*"],
    docs_url: "https://developers.facebook.com/docs/graph-api/webhooks/",
    ...overrides,
  };
}

test("connector catalog manifest is versioned, bounded and secret-free by contract", () => {
  const value = validateConnectorManifest(manifest());
  assert.equal(value.connector_key, "facebook-pages");
  assert.equal(connectorManifestIdentity(value), "facebook-pages@1.2.0#config-v2");

  for (const bad of [
    manifest({ connector_key: "Facebook Pages" }),
    manifest({ version: "latest" }),
    manifest({ auth_kinds: [] }),
    manifest({ auth_kinds: ["oauth2", "oauth2"] }),
    manifest({ capabilities: ["oauth_flow"], auth_kinds: ["api_key"] }),
    manifest({ capabilities: ["cursor_sync"], auth_kinds: ["none"] }),
    manifest({ docs_url: "http://example.com/docs" }),
    manifest({ event_patterns: ["facebook.*", "facebook.*"] }),
  ]) {
    assert.throws(() => validateConnectorManifest(bad));
  }
});

test("connector compatibility allows same-major forward config evolution only", () => {
  assert.deepEqual(compareConnectorVersions(manifest(), manifest()), { compatible: true, reason: "same_version" });
  assert.deepEqual(
    compareConnectorVersions(manifest(), manifest({ version: "1.3.0", config_schema_version: 3 })),
    { compatible: true, reason: "compatible_upgrade" },
  );
  assert.deepEqual(
    compareConnectorVersions(manifest(), manifest({ version: "2.0.0", config_schema_version: 3 })),
    { compatible: false, reason: "major_changed" },
  );
  assert.deepEqual(
    compareConnectorVersions(manifest(), manifest({ version: "1.3.0", config_schema_version: 1 })),
    { compatible: false, reason: "config_schema_downgrade" },
  );
  assert.deepEqual(
    compareConnectorVersions(manifest(), manifest({ connector_key: "zalo-oa" })),
    { compatible: false, reason: "connector_changed" },
  );
});

test("connector manifest constrains auth and event compatibility without provider code", () => {
  assert.doesNotThrow(() => assertConnectorSupportsAuth(manifest(), "oauth2"));
  assert.throws(() => assertConnectorSupportsAuth(manifest(), "api_key"), /does not support/);
  assert.doesNotThrow(() => assertConnectorSupportsEvent(manifest(), "facebook.message"));
  assert.throws(() => assertConnectorSupportsEvent(manifest(), "sales_order.submitted"), /does not support/);

  const generic = manifest({ event_patterns: undefined });
  assert.doesNotThrow(() => assertConnectorSupportsEvent(generic, "sales_order.submitted"));
});
