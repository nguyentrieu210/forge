import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore, deriveO2CStatus } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate, orderDocument, seedStandardMasters } from "./helpers.mjs";

const now = () => "2026-07-23T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, now) };
}

test("Order-to-Cash posts exact minor-unit GL, stock and receivable allocation", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-0001", document: orderDocument() });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note", name: "DN-0001",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: now(), against_sales_order: "SO-0001",
      items: [{ row_id: "DNI-1", item_code: "ITEM-001", qty: "4", rate: "25", warehouse: "Stores", valuation_rate: "15" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SINV-0001",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: now(), against_sales_order: "SO-0001",
      debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax",
      items: [{ row_id: "SII-1", item_code: "ITEM-001", qty: "4", rate: "25", income_account: "Sales" }],
      taxes: [{ row_id: "TAX-1", account: "Output Tax", rate: "10" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Payment Entry", name: "PAY-0001",
    document: {
      company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "110", received_amount: "110", currency: "USD", currency_scale: 2,
      references: [{ row_id: "REF-1", reference_doctype: "Sales Invoice", reference_name: "SINV-0001", allocated_amount: "110" }],
    },
  });

  const snapshot = store.snapshot();
  assert.equal(snapshot.stock_entries.at(-1).actual_qty_micros, -4_000_000);
  const debit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.debit_minor), 0n);
  const credit = snapshot.gl_entries.reduce((sum, line) => sum + BigInt(line.credit_minor), 0n);
  assert.equal(debit, credit);
  const receivable = snapshot.payment_entries
    .filter((line) => line.against_voucher_no === "SINV-0001")
    .reduce((sum, line) => sum + line.amount_minor, 0);
  assert.equal(receivable, 0);
  const invoice = await store.getDocument("demo", "Sales Invoice", "SINV-0001");
  assert.equal(invoice.data.outstanding_amount, "0.00");
  const order = await store.getDocument("demo", "Sales Order", "SO-0001");
  assert.equal(order.data.delivered_percentage, "40.00");
  assert.equal(order.data.billed_percentage, "40.00");
});

test("Delivery Note inherits inventory and COGS accounts from the nearest Item Group", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Account", "Stock - Aluminium");
  store.seedMaster("Account", "COGS - Materials");
  store.seedMaster("Item Group", "Materials", "demo", {
    parent_item_group: "All Items",
    default_inventory_account: "Stock - Aluminium",
    default_cogs_account: "COGS - Materials",
  });
  store.seedMaster("Item Group", "Aluminium", "demo", { parent_item_group: "Materials" });
  store.seedMaster("Item", "ITEM-001", "demo", { item_group: "Aluminium" });

  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-GROUP-ACCOUNT", document: orderDocument("1") });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note",
    name: "DN-GROUP-ACCOUNT",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: now(), against_sales_order: "SO-GROUP-ACCOUNT",
      items: [{ row_id: "DNI-1", item_code: "ITEM-001", qty: "1", rate: "25", warehouse: "Stores", valuation_rate: "15" }],
    },
  });

  const deliveryGl = store.snapshot().gl_entries.filter((line) => ["COGS-DNI-1", "STOCK-DNI-1"].includes(line.line_key));
  assert.deepEqual(deliveryGl.map((line) => line.account), ["COGS - Materials", "Stock - Aluminium"]);
});

