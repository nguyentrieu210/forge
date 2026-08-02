import test from "node:test";
import assert from "node:assert/strict";
import {
  assertProviderAdapterConformance,
  validateNormalizedProviderEvents,
  validateProviderHealthResult,
} from "../dist/packages/integration-hub/src/adapter.js";

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    connector_key: "facebook-pages",
    version: "1.0.0",
    provider: "meta.facebook",
    display_name: "Facebook Pages",
    category: "social",
    auth_kinds: ["oauth2"],
    capabilities: ["oauth_flow", "inbound_webhook", "push_events", "health_check"],
    config_schema_version: 1,
    event_patterns: ["facebook.*"],
    ...overrides,
  };
}

function adapter(overrides = {}) {
  return {
    manifest: manifest(),
    validateConfig() {},
    async normalizeInbound() { return []; },
    async healthCheck() { return { ok: true, code: "OK" }; },
    ...overrides,
  };
}

test("provider adapter functions must match declared capabilities", () => {
  assert.deepEqual(assertProviderAdapterConformance(adapter()), {
    connector_key: "facebook-pages", version: "1.0.0", inbound: true, sync: false, health: true,
  });
  assert.throws(() => assertProviderAdapterConformance(adapter({ normalizeInbound: undefined })), /requires normalizeInbound/);
  assert.throws(() => assertProviderAdapterConformance(adapter({
    manifest: manifest({ capabilities: ["oauth_flow", "push_events", "health_check"] }),
  })), /normalizeInbound requires inbound_webhook/);
  assert.throws(() => assertProviderAdapterConformance(adapter({ healthCheck: undefined })), /requires healthCheck/);
});

test("polling adapters require fetchPage and no inbound handler unless declared", () => {
  const bank = {
    manifest: manifest({
      connector_key: "bank-feed",
      provider: "bank.example",
      display_name: "Bank Feed",
      category: "bank",
      auth_kinds: ["api_key"],
      capabilities: ["poll", "pull_records", "cursor_sync", "health_check"],
      event_patterns: undefined,
    }),
    validateConfig() {},
    async fetchPage() { return { records: [], next_cursor: null, has_more: false }; },
    async healthCheck() { return { ok: true, code: "OK" }; },
  };
  assert.deepEqual(assertProviderAdapterConformance(bank), {
    connector_key: "bank-feed", version: "1.0.0", inbound: false, sync: true, health: true,
  });
  assert.throws(() => assertProviderAdapterConformance({ ...bank, fetchPage: undefined }), /requires fetchPage/);
});

test("normalized inbound events are bounded, unique and auditable", () => {
  const events = [{
    external_event_id: "facebook:evt-1",
    event_type: "facebook.message",
    occurred_at: "2026-08-03T00:00:00.000Z",
    payload: { message: "hello" },
  }];
  assert.equal(validateNormalizedProviderEvents(events), events);
  assert.throws(() => validateNormalizedProviderEvents([...events, ...events]), /Duplicate/);
  assert.throws(() => validateNormalizedProviderEvents([{ ...events[0], occurred_at: "bad" }]), /occurred_at/);
});

test("provider health result is typed without exposing transport secrets", () => {
  assert.deepEqual(validateProviderHealthResult({ ok: false, code: "TOKEN_EXPIRED", detail: "Credential refresh required" }), {
    ok: false, code: "TOKEN_EXPIRED", detail: "Credential refresh required",
  });
  assert.throws(() => validateProviderHealthResult({ ok: true, code: "" }), /code/);
});
