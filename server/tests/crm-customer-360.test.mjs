import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { createAndSubmit, mutate, seedStandardMasters } from "./helpers.mjs";

const NOW = "2026-08-04T12:00:00.000Z";
const PIPELINE = "Customer 360 Pipeline";
const STAGE = `${PIPELINE}::Proposal`;
const CUSTOMER_360_DOCTYPES = ["CRM Customer 360", "CRM Customer 360 Currency", "CRM Customer 360 Activity"];

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  store.seedMaster("Currency", "EUR", "demo", { currency_name: "Euro" });
  store.seedMaster("CRM Pipeline", PIPELINE, "demo", { pipeline_name: PIPELINE, disabled: false });
  store.seedMaster("CRM Stage", STAGE, "demo", { stage_name: "Proposal", pipeline: PIPELINE, stage_type: "Open", probability: "50", disabled: false });
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, { assert() {} }, () => NOW);
  return { kernel, store };
}

async function seedCustomerLifecycle(kernel) {
  await mutate(kernel, {
    commandId: "c360-org-create",
    doctype: "CRM Organization",
    name: "CRM-ORG-C360",
    action: "create",
    expectedVersion: null,
    document: { company: "Demo", organization_name: "Customer 360 Co", linked_customer: "CUST-0001", status: "Active" },
  });
  await mutate(kernel, {
    commandId: "c360-contact-create",
    doctype: "CRM Contact",
    name: "CRM-CONTACT-C360",
    action: "create",
    expectedVersion: null,
    document: {
      company: "Demo",
      first_name: "Buyer",
      organization: "CRM-ORG-C360",
      email: "buyer360@example.com",
      linked_customer: "CUST-0001",
      consent_status: "Unknown",
      status: "Active",
    },
  });
  await mutate(kernel, {
    commandId: "c360-deal-create",
    doctype: "CRM Deal",
    name: "CRM-DEAL-C360",
    action: "create",
    expectedVersion: null,
    document: {
      company: "Demo",
      opportunity_name: "Customer 360 expansion",
      party_type: "Customer",
      party: "CUST-0001",
      pipeline: PIPELINE,
      sales_stage: STAGE,
      opportunity_amount: "200.00",
      currency: "USD",
      expected_close_date: "2026-09-01",
    },
  });
  await mutate(kernel, {
    commandId: "c360-deal-eur-create",
    doctype: "CRM Deal",
    name: "CRM-DEAL-C360-EUR",
    action: "create",
    expectedVersion: null,
    document: {
      company: "Demo",
      opportunity_name: "Customer 360 Europe expansion",
      party_type: "Customer",
      party: "CUST-0001",
      pipeline: PIPELINE,
      sales_stage: STAGE,
      opportunity_amount: "50.00",
      currency: "EUR",
      expected_close_date: "2026-10-01",
    },
  });
  await mutate(kernel, {
    commandId: "c360-activity-create",
    doctype: "CRM Activity",
    name: "CRM-ACT-C360",
    action: "create",
    expectedVersion: null,
    document: {
      company: "Demo",
      reference_doctype: "Customer",
      reference_name: "CUST-0001",
      activity_type: "Task",
      subject: "Follow up quotation",
      status: "Open",
      activity_at: "2026-08-03T08:00:00.000Z",
      due_at: "2026-08-04T10:00:00.000Z",
    },
  });

  const quotation = {
    customer: "CUST-0001",
    company: "Demo",
    currency: "USD",
    transaction_date: "2026-08-04",
    valid_till: "2026-09-04",
    items: [{ row_id: "QI-C360", item_code: "ITEM-001", qty: "4", rate: "25" }],
    taxes: [{ row_id: "QTAX-C360", account: "Output Tax", rate: "10" }],
  };
  await createAndSubmit(kernel, { doctype: "Quotation", name: "Q-C360", document: quotation });
  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-C360",
    document: {
      customer: "CUST-0001",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-08-04",
      against_quotation: "Q-C360",
      items: [{ row_id: "SOI-C360", quotation_item: "QI-C360", item_code: "ITEM-001", qty: "4", rate: "25" }],
      taxes: [{ row_id: "SOTAX-C360", account: "Output Tax", rate: "10" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note",
    name: "DN-C360",
    document: {
      customer: "CUST-0001",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      against_sales_order: "SO-C360",
      items: [{ row_id: "DNI-C360", item_code: "ITEM-001", qty: "4", rate: "25", warehouse: "Stores", valuation_rate: "15" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name: "SI-C360",
    document: {
      customer: "CUST-0001",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      against_sales_order: "SO-C360",
      debit_to: "Debtors",
      default_income_account: "Sales",
      tax_account: "Output Tax",
      items: [{ row_id: "SII-C360", item_code: "ITEM-001", qty: "4", rate: "25", income_account: "Sales" }],
      taxes: [{ row_id: "SITAX-C360", account: "Output Tax", rate: "10" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PAY-C360",
    document: {
      company: "Demo",
      posting_at: NOW,
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-0001",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "60",
      received_amount: "60",
      currency: "USD",
      references: [{ row_id: "REF-C360", reference_doctype: "Sales Invoice", reference_name: "SI-C360", allocated_amount: "60" }],
    },
  });
}

test("CRM source packages the Customer 360 metadata without adding reserved status fields", async () => {
  const source = await readAppSource(fileURLToPath(new URL("../apps-src/crm/", import.meta.url)));
  for (const name of CUSTOMER_360_DOCTYPES) {
    const doctype = source.doctypes.find((candidate) => candidate.name === name);
    assert.ok(doctype, `${name} must be packaged`);
    assert.equal(doctype.fields.some((field) => field.fieldname === "status"), false, `${name} must not add the reserved status field`);
  }
  assert.ok(source.externalDocTypes.some((entry) => entry.name === "Customer Group"), "Customer Group external ownership must be declared");
});

test("Customer 360 refreshes CRM timeline and exact O2C amounts without cross-currency collapse", async () => {
  const { kernel, store } = setup();
  await seedCustomerLifecycle(kernel);

  await mutate(kernel, {
    commandId: "c360-create",
    doctype: "CRM Customer 360",
    name: "C360-CUST-0001",
    action: "create",
    expectedVersion: null,
    document: { company: "Demo", customer: "CUST-0001" },
  });

  let snapshot = await store.getDocument("demo", "CRM Customer 360", "C360-CUST-0001");
  assert.equal(snapshot.status, "Current");
  assert.equal(snapshot.data.organization_count, 1);
  assert.equal(snapshot.data.contact_count, 1);
  assert.equal(snapshot.data.open_deal_count, 2);
  assert.equal(snapshot.data.open_activity_count, 1);
  assert.equal(snapshot.data.overdue_activity_count, 1);
  assert.equal(snapshot.data.quotation_count, 1);
  assert.equal(snapshot.data.sales_order_count, 1);
  assert.equal(snapshot.data.delivery_count, 1);
  assert.equal(snapshot.data.sales_invoice_count, 1);
  assert.equal(snapshot.data.payment_count, 1);
  assert.equal(snapshot.data.recent_activities[0].activity, "CRM-ACT-C360");

  const usd = snapshot.data.currency_summary.find((row) => row.currency === "USD");
  const eur = snapshot.data.currency_summary.find((row) => row.currency === "EUR");
  assert.ok(usd);
  assert.ok(eur);
  assert.equal(snapshot.data.currency_summary.length, 2, "currencies must remain separate buckets");
  assert.equal(usd.pipeline_amount, "200.000000");
  assert.equal(usd.weighted_pipeline_amount, "100.000000");
  assert.equal(usd.quoted_amount, "110.000000");
  assert.equal(usd.ordered_amount, "110.000000");
  assert.equal(usd.invoiced_amount, "110.000000");
  assert.equal(usd.outstanding_amount, "50.000000");
  assert.equal(usd.received_amount, "60.000000");
  assert.equal(eur.pipeline_amount, "50.000000");
  assert.equal(eur.weighted_pipeline_amount, "25.000000");
  assert.equal(eur.quoted_amount, "0.000000");
  assert.equal(eur.ordered_amount, "0.000000");
  assert.equal(eur.invoiced_amount, "0.000000");
  assert.equal(eur.outstanding_amount, "0.000000");
  assert.equal(eur.received_amount, "0.000000");

  await mutate(kernel, {
    commandId: "c360-activity-complete",
    doctype: "CRM Activity",
    name: "CRM-ACT-C360",
    action: "save",
    expectedVersion: 1,
    document: { status: "Completed", outcome: "Quotation accepted" },
  });
  await mutate(kernel, {
    commandId: "c360-refresh",
    doctype: "CRM Customer 360",
    name: "C360-CUST-0001",
    action: "save",
    expectedVersion: 1,
    document: {},
  });
  snapshot = await store.getDocument("demo", "CRM Customer 360", "C360-CUST-0001");
  assert.equal(snapshot.data.open_activity_count, 0);
  assert.equal(snapshot.data.overdue_activity_count, 0);
  assert.equal(snapshot.data.recent_activities[0].status, "Completed");

  const event = store.snapshot().events.find((candidate) => candidate.event_type === "crm.customer_360.refreshed");
  assert.ok(event);
  assert.equal(Object.hasOwn(event.payload, "subject"), false);
  assert.equal(Object.hasOwn(event.payload, "email"), false);
});

test("Customer 360 enforces one immutable company/customer snapshot and stays draft-only", async () => {
  const { kernel } = setup();
  await mutate(kernel, {
    commandId: "c360-guard-create",
    doctype: "CRM Customer 360",
    name: "C360-GUARD",
    action: "create",
    expectedVersion: null,
    document: { company: "Demo", customer: "CUST-0001" },
  });

  await assert.rejects(() => mutate(kernel, {
    commandId: "c360-duplicate",
    doctype: "CRM Customer 360",
    name: "C360-GUARD-2",
    action: "create",
    expectedVersion: null,
    document: { company: "Demo", customer: "CUST-0001" },
  }), /already exists/);

  await assert.rejects(() => mutate(kernel, {
    commandId: "c360-change-customer",
    doctype: "CRM Customer 360",
    name: "C360-GUARD",
    action: "save",
    expectedVersion: 1,
    document: { customer: "OTHER" },
  }), /customer cannot change/);

  await assert.rejects(() => mutate(kernel, {
    commandId: "c360-submit",
    doctype: "CRM Customer 360",
    name: "C360-GUARD",
    action: "submit",
    expectedVersion: 1,
    document: {},
  }), /cannot be submitted or cancelled/);
});
