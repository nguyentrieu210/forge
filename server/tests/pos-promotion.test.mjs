import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const now = () => "2026-08-03T09:00:00.000Z";

test("POS promotion reuses server Pricing Rule and never trusts the cashier rate", async () => {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: ["POS-ITEM"],
    warehouses: ["Stores"],
    accounts: ["Sales", "Cash", "Stock", "COGS"],
  });
  store.seedMaster("Item", "POS-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item Price", "Retail:POS-ITEM", "demo", {
    price_list: "Retail",
    item_code: "POS-ITEM",
    currency: "USD",
    rate: "100",
  });
  store.seedMaster("Pricing Rule", "PROMO-10", "demo", {
    price_list: "Retail",
    item_code: "POS-ITEM",
    discount_percentage: "10",
    valid_from: "2026-08-01",
    valid_upto: "2026-08-31",
    min_qty: "2",
    max_qty: "5",
    priority: 10,
  });
  store.seedMaster("Mode of Payment", "Cash", "demo", {
    enabled: 1,
    type: "Cash",
    accounts: [{ company: "Demo", default_account: "Cash" }],
  });
  store.seedMaster("POS Profile", "MAIN", "demo", {
    company: "Demo",
    warehouse: "Stores",
    currency: "USD",
    selling_price_list: "Retail",
    income_account: "Sales",
    cash_account: "Cash",
    stock_account: "Stock",
    cogs_account: "COGS",
    payments: [{ mode_of_payment: "Cash" }],
  });
  store.seedStock({ itemCode: "POS-ITEM", warehouse: "Stores", qty: "10.000000", valuationRate: "40.00" });

  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  const kernel = new DocumentKernel(registry, store, undefined, now);
  await createAndSubmit(kernel, {
    doctype: "POS Opening Entry",
    name: "OPEN-1",
    document: { pos_profile: "MAIN", posting_at: now(), opening_cash: "0" },
  });
  await createAndSubmit(kernel, {
    doctype: "POS Invoice",
    name: "POS-PROMO",
    document: {
      pos_profile: "MAIN",
      opening_entry: "OPEN-1",
      customer: "CUST-1",
      company: "FORGED",
      currency: "EUR",
      posting_at: now(),
      cash_account: "FORGED",
      default_income_account: "FORGED",
      stock_account: "FORGED",
      cogs_account: "FORGED",
      items: [{ row_id: "1", item_code: "POS-ITEM", qty: "2", rate: "1", warehouse: "FORGED" }],
      taxes: [],
      payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "180" }],
    },
  });

  const invoice = await store.getDocument("demo", "POS Invoice", "POS-PROMO");
  assert.equal(invoice.data.items[0].rate, "90.00");
  assert.equal(invoice.data.items[0].pricing_rule, "PROMO-10");
  assert.equal(invoice.data.items[0].discount_percentage, "10.000000");
  assert.equal(invoice.data.net_total, "180.00");
  assert.equal(invoice.data.grand_total, "180.00");
  assert.equal(invoice.data.paid_amount, "180.00");
});
