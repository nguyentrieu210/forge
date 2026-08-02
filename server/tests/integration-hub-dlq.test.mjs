import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliveryTask } from "../dist/packages/integration-hub/src/delivery-planner.js";
import {
  createWebhookDeadLetter,
  requestWebhookReplay,
  validateWebhookDeadLetter,
  validateWebhookReplay,
} from "../dist/packages/integration-hub/src/dlq.js";

const event = {
  event_id: "evt-1", event_type: "sales_order.submitted", tenant_id: "demo",
  aggregate: { doctype: "Sales Order", name: "SO-1" }, aggregate_version: 1,
  actor: "Administrator", command_id: "cmd-1", occurred_at: "2026-08-03T00:00:00.000Z", schema_version: 1,
  payload: { customer: "ACME" },
};
const subscription = {
  subscription_id: "sub-sales", tenant_id: "demo", event_pattern: "sales_order.*",
  target_url: "https://hooks.example.com/forge", status: "active", auth_kind: "api_key",
  secret_ref: "credential://integration/sub-sales", allowed_hosts: ["hooks.example.com"],
};

test("dead-letter contract preserves immutable delivery task and no secret value", async () => {
  const task = await buildDeliveryTask(event, subscription);
  const dlq = await createWebhookDeadLetter({ task, attempts: 8, reason: "retry_exhausted", now: new Date("2026-08-03T01:00:00Z") });
  assert.match(dlq.dead_letter_id, /^dlq_[a-f0-9]{48}$/);
  assert.equal(dlq.delivery_id, task.delivery_id);
  assert.equal(dlq.task, task);
  assert.equal(dlq.replay_count, 0);
  assert.equal(JSON.stringify(dlq).includes("actual-secret"), false);
  assert.equal(validateWebhookDeadLetter(dlq).dead_letter_id, dlq.dead_letter_id);
});

test("replay requires actor and reason and preserves logical delivery identity", async () => {
  const task = await buildDeliveryTask(event, subscription);
  const dlq = await createWebhookDeadLetter({ task, attempts: 8, reason: "retry_exhausted", now: new Date("2026-08-03T01:00:00Z") });
  const replay = requestWebhookReplay(dlq, "Administrator", "Provider recovered", new Date("2026-08-03T02:00:00Z"));
  assert.equal(replay.delivery_id, dlq.delivery_id);
  assert.equal(replay.task.delivery_id, dlq.delivery_id);
  assert.equal(replay.actor_id, "Administrator");
  assert.equal(replay.replay_count, 1);
  assert.equal(validateWebhookReplay(replay).reason, "Provider recovered");
  assert.throws(() => requestWebhookReplay(dlq, "", "x", new Date()), /actor_id/);
  assert.throws(() => requestWebhookReplay(dlq, "Administrator", "", new Date()), /replay reason/);
});

test("DLQ validation rejects identity tampering", async () => {
  const task = await buildDeliveryTask(event, subscription);
  const dlq = await createWebhookDeadLetter({ task, attempts: 8, reason: "retry_exhausted", now: new Date() });
  assert.throws(() => validateWebhookDeadLetter({ ...dlq, tenant_id: "other" }), /identity mismatch/);
  const replay = requestWebhookReplay(dlq, "Administrator", "retry", new Date());
  assert.throws(() => validateWebhookReplay({ ...replay, delivery_id: "dlv_tampered" }), /identity mismatch/);
});
