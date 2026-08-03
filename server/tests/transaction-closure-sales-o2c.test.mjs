import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate, seedStandardMasters } from "./helpers.mjs";

const now = () => "2026-08-04T08:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  seedStandardMasters(store);
  return { store, kernel: new DocumentKernel(createO2CControllerRegistry(), store, undefined, now) };
}

function quotationDocument(qty = "10", rate = "25") {
  return {
    customer: "CUST-0001",
    company: "Demo",
    currency: "USD",
    transaction_date: "2026-08-04",
    valid_till: "2026-09-04",
    items: [{ row_id: "QI-1", item_code: "ITEM-001", qty, rate }],
    taxes: [{ row_id: "QTAX-1", account: "Output Tax", rate: "10" }],
  };
}

function orderFromQuotation(quotation, qty = "10", extra = {}) {
  return {
    customer: "CUST-0001",
    company: "Demo",
    currency: "USD",
    transaction_date: "2026-08-04",
    against_quotation: quotation,
    items: [{ row_id: "SOI-1", quotation_item: "QI-1", item_code: "ITEM-001", qty, rate: "25" }],
    taxes: [{ row_id: "SOTAX-1", account: "Output Tax", rate: "10" }],
    ...extra,
  };
}

test("Quotation to Sales Order preserves source row and server revision trace", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Quotation",
    name: "Q-TRACE-1",
    document: quotationDocument(),
  });
  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-TRACE-1",
    document: orderFromQuotation("Q-TRACE-1", "10", { revision_no: 99, quotation_revision_no: 99 }),
  });

  const order = await store.getDocument("demo", "Sales Order", "SO-TRACE-1");
  assert.equal(order.data.against_quotation, "Q-TRACE-1");
  assert.equal(order.data.quotation_revision_no, 1);
  assert.equal(order.data.revision_no, 1, "client cannot forge Sales Order revision number");
  assert.equal(order.data.items[0].quotation_item, "QI-1");
});

test("Quotation mapping rejects missing or foreign quotation child identity", async () => {
  const { kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Quotation",
    name: "Q-LINE-GUARD",
    document: quotationDocument(),
  });

  const missing = orderFromQuotation("Q-LINE-GUARD");
  delete missing.items[0].quotation_item;
  await assert.rejects(
    mutate(kernel, {
      commandId: "so-line-missing-create",
      doctype: "Sales Order",
      name: "SO-LINE-MISSING",
      action: "create",
      expectedVersion: null,
      document: missing,
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /quotation_item/.test(error.message),
  );

  const foreign = orderFromQuotation("Q-LINE-GUARD");
  foreign.items[0].quotation_item = "QI-NOT-THERE";
  await assert.rejects(
    mutate(kernel, {
      commandId: "so-line-foreign-create",
      doctype: "Sales Order",
      name: "SO-LINE-FOREIGN",
      action: "create",
      expectedVersion: null,
      document: foreign,
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /does not belong/.test(error.message),
  );
});

test("multiple Sales Orders cannot cumulatively exceed one quoted source row", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Quotation",
    name: "Q-CUMULATIVE",
    document: quotationDocument("10"),
  });
  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-CUMULATIVE-A",
    document: orderFromQuotation("Q-CUMULATIVE", "6"),
  });

  const second = orderFromQuotation("Q-CUMULATIVE", "5");
  await mutate(kernel, {
    commandId: "so-cumulative-b-create",
    doctype: "Sales Order",
    name: "SO-CUMULATIVE-B",
    action: "create",
    expectedVersion: null,
    document: second,
  });
  await assert.rejects(
    mutate(kernel, {
      commandId: "so-cumulative-b-submit",
      doctype: "Sales Order",
      name: "SO-CUMULATIVE-B",
      action: "submit",
      expectedVersion: 1,
      document: second,
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /Cumulative Sales Order quantity/.test(error.message),
  );

  const rejected = await store.getDocument("demo", "Sales Order", "SO-CUMULATIVE-B");
  assert.equal(rejected.docstatus, 0, "failed submit must leave the second order as Draft");
});

