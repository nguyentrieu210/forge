import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const openedAt = "2026-08-03T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["POS-ITEM"],
    warehouses: ["Stores"],
    accounts: ["Sales", "Cash", "Stock", "COGS"],
  });
  store.seedMaster("Item Price", "Retail:POS-ITEM", "demo", { currency: "USD", rate: "12" });
  store.seedMaster("POS Profile", "MAIN", "demo", {
    company: "Demo",
    warehouse: "Stores",
    currency: "USD",
    selling_price_list: "Retail",
    income_account: "Sales",
    cash_account: "Cash",
    stock_account: "Stock",
    cogs_account: "COGS",
  });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => openedAt) };
}

async function openSession(kernel) {
  await createAndSubmit(kernel, {
    doctype: "POS Opening Entry",
    name: "OPEN-1",
    document: { pos_profile: "MAIN", posting_at: openedAt, opening_cash: "100" },
  });
}

test("POS invoice and closing cannot predate their opening session", async () => {
  const { kernel } = setup();
  await openSession(kernel);

  await assert.rejects(createAndSubmit(kernel, {
    doctype: "POS Invoice",
    name: "POS-EARLY",
    document: {
      pos_profile: "MAIN",
      opening_entry: "OPEN-1",
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: "2026-08-03T08:59:59.000Z",
      cash_account: "Cash",
      default_income_account: "Sales",
      stock_account: "Stock",
      cogs_account: "COGS",
      items: [{ row_id: "1", item_code: "POS-ITEM", qty: "1", rate: "12", warehouse: "Stores" }],
      taxes: [],
    },
  }), (error) => error.code === "VALIDATION_ERROR");

  await assert.rejects(createAndSubmit(kernel, {
    doctype: "POS Closing Entry",
    name: "CLOSE-EARLY",
    document: { pos_profile: "MAIN", opening_entry: "OPEN-1", company: "Demo", posting_at: "2026-08-03T08:59:59.000Z", closing_cash: "100" },
  }), (error) => error.code === "VALIDATION_ERROR");
});

test("POS closing rejects negative cash and requires a reason for discrepancies", async () => {
  const { store, kernel } = setup();
  await openSession(kernel);

  await assert.rejects(mutate(kernel, {
    commandId: "CLOSE-NEG-create",
    doctype: "POS Closing Entry",
    name: "CLOSE-NEG",
    action: "create",
    expectedVersion: null,
    document: { pos_profile: "MAIN", opening_entry: "OPEN-1", company: "Demo", posting_at: "2026-08-03T10:00:00.000Z", closing_cash: "-1" },
  }), (error) => error.code === "VALIDATION_ERROR");

  const closingDocument = { pos_profile: "MAIN", opening_entry: "OPEN-1", company: "Demo", posting_at: "2026-08-03T10:00:00.000Z", closing_cash: "90" };
  await mutate(kernel, {
    commandId: "CLOSE-1-create",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "create",
    expectedVersion: null,
    document: closingDocument,
  });
  assert.equal((await store.getDocument("demo", "POS Closing Entry", "CLOSE-1")).data.difference_minor, -1000);

  await assert.rejects(mutate(kernel, {
    commandId: "CLOSE-1-submit-no-reason",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "submit",
    expectedVersion: 1,
    document: closingDocument,
  }), (error) => error.code === "VALIDATION_ERROR");
  assert.equal((await store.getDocument("demo", "POS Closing Entry", "CLOSE-1")).docstatus, 0);

  await mutate(kernel, {
    commandId: "CLOSE-1-submit",
    doctype: "POS Closing Entry",
    name: "CLOSE-1",
    action: "submit",
    expectedVersion: 1,
    document: { ...closingDocument, discrepancy_reason: "  Cash drawer shortage  " },
  });
  const closed = await store.getDocument("demo", "POS Closing Entry", "CLOSE-1");
  assert.equal(closed.docstatus, 1);
  assert.equal(closed.data.discrepancy_reason, "Cash drawer shortage");
  assert.equal(closed.data.difference_minor, -1000);
});