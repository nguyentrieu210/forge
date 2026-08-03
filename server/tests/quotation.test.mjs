import assert from "node:assert/strict";
import test from "node:test";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-03T12:00:00.000Z";
const salesUser = { user_id: "sales@example.com", roles: ["Sales User"] };
const salesManager = { user_id: "manager@example.com", roles: ["Sales Manager"] };
const PIPELINE = "Default Sales Pipeline";
const PROSPECTING = `${PIPELINE}::Prospecting`;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({ company: "Demo", customer: "CUST-0001", currency: "USD", items: [] });
  store.seedMaster("Item", "ITEM-1", "demo", { item_code: "ITEM-1", stock_uom: "Nos", default_sales_uom: "Nos" });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Stage", PROSPECTING, "demo", { stage_name: "Prospecting", pipeline: PIPELINE, stage_type: "Open", probability: "10", disabled: false });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function createCustomerDeal(kernel, name = "CRM-DEAL-Q1") {
  return mutate(kernel, {
    commandId: `${name}-create`, actor: salesUser, doctype: "CRM Deal", name, action: "create", expectedVersion: null,
    document: {
      company: "Demo", opportunity_name: "Quotation deal", party_type: "Customer", party: "CUST-0001",
      pipeline: PIPELINE, sales_stage: PROSPECTING, opportunity_amount: "200", currency: "USD", expected_close_date: "2026-08-31",
    },
  });
}

function quotationDocument(overrides = {}) {
  return {
    crm_deal: "CRM-DEAL-Q1", company: "Demo", currency: "USD", transaction_date: "2026-08-03", valid_till: "2026-08-31",
    items: [{ item_code: "ITEM-1", qty: "2", rate: "100" }], taxes: [], ...overrides,
  };
}

test("Quotation derives Customer from CRM Deal and reuses O2C totals", async () => {
  const { kernel, store } = setup();
  await createCustomerDeal(kernel);
  await mutate(kernel, { commandId: "quote-create", actor: salesUser, doctype: "Quotation", name: "QTN-1", action: "create", expectedVersion: null, document: quotationDocument() });
  const quote = await store.getDocument("demo", "Quotation", "QTN-1");
  assert.equal(quote.data.customer, "CUST-0001");
  assert.equal(quote.data.revision_no, 1);
  assert.equal(quote.data.net_total, "200.00");
  assert.equal(quote.data.grand_total, "200.00");
  assert.equal(quote.data.items[0].row_id, "ROW-1");
  assert.equal(quote.children[0].child_doctype, "Quotation Item");
  assert.ok(store.snapshot().events.some((event) => event.event_type === "quotation.created"));
});

test("Quotation customer must match CRM Deal and validity cannot run backwards", async () => {
  const { kernel } = setup();
  await createCustomerDeal(kernel);
  await assert.rejects(() => mutate(kernel, {
    commandId: "quote-wrong-customer", actor: salesUser, doctype: "Quotation", name: "QTN-X", action: "create", expectedVersion: null,
    document: quotationDocument({ customer: "OTHER" }),
  }), /does not match CRM Deal customer/);
  await assert.rejects(() => mutate(kernel, {
    commandId: "quote-bad-validity", actor: salesUser, doctype: "Quotation", name: "QTN-Y", action: "create", expectedVersion: null,
    document: quotationDocument({ valid_till: "2026-08-01" }),
  }), /valid_till cannot precede transaction_date/);
});

test("Quotation business revision uses the canonical amended_from chain", async () => {
  const { kernel, store } = setup();
  await createCustomerDeal(kernel);
  await mutate(kernel, { commandId: "quote-create", actor: salesUser, doctype: "Quotation", name: "QTN-1", action: "create", expectedVersion: null, document: quotationDocument() });
  let quote = await store.getDocument("demo", "Quotation", "QTN-1");
  await mutate(kernel, { commandId: "quote-submit", actor: salesUser, doctype: "Quotation", name: "QTN-1", action: "submit", expectedVersion: 1, document: quote.data });

  await assert.rejects(() => mutate(kernel, {
    commandId: "quote-revision-too-early", actor: salesUser, doctype: "Quotation", name: "QTN-2", action: "create", expectedVersion: null,
    amendedFrom: "QTN-1", document: quotationDocument({ valid_till: "2026-09-15" }),
  }), /amend only a cancelled Quotation/);

  await mutate(kernel, { commandId: "quote-cancel", actor: salesManager, doctype: "Quotation", name: "QTN-1", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, {
    commandId: "quote-revision", actor: salesUser, doctype: "Quotation", name: "QTN-2", action: "create", expectedVersion: null,
    amendedFrom: "QTN-1", document: quotationDocument({ valid_till: "2026-09-15" }),
  });
  quote = await store.getDocument("demo", "Quotation", "QTN-2");
  assert.equal(quote.data.revision_no, 2);
  assert.equal(quote.amended_from, "QTN-1");
  assert.equal(quote.status, "Draft");
});

test("Quotation resolves converted Customer from a CRM Lead-backed Deal", async () => {
  const { kernel, store } = setup();
  await mutate(kernel, { commandId: "lead-create", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-Q", action: "create", expectedVersion: null, document: { company: "Demo", lead_name: "Lead for quote", status: "New" } });
  await mutate(kernel, { commandId: "lead-open", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-Q", action: "save", expectedVersion: 1, document: { status: "Open" } });
  await mutate(kernel, { commandId: "lead-qualify", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-Q", action: "save", expectedVersion: 2, document: { status: "Qualified" } });
  await mutate(kernel, {
    commandId: "deal-create", actor: salesUser, doctype: "CRM Deal", name: "CRM-DEAL-QLEAD", action: "create", expectedVersion: null,
    document: { company: "Demo", opportunity_name: "Lead-backed deal", party_type: "CRM Lead", party: "CRM-LEAD-Q", pipeline: PIPELINE, sales_stage: PROSPECTING, opportunity_amount: "100", currency: "USD", expected_close_date: "2026-08-31" },
  });
  await mutate(kernel, {
    commandId: "lead-convert", actor: salesUser, doctype: "CRM Lead", name: "CRM-LEAD-Q", action: "save", expectedVersion: 3,
    document: { status: "Converted", converted_customer: "CUST-0001", converted_deal: "CRM-DEAL-QLEAD" },
  });
  await mutate(kernel, {
    commandId: "quote-lead-deal", actor: salesUser, doctype: "Quotation", name: "QTN-LEAD", action: "create", expectedVersion: null,
    document: quotationDocument({ crm_deal: "CRM-DEAL-QLEAD", items: [{ item_code: "ITEM-1", qty: "1", rate: "100" }] }),
  });
  const quote = await store.getDocument("demo", "Quotation", "QTN-LEAD");
  assert.equal(quote.data.customer, "CUST-0001");
});