test("Sales Order amendment increments revision and preserves Quotation authority", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Quotation",
    name: "Q-SO-AMEND",
    document: quotationDocument("6"),
  });
  const original = orderFromQuotation("Q-SO-AMEND", "6", { revision_no: 17 });
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-AMEND-1", document: original });
  await mutate(kernel, {
    commandId: "so-amend-1-cancel",
    doctype: "Sales Order",
    name: "SO-AMEND-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });

  const successor = orderFromQuotation("Q-SO-AMEND", "6", { revision_no: 44, quotation_revision_no: 88 });
  await mutate(kernel, {
    commandId: "so-amend-2-create",
    doctype: "Sales Order",
    name: "SO-AMEND-2",
    action: "create",
    expectedVersion: null,
    document: successor,
    amendedFrom: "SO-AMEND-1",
  });
  const amendment = await store.getDocument("demo", "Sales Order", "SO-AMEND-2");
  assert.equal(amendment.amended_from, "SO-AMEND-1");
  assert.equal(amendment.data.revision_no, 2);
  assert.equal(amendment.data.against_quotation, "Q-SO-AMEND");
  assert.equal(amendment.data.quotation_revision_no, 1);

  await mutate(kernel, {
    commandId: "so-amend-2-submit",
    doctype: "Sales Order",
    name: "SO-AMEND-2",
    action: "submit",
    expectedVersion: 1,
    document: successor,
  });
  assert.equal((await store.getDocument("demo", "Sales Order", "SO-AMEND-2")).docstatus, 1);
});

test("a revised Quotation carries its revision into the mapped Sales Order", async () => {
  const { store, kernel } = setup();
  const quote = quotationDocument("4");
  await createAndSubmit(kernel, { doctype: "Quotation", name: "Q-REV-1", document: quote });
  await mutate(kernel, {
    commandId: "q-rev-1-cancel",
    doctype: "Quotation",
    name: "Q-REV-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  await mutate(kernel, {
    commandId: "q-rev-2-create",
    doctype: "Quotation",
    name: "Q-REV-2",
    action: "create",
    expectedVersion: null,
    document: quote,
    amendedFrom: "Q-REV-1",
  });
  await mutate(kernel, {
    commandId: "q-rev-2-submit",
    doctype: "Quotation",
    name: "Q-REV-2",
    action: "submit",
    expectedVersion: 1,
    document: quote,
  });

  const revisedQuote = await store.getDocument("demo", "Quotation", "Q-REV-2");
  assert.equal(revisedQuote.data.revision_no, 2);
  assert.equal(revisedQuote.amended_from, "Q-REV-1");

  await createAndSubmit(kernel, {
    doctype: "Sales Order",
    name: "SO-FROM-Q-REV-2",
    document: orderFromQuotation("Q-REV-2", "4"),
  });
  const order = await store.getDocument("demo", "Sales Order", "SO-FROM-Q-REV-2");
  assert.equal(order.data.quotation_revision_no, 2);
});

test("Quotation conversion factor is frozen into downstream Sales Order mapping", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "ITEM-001", "demo", {
    stock_uom: "Nos",
    default_sales_uom: "Box",
    uom_conversions: [{ uom: "Box", conversion_factor: "2" }],
  });
  const quote = quotationDocument("2", "50");
  quote.items[0].uom = "Box";
  await createAndSubmit(kernel, { doctype: "Quotation", name: "Q-UOM-FROZEN", document: quote });

  store.seedMaster("Item", "ITEM-001", "demo", {
    stock_uom: "Nos",
    default_sales_uom: "Box",
    uom_conversions: [{ uom: "Box", conversion_factor: "3" }],
  });
  const order = orderFromQuotation("Q-UOM-FROZEN", "2");
  order.items[0].uom = "Box";
  await assert.rejects(
    mutate(kernel, {
      commandId: "so-uom-drift-create",
      doctype: "Sales Order",
      name: "SO-UOM-DRIFT",
      action: "create",
      expectedVersion: null,
      document: order,
    }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /conversion_factor/.test(error.message),
  );
});
