import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("CRM Lead Source", "Website", "demo", { source_name: "Website", disabled: false });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function createRule(kernel, name, document) {
  return mutate(kernel, { commandId: `${name}-create`, actor: salesManager, doctype: "CRM Lead Score Rule", name, action: "create", expectedVersion: null, document });
}

test("Lead scoring is deterministic from active effective rules and snapshots evidence", async () => {
  const { kernel, store } = setup();
  await mutate(kernel, {
    commandId: "lead-create", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-SCORE", action: "create", expectedVersion: null,
    document: { company: "Demo", lead_name: "Scored prospect", email_id: "buyer@example.com", lead_source: "Website", territory: "Vietnam", status: "New" },
  });
  await createRule(kernel, "RULE-SOURCE", { company: "Demo", rule_name: "Website source", fact: "Lead Source", operator: "Equals", match_value: "Website", points: 20, effective_from: "2026-01-01", status: "Active" });
  await createRule(kernel, "RULE-EMAIL", { company: "Demo", rule_name: "Has email", fact: "Has Email", operator: "Present", points: 5, effective_from: "2026-01-01", status: "Active" });
  await createRule(kernel, "RULE-MOBILE", { company: "Demo", rule_name: "Missing mobile", fact: "Has Mobile", operator: "Absent", points: -3, effective_from: "2026-01-01", status: "Active" });
  await createRule(kernel, "RULE-FUTURE", { company: "Demo", rule_name: "Future bonus", fact: "Territory", operator: "Equals", match_value: "Vietnam", points: 999, effective_from: "2027-01-01", status: "Active" });

  await mutate(kernel, {
    commandId: "score-create", actor: salesUser, doctype: "CRM Lead Score Snapshot", name: "CRM-SCORE-1", action: "create", expectedVersion: null,
    document: { company: "Demo", lead: "CRM-LEAD-SCORE", score: 9999, matched_rule_count: 99 },
  });
  const score = await store.getDocument("demo", "CRM Lead Score Snapshot", "CRM-SCORE-1");
  assert.equal(score.data.score, 22);
  assert.equal(score.data.matched_rule_count, 3);
  assert.equal(score.data.matched_rules, "RULE-EMAIL\nRULE-MOBILE\nRULE-SOURCE");
  assert.equal(score.data.scored_at, NOW);
  await assert.rejects(() => mutate(kernel, {
    commandId: "score-edit", actor: salesManager, doctype: "CRM Lead Score Snapshot", name: "CRM-SCORE-1", action: "save", expectedVersion: 1,
    document: { score: 100 },
  }), /immutable evidence/);
});

test("Sales Manager owns scoring rules and overlapping predicates are rejected", async () => {
  const { kernel } = setup();
  await assert.rejects(() => mutate(kernel, {
    commandId: "rule-user", actor: salesUser, doctype: "CRM Lead Score Rule", name: "RULE-USER", action: "create", expectedVersion: null,
    document: { company: "Demo", rule_name: "Unauthorized", fact: "Status", operator: "Equals", match_value: "Qualified", points: 10, effective_from: "2026-01-01", status: "Active" },
  }), /Only a Sales Manager may manage CRM Lead Score Rules/);
  await createRule(kernel, "RULE-ONE", { company: "Demo", rule_name: "Qualified leads", fact: "Status", operator: "Equals", match_value: "Qualified", points: 10, effective_from: "2026-01-01", effective_to: "2026-12-31", status: "Active" });
  await assert.rejects(() => createRule(kernel, "RULE-TWO", { company: "Demo", rule_name: "Overlapping qualified", fact: "Status", operator: "Equals", match_value: "Qualified", points: 15, effective_from: "2026-06-01", status: "Active" }), /overlaps active rule RULE-ONE/);
});
