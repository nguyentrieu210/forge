import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-07-31T09:00:00.000Z";
const now = () => NOW;

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
  for (const itemCode of ["RAW", "FG", "A", "B"]) {
    store.seedMaster("Item", itemCode, "demo", {
      item_nature: "Hàng tồn kho",
      material_stage: itemCode === "RAW" ? "Nguyên vật liệu" : "Thành phẩm",
      supply_type: itemCode === "RAW" ? "Mua ngoài" : "Tự sản xuất",
      is_stock_item: 1,
      include_item_in_manufacturing: 1,
      stock_uom: "Nos",
      valuation_method: "FIFO",
      standard_rate: "2.00",
    });
  }
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function submitBom(kernel, name, options = {}) {
  const {
    item = "FG",
    revision = 1,
    effectiveFrom = "2026-01-01",
    effectiveTo,
    rows = [{ row_id: "RAW-1", item_code: "RAW", qty: "5", qty_basis: "Cố định" }],
  } = options;
  return createAndSubmit(kernel, {
    doctype: "Bill of Materials",
    name,
    document: {
      company: "Demo",
      item,
      quantity: "1",
      revision,
      bom_status: "Active",
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      output_uom: "Nos",
      items: rows.map((row) => ({
        uom: "Nos",
        conversion_factor: "1",
        source_warehouse: "Raw",
        ...row,
      })),
    },
  });
}

async function submitWorkOrder(kernel, name, options = {}) {
  const {
    item = "FG",
    bomNo,
    qty = "2",
    plannedStart = "2026-07-15",
    width,
    height,
    leafCount,
  } = options;
  return createAndSubmit(kernel, {
    doctype: "Work Order",
    name,
    document: {
      company: "Demo",
      production_item: item,
      ...(bomNo ? { bom_no: bomNo } : {}),
      qty,
      source_warehouse: "Raw",
      wip_warehouse: "WIP",
      target_warehouse: "Finished",
      planned_start_date: plannedStart,
      ...(width ? { width_m: width } : {}),
      ...(height ? { height_m: height } : {}),
      ...(leafCount ? { leaf_count: leafCount } : {}),
    },
  });
}

async function submitMaterialReceipt(kernel, name, qty = "10", valuationRate = "2") {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: NOW,
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

async function submitMaterialTransfer(kernel, name, workOrder, qty = "4") {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: NOW,
      purpose: "Material Transfer",
      work_order: workOrder,
      items: [{
        row_id: "ISSUE-1",
        item_code: "RAW",
        qty,
        source_warehouse: "Raw",
        target_warehouse: "WIP",
        bom_row_id: "RAW-1",
        manufacturing_kind: "Issue",
      }],
    },
  });
}

async function submitManufacture(kernel, name, workOrder, items, finishedQty = "2") {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: NOW,
      purpose: "Manufacture",
      work_order: workOrder,
      finished_good_item: "FG",
      finished_good_qty: finishedQty,
      target_warehouse: "Finished",
      items,
    },
  });
}

function consumptionRow(rowId, qty, extra = {}) {
  return {
    row_id: rowId,
    item_code: "RAW",
    qty,
    source_warehouse: "Raw",
    bom_row_id: "RAW-1",
    manufacturing_kind: "Consumption",
    ...extra,
  };
}

test("Work Order selects the effective BOM revision and freezes quantity-basis rows", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1", {
    revision: 1,
    effectiveFrom: "2026-01-01",
    rows: [{ row_id: "RAW-WIDTH", item_code: "RAW", qty: "2", qty_basis: "Theo chiều rộng" }],
  });
  await submitWorkOrder(kernel, "WO-WIDTH", { qty: "2", width: "3", plannedStart: "2026-05-10" });

  const workOrder = await store.getDocument("demo", "Work Order", "WO-WIDTH");
  assert.equal(workOrder.data.bom_no, "BOM-FG-R1");
  assert.equal(workOrder.data.bom_revision, 1);
  assert.match(workOrder.data.bom_checksum, /^[0-9a-f]{64}$/);
  assert.equal(workOrder.data.manufacturing_snapshot.rows[0].required_qty_micros, 12_000_000);
  assert.equal(workOrder.data.required_items[0].required_qty_micros, 12_000_000);
});

test("active BOM revisions cannot overlap and circular BOMs are rejected", async () => {
  const { kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1", { revision: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" });
  await assert.rejects(
    submitBom(kernel, "BOM-FG-R2-BAD", { revision: 2, effectiveFrom: "2026-06-15" }),
    /overlaps the effective interval/i,
  );

  await submitBom(kernel, "BOM-A-R1", {
    item: "A",
    revision: 1,
    rows: [{ row_id: "B-1", item_code: "B", qty: "1", qty_basis: "Cố định" }],
  });
  await assert.rejects(
    submitBom(kernel, "BOM-B-R1", {
      item: "B",
      revision: 1,
      rows: [{ row_id: "A-1", item_code: "A", qty: "1", qty_basis: "Cố định" }],
    }),
    /circular manufacturing dependency/i,
  );
});

