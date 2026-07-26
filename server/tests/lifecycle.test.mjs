import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate, orderDocument, seedStandardMasters } from "./helpers.mjs";

const now = () => "2026-07-23T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, now) };
}

test("cancel draft is rejected before any reversal ledger is created", async () => {
  const { store, kernel } = setup();
  const invoice = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [] };
  await mutate(kernel, { commandId: "si-create", doctype: "Sales Invoice", name: "SI-DRAFT", action: "create", expectedVersion: null, document: invoice });
  await assert.rejects(mutate(kernel, { commandId: "si-cancel", doctype: "Sales Invoice", name: "SI-DRAFT", action: "cancel", expectedVersion: 1, document: invoice }), (error) => error.code === "INVALID_LIFECYCLE_TRANSITION");
  assert.equal(store.snapshot().gl_entries.length, 0);
  assert.equal((await store.getDocument("demo", "Sales Invoice", "SI-DRAFT")).docstatus, 0);
});

test("submitted documents cannot be saved or submitted twice and cancelled documents cannot be cancelled twice", async () => {
  const { kernel } = setup();
  const doc = orderDocument();
  await mutate(kernel, { commandId: "create", doctype: "Sales Order", name: "SO-LIFE", action: "create", expectedVersion: null, document: doc });
  await mutate(kernel, { commandId: "submit", doctype: "Sales Order", name: "SO-LIFE", action: "submit", expectedVersion: 1, document: doc });
  await assert.rejects(mutate(kernel, { commandId: "save-after", doctype: "Sales Order", name: "SO-LIFE", action: "save", expectedVersion: 2, document: doc }), (error) => error.code === "INVALID_LIFECYCLE_TRANSITION");
  await assert.rejects(mutate(kernel, { commandId: "submit-again", doctype: "Sales Order", name: "SO-LIFE", action: "submit", expectedVersion: 2, document: doc }), (error) => error.code === "INVALID_LIFECYCLE_TRANSITION");
  await mutate(kernel, { commandId: "cancel", doctype: "Sales Order", name: "SO-LIFE", action: "cancel", expectedVersion: 2, document: { hacked: true } });
  await assert.rejects(mutate(kernel, { commandId: "cancel-again", doctype: "Sales Order", name: "SO-LIFE", action: "cancel", expectedVersion: 3, document: doc }), (error) => error.code === "INVALID_LIFECYCLE_TRANSITION");
});

test("missing cross-document reference and locked posting period are rejected", async () => {
  const { store, kernel } = setup();
  const delivery = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-MISSING", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "25", warehouse: "Stores", valuation_rate: "15" }] };
  await mutate(kernel, { commandId: "dn-create", doctype: "Delivery Note", name: "DN-MISSING", action: "create", expectedVersion: null, document: delivery });
  await assert.rejects(mutate(kernel, { commandId: "dn-submit", doctype: "Delivery Note", name: "DN-MISSING", action: "submit", expectedVersion: 1, document: delivery }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  store.setPeriodLock("Demo", "2026-07-31");
  const actor = { user_id: "accounts@example.com", roles: ["Accounts Manager"] };
  const invoice = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [] };
  await mutate(kernel, { commandId: "lock-create", actor, doctype: "Sales Invoice", name: "SI-LOCK", action: "create", expectedVersion: null, document: invoice });
  await assert.rejects(mutate(kernel, { commandId: "lock-submit", actor, doctype: "Sales Invoice", name: "SI-LOCK", action: "submit", expectedVersion: 1, document: invoice }), (error) => error.code === "VALIDATION_ERROR" && /locked/.test(error.message));
});