test("cumulative delivery and billing cannot exceed submitted Sales Order quantity", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-QTY", document: orderDocument("10") });
  await createAndSubmit(kernel, {
    doctype: "Delivery Note", name: "DN-6",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", items: [{ row_id: "1", item_code: "ITEM-001", qty: "6", rate: "25", warehouse: "Stores", valuation_rate: "15" }] },
  });
  await mutate(kernel, {
    commandId: "dn-over-create", doctype: "Delivery Note", name: "DN-OVER", action: "create", expectedVersion: null,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", items: [{ row_id: "1", item_code: "ITEM-001", qty: "5", rate: "25", warehouse: "Stores", valuation_rate: "15" }] },
  });
  await assert.rejects(mutate(kernel, {
    commandId: "dn-over-submit", doctype: "Delivery Note", name: "DN-OVER", action: "submit", expectedVersion: 1,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", items: [{ row_id: "1", item_code: "ITEM-001", qty: "5", rate: "25", warehouse: "Stores", valuation_rate: "15" }] },
  }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-7",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "7", rate: "25" }], taxes: [] },
  });
  await mutate(kernel, {
    commandId: "si-over-create", doctype: "Sales Invoice", name: "SI-OVER", action: "create", expectedVersion: null,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25" }], taxes: [] },
  });
  await assert.rejects(mutate(kernel, {
    commandId: "si-over-submit", doctype: "Sales Invoice", name: "SI-OVER", action: "submit", expectedVersion: 1,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-QTY", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25" }], taxes: [] },
  }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("payment allocation cannot exceed live outstanding", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-PAY", document: orderDocument("1", "100") });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-PAY",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-PAY", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [] },
  });
  await mutate(kernel, {
    commandId: "pe-over-create", doctype: "Payment Entry", name: "PE-OVER", action: "create", expectedVersion: null,
    document: { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001", paid_from: "Debtors", paid_to: "Bank", paid_amount: "101", received_amount: "101", currency: "USD", references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-PAY", allocated_amount: "101" }] },
  });
  await assert.rejects(mutate(kernel, {
    commandId: "pe-over-submit", doctype: "Payment Entry", name: "PE-OVER", action: "submit", expectedVersion: 1,
    document: { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001", paid_from: "Debtors", paid_to: "Bank", paid_amount: "101", received_amount: "101", currency: "USD", references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-PAY", allocated_amount: "101" }] },
  }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("cross-aggregate delivery race is rejected atomically at commit", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-DN-RACE", document: orderDocument("10") });
  const delivery = (name) => ({
    customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-DN-RACE",
    items: [{ row_id: `${name}-1`, item_code: "ITEM-001", qty: "6", rate: "25", warehouse: "Stores", valuation_rate: "15" }],
  });
  await Promise.all([
    mutate(kernel, { commandId: "dn-race-a-create", doctype: "Delivery Note", name: "DN-RACE-A", action: "create", expectedVersion: null, document: delivery("A") }),
    mutate(kernel, { commandId: "dn-race-b-create", doctype: "Delivery Note", name: "DN-RACE-B", action: "create", expectedVersion: null, document: delivery("B") }),
  ]);
  const results = await Promise.allSettled([
    mutate(kernel, { commandId: "dn-race-a-submit", doctype: "Delivery Note", name: "DN-RACE-A", action: "submit", expectedVersion: 1, document: delivery("A") }),
    mutate(kernel, { commandId: "dn-race-b-submit", doctype: "Delivery Note", name: "DN-RACE-B", action: "submit", expectedVersion: 1, document: delivery("B") }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "REFERENCE_VALIDATION_FAILED").length, 1);
  assert.equal(await store.getFulfilledQuantityMicros("demo", "SO-DN-RACE", "Delivery", "ITEM-001"), 6_000_000);
});

test("cross-aggregate payment race cannot make receivable outstanding negative", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-PE-RACE", document: orderDocument("1", "100") });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-PE-RACE",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-PE-RACE", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [] },
  });
  const payment = (rowId) => ({
    company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
    paid_from: "Debtors", paid_to: "Bank", paid_amount: "60", received_amount: "60", currency: "USD",
    references: [{ row_id: rowId, reference_doctype: "Sales Invoice", reference_name: "SI-PE-RACE", allocated_amount: "60" }],
  });
  await Promise.all([
    mutate(kernel, { commandId: "pe-race-a-create", doctype: "Payment Entry", name: "PE-RACE-A", action: "create", expectedVersion: null, document: payment("A") }),
    mutate(kernel, { commandId: "pe-race-b-create", doctype: "Payment Entry", name: "PE-RACE-B", action: "create", expectedVersion: null, document: payment("B") }),
  ]);
  const results = await Promise.allSettled([
    mutate(kernel, { commandId: "pe-race-a-submit", doctype: "Payment Entry", name: "PE-RACE-A", action: "submit", expectedVersion: 1, document: payment("A") }),
    mutate(kernel, { commandId: "pe-race-b-submit", doctype: "Payment Entry", name: "PE-RACE-B", action: "submit", expectedVersion: 1, document: payment("B") }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "REFERENCE_VALIDATION_FAILED").length, 1);
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-PE-RACE"), 4_000);
});