test("Work Order snapshot remains on its effective revision after a later revision is activated", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1", { revision: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" });
  await submitBom(kernel, "BOM-FG-R2", {
    revision: 2,
    effectiveFrom: "2026-07-01",
    rows: [{ row_id: "RAW-1", item_code: "RAW", qty: "7", qty_basis: "Cố định" }],
  });
  await submitWorkOrder(kernel, "WO-MAY", { plannedStart: "2026-05-15" });
  await submitWorkOrder(kernel, "WO-JULY", { plannedStart: "2026-07-15" });

  const may = await store.getDocument("demo", "Work Order", "WO-MAY");
  const july = await store.getDocument("demo", "Work Order", "WO-JULY");
  assert.equal(may.data.bom_revision, 1);
  assert.equal(may.data.manufacturing_snapshot.rows[0].required_qty_micros, 10_000_000);
  assert.equal(july.data.bom_revision, 2);
  assert.equal(july.data.manufacturing_snapshot.rows[0].required_qty_micros, 14_000_000);
  assert.notEqual(may.data.bom_checksum, july.data.bom_checksum);
});

test("split lines cannot bypass the Work Order BOM-row cap", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1");
  await submitWorkOrder(kernel, "WO-CAP", { bomNo: "BOM-FG-R1" });
  store.seedStock({ itemCode: "RAW", warehouse: "Raw", qty: "11.000000", valuationRate: "2.00" });

  await assert.rejects(
    submitManufacture(kernel, "MFG-OVER", "WO-CAP", [
      consumptionRow("C-1", "6"),
      consumptionRow("C-2", "5"),
    ]),
    /exceeds the Work Order snapshot|vượt định mức/i,
  );
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 11_000_000);
});

test("Material Transfer issue progress and stock reverse exactly on cancel", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1");
  await submitWorkOrder(kernel, "WO-ISSUE", { bomNo: "BOM-FG-R1" });
  await submitMaterialReceipt(kernel, "RAW-ISSUE-OPEN");

  await submitMaterialTransfer(kernel, "ISSUE-WIP", "WO-ISSUE", "4");
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 6_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "WIP"), 4_000_000);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-ISSUE", "Material Transfer", "RAW"), 4_000_000);

  await mutate(kernel, {
    commandId: "ISSUE-WIP-cancel",
    doctype: "Stock Entry",
    name: "ISSUE-WIP",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 10_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "WIP"), 0);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-ISSUE", "Material Transfer", "RAW"), 0);

  await mutate(kernel, {
    commandId: "WO-ISSUE-cancel",
    doctype: "Work Order",
    name: "WO-ISSUE",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getDocument("demo", "Work Order", "WO-ISSUE")).docstatus, 2);
});

test("offcut value is retained once, finished value is corrected, and cancel reverses exactly", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1");
  await submitWorkOrder(kernel, "WO-OFFCUT", { bomNo: "BOM-FG-R1" });
  await submitMaterialReceipt(kernel, "RAW-OFFCUT-OPEN");
  const before = await store.getTrackedStockState("demo", "RAW", "Raw");
  assert.equal(before.stock_value_minor, 2_000);

  await submitManufacture(kernel, "MFG-OFFCUT", "WO-OFFCUT", [
    consumptionRow("C-1", "8"),
    consumptionRow("O-1", "2", {
      target_warehouse: "Scrap",
      manufacturing_kind: "Offcut",
    }),
  ]);

  const raw = await store.getTrackedStockState("demo", "RAW", "Raw");
  const scrap = await store.getTrackedStockState("demo", "RAW", "Scrap");
  const finished = await store.getTrackedStockState("demo", "FG", "Finished");
  assert.equal(raw.qty_micros, 0);
  assert.equal(scrap.qty_micros, 2_000_000);
  assert.equal(finished.qty_micros, 2_000_000);
  assert.equal(scrap.stock_value_minor + finished.stock_value_minor, before.stock_value_minor);
  assert.equal(scrap.stock_value_minor, 400);
  assert.equal(finished.stock_value_minor, 1_600);

  const document = await store.getDocument("demo", "Stock Entry", "MFG-OFFCUT");
  assert.equal(document.data.items[1].manufacturing_kind, "Offcut");
  assert.equal(document.data.items[1].target_warehouse_role, "SCRAP_OFFCUT");
  assert.equal(document.data.items[1].work_order_bom_checksum, document.data.items[0].work_order_bom_checksum);

  await mutate(kernel, {
    commandId: "MFG-OFFCUT-cancel",
    doctype: "Stock Entry",
    name: "MFG-OFFCUT",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  const restoredRaw = await store.getTrackedStockState("demo", "RAW", "Raw");
  const restoredScrap = await store.getTrackedStockState("demo", "RAW", "Scrap");
  const restoredFinished = await store.getTrackedStockState("demo", "FG", "Finished");
  assert.equal(restoredRaw.qty_micros, 10_000_000);
  assert.equal(restoredRaw.stock_value_minor, before.stock_value_minor);
  assert.equal(restoredScrap.qty_micros, 0);
  assert.equal(restoredScrap.stock_value_minor, 0);
  assert.equal(restoredFinished.qty_micros, 0);
  assert.equal(restoredFinished.stock_value_minor, 0);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-OFFCUT", "Consumption", "RAW"), 0);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-OFFCUT", "Manufacture", "FG"), 0);
});

test("concurrent manufacture commands cannot both consume the remaining Work Order quantity", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel, "BOM-FG-R1");
  await submitWorkOrder(kernel, "WO-RACE", { bomNo: "BOM-FG-R1" });
  store.seedStock({ itemCode: "RAW", warehouse: "Raw", qty: "10.000000", valuationRate: "2.00" });

  const results = await Promise.allSettled([
    submitManufacture(kernel, "MFG-RACE-A", "WO-RACE", [consumptionRow("A-1", "10")]),
    submitManufacture(kernel, "MFG-RACE-B", "WO-RACE", [consumptionRow("B-1", "10")]),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2_000_000);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-RACE", "Manufacture", "FG"), 2_000_000);
});
