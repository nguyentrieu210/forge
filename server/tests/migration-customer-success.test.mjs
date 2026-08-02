import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCustomerSuccess,
  snapshotCustomerSuccess,
} from "../dist/packages/migration/src/public.js";

const plan = {
  training: [
    { key: "warehouse-key-user", role: "Warehouse User", topic: "Receive and transfer stock", required: true },
    { key: "accountant-key-user", role: "Accounts User", topic: "Opening and reconciliation", required: true },
  ],
  knowledge: [
    { key: "stock-runbook", title: "Stock operations", kind: "runbook", reference: "kb:stock-v1", audience_roles: ["Warehouse User"] },
    { key: "finance-runbook", title: "Finance operations", kind: "knowledge_base", reference: "kb:finance-v1", audience_roles: ["Accounts User"] },
  ],
  support: { provider: "forge-helpdesk", channel_ref: "support:tenant-1", escalation_ref: "runbook:p1" },
  adoption_targets: [
    { capability: "stock-receipt", minimum_active_actors: 2, minimum_successful_actions: 5 },
  ],
};

test("customer success readiness requires training evidence and adoption targets", () => {
  const result = evaluateCustomerSuccess({
    plan,
    training_evidence: [
      { requirement_key: "warehouse-key-user", completed_by: "trainer@example", completed_at: "2026-08-03T10:00:00Z", evidence_ref: "training:1" },
    ],
    adoption: [
      { actor_id: "u1", capability: "stock-receipt", successful_actions: 4 },
    ],
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.training_open, ["accountant-key-user"]);
  assert.equal(result.support_configured, true);
  assert.equal(result.adoption_gaps.length, 1);
  assert.deepEqual(result.adoption_gaps[0], {
    capability: "stock-receipt",
    active_actors: 1,
    successful_actions: 4,
    target_active_actors: 2,
    target_successful_actions: 5,
  });
});

test("customer success snapshot is deterministic when evidence satisfies the plan", async () => {
  const input = {
    plan,
    training_evidence: [
      { requirement_key: "warehouse-key-user", completed_by: "trainer@example", completed_at: "2026-08-03T10:00:00Z", evidence_ref: "training:1" },
      { requirement_key: "accountant-key-user", completed_by: "trainer@example", completed_at: "2026-08-03T11:00:00Z", evidence_ref: "training:2" },
    ],
    adoption: [
      { actor_id: "u1", capability: "stock-receipt", successful_actions: 3 },
      { actor_id: "u2", capability: "stock-receipt", successful_actions: 2 },
    ],
  };
  const readiness = evaluateCustomerSuccess(input);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.training_open, []);
  assert.deepEqual(readiness.missing_knowledge, []);
  assert.deepEqual(readiness.adoption_gaps, []);
  const first = await snapshotCustomerSuccess(input);
  const second = await snapshotCustomerSuccess(input);
  assert.equal(first.snapshot_id, second.snapshot_id);
  assert.equal(first.plan_fingerprint, second.plan_fingerprint);
});

test("customer success requires knowledge coverage for each required training role", () => {
  const result = evaluateCustomerSuccess({
    plan: { ...plan, knowledge: plan.knowledge.filter((entry) => entry.key !== "finance-runbook") },
    training_evidence: [
      { requirement_key: "warehouse-key-user", completed_by: "trainer@example", completed_at: "2026-08-03T10:00:00Z", evidence_ref: "training:1" },
      { requirement_key: "accountant-key-user", completed_by: "trainer@example", completed_at: "2026-08-03T11:00:00Z", evidence_ref: "training:2" },
    ],
    adoption: [
      { actor_id: "u1", capability: "stock-receipt", successful_actions: 3 },
      { actor_id: "u2", capability: "stock-receipt", successful_actions: 2 },
    ],
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing_knowledge, ["accountant-key-user"]);
});
