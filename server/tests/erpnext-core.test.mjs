import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers, valueIssue } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-25T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "USD",
    items: [], warehouses: ["Stores", "Transit", "Finished"],
    accounts: ["Debtors", "Creditors", "Sales", "Expense", "Stock", "COGS", "Bank", "Accumulated Depreciation", "Depreciation Expense", "Fixed Asset", "Valuation Difference"],
  });
  store.seedMaster("Supplier", "SUP-1");
  store.seedMaster("Asset Category", "Equipment");
  const registry = registerErpNextCoreControllers(registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())));
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function stockEntry(kernel, name, purpose, items, extra = {}) {
  return createAndSubmit(kernel, { doctype: "Stock Entry", name, document: {
    company: "Demo", posting_at: now(), purpose, items, ...extra,
  }});
}

async function makeSalesInvoice(kernel, name = "SI-RET") {
  await createAndSubmit(kernel, { doctype: "Sales Order", name: `SO-${name}`, document: {
    customer: "CUST-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25",
    items: [{ row_id: "SOI-1", item_code: "ITEM-RET", qty: "10", rate: "10" }], taxes: [],
  }});
  await createAndSubmit(kernel, { doctype: "Sales Invoice", name, document: {
    customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(), against_sales_order: `SO-${name}`,
    debit_to: "Debtors", default_income_account: "Sales",
    items: [{ row_id: "SII-1", item_code: "ITEM-RET", qty: "10", rate: "10", income_account: "Sales" }], taxes: [],
  }});
}

test("FIFO and Moving Average derive issue values from server ledger history", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "FIFO-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item", "MA-ITEM", "demo", { valuation_method: "Moving Average" });
  for (const item of ["FIFO-ITEM", "MA-ITEM"]) {
    await stockEntry(kernel, `${item}-R1`, "Material Receipt", [{ row_id: "1", item_code: item, qty: "10", valuation_rate: "10", target_warehouse: "Stores" }]);
    await stockEntry(kernel, `${item}-R2`, "Material Receipt", [{ row_id: "1", item_code: item, qty: "10", valuation_rate: "20", target_warehouse: "Stores" }]);
    await stockEntry(kernel, `${item}-I1`, "Material Issue", [{ row_id: "1", item_code: item, qty: "15", valuation_rate: "999", source_warehouse: "Stores" }]);
  }
  const snapshot = store.snapshot();
  const fifoIssue = snapshot.stock_entries.find((line) => line.line_key === "SRC-1" && line.item_code === "FIFO-ITEM");
  const maIssue = snapshot.stock_entries.find((line) => line.line_key === "SRC-1" && line.item_code === "MA-ITEM");
  assert.equal(fifoIssue.stock_value_difference_minor, -20_000);
  assert.equal(maIssue.stock_value_difference_minor, -22_500);
  assert.equal(await store.getStockBalanceMicros("demo", "FIFO-ITEM", "Stores"), 5_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "MA-ITEM", "Stores"), 5_000_000);
  assert.equal(valueIssue(snapshot.stock_entries.filter((line) => line.item_code === "FIFO-ITEM" && !line.line_key.startsWith("SRC")), 15_000_000, "FIFO").stock_value_difference_minor, -20_000);
});