test("active fulfillment and payment allocations block source cancellation until reversed", async () => {
  const { store, kernel } = setup();
  const order = orderDocument("1", "100");
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-CANCEL-GUARD", document: order });
  const delivery = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-CANCEL-GUARD", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100", warehouse: "Stores", valuation_rate: "15" }] };
  await createAndSubmit(kernel, { doctype: "Delivery Note", name: "DN-CANCEL-GUARD", document: delivery });
  await assert.rejects(mutate(kernel, { commandId: "so-cancel-blocked", doctype: "Sales Order", name: "SO-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: order }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await mutate(kernel, { commandId: "dn-cancel", doctype: "Delivery Note", name: "DN-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: {} });

  const invoice = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-CANCEL-GUARD", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax", items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [] };
  await createAndSubmit(kernel, { doctype: "Sales Invoice", name: "SI-CANCEL-GUARD", document: invoice });
  const payment = { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001", paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD", references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-CANCEL-GUARD", allocated_amount: "100" }] };
  await createAndSubmit(kernel, { doctype: "Payment Entry", name: "PE-CANCEL-GUARD", document: payment });
  await assert.rejects(mutate(kernel, { commandId: "si-cancel-blocked", doctype: "Sales Invoice", name: "SI-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: {} }), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  await mutate(kernel, { commandId: "pe-cancel", doctype: "Payment Entry", name: "PE-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "si-cancel", doctype: "Sales Invoice", name: "SI-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-CANCEL-GUARD"), 0);
  assert.equal(await store.getFulfilledQuantityMicros("demo", "SO-CANCEL-GUARD", "Billing", "ITEM-001"), 0);
  await mutate(kernel, { commandId: "so-cancel", doctype: "Sales Order", name: "SO-CANCEL-GUARD", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal((await store.getDocument("demo", "Sales Order", "SO-CANCEL-GUARD")).docstatus, 2);
});

test("cross-aggregate stock race cannot overdraw a warehouse", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-STOCK-A", document: orderDocument("60", "1") });
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-STOCK-B", document: orderDocument("60", "1") });
  const delivery = (salesOrder, rowId) => ({
    customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: salesOrder,
    items: [{ row_id: rowId, item_code: "ITEM-001", qty: "60", rate: "1", warehouse: "Stores", valuation_rate: "1" }],
  });
  await Promise.all([
    mutate(kernel, { commandId: "stock-a-create", doctype: "Delivery Note", name: "DN-STOCK-A", action: "create", expectedVersion: null, document: delivery("SO-STOCK-A", "A") }),
    mutate(kernel, { commandId: "stock-b-create", doctype: "Delivery Note", name: "DN-STOCK-B", action: "create", expectedVersion: null, document: delivery("SO-STOCK-B", "B") }),
  ]);
  const results = await Promise.allSettled([
    mutate(kernel, { commandId: "stock-a-submit", doctype: "Delivery Note", name: "DN-STOCK-A", action: "submit", expectedVersion: 1, document: delivery("SO-STOCK-A", "A") }),
    mutate(kernel, { commandId: "stock-b-submit", doctype: "Delivery Note", name: "DN-STOCK-B", action: "submit", expectedVersion: 1, document: delivery("SO-STOCK-B", "B") }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason.code === "REFERENCE_VALIDATION_FAILED").length, 1);
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-001", "Stores"), 40_000_000);
});

test("deriveO2CStatus maps docstatus + metrics to the ERPNext status label", () => {
  // draft / cancelled ignore metrics
  assert.equal(deriveO2CStatus("Sales Order", 0, { deliveredPercentage: 100, billedPercentage: 100 }), "Draft");
  assert.equal(deriveO2CStatus("Sales Invoice", 2, { outstandingMinor: 0, grandTotalMinor: 100 }), "Cancelled");
  // Sales Order matrix
  assert.equal(deriveO2CStatus("Sales Order", 1, { deliveredPercentage: 0, billedPercentage: 0 }), "To Deliver and Bill");
  assert.equal(deriveO2CStatus("Sales Order", 1, { deliveredPercentage: 100, billedPercentage: 0 }), "To Bill");
  assert.equal(deriveO2CStatus("Sales Order", 1, { deliveredPercentage: 50, billedPercentage: 100 }), "To Deliver");
  assert.equal(deriveO2CStatus("Sales Order", 1, { deliveredPercentage: 100, billedPercentage: 100 }), "Completed");
  // Delivery Note is always To Bill when submitted (CloudForge bills the Sales Order)
  assert.equal(deriveO2CStatus("Delivery Note", 1), "To Bill");
  // Sales Invoice by outstanding
  assert.equal(deriveO2CStatus("Sales Invoice", 1, { outstandingMinor: 27500, grandTotalMinor: 27500 }), "Unpaid");
  assert.equal(deriveO2CStatus("Sales Invoice", 1, { outstandingMinor: 17500, grandTotalMinor: 27500 }), "Partly Paid");
  assert.equal(deriveO2CStatus("Sales Invoice", 1, { outstandingMinor: 0, grandTotalMinor: 27500 }), "Paid");
  // Payment Entry / unknown -> Submitted
  assert.equal(deriveO2CStatus("Payment Entry", 1), "Submitted");
});

test("O2C workflow status labels are re-derived server-side to match the ERPNext oracle", async () => {
  // Gate 2E oracle-backed (docs/spec/source-exact/oracle/runtime/o2c-matrix-capture.json):
  // status must reflect actual fulfilment/billing/payment state on every read, not
  // freeze at submit. Fixtures: O2C-E-STATUS-RECALC-049, O2C-C-OUTSTANDING-031,
  // O2C-D-RECEIVE-PARTIAL-035, O2C-B-SUBMIT-018, O2C-E-SO-DN-SI-PE-HAPPY-043.
  const { store, kernel } = setup();
  const so = async () => store.getDocument("demo", "Sales Order", "SO-ST");
  const si = async () => store.getDocument("demo", "Sales Invoice", "SI-ST");

  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-ST", document: orderDocument("10") });
  assert.equal((await so()).status, "To Deliver and Bill"); // nothing delivered or billed yet

  // partial delivery (5 of 10)
  await createAndSubmit(kernel, {
    doctype: "Delivery Note", name: "DN-ST",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-ST",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "5", rate: "25", warehouse: "Stores", valuation_rate: "15" }] },
  });
  assert.equal((await store.getDocument("demo", "Delivery Note", "DN-ST")).status, "To Bill"); // O2C-B-SUBMIT-018
  assert.equal((await so()).data.delivered_percentage, "50.00");
  assert.equal((await so()).status, "To Deliver and Bill"); // billed still 0

  // full billing (10 of 10) -> SO fully billed but only 50% delivered
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-ST",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2, posting_at: now(),
      against_sales_order: "SO-ST", debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "10", rate: "25", income_account: "Sales" }],
      taxes: [{ row_id: "T1", account: "Output Tax", rate: "10" }] },
  });
  assert.equal((await so()).data.billed_percentage, "100.00");
  assert.equal((await so()).status, "To Deliver");   // O2C-E-STATUS-RECALC-049 (delivered<100, billed==100)
  assert.equal((await si()).status, "Unpaid");        // O2C-C-OUTSTANDING-031 (outstanding == grand 275)

  // partial payment (100 of 275) -> Partly Paid
  await createAndSubmit(kernel, {
    doctype: "Payment Entry", name: "PAY-ST-1",
    document: { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD", currency_scale: 2,
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-ST", allocated_amount: "100" }] },
  });
  assert.equal((await si()).data.outstanding_amount, "175.00");
  assert.equal((await si()).status, "Partly Paid");   // O2C-D-RECEIVE-PARTIAL-035

  // settle the remaining 175 -> Paid
  await createAndSubmit(kernel, {
    doctype: "Payment Entry", name: "PAY-ST-2",
    document: { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "175", received_amount: "175", currency: "USD", currency_scale: 2,
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-ST", allocated_amount: "175" }] },
  });
  assert.equal((await si()).status, "Paid");

  // deliver the remaining 5 -> SO fully delivered AND fully billed -> Completed
  await createAndSubmit(kernel, {
    doctype: "Delivery Note", name: "DN-ST-2",
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-ST",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "5", rate: "25", warehouse: "Stores", valuation_rate: "15" }] },
  });
  assert.equal((await so()).data.delivered_percentage, "100.00");
  assert.equal((await so()).status, "Completed");     // O2C-E-SO-DN-SI-PE-HAPPY-043
});

