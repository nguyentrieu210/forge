import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIntegrationHubPermission,
  assertSubscriptionStatusTransition,
  integrationHubAuditContext,
  parseCreateWebhookSubscription,
  parseReplayDelivery,
  parseSubscriptionStatusChange,
} from "../dist/packages/integration-hub/src/api-contract.js";

const manager = { user_id: "Administrator", roles: ["System Manager"] };
const integrationAdmin = { user_id: "integration@example.com", roles: ["Integration Admin"] };
const ordinary = { user_id: "sales@example.com", roles: ["Sales User"] };

function createInput(overrides = {}) {
  return {
    schema_version: 1,
    subscription_id: "sub-sales",
    event_pattern: "sales_order.*",
    target_url: "https://hooks.example.com/forge",
    auth_kind: "api_key",
    secret_ref: "credential://integration/sub-sales",
    allowed_hosts: ["hooks.example.com"],
    mapping: [{ source: "payload.customer", target: "customer", required: true }],
    retry_policy: { max_attempts: 5, base_delay_seconds: 2, max_delay_seconds: 60 },
    ...overrides,
  };
}

test("Integration Hub permissions are server-contract enforced", () => {
  for (const actor of [manager, integrationAdmin]) {
    assert.doesNotThrow(() => assertIntegrationHubPermission(actor, "read"));
    assert.doesNotThrow(() => assertIntegrationHubPermission(actor, "manage"));
    assert.doesNotThrow(() => assertIntegrationHubPermission(actor, "replay"));
  }
  assert.throws(() => assertIntegrationHubPermission(ordinary, "read"), /permission denied/);
  assert.throws(() => assertIntegrationHubPermission({ user_id: "", roles: ["System Manager"] }, "manage"), /permission denied/);
});

test("subscription creation binds trusted tenant and always begins draft", () => {
  const parsed = parseCreateWebhookSubscription(createInput(), "demo");
  assert.equal(parsed.tenant_id, "demo");
  assert.equal(parsed.status, "draft");
  assert.equal(parsed.auth_kind, "api_key");

  assert.throws(
    () => parseCreateWebhookSubscription({ ...createInput(), tenant_id: "attacker" }, "demo"),
    /Unsupported webhook subscription field: tenant_id/,
  );
  assert.throws(
    () => parseCreateWebhookSubscription({ ...createInput(), status: "active" }, "demo"),
    /Unsupported webhook subscription field: status/,
  );
  assert.throws(() => parseCreateWebhookSubscription(createInput({ allowed_hosts: [] }), "demo"), /allowed_hosts/);
  assert.throws(() => parseCreateWebhookSubscription(createInput({ schema_version: 2 }), "demo"), /schema_version/);
});

test("status changes use expected-state concurrency and explicit reasons", () => {
  const activate = parseSubscriptionStatusChange({
    schema_version: 1,
    subscription_id: "sub-sales",
    expected_status: "draft",
    next_status: "active",
    reason: "Provider test succeeded",
  });
  assert.doesNotThrow(() => assertSubscriptionStatusTransition("draft", activate));
  assert.throws(() => assertSubscriptionStatusTransition("disabled", activate), /concurrently/);

  assert.throws(() => parseSubscriptionStatusChange({
    schema_version: 1, subscription_id: "sub-sales", expected_status: "draft", next_status: "error", reason: "bad",
  }), /Invalid subscription status transition/);
  assert.throws(() => parseSubscriptionStatusChange({
    schema_version: 1, subscription_id: "sub-sales", expected_status: "active", next_status: "active", reason: "same",
  }), /must change state/);
});

test("replay contract requires bounded reason and exposes no tenant selector", () => {
  const replay = parseReplayDelivery({ schema_version: 1, delivery_id: "dlv_123", reason: "Mapping corrected" });
  assert.deepEqual(replay, { schema_version: 1, delivery_id: "dlv_123", reason: "Mapping corrected" });
  assert.throws(
    () => parseReplayDelivery({ schema_version: 1, delivery_id: "dlv_123", reason: "ok", tenant_id: "other" }),
    /Unsupported delivery replay field: tenant_id/,
  );
  assert.throws(() => parseReplayDelivery({ schema_version: 1, delivery_id: "dlv_123", reason: "" }), /reason/);
});

test("audit context is trusted-tenant and actor scoped", () => {
  assert.deepEqual(integrationHubAuditContext(manager, "demo", "subscription.activate"), {
    actor_id: "Administrator", tenant_id: "demo", action: "subscription.activate",
  });
  assert.throws(() => integrationHubAuditContext({ user_id: "", roles: [] }, "demo", "x"), /actor/);
  assert.throws(() => integrationHubAuditContext(manager, "", "x"), /tenant/);
});
