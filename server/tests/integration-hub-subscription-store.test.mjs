import test from "node:test";
import assert from "node:assert/strict";
import {
  IntegrationSubscriptionService,
  subscriptionFromDocument,
} from "../dist/packages/integration-hub/src/subscription-store.js";

function document(name, overrides = {}) {
  return {
    tenant_id: "demo",
    doctype: "Integration Subscription",
    name,
    owner: "Administrator",
    docstatus: 0,
    status: overrides.status ?? "active",
    version: 1,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T00:00:00.000Z",
    data: {
      event_pattern: "sales_order.*",
      target_url: "https://hooks.example.com/forge",
      auth_kind: "api_key",
      secret_ref: "credential://integration/sub-sales",
      allowed_hosts: ["hooks.example.com"],
      mapping: [{ source: "payload.customer", target: "customer", required: true }],
      max_attempts: 5,
      base_delay_seconds: 2,
      max_delay_seconds: 60,
      status: overrides.status ?? "active",
      ...overrides.data,
    },
    children: [],
  };
}

function event(overrides = {}) {
  return {
    event_id: "evt-1",
    event_type: "sales_order.submitted",
    tenant_id: "demo",
    aggregate: { doctype: "Sales Order", name: "SO-1" },
    aggregate_version: 1,
    actor: "Administrator",
    command_id: "cmd-1",
    occurred_at: "2026-08-03T00:00:00.000Z",
    schema_version: 1,
    payload: { customer: "ACME" },
    ...overrides,
  };
}

test("subscription service consumes only active canonical subscription documents", async () => {
  const calls = [];
  const service = new IntegrationSubscriptionService({
    async listActiveSubscriptionDocuments(tenantId) {
      calls.push({ tenantId });
      return [document("sub-active")];
    },
  });
  const active = await service.listActive("demo");
  assert.deepEqual(calls, [{ tenantId: "demo" }]);
  assert.deepEqual(active.map((item) => item.subscription_id), ["sub-active"]);
  assert.equal(active[0].tenant_id, "demo");
});

test("event selection remains tenant and event scoped after document conversion", async () => {
  const service = new IntegrationSubscriptionService({
    async listActiveSubscriptionDocuments() {
      return [
        document("sales"),
        document("purchase", { data: { event_pattern: "purchase_order.*" } }),
      ];
    },
  });
  assert.deepEqual((await service.subscriptionsForEvent(event())).map((item) => item.subscription_id), ["sales"]);
});

test("reader fails closed if active query returns cross-tenant, inactive or malformed data", async () => {
  const crossTenant = new IntegrationSubscriptionService({
    async listActiveSubscriptionDocuments() { return [{ ...document("bad"), tenant_id: "other" }]; },
  });
  await assert.rejects(() => crossTenant.listActive("demo"), /cross-scope/);

  const inactive = new IntegrationSubscriptionService({
    async listActiveSubscriptionDocuments() { return [document("disabled", { status: "disabled" })]; },
  });
  await assert.rejects(() => inactive.listActive("demo"), /inactive/);

  assert.throws(() => subscriptionFromDocument(document("bad-url", {
    data: { target_url: "https://127.0.0.1/private", allowed_hosts: ["127.0.0.1"] },
  })), /host is not allowed/);
});

test("active subscription service rejects a result set above the authoritative scan bound", async () => {
  const service = new IntegrationSubscriptionService({
    async listActiveSubscriptionDocuments() {
      const one = document("sub");
      return Array.from({ length: 5001 }, (_, index) => ({ ...one, name: `sub-${index}` }));
    },
  });
  await assert.rejects(() => service.listActive("demo"), /safe bound/);
});
