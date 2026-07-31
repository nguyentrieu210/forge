import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-31T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "WIP", "Finished", "Quarantine", "Scrap", "General"],
    accounts: [],
  });
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "WIP", "demo", { company: "Demo", stock_role: "Kho đang sản xuất", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
  store.seedMaster("Warehouse", "Quarantine", "demo", { company: "Demo", stock_role: "Kho chờ kiểm", is_group: 0 });
  store.seedMaster("Warehouse", "Scrap", "demo", { company: "Demo", stock_role: "Kho phế", is_group: 0 });
  store.seedMaster("Warehouse", "General", "demo", { company: "Demo", stock_role: "Kho chính", is_group: 0 });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function stockEntry(kernel, name, purpose, items, extra = {}) {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: { company: "Demo", posting_at: now(), purpose, items, ...extra },
  });
}

async function bundle(kernel, name, warehouse, type, batchNo, qty = "2") {
  return createAndSubmit(kernel, {
    doctype: "Serial and Batch Bundle",
    name,
    document: {
      item_code: "ALU-1",
      warehouse,
      type,
      posting_at: now(),
      entries: [{ row_id: "1", qty, batch_no: batchNo }],
    },
  });
}

function seedAluminium(store) {
  store.seedMaster("Item", "ALU-1", "demo", {
    valuation_method: "FIFO",
    has_batch_no: 1,
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    default_color: "THÔ",
  });
  store.seedMaster("Batch", "LOT-1", "demo", { item_code: "ALU-1" });
  store.seedMaster("Aluminium Lot", "LOT-1", "demo", {
    profile: "ALU-1",
    colour: "THÔ",
    generation: "MỚI",
    condition: "Tốt",
    width_m: 6,
    warehouse: "Raw",
  });
}

test("Stock Entry snapshots canonical physical identity and warehouse roles", async () => {
  const { store, kernel } = setup();
  seedAluminium(store);
  await bundle(kernel, "BUNDLE-IN", "Raw", "Inward", "LOT-1");
  await stockEntry(kernel, "RECEIVE-ALU", "Material Receipt", [{
    row_id: "1",
    item_code: "ALU-1",
    qty: "2",
    qty_bar: "2",
    length_m: "6",
    color: "THÔ",
    valuation_rate: "10",
    target_warehouse: "Raw",
    serial_and_batch_bundle: "BUNDLE-IN",
  }]);

  const document = await store.getDocument("demo", "Stock Entry", "RECEIVE-ALU");
  const row = document.data.items[0];
  assert.equal(row.inventory_mode, "Nhôm cây/lá");
  assert.equal(row.measurement_profile, "Nhôm cây/lá");
  assert.equal(row.target_warehouse_role, "RAW_MATERIAL");
  assert.equal(row.physical_identity_version, 1);
  assert.equal(row.physical_count_micros, 2_000_000);
  assert.equal(row.length_micros, 6_000_000);
  assert.match(row.physical_identity_key, /LOT-1/);
  assert.deepEqual(row.physical_lot_refs, [{ batch_no: "LOT-1", qty_micros: 2_000_000 }]);
});

test("dimensioned stock is rejected without physical lot lineage", async () => {
  const { store, kernel } = setup();
  seedAluminium(store);
  await assert.rejects(
    stockEntry(kernel, "RECEIVE-NO-LOT", "Material Receipt", [{
      row_id: "1",
      item_code: "ALU-1",
      qty: "2",
      qty_bar: "2",
      length_m: "6",
      color: "THÔ",
      valuation_rate: "10",
      target_warehouse: "Raw",
    }]),
    /phải chọn lô\/bundle vật lý/i,
  );
});

test("warehouse roles reject receipt directly into scrap", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NORMAL", "demo", { valuation_method: "FIFO", inventory_mode: "Hàng thường" });
  await assert.rejects(
    stockEntry(kernel, "RECEIVE-SCRAP", "Material Receipt", [{
      row_id: "1", item_code: "NORMAL", qty: "1", valuation_rate: "1", target_warehouse: "Scrap",
    }]),
    /SCRAP_OFFCUT.*không hợp lệ/i,
  );
});

test("quarantine stock cannot leave without a quality release reference", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Item", "NORMAL", "demo", { valuation_method: "FIFO", inventory_mode: "Hàng thường" });
  await stockEntry(kernel, "RECEIVE-QA", "Material Receipt", [{
    row_id: "1", item_code: "NORMAL", qty: "1", valuation_rate: "1", target_warehouse: "Quarantine",
  }]);
  await assert.rejects(
    stockEntry(kernel, "MOVE-QA", "Material Transfer", [{
      row_id: "1", item_code: "NORMAL", qty: "1", source_warehouse: "Quarantine", target_warehouse: "Finished",
    }]),
    /quality_release_reference/i,
  );
  await stockEntry(kernel, "MOVE-QA-RELEASED", "Material Transfer", [{
    row_id: "1", item_code: "NORMAL", qty: "1", source_warehouse: "Quarantine", target_warehouse: "Finished",
  }], { quality_release_reference: "QI-0001" });
  assert.equal(await store.getStockBalanceMicros("demo", "NORMAL", "Finished"), 1_000_000);
});

test("tracked transfer preserves physical lineage and cancel reverses exact stock rows", async () => {
  const { store, kernel } = setup();
  seedAluminium(store);
  await bundle(kernel, "BUNDLE-IN", "Raw", "Inward", "LOT-1");
  await stockEntry(kernel, "RECEIVE-ALU", "Material Receipt", [{
    row_id: "1",
    item_code: "ALU-1",
    qty: "2",
    qty_bar: "2",
    length_m: "6",
    color: "THÔ",
    valuation_rate: "10",
    target_warehouse: "Raw",
    serial_and_batch_bundle: "BUNDLE-IN",
  }]);
  await bundle(kernel, "BUNDLE-OUT", "Raw", "Outward", "LOT-1");
  await stockEntry(kernel, "MOVE-ALU", "Material Transfer", [{
    row_id: "1",
    item_code: "ALU-1",
    qty: "2",
    qty_bar: "2",
    length_m: "6",
    color: "THÔ",
    source_warehouse: "Raw",
    target_warehouse: "WIP",
    serial_and_batch_bundle: "BUNDLE-OUT",
  }]);

  const moved = await store.getDocument("demo", "Stock Entry", "MOVE-ALU");
  assert.equal(moved.data.items[0].source_warehouse_role, "RAW_MATERIAL");
  assert.equal(moved.data.items[0].target_warehouse_role, "WIP");
  assert.match(moved.data.items[0].physical_identity_key, /LOT-1/);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "Raw", "LOT-1"), 0);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "WIP", "LOT-1"), 2_000_000);

  await mutate(kernel, {
    commandId: "MOVE-ALU-cancel",
    doctype: "Stock Entry",
    name: "MOVE-ALU",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "Raw", "LOT-1"), 2_000_000);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "WIP", "LOT-1"), 0);
});
