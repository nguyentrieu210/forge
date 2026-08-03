import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-08-04T02:30:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["ITEM-RETURN"],
    warehouses: ["Stores"],
    accounts: ["Creditors", "Expense"],
  });
  store.seedMaster("Item", "ITEM-RETURN", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Supplier", "SUP-1");
  const registry = registerErpNextCoreControllers(
    registerStockControllers(
      registerErpCoreControllers(createO2CControllerRegistry()),
    ),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

test("Purchase Return stays physical while Debit Note owns AP correction, with exact reversals", async () => {
  const { store, kernel } = setup();

  await createAndSubmit(kernel, {
    doctype: "Purchase Order",
    name: "PO-RETURN",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-08-04",
      receipt_match_required: true,
      items: [{ row_id: "PO-1", item_code: "ITEM-RETURN", qty: "10", rate: "10" }],
      taxes: [],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Purchase Receipt",
    name: "PR-RETURN",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      against_purchase_order: "PO-RETURN",
      items: [{ row_id: "PR-1", item_code: "ITEM-RETURN", qty: "10", rate: "10", valuation_rate: "10", warehouse: "Stores" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Purchase Invoice",
    name: "PI-RETURN",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      against_purchase_order: "PO-RETURN",
      credit_to: "Creditors",
      items: [{ row_id: "PI-1", item_code: "ITEM-RETURN", qty: "10", rate: "10", expense_account: "Expense" }],
      taxes: [],
    },
  });

  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-RETURN", "Stores"), 10_000_000);
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-RETURN"), 10_000);

  await createAndSubmit(kernel, {
    doctype: "Stock Return",
    name: "RET-PHYSICAL",
    document: {
      party: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      return_against: "PR-RETURN",
      return_type: "Purchase",
      items: [{ row_id: "RET-1", item_code: "ITEM-RETURN", qty: "4", rate: "10", warehouse: "Stores" }],
    },
  });

  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-RETURN", "Stores"), 6_000_000);
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-RETURN"), 10_000);

  await createAndSubmit(kernel, {
    doctype: "Debit Note",
    name: "DN-RETURN",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      return_against: "PI-RETURN",
      credit_to: "Creditors",
      default_expense_account: "Expense",
      items: [{ row_id: "DN-1", item_code: "ITEM-RETURN", qty: "4", rate: "10" }],
      taxes: [],
    },
  });

  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-RETURN"), 6_000);
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-RETURN", "Stores"), 6_000_000);

  await mutate(kernel, {
    commandId: "dn-return-cancel",
    doctype: "Debit Note",
    name: "DN-RETURN",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-RETURN"), 10_000);
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-RETURN", "Stores"), 6_000_000);

  await mutate(kernel, {
    commandId: "stock-return-cancel",
    doctype: "Stock Return",
    name: "RET-PHYSICAL",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "ITEM-RETURN", "Stores"), 10_000_000);
  assert.equal(await store.getOutstandingMinor("demo", "Purchase Invoice", "PI-RETURN"), 10_000);
});
