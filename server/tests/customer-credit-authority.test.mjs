import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const NOW = "2026-10-02T09:00:00.000Z";

function setup(customer = {}) {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["ITEM-1"],
    accounts: ["Income"],
  });
  store.seedMaster("Customer", "CUST-1", "demo", customer);
  const kernel = new DocumentKernel(createO2CControllerRegistry(), store, undefined, () => NOW);
  return { store, kernel };
}

function order(name, amount = "60") {
  return {
    doctype: "Sales Order",
    name,
    document: {
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-10-02",
      items: [{ row_id: "ROW-1", item_code: "ITEM-1", qty: "1", rate: amount }],
      taxes: [],
    },
  };
}

test("sales order freezes Customer credit limit in company-currency minor units", async () => {
  const { store, kernel } = setup({ credit_limit: "100" });
  await createAndSubmit(kernel, order("SO-CREDIT"));

  const saved = await store.getDocument("demo", "Sales Order", "SO-CREDIT");
  assert.equal(saved.data.credit_limit_minor, 10_000);
  assert.equal(saved.data.credit_limit, "100.00");
  assert.equal(saved.data.credit_limit_source, "Customer");
  assert.equal(saved.data.credit_limit_enforced, true);
  assert.equal(saved.data.credit_limit_bypass_sales_order, false);
});

test("sales-order bypass disables order reservation but preserves the policy snapshot", async () => {
  const { store, kernel } = setup({
    credit_limit: "100",
    bypass_credit_limit_check: true,
  });
  await createAndSubmit(kernel, order("SO-BYPASS"));

  const saved = await store.getDocument("demo", "Sales Order", "SO-BYPASS");
  assert.equal(saved.data.credit_limit_minor, 10_000);
  assert.equal(saved.data.credit_limit_bypass_sales_order, true);
  assert.equal(saved.data.credit_limit_enforced, false);
});

test("customer hold blocks submit until the release date has passed", async () => {
  const { kernel } = setup({
    credit_limit: "100",
    on_hold: true,
    release_date: "2026-10-03",
  });

  await assert.rejects(
    createAndSubmit(kernel, order("SO-HOLD")),
    /on credit hold/i,
  );
});
