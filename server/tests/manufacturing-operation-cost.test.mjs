import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-04T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "WIP", "Finished", "Scrap"],
    accounts: ["Stock", "Labor Clearing", "Machine Clearing", "Overhead Clearing"],
  });
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "WIP", "demo", { company: "Demo", stock_role: "Kho đang sản xuất", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
  store.seedMaster("Warehouse", "Scrap", "demo", { company: "Demo", stock_role: "Kho đầu thừa", is_group: 0 });
  store.seedMaster("Item", "RAW", "demo", {
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    include_item_in_manufacturing: 1,
    stock_uom: "Nos",
    valuation_method: "FIFO",
    standard_rate: "2.00",
  });
  store.seedMaster("Item", "FG", "demo", {
    item_nature: "Hàng tồn kho",
    material_stage: "Thành phẩm",
    supply_type: "Tự sản xuất",
    is_stock_item: 1,
    include_item_in_manufacturing: 1,
    stock_uom: "Nos",
    valuation_method: "FIFO",
    standard_rate: "10.00",
  });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => NOW) };
}

async function createAndSubmitExact(kernel, { doctype, name, document, submitCommandId = `${name}-submit` }) {
  await mutate(kernel, {
    commandId: `${name}-create`,
    doctype,
    name,
    action: "create",
    expectedVersion: null,
    document,
  });
  return mutate(kernel, {
    commandId: submitCommandId,
    doctype,
    name,
    action: "submit",
    expectedVersion: 1,
    document,
  });
}

async function submitBom(kernel) {
  return createAndSubmitExact(kernel, {
    doctype: "Bill of Materials",
    name: "BOM-CLOSURE",
    document: {
      company: "Demo",
      item: "FG",
      quantity: "1",
      operating_cost: "9.00",
      revision: 1,
      bom_status: "Active",
      effective_from: "2026-01-01",
      output_uom: "Nos",
      items: [{
        row_id: "RAW-1",
        item_code: "RAW",
        qty: "5",
        qty_basis: "Cố định",
        uom: "Nos",
        conversion_factor: "1",
        source_warehouse: "Raw",
      }],
    },
  });
}

async function submitWorkOrder(kernel, name = "WO-CLOSURE") {
  return createAndSubmitExact(kernel, {
    doctype: "Work Order",
    name,
    document: {
      company: "Demo",
      production_item: "FG",
      bom_no: "BOM-CLOSURE",
      qty: "2",
      source_warehouse: "Raw",
      wip_warehouse: "WIP",
      target_warehouse: "Finished",
      planned_start_date: "2026-08-01T08:00:00.000Z",
    },
  });
}

async function submitReceipt(kernel, name, postingAt, qty, valuationRate) {
  return createAndSubmitExact(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: postingAt,
      purpose: "Material Receipt",
      items: [{
        row_id: "OPEN-1",
        item_code: "RAW",
        qty,
        valuation_rate: valuationRate,
        target_warehouse: "Raw",
      }],
    },
  });
}

function manufactureDocument(workOrder, postingAt, rawQty, finishedQty = "1") {
  return {
    company: "Demo",
    posting_at: postingAt,
    purpose: "Manufacture",
    work_order: workOrder,
    finished_good_item: "FG",
    finished_good_qty: finishedQty,
    target_warehouse: "Finished",
    items: [{
      row_id: "CONSUME-1",
      item_code: "RAW",
      qty: rawQty,
      source_warehouse: "Raw",
      bom_row_id: "RAW-1",
      manufacturing_kind: "Consumption",
    }],
  };
}

async function ready() {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitWorkOrder(kernel);
  await submitReceipt(kernel, "OPEN", "2026-08-01T09:00:00.000Z", "20", "2");
  return { store, kernel };
}
function costDocument() {
  return {
    ...manufactureDocument("WO-CLOSURE", NOW, "5"),
    operation_cost_stock_account: "Stock",
    actual_operation_cost_minor: 999999,
    actual_operation_costs: [
      { row_id: "LABOR", cost_type: "Labor", amount: "1.23", amount_minor: 999999, clearing_account: "Labor Clearing" },
      { row_id: "MACHINE", cost_type: "Machine", amount: "2.34", clearing_account: "Machine Clearing" },
      { row_id: "OVERHEAD", cost_type: "Overhead", amount: "0.44", clearing_account: "Overhead Clearing" },
    ],
  };
}

