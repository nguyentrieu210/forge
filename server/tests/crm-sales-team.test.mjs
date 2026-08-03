import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };
const PIPELINE = "Default Sales Pipeline";
const STAGE = `${PIPELINE}::Prospecting`;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  for (const user of ["manager@example.com", "sales@example.com", "outsider@example.com"]) store.seedMaster("User", user, "demo", { enabled: true });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Stage", STAGE, "demo", { stage_name: "Prospecting", pipeline: PIPELINE, stage_type: "Open", probability: "10", disabled: false });
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW) };
}

async function seedTeam(kernel) {
  await mutate(kernel, {
    commandId: "team-create", actor: salesManager, doctype: "CRM Sales Team", name: "CRM-TEAM-1", action: "create", expectedVersion: null,
    document: { company: "Demo", team_name: "Vietnam Direct Sales", manager: "manager@example.com", territory: "Vietnam", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "member-create", actor: salesManager, doctype: "CRM Sales Team Member", name: "CRM-TM-1", action: "create", expectedVersion: null,
    document: { company: "Demo", sales_team: "CRM-TEAM-1", user: "sales@example.com", member_role: "Member", status: "Active" },
  });
}

test("Lead and Deal assignment must belong to the selected active sales team", async () => {
  const { kernel } = setup();
  await seedTeam(kernel);
  await mutate(kernel, {
    commandId: "lead-team", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-T", action: "create", expectedVersion: null,
    document: { company: "Demo", lead_name: "Team prospect", territory: "Vietnam", sales_team: "CRM-TEAM-1", assigned_to: "sales@example.com", status: "New" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "deal-outsider", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-X", action: "create", expectedVersion: null,
    document: { company: "Demo", opportunity_name: "Wrong assignment", party_type: "Customer", party: "CUST-0001", pipeline: PIPELINE, sales_stage: STAGE, opportunity_amount: "10", currency: "USD", expected_close_date: "2026-08-31", sales_team: "CRM-TEAM-1", assigned_to: "outsider@example.com" },
  }), /is not active in CRM Sales Team CRM-TEAM-1/);
  await mutate(kernel, {
    commandId: "deal-team", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-T", action: "create", expectedVersion: null,
    document: { company: "Demo", opportunity_name: "Team deal", party_type: "Customer", party: "CUST-0001", pipeline: PIPELINE, sales_stage: STAGE, opportunity_amount: "10", currency: "USD", expected_close_date: "2026-08-31", sales_team: "CRM-TEAM-1", assigned_to: "sales@example.com" },
  });
});

test("Sales Manager controls membership and team may own quota", async () => {
  const { kernel, store } = setup();
  await seedTeam(kernel);
  await assert.rejects(() => mutate(kernel, {
    commandId: "member-user", actor: salesUser, doctype: "CRM Sales Team Member", name: "CRM-TM-X", action: "create", expectedVersion: null,
    document: { company: "Demo", sales_team: "CRM-TEAM-1", user: "outsider@example.com", member_role: "Member", status: "Active" },
  }), /Only a Sales Manager may manage CRM Sales Team Members/);
  await mutate(kernel, {
    commandId: "team-target", actor: salesManager, doctype: "CRM Sales Target", name: "CRM-TARGET-TEAM", action: "create", expectedVersion: null,
    document: { company: "Demo", target_owner_type: "CRM Sales Team", target_owner: "CRM-TEAM-1", currency: "USD", start_date: "2026-08-01", end_date: "2026-08-31", target_amount: "250000", status: "Draft" },
  });
  const target = await store.getDocument("demo", "CRM Sales Target", "CRM-TARGET-TEAM");
  assert.equal(target.data.target_owner, "CRM-TEAM-1");
});