test("master-data existence is validated at submit, not create (intentional defer-to-submit)", async () => {
  // Gate 2E differential O2C-A-INVALID-ITEM-006 (INTENTIONAL_ARCHITECTURE_DIFFERENCE):
  // create/save presence-checks only; master existence (item/customer/...) is validated
  // at submit — the posting gate. A draft MAY reference a not-yet-created item; submit
  // rejects it and nothing posts. (ERPNext instead validates Link fields at insert.)
  // This characterization test LOCKS the intended behavior against silent regression.
  const { store, kernel } = setup();
  const doc = { ...orderDocument("5"), items: [{ row_id: "SOI-1", item_code: "ITEM-NOPE", qty: "5", rate: "25" }] };
  // create: accepted and persisted as a draft
  await mutate(kernel, { commandId: "so-nope-create", doctype: "Sales Order", name: "SO-NOPE", action: "create", expectedVersion: null, document: doc });
  const draft = await store.getDocument("demo", "Sales Order", "SO-NOPE");
  assert.equal(draft.docstatus, 0);
  assert.equal(draft.status, "Draft");
  // submit: rejected on the non-existent item; still a draft, nothing posts
  await assert.rejects(
    mutate(kernel, { commandId: "so-nope-submit", doctype: "Sales Order", name: "SO-NOPE", action: "submit", expectedVersion: 1, document: doc }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED");
  assert.equal((await store.getDocument("demo", "Sales Order", "SO-NOPE")).docstatus, 0);
  assert.equal(store.snapshot().gl_entries.length, 0); // the rejected submit posted nothing
});

test("create and save never post to any ledger — side-effects are exclusive to submit/cancel", async () => {
  // Posting-gate invariant (half 1 of 2): the ONLY path that writes gl/stock/payment/
  // fulfillment entries is kernel.execute -> buildPlan -> store.execute, and ledger()
  // emits entries only when action is 'submit' (post) or 'cancel' (reverse). No
  // 'create'/'save' — on ANY of the four O2C controllers — may produce a side-effect,
  // even with fully valid master data. This pins "nothing posts before the submit gate"
  // so a future controller that eagerly posted at draft time would fail loudly.
  const { store, kernel } = setup();

  await mutate(kernel, { commandId: "so-nopost-create", doctype: "Sales Order", name: "SO-NOPOST", action: "create", expectedVersion: null, document: orderDocument("10") });
  // a draft edit (save) keeps docstatus 0 and must still post nothing
  await mutate(kernel, { commandId: "so-nopost-save", doctype: "Sales Order", name: "SO-NOPOST", action: "save", expectedVersion: 1, document: orderDocument("12") });
  await mutate(kernel, { commandId: "dn-nopost-create", doctype: "Delivery Note", name: "DN-NOPOST", action: "create", expectedVersion: null,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-NOPOST",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25", warehouse: "Stores", valuation_rate: "15" }] } });
  await mutate(kernel, { commandId: "si-nopost-create", doctype: "Sales Invoice", name: "SI-NOPOST", action: "create", expectedVersion: null,
    document: { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-NOPOST",
      debit_to: "Debtors", default_income_account: "Sales", tax_account: "Output Tax",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25" }], taxes: [] } });
  await mutate(kernel, { commandId: "pe-nopost-create", doctype: "Payment Entry", name: "PE-NOPOST", action: "create", expectedVersion: null,
    document: { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD",
      references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-NOPOST", allocated_amount: "100" }] } });

  // every draft persisted as docstatus 0...
  for (const [doctype, name] of [["Sales Order", "SO-NOPOST"], ["Delivery Note", "DN-NOPOST"], ["Sales Invoice", "SI-NOPOST"], ["Payment Entry", "PE-NOPOST"]]) {
    assert.equal((await store.getDocument("demo", doctype, name)).docstatus, 0);
  }
  // ...and NOTHING posted to any ledger (stock holds only the seeded opening balances).
  const snap = store.snapshot();
  assert.equal(snap.gl_entries.length, 0);
  assert.equal(snap.payment_entries.length, 0);
  assert.equal(snap.fulfillment_entries.length, 0);
  assert.ok(snap.stock_entries.every((line) => line.line_key.startsWith("OPENING-")));
});

test("submit validates master-data existence uniformly across all four O2C controllers", async () => {
  // Posting-gate invariant (half 2 of 2): assertMasterData guards the submit gate on
  // EVERY controller and EVERY master type — extending O2C-A-INVALID-ITEM-006 (SO item)
  // to a non-existent Warehouse (Delivery Note) and Account (Sales Invoice, Payment
  // Entry). Each submit is rejected with REFERENCE_VALIDATION_FAILED and posts nothing;
  // the drafts stay docstatus 0. (Create accepted the non-existent refs — defer-to-submit.)
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-GATE", document: orderDocument("10") });

  const dn = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-GATE",
    items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25", warehouse: "WH-NOPE", valuation_rate: "15" }] };
  await mutate(kernel, { commandId: "dn-gate-create", doctype: "Delivery Note", name: "DN-GATE", action: "create", expectedVersion: null, document: dn });
  await assert.rejects(mutate(kernel, { commandId: "dn-gate-submit", doctype: "Delivery Note", name: "DN-GATE", action: "submit", expectedVersion: 1, document: dn }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  const si = { customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: "SO-GATE",
    debit_to: "Debtors", default_income_account: "ACC-NOPE", tax_account: "Output Tax",
    items: [{ row_id: "1", item_code: "ITEM-001", qty: "4", rate: "25" }], taxes: [] };
  await mutate(kernel, { commandId: "si-gate-create", doctype: "Sales Invoice", name: "SI-GATE", action: "create", expectedVersion: null, document: si });
  await assert.rejects(mutate(kernel, { commandId: "si-gate-submit", doctype: "Sales Invoice", name: "SI-GATE", action: "submit", expectedVersion: 1, document: si }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  const pe = { company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
    paid_from: "Debtors", paid_to: "ACC-NOPE", paid_amount: "100", received_amount: "100", currency: "USD",
    references: [{ row_id: "1", reference_doctype: "Sales Invoice", reference_name: "SI-GATE", allocated_amount: "100" }] };
  await mutate(kernel, { commandId: "pe-gate-create", doctype: "Payment Entry", name: "PE-GATE", action: "create", expectedVersion: null, document: pe });
  await assert.rejects(mutate(kernel, { commandId: "pe-gate-submit", doctype: "Payment Entry", name: "PE-GATE", action: "submit", expectedVersion: 1, document: pe }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  // none of the three rejected submits posted anything; all remain drafts
  const snap = store.snapshot();
  assert.equal(snap.gl_entries.length, 0);
  assert.equal(snap.payment_entries.length, 0);
  assert.equal(snap.fulfillment_entries.length, 0);
  assert.ok(snap.stock_entries.every((line) => line.line_key.startsWith("OPENING-")));
  assert.equal((await store.getDocument("demo", "Delivery Note", "DN-GATE")).docstatus, 0);
  assert.equal((await store.getDocument("demo", "Sales Invoice", "SI-GATE")).docstatus, 0);
  assert.equal((await store.getDocument("demo", "Payment Entry", "PE-GATE")).docstatus, 0);
});

test("client-supplied delivered/billed percentages cannot forge a Completed Sales Order", async () => {
  // Regression (Gate 2E differential finding): a client must not be able to inject
  // server-derived fulfilment fields. Submitting an order that has delivered and
  // billed nothing while claiming 100% must persist as "To Deliver and Bill", and
  // the derived percentages must be forced to "0.00" — not the forged input.
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Sales Order", name: "SO-FORGE",
    document: { ...orderDocument(), delivered_percentage: "100", billed_percentage: "100", status: "Completed" },
  });
  const order = await store.getDocument("demo", "Sales Order", "SO-FORGE");
  assert.equal(order.status, "To Deliver and Bill");
  assert.notEqual(order.status, "Completed");
  assert.equal(order.data.delivered_percentage, "0.00");
  assert.equal(order.data.billed_percentage, "0.00");
});

test("Sales Invoice posts each tax account and an explicit round-off line for inclusive tax", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Account", "Round Off");
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-INCLUSIVE",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 2,
      posting_at: now(), debit_to: "Debtors", default_income_account: "Sales", round_off_account: "Round Off",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "500" }],
      taxes: [{ row_id: "T1", account: "Output Tax", rate: "10", included_in_print_rate: true }],
    },
  });
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-INCLUSIVE");
  assert.equal(invoice.data.net_total, "454.55");
  assert.equal(invoice.data.grand_total, "500.00");
  assert.equal(invoice.data.rounding_adjustment, "-0.01");
  const lines = store.snapshot().gl_entries.filter((line) => ["RECEIVABLE", "INCOME", "TAX-T1", "ROUND-OFF"].includes(line.line_key));
  assert.deepEqual(lines.map((line) => [line.line_key, line.account, line.debit_minor, line.credit_minor]), [
    ["RECEIVABLE", "Debtors", 50000, 0],
    ["INCOME", "Sales", 0, 45455],
    ["TAX-T1", "Output Tax", 0, 4546],
    ["ROUND-OFF", "Round Off", 1, 0],
  ]);
});

test("foreign-currency invoice and payment post base GL with exchange difference while outstanding remains transactional", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Currency", "EUR", "demo", { currency_scale: 2 });
  store.seedMaster("Account", "Exchange Gain Loss");
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-22", "demo", { rate: "1.10" });
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-23", "demo", { rate: "1.20" });

  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-EUR",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "EUR", currency_scale: 2,
      posting_at: "2026-07-22T08:00:00.000Z", debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "500" }], taxes: [],
    },
  });
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-EUR");
  assert.equal(invoice.data.conversion_rate, "1.100000");
  assert.equal(invoice.data.grand_total, "500.00");
  assert.equal(invoice.data.base_grand_total, "550.00");
  assert.equal(invoice.data.outstanding_amount, "500.00");

  await createAndSubmit(kernel, {
    doctype: "Payment Entry", name: "PE-EUR",
    document: {
      company: "Demo", posting_at: "2026-07-23T08:00:00.000Z", payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", exchange_gain_loss_account: "Exchange Gain Loss",
      paid_amount: "500", received_amount: "600", currency: "EUR", currency_scale: 2,
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-EUR", allocated_amount: "500" }],
    },
  });
  const payment = await store.getDocument("demo", "Payment Entry", "PE-EUR");
  assert.equal(payment.data.source_exchange_rate, "1.200000");
  assert.equal(payment.data.base_paid_amount, "600.00");
  assert.equal(payment.data.base_receivable_amount, "550.00");
  assert.equal(payment.data.difference_amount, "-50.00");
  const paymentGl = store.snapshot().gl_entries.slice(-3);
  assert.deepEqual(paymentGl.map((line) => [line.line_key, line.debit_minor, line.credit_minor, line.currency]), [
    ["BANK", 60000, 0, "USD"],
    ["RECEIVABLE", 0, 55000, "USD"],
    ["EXCHANGE-DIFFERENCE", 0, 5000, "USD"],
  ]);
  const allGl = store.snapshot().gl_entries;
  const receivableResidual = allGl
    .filter((line) => line.account === "Debtors" && line.party === "CUST-0001")
    .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);
  assert.equal(receivableResidual, 0, "historical-rate settlement must fully clear base-currency receivable");
  const paidInvoice = await store.getDocument("demo", "Sales Invoice", "SI-EUR");
  assert.equal(paidInvoice.data.outstanding_amount, "0.00");
});

