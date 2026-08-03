import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };
const PIPELINE = "Default Sales Pipeline";
const PROSPECTING = `${PIPELINE}::Prospecting`;
const PROPOSAL = `${PIPELINE}::Proposal`;
const WON = `${PIPELINE}::Won`;
const LOST = `${PIPELINE}::Lost`;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("Company", "OtherCo", "demo", { default_currency: "USD" });
  store.seedMaster("CRM Lead Source", "Website", "demo", { source_name: "Website", disabled: false });
  store.seedMaster("Territory", "Vietnam", "demo", { territory_name: "Vietnam" });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Pipeline", "Enterprise", "demo", { pipeline_name: "Enterprise", disabled: false });
  store.seedMaster("CRM Stage", PROSPECTING, "demo", { stage_name: "Prospecting", pipeline: PIPELINE, stage_type: "Open", probability: "10", disabled: false });
  store.seedMaster("CRM Stage", PROPOSAL, "demo", { stage_name: "Proposal", pipeline: PIPELINE, stage_type: "Open", probability: "60", disabled: false });
  store.seedMaster("CRM Stage", WON, "demo", { stage_name: "Won", pipeline: PIPELINE, stage_type: "Won", probability: "20", disabled: false });
  store.seedMaster("CRM Stage", LOST, "demo", { stage_name: "Lost", pipeline: PIPELINE, stage_type: "Lost", probability: "90", disabled: false });
  store.seedMaster("CRM Stage", "Enterprise::Qualification", "demo", { stage_name: "Qualification", pipeline: "Enterprise", stage_type: "Open", probability: "40", disabled: false });
  store.seedMaster("CRM Deal Close Reason", "Best fit", "demo", { reason: "Best fit", outcome: "Won", disabled: false });
  store.seedMaster("CRM Deal Close Reason", "Price", "demo", { reason: "Price", outcome: "Lost", disabled: false });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function createLead(kernel, name = "CRM-LEAD-1") {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Lead", name, action: "create", expectedVersion: null,
    document: { company: "Demo", lead_name: "Acme prospect", email_id: "buyer@example.com", lead_source: "Website", territory: "Vietnam", status: "New" },
  });
}

async function createDeal(kernel, name = "CRM-DEAL-1", overrides = {}) {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Deal", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo", opportunity_name: "Acme annual contract", party_type: "CRM Lead", party: "CRM-LEAD-1",
      pipeline: PIPELINE, sales_stage: PROSPECTING, probability: "99", weighted_value: "999999",
      opportunity_amount: "125000.50", currency: "USD", expected_close_date: "2026-09-30",
      lead_source: "Website", territory: "Vietnam", ...overrides,
    },
  });
}

test("CRM package v0.5 keeps namespaced core and ERP bridge", async () => {
  const source = await readAppSource(fileURLToPath(new URL("../apps-src/crm/", import.meta.url)));
  const parsed = parseAppManifest(source);
  assert.equal(parsed.id, "crm");
  assert.equal(parsed.version, "0.5.0");
  for (const name of ["CRM Lead", "CRM Deal", "CRM Activity", "CRM Pipeline", "CRM Stage", "CRM Lead Source", "CRM Deal Close Reason"]) {
    assert.ok(parsed.doctypes.some((doctype) => doctype.name === name), `${name} must be packaged`);
  }
  for (const name of ["Company", "Customer", "Currency", "Territory", "User", "Sales Order", "Sales Invoice", "Payment Entry"]) {
    assert.ok(parsed.externalDocTypes.some((doctype) => doctype.name === name), `${name} must be external, not redefined by CRM`);
  }
});

