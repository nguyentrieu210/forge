import test from "node:test";
import assert from "node:assert/strict";
import {
  blankApprovalPlan,
  newApprovalStage,
  serializeApprovalPlan,
  validateApprovalPlan,
} from "../dist/workflow/approval-plan.js";

test("approval builder serializes staged quorum and SLA into server contract", () => {
  const model = {
    distinctActorAcrossStages: true,
    stages: [
      {
        key: "finance",
        label: "Tài chính",
        mode: "quorum",
        quorum: 2,
        approvers: [{ role: "Finance Manager" }, { user: "owner@example.com" }],
        dueAfterMinutes: 60,
        escalations: [
          { key: "notify-director", afterMinutes: 120 },
          { key: "remind-finance", afterMinutes: 90 },
        ],
      },
    ],
  };
  const result = serializeApprovalPlan(model);
  assert.equal(result.approval_plan.distinct_actor_across_stages, true);
  assert.equal(result.approval_plan.stages[0].quorum, 2);
  assert.deepEqual(result.approval_plan.stages[0].approvers, [
    { role: "Finance Manager" },
    { user: "owner@example.com" },
  ]);
  assert.deepEqual(result.timer_plan.stages[0].escalations, [
    { key: "remind-finance", after_minutes: 90 },
    { key: "notify-director", after_minutes: 120 },
  ]);
});

test("blank/new helpers produce editable but explicit drafts", () => {
  assert.deepEqual(blankApprovalPlan(), { distinctActorAcrossStages: false, stages: [] });
  assert.deepEqual(newApprovalStage(1), {
    key: "stage-2",
    label: "Bước 2",
    mode: "any",
    approvers: [{ role: "System Manager" }],
  });
});

test("validation rejects duplicate stage/selectors and invalid quorum", () => {
  const result = validateApprovalPlan({
    distinctActorAcrossStages: false,
    stages: [
      {
        key: "review",
        label: "Review",
        mode: "quorum",
        quorum: 0,
        approvers: [{ role: "Manager" }, { role: "Manager" }],
      },
      {
        key: "review",
        label: "Review 2",
        mode: "any",
        approvers: [{ user: "a@example.com" }],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "stage_key_dup"));
  assert.ok(result.issues.some((entry) => entry.code === "approver_dup"));
  assert.ok(result.issues.some((entry) => entry.code === "quorum"));
});

test("SLA escalation cannot exist before or at the due boundary", () => {
  const noSla = validateApprovalPlan({
    distinctActorAcrossStages: false,
    stages: [{ key: "review", label: "Review", mode: "any", approvers: [{ role: "Manager" }], escalations: [{ key: "x", afterMinutes: 10 }] }],
  });
  assert.ok(noSla.issues.some((entry) => entry.code === "escalation_without_sla"));

  const tooSoon = validateApprovalPlan({
    distinctActorAcrossStages: false,
    stages: [{ key: "review", label: "Review", mode: "any", approvers: [{ role: "Manager" }], dueAfterMinutes: 60, escalations: [{ key: "x", afterMinutes: 60 }] }],
  });
  assert.ok(tooSoon.issues.some((entry) => entry.code === "escalation_time"));
});
