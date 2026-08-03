import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateApprovalTimers,
  parseApprovalTimerPlan,
} from "../dist/packages/app-registry/src/index.js";

const PLAN = {
  stages: [
    { key: "manager", mode: "any", approvers: [{ role: "Manager" }] },
    { key: "director", mode: "any", approvers: [{ role: "Director" }] },
  ],
};
const TIMERS = {
  stages: [
    {
      stage_key: "manager",
      due_after_minutes: 60,
      escalations: [
        { key: "remind-manager", after_minutes: 90 },
        { key: "notify-director", after_minutes: 120 },
      ],
    },
    { stage_key: "director", due_after_minutes: 180 },
  ],
};

function approvedManager() {
  return [{
    decision_id: "d1",
    stage_key: "manager",
    actor_id: "manager@example.com",
    decision: "approve",
    matched_approver: "role:Manager",
    occurred_at: "2026-08-03T01:00:00.000Z",
  }];
}

test("timer planner emits stable due/escalation event keys around the SLA boundary", () => {
  const before = evaluateApprovalTimers(PLAN, TIMERS, [], {
    manager: "2026-08-03T00:00:00.000Z",
  }, "2026-08-03T00:59:00.000Z");
  assert.equal(before.overdue, false);
  assert.equal(before.due_events.length, 0);
  assert.deepEqual(before.future_events.map((event) => event.event_key), [
    "manager:due",
    "manager:escalation:remind-manager",
    "manager:escalation:notify-director",
  ]);

  const after = evaluateApprovalTimers(PLAN, TIMERS, [], {
    manager: "2026-08-03T00:00:00.000Z",
  }, "2026-08-03T02:01:00.000Z");
  assert.equal(after.overdue, true);
  assert.deepEqual(after.due_events.map((event) => event.event_key), [
    "manager:due",
    "manager:escalation:remind-manager",
    "manager:escalation:notify-director",
  ]);
});

test("timer evaluation follows the current open stage after a decision", () => {
  const result = evaluateApprovalTimers(PLAN, TIMERS, approvedManager(), {
    manager: "2026-08-03T00:00:00.000Z",
    director: "2026-08-03T01:00:00.000Z",
  }, "2026-08-03T02:00:00.000Z");
  assert.equal(result.open_stage, "director");
  assert.equal(result.due_at, "2026-08-03T04:00:00.000Z");
  assert.equal(result.overdue, false);
});

test("a completed or rejected plan has no active timers", () => {
  const completed = evaluateApprovalTimers(PLAN, TIMERS, [
    ...approvedManager(),
    {
      decision_id: "d2",
      stage_key: "director",
      actor_id: "director@example.com",
      decision: "approve",
      matched_approver: "role:Director",
      occurred_at: "2026-08-03T02:00:00.000Z",
    },
  ], { manager: "2026-08-03T00:00:00.000Z", director: "2026-08-03T01:00:00.000Z" }, "2026-08-03T03:00:00.000Z");
  assert.equal(completed.open_stage, null);
  assert.deepEqual(completed.due_events, []);

  const rejected = evaluateApprovalTimers(PLAN, TIMERS, [{
    decision_id: "r1",
    stage_key: "manager",
    actor_id: "manager@example.com",
    decision: "reject",
    matched_approver: "role:Manager",
    occurred_at: "2026-08-03T00:10:00.000Z",
  }], { manager: "2026-08-03T00:00:00.000Z" }, "2026-08-03T03:00:00.000Z");
  assert.equal(rejected.open_stage, null);
});

test("timed open stage fails closed without opened-at persistence evidence", () => {
  assert.throws(() => evaluateApprovalTimers(PLAN, TIMERS, [], {}, "2026-08-03T01:00:00.000Z"), /Missing opened-at evidence/);
});

test("timer plan rejects unknown stage, non-increasing escalation, duplicates and excessive values", () => {
  assert.throws(() => parseApprovalTimerPlan({ stages: [{ stage_key: "ghost", due_after_minutes: 60 }] }, PLAN), /declared approval stage/);
  assert.throws(() => parseApprovalTimerPlan({ stages: [{
    stage_key: "manager",
    due_after_minutes: 60,
    escalations: [{ key: "too-soon", after_minutes: 60 }],
  }] }, PLAN), /must be later/);
  assert.throws(() => parseApprovalTimerPlan({ stages: [
    { stage_key: "manager", due_after_minutes: 60 },
    { stage_key: "manager", due_after_minutes: 90 },
  ] }, PLAN), /Duplicate approval timer policy/);
});