test("serial and batch bundles are single-use and tracked stock cannot be issued twice", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "SERIAL-ITEM", "demo", { valuation_method: "FIFO", has_serial_no: true });
  store.seedMaster("Serial No", "SN-001", "demo", { item_code: "SERIAL-ITEM" });
  await createAndSubmit(kernel, { doctype: "Serial and Batch Bundle", name: "BUNDLE-IN", document: {
    item_code: "SERIAL-ITEM", warehouse: "Stores", type: "Inward", posting_at: now(), entries: [{ row_id: "1", qty: "1", serial_no: "SN-001" }],
  }});
  await stockEntry(kernel, "SERIAL-RECEIPT", "Material Receipt", [{ row_id: "1", item_code: "SERIAL-ITEM", qty: "1", valuation_rate: "50", target_warehouse: "Stores", serial_and_batch_bundle: "BUNDLE-IN" }]);
  await assert.rejects(stockEntry(kernel, "SERIAL-REUSE", "Material Receipt", [{ row_id: "1", item_code: "SERIAL-ITEM", qty: "1", valuation_rate: "50", target_warehouse: "Stores", serial_and_batch_bundle: "BUNDLE-IN" }]), (error) => error.code === "REFERENCE_VALIDATION_FAILED");

  // Cancelling the voucher reverses bundle usage and tracked stock atomically.
  await mutate(kernel, { commandId: "serial-receipt-cancel", doctype: "Stock Entry", name: "SERIAL-RECEIPT", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal(await store.isStockBundleUsed("demo", "BUNDLE-IN"), false);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "SERIAL-ITEM", "Stores", undefined, "SN-001"), 0);
  await stockEntry(kernel, "SERIAL-RECEIPT-RETRY", "Material Receipt", [{ row_id: "1", item_code: "SERIAL-ITEM", qty: "1", valuation_rate: "50", target_warehouse: "Stores", serial_and_batch_bundle: "BUNDLE-IN" }]);
  assert.equal(await store.isStockBundleUsed("demo", "BUNDLE-IN"), true);

  await createAndSubmit(kernel, { doctype: "Serial and Batch Bundle", name: "BUNDLE-OUT", document: {
    item_code: "SERIAL-ITEM", warehouse: "Stores", type: "Outward", posting_at: now(), entries: [{ row_id: "1", qty: "1", serial_no: "SN-001" }],
  }});
  await stockEntry(kernel, "SERIAL-ISSUE", "Material Issue", [{ row_id: "1", item_code: "SERIAL-ITEM", qty: "1", source_warehouse: "Stores", serial_and_batch_bundle: "BUNDLE-OUT" }]);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "SERIAL-ITEM", "Stores", undefined, "SN-001"), 0);
  await createAndSubmit(kernel, { doctype: "Serial and Batch Bundle", name: "BUNDLE-OUT-2", document: {
    item_code: "SERIAL-ITEM", warehouse: "Stores", type: "Outward", posting_at: now(), entries: [{ row_id: "1", qty: "1", serial_no: "SN-001" }],
  }});
  await assert.rejects(stockEntry(kernel, "SERIAL-ISSUE-2", "Material Issue", [{ row_id: "1", item_code: "SERIAL-ITEM", qty: "1", source_warehouse: "Stores", serial_and_batch_bundle: "BUNDLE-OUT-2" }]), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("Credit Note reduces invoice outstanding and enforces cumulative returned quantity", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "ITEM-RET", "demo", { valuation_method: "FIFO" });
  await makeSalesInvoice(kernel);
  await createAndSubmit(kernel, { doctype: "Credit Note", name: "CN-1", document: {
    customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(), return_against: "SI-RET",
    debit_to: "Debtors", default_income_account: "Sales",
    items: [{ row_id: "1", item_code: "ITEM-RET", qty: "4", rate: "10" }], taxes: [],
  }});
  const invoice = await store.getDocument("demo", "Sales Invoice", "SI-RET");
  assert.equal(invoice.data.outstanding_amount, "60.00");
  await assert.rejects(createAndSubmit(kernel, { doctype: "Credit Note", name: "CN-OVER", document: {
    customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(), return_against: "SI-RET",
    debit_to: "Debtors", default_income_account: "Sales",
    items: [{ row_id: "1", item_code: "ITEM-RET", qty: "7", rate: "10" }], taxes: [],
  }}), (error) => error.code === "REFERENCE_VALIDATION_FAILED");
});

test("BOM, Work Order and Manufacture consume server-valued materials and produce finished stock", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "RAW", "demo", { valuation_method: "FIFO", standard_rate: "5" });
  store.seedMaster("Item", "FG", "demo", { valuation_method: "FIFO", standard_rate: "11" });
  await stockEntry(kernel, "RAW-OPEN", "Material Receipt", [{ row_id: "1", item_code: "RAW", qty: "10", valuation_rate: "5", target_warehouse: "Stores" }]);
  await createAndSubmit(kernel, { doctype: "Bill of Materials", name: "BOM-FG", document: {
    company: "Demo", item: "FG", quantity: "1", operating_cost: "1",
    items: [{ row_id: "1", item_code: "RAW", qty: "2", source_warehouse: "Stores" }],
  }});
  await createAndSubmit(kernel, { doctype: "Work Order", name: "WO-FG", document: {
    company: "Demo", production_item: "FG", bom_no: "BOM-FG", qty: "3", source_warehouse: "Stores", target_warehouse: "Finished",
  }});
  await stockEntry(kernel, "MFG-FG", "Manufacture", [{ row_id: "1", item_code: "RAW", qty: "6", source_warehouse: "Stores" }], {
    work_order: "WO-FG", source_warehouse: "Stores", finished_good_item: "FG", finished_good_qty: "3", target_warehouse: "Finished",
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Stores"), 4_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 3_000_000);
  const workOrder = await store.getDocument("demo", "Work Order", "WO-FG");
  assert.equal(workOrder.status, "Completed");
  assert.equal(workOrder.data.produced_qty, "3.000000");
  const finished = store.snapshot().stock_entries.find((line) => line.line_key === "FINISHED" && line.item_code === "FG");
  assert.equal(finished.stock_value_difference_minor, 3_300);
});