test("Lead conversion binds same-company CRM Deal and correction is manager-only", async () => {
  const { kernel, store } = setup();
  await createLead(kernel);
  await mutate(kernel, { commandId: "lead-open", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 1, document: { status: "Open" } });
  await mutate(kernel, { commandId: "lead-qualify", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 2, document: { status: "Qualified" } });
  await createDeal(kernel);
  await assert.rejects(() => mutate(kernel, {
    commandId: "lead-convert-missing-deal", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 3,
    document: { status: "Converted", converted_customer: "CUST-0001" },
  }), /requires a CRM Deal reference/);
  await mutate(kernel, {
    commandId: "lead-convert", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 3,
    document: { status: "Converted", converted_customer: "CUST-0001", converted_deal: "CRM-DEAL-1" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "lead-reopen-user", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 4,
    document: { status: "Qualified" },
  }), /Only a Sales Manager may reopen/);
  await mutate(kernel, {
    commandId: "lead-reopen-manager", actor: salesManager, doctype: "CRM Lead", name: "CRM-LEAD-1", action: "save", expectedVersion: 4,
    document: { status: "Qualified" },
  });
  const lead = await store.getDocument("demo", "CRM Lead", "CRM-LEAD-1");
  assert.equal(lead.status, "Qualified");
  assert.equal(lead.data.converted_customer, undefined);
  assert.equal(lead.data.converted_deal, undefined);
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.lead.converted"));
});

test("Deal stage controls probability, weighted forecast and terminal correction", async () => {
  const { kernel, store } = setup();
  await createLead(kernel);
  await createDeal(kernel);
  let deal = await store.getDocument("demo", "CRM Deal", "CRM-DEAL-1");
  assert.equal(deal.data.probability, "10");
  assert.equal(deal.data.weighted_value, "12500.050000");

  await assert.rejects(() => mutate(kernel, {
    commandId: "deal-wrong-pipeline", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 1,
    document: { pipeline: "Enterprise", sales_stage: PROPOSAL },
  }), /does not belong to CRM Pipeline Enterprise/);
  await assert.rejects(() => mutate(kernel, {
    commandId: "deal-lost-no-reason", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 1,
    document: { sales_stage: LOST },
  }), /requires a configured close reason/);
  await mutate(kernel, {
    commandId: "deal-lost", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 1,
    document: { sales_stage: LOST, close_reason: "Price" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "deal-reopen-user", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 2,
    document: { sales_stage: PROPOSAL },
  }), /Only a Sales Manager may reopen/);
  await mutate(kernel, {
    commandId: "deal-reopen-manager", actor: salesManager, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 2,
    document: { sales_stage: PROPOSAL },
  });
  await mutate(kernel, {
    commandId: "deal-won", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-1", action: "save", expectedVersion: 3,
    document: { sales_stage: WON, close_reason: "Best fit" },
  });
  deal = await store.getDocument("demo", "CRM Deal", "CRM-DEAL-1");
  assert.equal(deal.status, "Won");
  assert.equal(deal.data.probability, "100");
  assert.equal(deal.data.weighted_value, "125000.500000");
  assert.ok(store.snapshot().events.some((event) => event.event_type === "crm.deal.won"));
});

test("CRM Activity remains company-safe and terminal records require explicit manager correction", async () => {
  const { kernel, store } = setup();
  await createLead(kernel);
  await createDeal(kernel);
  await mutate(kernel, {
    commandId: "activity-create", actor: salesUser, doctype: "CRM Activity", name: "CRM-ACT-1", action: "create", expectedVersion: null,
    document: { company: "Demo", reference_doctype: "CRM Deal", reference_name: "CRM-DEAL-1", activity_type: "Meeting", subject: "Proposal review", status: "Open" },
  });
  await mutate(kernel, {
    commandId: "activity-complete", actor: salesUser, doctype: "CRM Activity", name: "CRM-ACT-1", action: "save", expectedVersion: 1,
    document: { status: "Completed", outcome: "Customer requested final quotation" },
  });
  await assert.rejects(() => mutate(kernel, {
    commandId: "activity-edit-terminal", actor: salesUser, doctype: "CRM Activity", name: "CRM-ACT-1", action: "save", expectedVersion: 2,
    document: { notes: "late edit" },
  }), /immutable/);
  await mutate(kernel, {
    commandId: "activity-reopen", actor: salesManager, doctype: "CRM Activity", name: "CRM-ACT-1", action: "save", expectedVersion: 2,
    document: { status: "Open" },
  });
  const activity = await store.getDocument("demo", "CRM Activity", "CRM-ACT-1");
  assert.equal(activity.status, "Open");
  assert.equal(activity.data.completed_at, undefined);
});
