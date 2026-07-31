import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate, orderDocument, seedStandardMasters } from "./helpers.mjs";

const now = () => "2026-08-01T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, now) };
}

async function invoice(kernel, name = "SI-FIN", amount = "100") {
  await createAndSubmit(kernel, { doctype: "Sales Order", name: `SO-${name}`, document: orderDocument("1", amount) });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice",
    name,
    document: {
      customer: "CUST-0001",
      company: "Demo",
      currency: "USD",
      currency_scale: 2,
      posting_at: now(),
      against_sales_order: `SO-${name}`,
      debit_to: "Debtors",
      default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: amount, income_account: "Sales" }],
      taxes: [],
    },
  });
}

test("Payment Entry permits partial allocation and keeps the remainder as an advance", async () => {
  const { store, kernel } = setup();
  await invoice(kernel);
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PE-ADVANCE",
    document: {
      company: "Demo",
      posting_at: now(),
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-0001",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "150",
      received_amount: "150",
      currency: "USD",
      currency_scale: 2,
      references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-FIN", allocated_amount: "40" }],
    },
  });

  const payment = await store.getDocument("demo", "Payment Entry", "PE-ADVANCE");
  assert.equal(payment.data.unallocated_amount, "110.00");
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FIN"), 6_000);
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-ADVANCE"), -11_000);
  const gl = store.snapshot().gl_entries.filter((row) => row.voucher_no === "PE-ADVANCE");
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor, 0), 15_000);
  assert.equal(gl.reduce((sum, row) => sum + row.credit_minor, 0), 15_000);
});

test("Payment Entry may be fully unallocated", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PE-UNALLOCATED",
    document: {
      company: "Demo",
      posting_at: now(),
      payment_type: "Receive",
      party_type: "Customer",
      party: "CUST-0001",
      paid_from: "Debtors",
      paid_to: "Bank",
      paid_amount: "25",
      received_amount: "25",
      currency: "USD",
      currency_scale: 2,
      references: [],
    },
  });
  const payment = await store.getDocument("demo", "Payment Entry", "PE-UNALLOCATED");
  assert.equal(payment.data.unallocated_amount, "25.00");
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-UNALLOCATED"), -2_500);
});

test("Payment Allocation consumes an advance and settles the target invoice without new GL", async () => {
  const { store, kernel } = setup();
  await invoice(kernel);
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PE-SOURCE",
    document: {
      company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD", currency_scale: 2,
      references: [],
    },
  });
  const glBefore = store.snapshot().gl_entries.length;
  await createAndSubmit(kernel, {
    doctype: "Payment Allocation",
    name: "PA-0001",
    document: {
      company: "Demo",
      party_type: "Customer",
      party: "CUST-0001",
      party_account: "Debtors",
      currency: "USD",
      posting_at: now(),
      source_payment_entry: "PE-SOURCE",
      references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-FIN", allocated_amount: "60" }],
    },
  });

  assert.equal(store.snapshot().gl_entries.length, glBefore, "allocation must not duplicate cash or party GL");
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-SOURCE"), -4_000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FIN"), 4_000);

  await mutate(kernel, {
    commandId: "cancel-pa-1",
    doctype: "Payment Allocation",
    name: "PA-0001",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Payment Entry", "PE-SOURCE"), -10_000);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FIN"), 10_000);
});

test("Payment Allocation rejects another party and source over-allocation", async () => {
  const { kernel } = setup();
  await invoice(kernel);
  await createAndSubmit(kernel, {
    doctype: "Payment Entry",
    name: "PE-LIMIT",
    document: {
      company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "30", received_amount: "30", currency: "USD", currency_scale: 2,
      references: [],
    },
  });
  const document = {
    company: "Demo", party_type: "Customer", party: "CUST-0001", party_account: "Debtors", currency: "USD",
    posting_at: now(), source_payment_entry: "PE-LIMIT",
    references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-FIN", allocated_amount: "31" }],
  };
  await mutate(kernel, {
    commandId: "pa-limit-create", doctype: "Payment Allocation", name: "PA-LIMIT", action: "create", expectedVersion: null, document,
  });
  await assert.rejects(
    mutate(kernel, {
      commandId: "pa-limit-submit", doctype: "Payment Allocation", name: "PA-LIMIT", action: "submit", expectedVersion: 1, document,
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /remaining source advance/.test(error.message),
  );
});
