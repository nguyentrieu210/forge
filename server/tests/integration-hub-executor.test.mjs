import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutionHeaders,
  executeWebhookDelivery,
  parseRetryAfterSeconds,
} from "../dist/packages/integration-hub/src/executor.js";
import { buildWebhookEnvelope, stableJsonStringify } from "../dist/packages/integration-hub/src/index.js";

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
    payload: { action: "submit", customer: "ACME" },
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

function resolver(value = { signing_secret: "0123456789abcdef0123456789abcdef", headers: { "x-provider-token": "secret-token" } }) {
  return { async resolve() { return value; } };
}

test("executor sends exact canonical bytes once with redirects disabled and protected headers intact", async () => {
  const calls = [];
  const transport = {
    async fetch(url, init) {
      calls.push({ url, init });
      return new Response("accepted", { status: 202 });
    },
  };
  const result = await executeWebhookDelivery({
    event: event(), subscription: subscription(), attempt: 1,
    credential_resolver: resolver(), transport,
  });

  assert.equal(result.decision.action, "delivered");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://hooks.example.com/forge");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.body, result.body);
  assert.equal(calls[0].init.headers["x-provider-token"], "secret-token");
  assert.equal(calls[0].init.headers["x-cloudforge-idempotency-key"], result.envelope.delivery_id);
  assert.match(calls[0].init.headers["x-cloudforge-signature-256"], /^sha256=[a-f0-9]{64}$/);
});

test("executor blocks redirect responses instead of escaping the allowlisted origin", async () => {
  let calls = 0;
  const result = await executeWebhookDelivery({
    event: event(), subscription: subscription(), attempt: 1, credential_resolver: resolver(),
    transport: { async fetch(_url, init) {
      calls += 1;
      assert.equal(init.redirect, "manual");
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/internal" } });
    } },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.decision, { action: "dead_letter", retry_after_seconds: null, reason: "redirect_blocked_302" });
});

test("executor preserves retry-after semantics and never returns credential material", async () => {
  const now = new Date("2026-08-03T00:00:00.000Z");
  const result = await executeWebhookDelivery({
    event: event(), subscription: subscription(), attempt: 2, credential_resolver: resolver(), now,
    transport: { async fetch() { return new Response("slow down", { status: 429, headers: { "retry-after": "90" } }); } },
  });
  assert.deepEqual(result.decision, { action: "retry", retry_after_seconds: 90, reason: "retryable_http_429" });
  assert.equal(result.retry_after_seconds, 90);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
  assert.equal(JSON.stringify(result).includes("0123456789abcdef"), false);

  assert.equal(parseRetryAfterSeconds("30", now), 30);
  assert.equal(parseRetryAfterSeconds("Mon, 03 Aug 2026 00:01:00 GMT", now), 60);
  assert.equal(parseRetryAfterSeconds("0", now), undefined);
  assert.equal(parseRetryAfterSeconds("garbage", now), undefined);
});

test("transport failures retry while credential/config failures fail before network", async () => {
  const transportFailure = await executeWebhookDelivery({
    event: event(), subscription: subscription(), attempt: 1, credential_resolver: resolver(),
    transport: { async fetch() { throw new Error("network down"); } },
  });
  assert.equal(transportFailure.transport_error, true);
  assert.equal(transportFailure.decision.action, "retry");

  let called = false;
  await assert.rejects(() => executeWebhookDelivery({
    event: event(), subscription: subscription(), attempt: 1,
    credential_resolver: resolver({ signing_secret: "0123456789abcdef0123456789abcdef", headers: {} }),
    transport: { async fetch() { called = true; return new Response(); } },
  }), /no provider authentication material/);
  assert.equal(called, false);
});

test("credential headers cannot override Forge delivery identity or inject newlines", async () => {
  const envelope = await buildWebhookEnvelope(event(), subscription({ auth_kind: "none", secret_ref: undefined }));
  const body = stableJsonStringify(envelope);
  await assert.rejects(
    () => buildExecutionHeaders(envelope, body, { headers: { "x-cloudforge-idempotency-key": "evil" } }),
    /protected header/,
  );
  await assert.rejects(
    () => buildExecutionHeaders(envelope, body, { headers: { "x-provider-token": "ok\r\nX-Evil: 1" } }),
    /newline/,
  );
});