test("business posting dates, not mutation time, are persisted on every accounting and fulfillment ledger", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-POSTING", document: orderDocument("1", "100") });
  const dnPosting = "2026-06-28T09:30:00.000Z";
  await createAndSubmit(kernel, {
    doctype: "Delivery Note", name: "DN-POSTING",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 0,
      posting_at: dnPosting, against_sales_order: "SO-POSTING",
      items: [{ row_id: "D1", item_code: "ITEM-001", qty: "1", rate: "100", warehouse: "Stores", valuation_rate: "15" }],
    },
  });
  const siPosting = "2026-06-29T10:00:00.000Z";
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-POSTING",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 0,
      posting_at: siPosting, against_sales_order: "SO-POSTING", debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "I1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [],
    },
  });
  const pePosting = "2026-06-30T11:00:00.000Z";
  await createAndSubmit(kernel, {
    doctype: "Payment Entry", name: "PE-POSTING",
    document: {
      company: "Demo", posting_at: pePosting, payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD", currency_scale: 0,
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-POSTING", allocated_amount: "100" }],
    },
  });

  const snapshot = store.snapshot();
  assert.ok(snapshot.stock_entries.some((line) => line.posting_at === dnPosting));
  assert.ok(snapshot.fulfillment_entries.some((line) => line.kind === "Delivery" && line.posting_at === dnPosting));
  assert.ok(snapshot.fulfillment_entries.some((line) => line.kind === "Billing" && line.posting_at === siPosting));
  assert.ok(snapshot.gl_entries.some((line) => line.line_key === "RECEIVABLE" && line.posting_at === siPosting));
  assert.ok(snapshot.gl_entries.some((line) => line.line_key === "BANK" && line.posting_at === pePosting));
  assert.ok(snapshot.payment_entries.some((line) => line.amount_minor > 0 && line.posting_at === siPosting));
  assert.ok(snapshot.payment_entries.some((line) => line.amount_minor < 0 && line.posting_at === pePosting));
  assert.ok(snapshot.gl_entries.every((line) => line.posting_at !== now()), "ledger posting date must not fall back to mutation time");
});

