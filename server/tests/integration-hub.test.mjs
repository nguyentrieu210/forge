import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAllowedWebhookTarget,
  buildWebhookEnvelope,
  buildWebhookHeaders,
  computeRetryDelaySeconds,
  decideDelivery,
  deriveDeliveryId,
  mapIntegrationPayload,
  matchesEventPattern,
  normalizeRetryPolicy,
  selectWebhookSubscriptions,
  stableJsonStringify,
  validateWebhookSubscription,
} from "../dist/packages/integration-hub/src/index.js";

function event(overrides = {}) {
  return {
    event_id: "evt-100",
    event_type: "sales_order.submitted",
    tenant_id: "demo",
    aggregate: { doctype: "Sales Order", name: "SO-100" },
    aggregate_version: 3,
    actor: "Administrator",
    command_id: "cmd-100",
    occurred_at: "2026-08-03T00:00:00.000Z",
    schema_version: 1,
    payload: { action: "submit", customer: "ACME", grand_total_minor: 1250000, nested: { source: "web" } },
    ...overrides,
  };
}

function subscription(overrides = {}) {
  return {
    subscription_id: "sub-sales",
    tenant_id: "demo",
    event_pattern: "sales_order.*",
    target_url: "https://hooks.example.com/forge",
    status: "active",
    auth_kind: "api_key",
    secret_ref: "credential://integration/sub-sales",
    allowed_hosts: ["hooks.example.com"],
    ...overrides,
  };
}

test("webhook target is HTTPS, credential-free, public and explicitly allowlisted", () => {
  assert.equal(assertAllowedWebhookTarget("https://hooks.example.com/forge", ["HOOKS.EXAMPLE.COM"]).hostname, "hooks.example.com");
  for (const target of [
    "http://hooks.example.com/forge",
    "https://user:pass@hooks.example.com/forge",
    "https://localhost/forge",
    "https://127.0.0.1/forge",
    "https://10.0.0.1/forge",
    "https://192.168.1.5/forge",
    "https://hooks.other.com/forge",
    "https://hooks.example.com/forge#secret",
  ]) {
    assert.throws(() => assertAllowedWebhookTarget(target, ["hooks.example.com"]));
  }
});

test("subscription validation never accepts inline auth without a credential reference", () => {
  assert.equal(validateWebhookSubscription(subscription()).subscription_id, "sub-sales");
  assert.throws(() => validateWebhookSubscription(subscription({ secret_ref: undefined })), /secret_ref/);
  assert.doesNotThrow(() => validateWebhookSubscription(subscription({ auth_kind: "none", secret_ref: undefined })));
});

test("event subscriptions support exact, trailing wildcard and all-event matching only", () => {
  assert.equal(matchesEventPattern("sales_order.submitted", "sales_order.submitted"), true);
  assert.equal(matchesEventPattern("sales_order.*", "sales_order.cancelled"), true);
  assert.equal(matchesEventPattern("sales_order.*", "purchase_order.submitted"), false);
  assert.equal(matchesEventPattern("*", "anything.happened"), true);
  assert.throws(() => matchesEventPattern("sales_*_submitted", "sales_order.submitted"), /event pattern/);

  const selected = selectWebhookSubscriptions(event(), [
    subscription(),
    subscription({ subscription_id: "wrong-tenant", tenant_id: "other" }),
    subscription({ subscription_id: "disabled", status: "disabled" }),
    subscription({ subscription_id: "wrong-event", event_pattern: "purchase_order.*" }),
  ]);
  assert.deepEqual(selected.map((item) => item.subscription_id), ["sub-sales"]);
});

test("mapping is deterministic, nested and prototype-safe", () => {
  const mapped = mapIntegrationPayload(event(), [
    { source: "aggregate.name", target: "document.name", required: true },
    { source: "payload.customer", target: "customer.code", required: true },
    { source: "payload.grand_total_minor", target: "amount.minor", required: true },
    { source: "payload.missing", target: "optional.value" },
  ]);
  assert.deepEqual(mapped, {
    document: { name: "SO-100" },
    customer: { code: "ACME" },
    amount: { minor: 1250000 },
  });
  assert.throws(() => mapIntegrationPayload(event(), [{ source: "payload.missing", target: "x", required: true }]), /Required mapping source/);
  assert.throws(() => mapIntegrationPayload(event(), [{ source: "payload.customer", target: "__proto__.polluted" }]), /Unsafe mapping path/);
  assert.equal({}.polluted, undefined);
});

test("retry policy is bounded and moves terminal failures to dead-letter", () => {
  assert.deepEqual(normalizeRetryPolicy(), { max_attempts: 8, base_delay_seconds: 2, max_delay_seconds: 300 });
  assert.equal(computeRetryDelaySeconds(1), 2);
  assert.equal(computeRetryDelaySeconds(8), 256);
  assert.equal(computeRetryDelaySeconds(9, { max_attempts: 10 }), 300);
  assert.throws(() => normalizeRetryPolicy({ base_delay_seconds: 60, max_delay_seconds: 30 }));

  assert.deepEqual(decideDelivery({ attempt: 1, http_status: 204 }), { action: "delivered", retry_after_seconds: null, reason: "accepted" });
  assert.deepEqual(decideDelivery({ attempt: 1, http_status: 400 }), { action: "dead_letter", retry_after_seconds: null, reason: "permanent_http_400" });
  assert.deepEqual(decideDelivery({ attempt: 1, http_status: 503 }), { action: "retry", retry_after_seconds: 2, reason: "retryable_http_503" });
  assert.deepEqual(decideDelivery({ attempt: 2, http_status: 429, retry_after_seconds: 90 }), { action: "retry", retry_after_seconds: 90, reason: "retryable_http_429" });
  assert.deepEqual(decideDelivery({ attempt: 8, transport_error: true }), { action: "dead_letter", retry_after_seconds: null, reason: "attempt_limit_exhausted" });
});

test("delivery identity, canonical payload and HMAC headers are stable and tenant/event scoped", async () => {
  const first = await deriveDeliveryId("sub-sales", "evt-100");
  const again = await deriveDeliveryId("sub-sales", "evt-100");
  const other = await deriveDeliveryId("sub-sales", "evt-101");
  assert.equal(first, again);
  assert.notEqual(first, other);
  assert.match(first, /^dlv_[a-f0-9]{40}$/);

  const sub = subscription({ mapping: [
    { source: "payload.customer", target: "customer" },
    { source: "payload.grand_total_minor", target: "total_minor" },
  ] });
  const envelope = await buildWebhookEnvelope(event(), sub);
  assert.equal(envelope.delivery_id, first);
  assert.deepEqual(envelope.data, { customer: "ACME", total_minor: 1250000 });

  assert.equal(stableJsonStringify({ z: 1, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":1}');
  const headersA = await buildWebhookHeaders(envelope, "0123456789abcdef0123456789abcdef");
  const headersB = await buildWebhookHeaders(envelope, "0123456789abcdef0123456789abcdef");
  assert.equal(headersA["x-cloudforge-idempotency-key"], first);
  assert.equal(headersA["x-cloudforge-signature-256"], headersB["x-cloudforge-signature-256"]);
  assert.match(headersA["x-cloudforge-signature-256"], /^sha256=[a-f0-9]{64}$/);
});
