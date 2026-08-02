import test from "node:test";
import assert from "node:assert/strict";
import {
  dueBpmScheduledActions,
  matchBpmEventTriggers,
  parseBpmTriggerSet,
} from "../dist/packages/app-registry/src/index.js";

const SET = {
  event_triggers: [
    { key: "purchase-submit", event: "purchase_order.submitted", action: "notify-purchasing" },
    {
      key: "large-purchase",
      event: "purchase_order.*",
      action: "review-large-order",
      when: { op: "gte", left: { kind: "field", field: "grand_total" }, right: { kind: "value", value: 1000000 } },
    },
  ],
  scheduled_actions: [
    { key: "month-close", action: "close-period", schedule: { kind: "once", at: "2026-08-31T17:00:00.000Z" } },
    { key: "hourly-sweep", action: "sweep-overdue", schedule: { kind: "interval", anchor: "2026-08-03T00:00:00.000Z", every_minutes: 60 } },
  ],
};

test("event triggers reuse exact/prefix hook matching and safe decision conditions", () => {
  const exact = matchBpmEventTriggers(SET, "purchase_order.submitted", { grand_total: 2000000 });
  assert.deepEqual(exact.map((entry) => entry.key), ["purchase-submit", "large-purchase"]);

  const small = matchBpmEventTriggers(SET, "purchase_order.cancelled", { grand_total: 100 });
  assert.deepEqual(small.map((entry) => entry.key), []);
});

test("declared action names can be validated at authoring time", () => {
  assert.doesNotThrow(() => parseBpmTriggerSet(SET, new Set(["notify-purchasing", "review-large-order", "close-period", "sweep-overdue"])));
  assert.throws(() => parseBpmTriggerSet(SET, new Set(["notify-purchasing"])), /undeclared action/);
});

test("scheduled intervals emit deterministic catch-up occurrence keys after a watermark", () => {
  const due = dueBpmScheduledActions(SET, "2026-08-03T00:30:00.000Z", "2026-08-03T03:05:00.000Z");
  assert.deepEqual(due.map((entry) => entry.occurrence_key), [
    "hourly-sweep@2026-08-03T01:00:00.000Z",
    "hourly-sweep@2026-08-03T02:00:00.000Z",
    "hourly-sweep@2026-08-03T03:00:00.000Z",
  ]);
});

test("one-time schedules fire once inside the requested watermark window", () => {
  const due = dueBpmScheduledActions(SET, "2026-08-31T16:59:00.000Z", "2026-08-31T17:01:00.000Z");
  assert.ok(due.some((entry) => entry.occurrence_key === "month-close@2026-08-31T17:00:00.000Z"));
  const replay = dueBpmScheduledActions(SET, "2026-08-31T17:00:00.000Z", "2026-08-31T18:00:00.000Z");
  assert.equal(replay.some((entry) => entry.schedule_key === "month-close"), false);
});

test("schedule parser rejects duplicate keys, malformed patterns and bad intervals", () => {
  assert.throws(() => parseBpmTriggerSet({
    event_triggers: [{ key: "same", event: "x.y", action: "a" }],
    scheduled_actions: [{ key: "same", action: "a", schedule: { kind: "once", at: "2026-08-03T00:00:00Z" } }],
  }), /Duplicate BPM trigger key/);
  assert.throws(() => parseBpmTriggerSet({ event_triggers: [{ key: "x", event: "x.*.bad", action: "a" }] }), /supported exact\/prefix/);
  assert.throws(() => parseBpmTriggerSet({ scheduled_actions: [{ key: "x", action: "a", schedule: { kind: "interval", anchor: "2026-08-03T00:00:00Z", every_minutes: 0 } }] }), /integer from 1/);
});

test("large missed windows fail closed instead of silently truncating scheduled work", () => {
  assert.throws(() => dueBpmScheduledActions({
    scheduled_actions: [{ key: "minute", action: "a", schedule: { kind: "interval", anchor: "2026-08-03T00:00:00Z", every_minutes: 1 } }],
  }, null, "2026-08-03T03:00:00Z"), /catch-up exceeds/);
});
