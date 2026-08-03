import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-08-03T09:00:00.000Z";

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
  store.seedMaster("Item", "POS-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item Price", "Retail:POS-ITEM", "demo", { currency: "USD", rate: "12" });
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
  store.seedStock({ itemCode: "POS-ITEM", warehouse: "Stores", qty: "10.000000", valuationRate: "5.00" });
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

test("POS cancellation reverses exact historical GL and FIFO stock after later layers change", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "POS Opening Entry",
    name: "OPEN-1",
    document: { pos_profile: "MAIN", posting_at: now(), opening_cash: "100" },
  });
  await createAndSubmit(kernel, {
    doctype: "POS Invoice",
    name: "POS-1",
    document: {
      pos_profile: "MAIN",
      opening_entry: "OPEN-1",
      customer: "CUST-1",
      company: "Demo",
      currency: "USD",
      posting_at: now(),
      cash_account: "Cash",
      default_income_account: "Sales",
      stock_account: "Stock",
      cogs_account: "COGS",
      items: [{ row_id: "1", item_code: "POS-ITEM", qty: "8", rate: "999", warehouse: "Stores" }],
      taxes: [],
      payments: [{ row_id: "1", mode_of_payment: "Cash", amount: "96" }],
    },
  });

  const originalGl = await store.getVoucherGlEntries("demo", "POS Invoice", "POS-1", 2);
  const originalStock = await store.getVoucherStockEntries("demo", "POS Invoice", "POS-1", 2);
  assert.ok(originalGl.length > 0);
  assert.ok(originalStock.length > 0);
  assert.equal(originalStock.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), -4000);

  // Change the current FIFO layers after the sale. A recomputed cancel would now
  // value 8 units as 2@5 + 6@9 = 64 instead of the historical 8@5 = 40.
  store.seedStock({ itemCode: "POS-ITEM", warehouse: "Stores", qty: "10.000000", valuationRate: "9.00" });

  await mutate(kernel, {
    commandId: "POS-1-cancel",
    doctype: "POS Invoice",
    name: "POS-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });

  const reversalGl = await store.getVoucherGlEntries("demo", "POS Invoice", "POS-1", 3);
  const reversalStock = await store.getVoucherStockEntries("demo", "POS Invoice", "POS-1", 3);
  assert.equal(reversalGl.length, originalGl.length);
  assert.equal(reversalStock.length, originalStock.length);
  for (const source of originalGl) {
    const reversed = reversalGl.find((row) => row.line_key === `REV-${source.line_key}`);
    assert.ok(reversed, `missing GL reversal for ${source.line_key}`);
    assert.equal(reversed.debit_minor, source.credit_minor);
    assert.equal(reversed.credit_minor, source.debit_minor);
    assert.equal(reversed.account, source.account);
  }
  for (const source of originalStock) {
    const reversed = reversalStock.find((row) => row.line_key === `REV-${source.line_key}`);
    assert.ok(reversed, `missing stock reversal for ${source.line_key}`);
    assert.equal(reversed.actual_qty_micros, -source.actual_qty_micros);
    assert.equal(reversed.stock_value_difference_minor, -source.stock_value_difference_minor);
    assert.equal(reversed.valuation_rate_minor, source.valuation_rate_minor);
    assert.equal(reversed.batch_no, source.batch_no);
    assert.equal(reversed.serial_no, source.serial_no);
  }
  assert.equal(reversalStock.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 4000);
});
