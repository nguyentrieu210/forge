import test from "node:test";
import assert from "node:assert/strict";
import {
  inspectQueueQuarantine,
  materializeQueueReplay,
  quarantineQueueMessage,
  requestQueueReplay,
  validateQueueQuarantine,
} from "../dist/packages/integration-hub/src/queue-recovery.js";

const now = new Date("2026-08-04T00:00:00.000Z");

const domainEvent = {
  event_id: "evt-sales-1",
  event_type: "sales_order.submitted",
  tenant_id: "demo",
  aggregate: { doctype: "Sales Order", name: "SO-1" },
  aggregate_version: 3,
  actor: "Administrator",
  command_id: "cmd-sales-1",
  occurred_at: now.toISOString(),
  schema_version: 1,
  payload: { customer: "ACME", total_minor: 125000 },
};

const socialEvent = {
  schema_version: 1,
  tenant_id: "demo",
  worker_name: "cloudforge-tenant-demo",
  provider: "facebook",
  page_key_hmac: "a".repeat(64),
  event_id: "facebook:evt-1",
  received_at: now.toISOString(),
  raw_body: "{\n  \"entry\": [{\"id\": \"page-1\"}]\n}",
};

const preparedReport = {
  tenant_id: "demo",
  job_id: "job-gl-1",
  actor_id: "accountant@example.com",
  request: { report: "General Ledger", filters: { company: "ACME" } },
  bookmark: "bookmark-1",
};

test("queue quarantine preserves tenant/schema/idempotency while operator inspection hides payload", async () => {
  for (const fixture of [
    ["outbox_domain_event", domainEvent, domainEvent.event_id],
    ["social_event", socialEvent, socialEvent.event_id],
    ["prepared_report", preparedReport, preparedReport.job_id],
  ]) {
    const [queueKind, message, identity] = fixture;
    const quarantine = await quarantineQueueMessage({
      queue_kind: queueKind,
      message,
      attempts: 7,
      failure_code: "PROVIDER_UNAVAILABLE",
      now,
    });
    assert.equal(quarantine.tenant_id, "demo");
    assert.equal(quarantine.idempotency_identity, identity);
    assert.equal(quarantine.message_schema_version, 1);
    assert.match(quarantine.payload_hash, /^[0-9a-f]{64}$/);
    assert.match(quarantine.dead_letter_id, /^qdlq_[0-9a-f]{48}$/);

    const inspection = await inspectQueueQuarantine(quarantine);
    assert.equal(inspection.idempotency_identity, identity);
    assert.equal(Object.hasOwn(inspection, "original_message"), false);
    assert.equal(JSON.stringify(inspection).includes("ACME"), false);
    assert.equal(JSON.stringify(inspection).includes("entry"), false);
  }
});

test("replay is hash-bound, reasoned and materializes only the immutable quarantined message", async () => {
  const quarantine = await quarantineQueueMessage({
    queue_kind: "outbox_domain_event",
    message: domainEvent,
    attempts: 8,
    failure_code: "RETRY_EXHAUSTED",
    now,
  });
  const replay = await requestQueueReplay(quarantine, {
    actor_id: "Administrator",
    reason: "Provider recovered after outage",
    expected_payload_hash: quarantine.payload_hash,
    now: new Date("2026-08-04T01:00:00.000Z"),
  });
  assert.equal(Object.hasOwn(replay, "message"), false);
  assert.equal(replay.idempotency_identity, domainEvent.event_id);
  assert.equal(replay.replay_count, 1);

  const materialized = await materializeQueueReplay(quarantine, replay);
  assert.equal(materialized.tenant_id, "demo");
  assert.equal(materialized.idempotency_identity, domainEvent.event_id);
  assert.deepEqual(materialized.message, domainEvent);
});

test("queue recovery fails closed on payload, tenant, identity and replay tampering", async () => {
  const quarantine = await quarantineQueueMessage({
    queue_kind: "prepared_report",
    message: preparedReport,
    attempts: 5,
    failure_code: "REPORT_FAILED",
    now,
  });
  await assert.rejects(
    validateQueueQuarantine({ ...quarantine, tenant_id: "other" }),
    /identity mismatch/,
  );
  await assert.rejects(
    validateQueueQuarantine({ ...quarantine, original_message: { ...preparedReport, job_id: "job-other" } }),
    /identity mismatch|payload hash mismatch/,
  );
  await assert.rejects(
    requestQueueReplay(quarantine, {
      actor_id: "Administrator",
      reason: "retry",
      expected_payload_hash: "0".repeat(64),
      now,
    }),
    /payload hash/,
  );

  const replay = await requestQueueReplay(quarantine, {
    actor_id: "Administrator",
    reason: "retry",
    expected_payload_hash: quarantine.payload_hash,
    now,
  });
  await assert.rejects(
    materializeQueueReplay(quarantine, { ...replay, replay_count: 2 }),
    /stale or out of sequence/,
  );
});

test("social quarantine accepts pretty-printed raw webhook body without normalizing bytes", async () => {
  const quarantine = await quarantineQueueMessage({
    queue_kind: "social_event",
    message: socialEvent,
    attempts: 2,
    failure_code: "DISPATCH_FAILED",
    now,
  });
  assert.equal(quarantine.original_message.raw_body, socialEvent.raw_body);
  const replay = await requestQueueReplay(quarantine, {
    actor_id: "System Manager",
    reason: "Route restored",
    expected_payload_hash: quarantine.payload_hash,
    now,
  });
  const materialized = await materializeQueueReplay(quarantine, replay);
  assert.equal(materialized.message.raw_body, socialEvent.raw_body);
});
