import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalPlanFromPolicySteps,
  createApprovalDecisionFact,
  evaluateApprovalPlan,
  parseApprovalPlan,
} from "../dist/packages/app-registry/src/index.js";

function fact(overrides = {}) {
  return {
    decision_id: "d-1",
    stage_key: "finance",
    actor_id: "a@example.com",
    decision: "approve",
    matched_approver: "role:Finance Manager",
    occurred_at: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

const PLAN = {
  schema_version: 1,
  stages: [
    {
      key: "finance",
      label: "Tài chính",
      mode: "quorum",
      quorum: 2,
      approvers: [{ role: "Finance Manager" }],
    },
    {
      key: "director",
      label: "Giám đốc",
      mode: "all",
      approvers: [{ role: "Director" }, { user: "owner@example.com" }],
    },
  ],
};

test("quorum stage counts distinct actors even when they satisfy the same role selector", () => {
  const decisions = [
    fact(),
    fact({ decision_id: "d-2", actor_id: "b@example.com" }),
  ];
  const result = evaluateApprovalPlan(PLAN, decisions);
  assert.equal(result.status, "pending");
  assert.equal(result.stages[0].status, "approved");
  assert.equal(result.stages[0].approvals, 2);
  assert.equal(result.open_stage, "director");
});

test("all stage requires every declared selector and distinct actors", () => {
  const decisions = [
    fact(),
    fact({ decision_id: "d-2", actor_id: "b@example.com" }),
    fact({
      decision_id: "d-3",
      stage_key: "director",
      actor_id: "director@example.com",
      matched_approver: "role:Director",
    }),
  ];
  const pending = evaluateApprovalPlan(PLAN, decisions);
  assert.equal(pending.open_stage, "director");
  assert.equal(pending.stages[1].status, "pending");

  const approved = evaluateApprovalPlan(PLAN, [
    ...decisions,
    fact({
      decision_id: "d-4",
      stage_key: "director",
      actor_id: "owner@example.com",
      matched_approver: "user:owner@example.com",
    }),
  ]);
  assert.equal(approved.status, "approved");
  assert.equal(approved.open_stage, null);
});

test("one rejection fails the open stage and the whole plan", () => {
  const result = evaluateApprovalPlan(PLAN, [
    fact({ decision: "reject" }),
  ]);
  assert.equal(result.status, "rejected");
  assert.equal(result.stages[0].status, "rejected");
  assert.equal(result.stages[1].status, "blocked");
});

test("decisions for future blocked stages fail closed", () => {
  assert.throws(() => evaluateApprovalPlan(PLAN, [
    fact({
      stage_key: "director",
      actor_id: "director@example.com",
      matched_approver: "role:Director",
    }),
  ]), /blocked future stage/);
});

test("one actor cannot cast two decisions in the same parallel stage", () => {
  assert.throws(() => evaluateApprovalPlan(PLAN, [
    fact(),
    fact({ decision_id: "d-2", matched_approver: "role:Finance Manager" }),
  ]), /more than one decision/);
});

test("optional cross-stage actor separation is explicit and deterministic", () => {
  const plan = { ...PLAN, distinct_actor_across_stages: true };
  assert.throws(() => evaluateApprovalPlan(plan, [
    fact(),
    fact({ decision_id: "d-2", actor_id: "b@example.com" }),
    fact({
      decision_id: "d-3",
      stage_key: "director",
      actor_id: "a@example.com",
      matched_approver: "role:Director",
    }),
  ]), /reused across approval stages/);
});

test("new decision creation requires WS11-provided eligibility evidence", () => {
  const plan = parseApprovalPlan(PLAN);
  assert.throws(() => createApprovalDecisionFact(plan, [], {
    decision_id: "d-1",
    stage_key: "finance",
    actor_id: "a@example.com",
    decision: "approve",
    eligible_approvers: [],
    matched_approver: "role:Finance Manager",
    occurred_at: "2026-08-03T00:00:00.000Z",
  }), /not currently eligible/);

  const normalized = createApprovalDecisionFact(plan, [], {
    decision_id: "d-1",
    stage_key: "finance",
    actor_id: "a@example.com",
    decision: "approve",
    eligible_approvers: ["role:Finance Manager"],
    matched_approver: "role:Finance Manager",
    occurred_at: "2026-08-03T00:00:00.000Z",
    delegation_id: "DEL-1",
  });
  assert.equal(normalized.delegation_id, "DEL-1");
  assert.equal(normalized.matched_approver, "role:Finance Manager");
});

test("current Approval Policy flat steps compile to sequential stages without changing semantics", () => {
  const plan = approvalPlanFromPolicySteps([
    { role: "Finance Manager" },
    { user: "owner@example.com", label: "Chủ doanh nghiệp" },
  ]);
  assert.deepEqual(plan.stages.map((stage) => stage.key), ["step-1", "step-2"]);
  assert.equal(plan.stages[0].mode, "any");
  assert.equal(plan.stages[0].approvers[0].key, "role:Finance Manager");
  assert.equal(plan.stages[1].approvers[0].key, "user:owner@example.com");
});

test("plan parser rejects duplicate stages/selectors and malformed quorum", () => {
  assert.throws(() => parseApprovalPlan({
    stages: [
      { key: "x", approvers: [{ role: "A" }] },
      { key: "x", approvers: [{ role: "B" }] },
    ],
  }), /Duplicate approval stage/);
  assert.throws(() => parseApprovalPlan({
    stages: [{ key: "x", mode: "all", quorum: 2, approvers: [{ role: "A" }] }],
  }), /only valid when mode is quorum/);
  assert.throws(() => parseApprovalPlan({
    stages: [{ key: "x", mode: "quorum", quorum: 0, approvers: [{ role: "A" }] }],
  }), /integer from 1/);
  assert.throws(() => parseApprovalPlan({
    stages: [{ key: "x", approvers: [{ role: "A", user: "a@example.com" }] }],
  }), /exactly one of role or user/);
});