test("Asset depreciation posts balanced GL and re-derives net book value", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, { doctype: "Asset", name: "ASSET-1", document: {
    asset_name: "Machine", company: "Demo", asset_category: "Equipment", purchase_date: "2026-01-01", available_for_use_date: "2026-01-01",
    gross_purchase_amount: "1200", salvage_value: "0", depreciation_method: "Straight Line",
    total_number_of_depreciations: 12, frequency_of_depreciation_months: 1,
    accumulated_depreciation_account: "Accumulated Depreciation", depreciation_expense_account: "Depreciation Expense", fixed_asset_account: "Fixed Asset",
  }});
  await createAndSubmit(kernel, { doctype: "Asset Depreciation Entry", name: "DEP-1", document: {
    asset: "ASSET-1", company: "Demo", posting_at: now(),
  }});
  const asset = await store.getDocument("demo", "Asset", "ASSET-1");
  assert.equal(asset.data.accumulated_depreciation, "100.00");
  assert.equal(asset.data.net_book_value, "1100.00");
  const lines = store.snapshot().gl_entries.filter((line) => line.voucher_no === undefined || ["EXPENSE", "ACCUMULATED"].includes(line.line_key)).slice(-2);
  assert.equal(lines.reduce((sum, line) => sum + line.debit_minor, 0), lines.reduce((sum, line) => sum + line.credit_minor, 0));
});

test("Item Price and Pricing Rule override client rates server-side", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "PRICE-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item Price", "Retail:PRICE-ITEM", "demo", { currency: "USD", rate: "100" });
  store.seedMaster("Pricing Rule", "VIP-10", "demo", { price_list: "Retail", item_code: "PRICE-ITEM", party_type: "Customer", party: "CUST-1", discount_percentage: "10", priority: 10 });
  await createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-PRICE", document: {
    customer: "CUST-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25", selling_price_list: "Retail",
    items: [{ row_id: "1", item_code: "PRICE-ITEM", qty: "2", rate: "999" }], taxes: [],
  }});
  const order = await store.getDocument("demo", "Sales Order", "SO-PRICE");
  assert.equal(order.data.items[0].rate, "90.00");
  assert.equal(order.data.items[0].pricing_rule, "VIP-10");
  assert.equal(order.data.grand_total, "180.00");
});

test("Item Price never applies silently to a different transaction UOM", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "PRICE-UOM", "demo", { valuation_method: "FIFO", stock_uom: "Kg" });
  store.seedMaster("Item Price", "Retail:PRICE-UOM", "demo", { currency: "USD", uom: "Kg", rate: "100" });
  await assert.rejects(
    createAndSubmit(kernel, { doctype: "Sales Order", name: "SO-PRICE-UOM", document: {
      customer: "CUST-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25", selling_price_list: "Retail",
      items: [{ row_id: "1", item_code: "PRICE-UOM", qty: "2", uom: "Mét", rate: "999" }], taxes: [],
    }}),
    /applies to UOM "Kg".*"Mét"/,
  );
});

