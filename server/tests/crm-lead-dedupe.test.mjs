import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function createLead(kernel, name, document) {
  return mutate(kernel, { commandId: `${name}-create`, actor: salesUser, doctype: "CRM Lead", name, action: "create", expectedVersion: null, document });
}

test("CRM Lead exact email and phone duplicates are rejected inside one company", async () => {
  const { kernel } = setup();
  await createLead(kernel, "CRM-LEAD-D1", { company: "Demo", lead_name: "First", email_id: "Buyer@Example.com", mobile_no: "+84 912 345 678", status: "New" });
  await assert.rejects(() => createLead(kernel, "CRM-LEAD-D2", { company: "Demo", lead_name: "Email duplicate", email_id: " buyer@example.com ", status: "New" }), /Possible duplicate CRM Lead CRM-LEAD-D1/);
  await assert.rejects(() => createLead(kernel, "CRM-LEAD-D3", { company: "Demo", lead_name: "Phone duplicate", mobile_no: "+84-912-345-678", status: "New" }), /Possible duplicate CRM Lead CRM-LEAD-D1/);
});

test("editing the same CRM Lead does not self-trigger duplicate detection", async () => {
  const { kernel, store } = setup();
  await createLead(kernel, "CRM-LEAD-D1", { company: "Demo", lead_name: "First", email_id: "buyer@example.com", status: "New" });
  await mutate(kernel, { commandId: "lead-open", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-D1", action: "save", expectedVersion: 1, document: { status: "Open", notes: "Reached by phone" } });
  const lead = await store.getDocument("demo", "CRM Lead", "CRM-LEAD-D1");
  assert.equal(lead.status, "Open");
});