test("currency precision and company currency are server-authoritative master data", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-SCALE-SPOOF",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", currency_scale: 0,
      company_currency: "JPY", company_currency_scale: 0,
      posting_at: "2026-07-20T00:00:00.000Z", debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100.49" }], taxes: [],
    },
  });
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-SCALE-SPOOF");
  assert.equal(invoice.data.currency_scale, 2);
  assert.equal(invoice.data.company_currency, "USD");
  assert.equal(invoice.data.company_currency_scale, 2);
  assert.equal(invoice.data.grand_total, "100.49");
  assert.equal(invoice.data.base_grand_total, "100.49");
});

test("client cannot manufacture exchange gain or loss with an arbitrary received_amount", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Currency", "EUR", "demo", { currency_scale: 2 });
  store.seedMaster("Account", "Exchange Gain Loss");
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-22", "demo", { rate: "1.10" });
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-23", "demo", { rate: "1.20" });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-FX-AUTH",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "EUR", posting_at: "2026-07-22T08:00:00.000Z",
      debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "500" }], taxes: [],
    },
  });
  await assert.rejects(mutate(kernel, {
    commandId: "pe-fx-forged-create", doctype: "Payment Entry", name: "PE-FX-FORGED", action: "create", expectedVersion: null,
    document: {
      company: "Demo", posting_at: "2026-07-23T08:00:00.000Z", payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", exchange_gain_loss_account: "Exchange Gain Loss",
      paid_amount: "500", received_amount: "1", currency: "EUR",
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-FX-AUTH", allocated_amount: "500" }],
    },
  }), (error) => error.code === "VALIDATION_ERROR" && error.details?.expected_received_minor === 60000);
  assert.equal(store.snapshot().gl_entries.filter((line) => line.line_key === "EXCHANGE-DIFFERENCE").length, 0);
});