test("ERPNext posting controllers enforce the company period lock", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "ITEM-RET", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Item", "LOCK-ITEM", "demo", { valuation_method: "FIFO" });
  await makeSalesInvoice(kernel, "SI-LOCK-SOURCE");
  await createAndSubmit(kernel, { doctype: "Purchase Order", name: "PO-LOCK-SOURCE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25",
    items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "2", rate: "10" }], taxes: [],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-LOCK-SOURCE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-LOCK-SOURCE",
    items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "2", rate: "10", valuation_rate: "10", warehouse: "Stores" }],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Invoice", name: "PI-LOCK-SOURCE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-LOCK-SOURCE", credit_to: "Creditors",
    items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "2", rate: "10", expense_account: "Expense" }], taxes: [],
  }});
  await createAndSubmit(kernel, { doctype: "Asset", name: "ASSET-LOCK", document: {
    asset_name: "Locked Machine", company: "Demo", asset_category: "Equipment", purchase_date: "2026-01-01", available_for_use_date: "2026-01-01",
    gross_purchase_amount: "1200", salvage_value: "0", depreciation_method: "Straight Line", total_number_of_depreciations: 12,
    frequency_of_depreciation_months: 1, accumulated_depreciation_account: "Accumulated Depreciation",
    depreciation_expense_account: "Depreciation Expense", fixed_asset_account: "Fixed Asset",
  }});

  store.setPeriodLock("Demo", "2026-07-31");
  const actor = { user_id: "erp-manager@example.com", roles: ["Accounts Manager", "Stock Manager", "Asset Manager", "Manufacturing Manager"] };
  const cases = [
    ["Credit Note", "CN-LOCK", { customer: "CUST-1", company: "Demo", currency: "USD", posting_at: now(), return_against: "SI-LOCK-SOURCE", debit_to: "Debtors", default_income_account: "Sales", items: [{ row_id: "1", item_code: "ITEM-RET", qty: "1", rate: "10" }], taxes: [] }],
    ["Debit Note", "DNB-LOCK", { supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), return_against: "PI-LOCK-SOURCE", credit_to: "Creditors", default_expense_account: "Expense", items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "1", rate: "10" }], taxes: [] }],
    ["Stock Return", "SRET-LOCK", { return_type: "Purchase", party: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), return_against: "PR-LOCK-SOURCE", items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "1", warehouse: "Stores" }] }],
    ["Stock Entry", "STE-LOCK", { company: "Demo", posting_at: now(), purpose: "Material Receipt", items: [{ row_id: "1", item_code: "LOCK-ITEM", qty: "1", valuation_rate: "10", target_warehouse: "Stores" }] }],
    ["Repost Item Valuation", "RIV-LOCK", { company: "Demo", item_code: "LOCK-ITEM", warehouse: "Stores", posting_at: now(), stock_account: "Stock", difference_account: "Valuation Difference" }],
    ["Asset Depreciation Entry", "DEP-LOCK", { asset: "ASSET-LOCK", company: "Demo", posting_at: now() }],
  ];
  for (const [doctype, name, document] of cases) {
    await mutate(kernel, { commandId: `${name}-create`, actor, doctype, name, action: "create", expectedVersion: null, document });
    await assert.rejects(
      mutate(kernel, { commandId: `${name}-submit`, actor, doctype, name, action: "submit", expectedVersion: 1, document }),
      (error) => error.code === "VALIDATION_ERROR" && /locked/.test(error.message),
      `${doctype} must enforce the period lock`,
    );
  }
});


test("Stock Return is scoped to the source party and warehouse", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "RETURN-ITEM", "demo", { valuation_method: "FIFO" });
  store.seedMaster("Supplier", "SUP-OTHER");
  await createAndSubmit(kernel, { doctype: "Purchase Order", name: "PO-RETURN-SOURCE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", transaction_date: "2026-07-25",
    items: [{ row_id: "1", item_code: "RETURN-ITEM", qty: "2", rate: "10" }], taxes: [],
  }});
  await createAndSubmit(kernel, { doctype: "Purchase Receipt", name: "PR-RETURN-SOURCE", document: {
    supplier: "SUP-1", company: "Demo", currency: "USD", posting_at: now(), against_purchase_order: "PO-RETURN-SOURCE",
    items: [{ row_id: "1", item_code: "RETURN-ITEM", qty: "2", rate: "10", valuation_rate: "10", warehouse: "Stores" }],
  }});
  const base = { return_type: "Purchase", company: "Demo", currency: "USD", posting_at: now(), return_against: "PR-RETURN-SOURCE" };
  await assert.rejects(
    mutate(kernel, { commandId: "return-party-create", doctype: "Stock Return", name: "SRET-BAD-PARTY", action: "create", expectedVersion: null, document: { ...base, party: "SUP-OTHER", items: [{ row_id: "1", item_code: "RETURN-ITEM", qty: "1", warehouse: "Stores" }] } }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /party/.test(error.message),
  );
  await assert.rejects(
    mutate(kernel, { commandId: "return-wh-create", doctype: "Stock Return", name: "SRET-BAD-WH", action: "create", expectedVersion: null, document: { ...base, party: "SUP-1", items: [{ row_id: "1", item_code: "RETURN-ITEM", qty: "1", warehouse: "Transit" }] } }),
    (error) => error.code === "REFERENCE_VALIDATION_FAILED" && /warehouse/.test(error.message),
  );
});
