import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeliveryTask,
  planWebhookDeliveries,
  taskToSubscription,
  validateDeliveryTask,
} from "../dist/packages/integration-hub/src/delivery-planner.js";

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
    payload: { customer: "ACME", amount_minor: 125000 },
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
    mapping: [{ source: "payload.customer", target: "customer", required: true }],
    retry_policy: { max_attempts: 5, base_delay_seconds: 2, max_delay_seconds: 60 },
    ...overrides,
  };
}

test("planner freezes a deterministic delivery snapshot without secret material", async () => {
  const task = await buildDeliveryTask(event(), subscription());
  assert.equal(task.delivery_id, task.envelope.delivery_id);
  assert.equal(task.subscription_id, "sub-sales");
  assert.equal(task.target_url, "https://hooks.example.com/forge");
  assert.equal(task.secret_ref, "credential://integration/sub-sales");
  assert.equal(JSON.stringify(task).includes("actual-secret-value"), false);
  assert.deepEqual(task.envelope.data, { customer: "ACME" });
  assert.deepEqual(task.retry_policy, { max_attempts: 5, base_delay_seconds: 2, max_delay_seconds: 60 });

  const same = await buildDeliveryTask(event(), subscription());
  assert.equal(task.delivery_id, same.delivery_id);
  assert.deepEqual(task, same);
});

test("planner selects only active tenant/event subscriptions", async () => {
  const tasks = await planWebhookDeliveries(event(), [
    subscription(),
    subscription({ subscription_id: "disabled", status: "disabled" }),
    subscription({ subscription_id: "other-event", event_pattern: "purchase_order.*" }),
    subscription({ subscription_id: "other-tenant", tenant_id: "other" }),
  ]);
  assert.deepEqual(tasks.map((item) => item.subscription_id), ["sub-sales"]);
});

test("delivery task validation binds task identity to the frozen envelope", async () => {
  const task = await buildDeliveryTask(event(), subscription());
  assert.equal(validateDeliveryTask(task).delivery_id, task.delivery_id);
  assert.throws(() => validateDeliveryTask({ ...task, tenant_id: "other" }), /identity mismatch/);
  assert.throws(() => validateDeliveryTask({ ...task, target_url: "https://127.0.0.1/private", allowed_hosts: ["127.0.0.1"] }), /host is not allowed/);

  const restored = taskToSubscription(task);
  assert.equal(restored.subscription_id, "sub-sales");
  assert.equal(restored.event_pattern, "sales_order.submitted");
  assert.equal(restored.status, "active");
});

test("inactive subscriptions cannot be forced into queue tasks directly", async () => {
  await assert.rejects(() => buildDeliveryTask(event(), subscription({ status: "disabled" })), /Only active/);
});
