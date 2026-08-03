import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { auditOutgoingValuation, registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { mutate } from "./helpers.mjs";

const NOW = "2026-08-04T09:00:00.000Z";
const Q = 1_000_000;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "WIP", "Finished", "Scrap"],
    accounts: [],
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

async function createManufacture(kernel, name, workOrder, postingAt, rawQty, finishedQty = "1") {
  const document = manufactureDocument(workOrder, postingAt, rawQty, finishedQty);
  await mutate(kernel, {
    commandId: `${name}-create`,
    doctype: "Stock Entry",
    name,
    action: "create",
    expectedVersion: null,
    document,
  });
  return document;
}

async function submitManufacture(kernel, name, workOrder, postingAt, rawQty, finishedQty = "1") {
  const document = await createManufacture(kernel, name, workOrder, postingAt, rawQty, finishedQty);
  return mutate(kernel, {
    commandId: `${name}-submit`,
    doctype: "Stock Entry",
    name,
    action: "submit",
    expectedVersion: 1,
    document,
  });
}

test("manufacturing closure keeps partial execution retry-safe and correctable without duplicate progress", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitWorkOrder(kernel);
  await submitReceipt(kernel, "RAW-OPEN", "2026-08-01T07:00:00.000Z", "10", "2");

  const firstDocument = await createManufacture(
    kernel,
    "MFG-PART-1",
    "WO-CLOSURE",
    "2026-08-01T09:00:00.000Z",
    "4",
  );
  const firstSubmit = {
    commandId: "MFG-PART-1-submit",
    doctype: "Stock Entry",
    name: "MFG-PART-1",
    action: "submit",
    expectedVersion: 1,
    document: firstDocument,
  };
  const firstReceipt = await mutate(kernel, firstSubmit);
  const retryReceipt = await mutate(kernel, firstSubmit);
  assert.deepEqual(retryReceipt, firstReceipt);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 6 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Consumption", "RAW"), 4 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Manufacture", "FG"), 1 * Q);

  await submitManufacture(kernel, "MFG-PART-2", "WO-CLOSURE", "2026-08-01T10:00:00.000Z", "5");
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 1 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Consumption", "RAW"), 9 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Manufacture", "FG"), 2 * Q);

  await assert.rejects(
    submitManufacture(kernel, "MFG-EXCESS", "WO-CLOSURE", "2026-08-01T11:00:00.000Z", "2"),
  );
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 1 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2 * Q);

  await mutate(kernel, {
    commandId: "MFG-PART-2-cancel",
    doctype: "Stock Entry",
    name: "MFG-PART-2",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 6 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Consumption", "RAW"), 4 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Manufacture", "FG"), 1 * Q);

  await submitManufacture(kernel, "MFG-CORRECTED", "WO-CLOSURE", "2026-08-01T12:00:00.000Z", "6");
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Consumption", "RAW"), 10 * Q);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-CLOSURE", "Manufacture", "FG"), 2 * Q);
});

test("backdated raw-material receipt makes prior manufacturing valuation auditable and cancellation reverses exact stock", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitWorkOrder(kernel, "WO-BACKDATE");
  await submitReceipt(kernel, "RAW-LATER", "2026-08-02T08:00:00.000Z", "10", "2");
  await submitManufacture(kernel, "MFG-BACKDATE", "WO-BACKDATE", "2026-08-03T08:00:00.000Z", "5");

  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 5 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1 * Q);

  await submitReceipt(kernel, "RAW-BACKDATED", "2026-08-01T08:00:00.000Z", "10", "4");
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 15 * Q);

  const history = await store.getStockLedgerHistory("demo", "RAW", "Raw");
  const audit = auditOutgoingValuation(history, "FIFO");
  assert.equal(audit.mismatch_count, 1);
  assert.notEqual(audit.mismatches[0].delta_minor, 0);

  await mutate(kernel, {
    commandId: "MFG-BACKDATE-cancel",
    doctype: "Stock Entry",
    name: "MFG-BACKDATE",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 20 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-BACKDATE", "Consumption", "RAW"), 0);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-BACKDATE", "Manufacture", "FG"), 0);
});