test("final partial FX allocation consumes exact base outstanding and leaves no receivable residual", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Currency", "EUR", "demo", { currency_scale: 2 });
  store.seedMaster("Account", "Exchange Gain Loss");
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-20", "demo", { rate: "1.234567" });
  store.seedMaster("Exchange Rate", "EUR:USD:2026-07-21", "demo", { rate: "1.234567" });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-FX-ROUND",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "EUR", posting_at: "2026-07-20T08:00:00.000Z",
      debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "0.03" }], taxes: [],
    },
  });
  for (let index = 1; index <= 3; index += 1) {
    await createAndSubmit(kernel, {
      doctype: "Payment Entry", name: `PE-FX-ROUND-${index}`,
      document: {
        company: "Demo", posting_at: "2026-07-21T08:00:00.000Z", payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
        paid_from: "Debtors", paid_to: "Bank", exchange_gain_loss_account: "Exchange Gain Loss",
        paid_amount: "0.01", received_amount: "0.01", currency: "EUR",
        references: [{ row_id: `R${index}`, reference_doctype: "Sales Invoice", reference_name: "SI-FX-ROUND", allocated_amount: "0.01" }],
      },
    });
  }
  assert.equal(await store.getOutstandingMinor("demo", "Sales Invoice", "SI-FX-ROUND"), 0);
  assert.equal(await store.getBaseOutstandingMinor("demo", "Sales Invoice", "SI-FX-ROUND"), 0);
  const residual = store.snapshot().gl_entries
    .filter((line) => line.account === "Debtors" && line.party === "CUST-0001")
    .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);
  assert.equal(residual, 0);
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-FX-ROUND");
  assert.equal(invoice.status, "Paid");
});


test("commercial O2C rejects unallocated customer receipts until advances/write-offs have an explicit ledger model", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-UNALLOC", document: orderDocument("1", "100") });
  await createAndSubmit(kernel, {
    doctype: "Sales Invoice", name: "SI-UNALLOC",
    document: {
      customer: "CUST-0001", company: "Demo", currency: "USD", posting_at: now(),
      against_sales_order: "SO-UNALLOC", debit_to: "Debtors", default_income_account: "Sales",
      items: [{ row_id: "1", item_code: "ITEM-001", qty: "1", rate: "100" }], taxes: [],
    },
  });
  await assert.rejects(mutate(kernel, {
    commandId: "pe-unallocated-create", doctype: "Payment Entry", name: "PE-UNALLOC", action: "create", expectedVersion: null,
    document: {
      company: "Demo", posting_at: now(), payment_type: "Receive", party_type: "Customer", party: "CUST-0001",
      paid_from: "Debtors", paid_to: "Bank", paid_amount: "100", received_amount: "100", currency: "USD",
      references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: "SI-UNALLOC", allocated_amount: "60" }],
    },
  }), (error) => error.code === "VALIDATION_ERROR" && error.details?.paid_minor === 10000 && error.details?.allocated_minor === 6000);
});
