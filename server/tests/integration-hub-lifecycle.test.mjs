import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeliveryRecord,
  finishDeliveryAttempt,
  replayDeadLetter,
  startDeliveryAttempt,
  validateDeliveryRecord,
} from "../dist/packages/integration-hub/src/lifecycle.js";

function initial(now = new Date("2026-08-03T00:00:00.000Z")) {
  return createDeliveryRecord({
    delivery_id: "dlv_0123456789abcdef",
    tenant_id: "demo",
    subscription_id: "sub-sales",
    event_id: "evt-100",
    event_type: "sales_order.submitted",
    now,
  });
}

test("delivery lifecycle is explicit from queue to successful delivery", () => {
  const created = initial();
  assert.equal(created.record.state, "queued");
  assert.equal(created.record.attempts, 0);
  assert.equal(created.audit.action, "queued");

  const started = startDeliveryAttempt(created.record, new Date("2026-08-03T00:00:01.000Z"));
  assert.equal(started.record.state, "in_flight");
  assert.equal(started.record.attempts, 1);
  assert.equal(started.audit.action, "attempt_started");

  const finished = finishDeliveryAttempt(started.record, { http_status: 204 }, new Date("2026-08-03T00:00:02.000Z"));
  assert.equal(finished.record.state, "delivered");
  assert.equal(finished.record.delivered_at, "2026-08-03T00:00:02.000Z");
  assert.equal(finished.audit.action, "delivered");
  assert.throws(() => startDeliveryAttempt(finished.record, new Date("2026-08-03T00:00:03.000Z")), /Cannot start/);
});

test("retry schedule cannot execute before due time and preserves logical delivery identity", () => {
  const started = startDeliveryAttempt(initial().record, new Date("2026-08-03T00:00:01.000Z"));
  const retried = finishDeliveryAttempt(
    started.record,
    { http_status: 503, error_code: "PROVIDER_UNAVAILABLE" },
    new Date("2026-08-03T00:00:02.000Z"),
    { base_delay_seconds: 10, max_delay_seconds: 60, max_attempts: 3 },
  );
  assert.equal(retried.record.state, "retry_scheduled");
  assert.equal(retried.record.delivery_id, started.record.delivery_id);
  assert.equal(retried.record.next_attempt_at, "2026-08-03T00:00:12.000Z");
  assert.equal(retried.audit.reason, "retryable_http_503");
  assert.throws(() => startDeliveryAttempt(retried.record, new Date("2026-08-03T00:00:11.999Z")), /not due/);
  const second = startDeliveryAttempt(retried.record, new Date("2026-08-03T00:00:12.000Z"));
  assert.equal(second.record.attempts, 2);
});

test("terminal delivery becomes dead-letter and replay requires actor plus reason", () => {
  const started = startDeliveryAttempt(initial().record, new Date("2026-08-03T00:00:01.000Z"));
  const dead = finishDeliveryAttempt(started.record, { http_status: 400 }, new Date("2026-08-03T00:00:02.000Z"));
  assert.equal(dead.record.state, "dead_letter");
  assert.equal(dead.audit.reason, "permanent_http_400");

  const replay = replayDeadLetter(dead.record, "Administrator", "Provider mapping corrected", new Date("2026-08-03T01:00:00.000Z"));
  assert.equal(replay.record.state, "retry_scheduled");
  assert.equal(replay.record.replay_count, 1);
  assert.equal(replay.record.delivery_id, dead.record.delivery_id);
  assert.equal(replay.record.next_attempt_at, "2026-08-03T01:00:00.000Z");
  assert.equal(replay.audit.actor_id, "Administrator");
  assert.equal(replay.audit.reason, "Provider mapping corrected");

  assert.throws(() => replayDeadLetter(initial().record, "Administrator", "bad", new Date()), /Only dead-letter/);
  assert.throws(() => replayDeadLetter(dead.record, "", "bad", new Date()), /actor_id/);
  assert.throws(() => replayDeadLetter(dead.record, "Administrator", "", new Date()), /replay reason/);
});

test("record validation rejects malformed identity, dates and counters", () => {
  assert.equal(validateDeliveryRecord(initial().record).tenant_id, "demo");
  assert.throws(() => validateDeliveryRecord({ ...initial().record, tenant_id: "" }), /tenant_id/);
  assert.throws(() => validateDeliveryRecord({ ...initial().record, queued_at: "not-a-date" }), /queued_at/);
  assert.throws(() => validateDeliveryRecord({ ...initial().record, attempts: -1 }), /attempts/);
  assert.throws(() => validateDeliveryRecord({ ...initial().record, state: "lost" }), /state/);
});