test("manufacturing actual costs capitalize exact amounts and cancellation reverses original stock/GL", async () => {
  const { store, kernel } = await ready();
  const document = costDocument();
  await createAndSubmitExact(kernel, { doctype: "Stock Entry", name: "ACTUAL", document });
  const stored = await store.getDocument("demo", "Stock Entry", "ACTUAL");
  assert.equal(stored.data.actual_operation_cost_minor, 401);
  assert.equal(stored.data.actual_operation_costs[0].amount_minor, 123);
  const gl = await store.getVoucherGlEntries("demo", "Stock Entry", "ACTUAL", 2);
  const stock = await store.getVoucherStockEntries("demo", "Stock Entry", "ACTUAL", 2);
  assert.equal(stock.find(row => row.line_key.startsWith("FINISHED")).stock_value_difference_minor, 1401);
  assert.equal(stock.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 401);
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0), 0);
  assert.equal(gl.find(row => row.account === "Stock").debit_minor, 401);
  // Retry does not capitalize the cost twice.
  await mutate(kernel, { commandId: "ACTUAL-submit", doctype: "Stock Entry", name: "ACTUAL", action: "submit", expectedVersion: 1, document });
  assert.equal((await store.getVoucherGlEntries("demo", "Stock Entry", "ACTUAL", 2)).length, gl.length);
  // Cancel payload cannot replace the stored posting or its clearing accounts.
  await mutate(kernel, { commandId: "ACTUAL-cancel", doctype: "Stock Entry", name: "ACTUAL", action: "cancel", expectedVersion: 2, document: { ...document, actual_operation_costs: [] } });
  const reversedGl = await store.getVoucherGlEntries("demo", "Stock Entry", "ACTUAL", 3);
  const reversedStock = await store.getVoucherStockEntries("demo", "Stock Entry", "ACTUAL", 3);
  assert.deepEqual(reversedGl.map(row => [row.account, row.debit_minor, row.credit_minor]), gl.map(row => [row.account, row.credit_minor, row.debit_minor]));
  assert.deepEqual(reversedStock.map(row => [row.item_code, row.actual_qty_micros, row.stock_value_difference_minor]), stock.map(row => [row.item_code, -row.actual_qty_micros, -row.stock_value_difference_minor]));
});

test("manufacturing cost validation fails before stock/GL commit", async () => {
  for (const change of [
    doc => { doc.actual_operation_costs[0].amount = "-1"; },
    doc => { doc.actual_operation_costs[1].row_id = "LABOR"; },
    doc => { doc.actual_operation_costs[0].clearing_account = "Missing"; },
    doc => { doc.operation_cost_stock_account = "Labor Clearing"; },
  ]) {
    const { store, kernel } = await ready();
    const doc = costDocument();
    change(doc);
    await assert.rejects(createAndSubmitExact(kernel, { doctype: "Stock Entry", name: "BAD", document: doc }));
    assert.equal((await store.getVoucherStockEntries("demo", "Stock Entry", "BAD", 2)).length, 0);
    assert.equal((await store.getVoucherGlEntries("demo", "Stock Entry", "BAD", 2)).length, 0);
  }
});

test("manufacturing costs reject a foreign-company or group account", async () => {
  for (const master of [{ company: "Other" }, { is_group: 1 }, { disabled: 1 }, { is_group: "1" }, { disabled: "true" }]) {
    const { store, kernel } = await ready();
    store.seedMaster("Account", "Labor Clearing", "demo", master);
    await assert.rejects(createAndSubmitExact(kernel, { doctype: "Stock Entry", name: "BAD-ACCOUNT", document: costDocument() }), /active, a leaf/);
    assert.equal((await store.getVoucherStockEntries("demo", "Stock Entry", "BAD-ACCOUNT", 2)).length, 0);
  }
});

test("manufacturing operation costs preserve period lock on submit and cancel", async () => {
  const { store, kernel } = await ready();
  const document = costDocument();
  await mutate(kernel, { commandId: "LOCKED-create", doctype: "Stock Entry", name: "LOCKED", action: "create", expectedVersion: null, document });
  store.setPeriodLock("Demo", "2026-08-04");
  const actor = { user_id: "stock-user", roles: ["Stock Manager"] };
  await assert.rejects(mutate(kernel, { commandId: "LOCKED-submit", doctype: "Stock Entry", name: "LOCKED", action: "submit", expectedVersion: 1, document, actor }), /locked/);
  assert.equal((await store.getVoucherStockEntries("demo", "Stock Entry", "LOCKED", 2)).length, 0);
  store.setPeriodLock("Demo", "2026-07-31");
  await mutate(kernel, { commandId: "LOCKED-submit-ok", doctype: "Stock Entry", name: "LOCKED", action: "submit", expectedVersion: 1, document, actor });
  store.setPeriodLock("Demo", "2026-08-04");
  await assert.rejects(mutate(kernel, { commandId: "LOCKED-cancel", doctype: "Stock Entry", name: "LOCKED", action: "cancel", expectedVersion: 2, document, actor }), /locked/);
  assert.equal((await store.getVoucherGlEntries("demo", "Stock Entry", "LOCKED", 3)).length, 0);
});

test("actual operation costs retain offcut value once and preserve total inventory value", async () => {
  const { store, kernel } = await ready();
  const document = costDocument();
  document.items[0].qty = "4";
  document.items.push({ ...document.items[0], row_id: "OFFCUT", qty: "1", target_warehouse: "Scrap", manufacturing_kind: "Offcut" });
  await createAndSubmitExact(kernel, { doctype: "Stock Entry", name: "COST-OFFCUT", document });
  const stock = await store.getVoucherStockEntries("demo", "Stock Entry", "COST-OFFCUT", 2);
  assert.equal(stock.find(row => row.warehouse === "Scrap").stock_value_difference_minor, 200);
  assert.equal(stock.find(row => row.line_key.startsWith("FINISHED")).stock_value_difference_minor, 1201);
  assert.equal(stock.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 401);
});
