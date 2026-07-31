import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const now = () => "2026-07-31T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo", customer: "CUST-1", currency: "USD", items: [],
    warehouses: ["Raw", "WIP", "Finished"], accounts: [],
  });
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "WIP", "demo", { company: "Demo", stock_role: "Kho đang sản xuất", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
  store.seedMaster("Item", "ALU-1", "demo", {
    valuation_method: "FIFO", has_batch_no: 1,
    inventory_mode: "Nhôm cây/lá", measurement_profile: "Nhôm cây/lá", default_color: "THÔ",
  });
  store.seedMaster("Batch", "LOT-1", "demo", { item_code: "ALU-1" });
  store.seedMaster("Aluminium Lot", "LOT-1", "demo", {
    profile: "ALU-1", colour: "THÔ", generation: "MỚI", condition: "Tốt",
    width_m: 6, warehouse: "Raw",
  });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, now) };
}

async function bundle(kernel, name, warehouse, type, qty = "2") {
  return createAndSubmit(kernel, {
    doctype: "Serial and Batch Bundle", name,
    document: {
      item_code: "ALU-1", warehouse, type, posting_at: now(),
      entries: [{ row_id: "1", qty, batch_no: "LOT-1" }],
    },
  });
}

async function stockEntry(kernel, name, purpose, items) {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry", name,
    document: { company: "Demo", posting_at: now(), purpose, items },
  });
}

function aluminiumRow(bundleName, source, target, overrides = {}) {
  return {
    row_id: "1", item_code: "ALU-1", qty: "2", qty_bar: "2",
    length_m: "6", color: "THÔ", valuation_rate: "10",
    ...(source ? { source_warehouse: source } : {}),
    ...(target ? { target_warehouse: target } : {}),
    serial_and_batch_bundle: bundleName,
    ...overrides,
  };
}

async function receive(kernel) {
  await bundle(kernel, "BUNDLE-IN", "Raw", "Inward");
  await stockEntry(kernel, "RECEIVE", "Material Receipt", [aluminiumRow("BUNDLE-IN", undefined, "Raw")]);
}

test("explicit colour and length must match the physical Aluminium Lot", async () => {
  const { kernel } = setup();
  await bundle(kernel, "BUNDLE-IN", "Raw", "Inward");
  await assert.rejects(
    stockEntry(kernel, "BAD-COLOR", "Material Receipt", [
      aluminiumRow("BUNDLE-IN", undefined, "Raw", { color: "SƠN ĐEN" }),
    ]),
    /khai màu.*lô vật lý/i,
  );
});

test("a second transfer follows stock-ledger location instead of stale Aluminium Lot warehouse", async () => {
  const { store, kernel } = setup();
  await receive(kernel);
  await bundle(kernel, "BUNDLE-RAW-WIP", "Raw", "Outward");
  await stockEntry(kernel, "MOVE-RAW-WIP", "Material Transfer", [aluminiumRow("BUNDLE-RAW-WIP", "Raw", "WIP")]);
  await bundle(kernel, "BUNDLE-WIP-FG", "WIP", "Outward");
  await stockEntry(kernel, "MOVE-WIP-FG", "Material Transfer", [aluminiumRow("BUNDLE-WIP-FG", "WIP", "Finished")]);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "Raw", "LOT-1"), 0);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "WIP", "LOT-1"), 0);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "Finished", "LOT-1"), 2_000_000);
});

test("two concurrent issues cannot both consume the same remaining batch", async () => {
  const { store, kernel } = setup();
  await receive(kernel);
  await bundle(kernel, "BUNDLE-ISSUE-A", "Raw", "Outward");
  await bundle(kernel, "BUNDLE-ISSUE-B", "Raw", "Outward");

  const results = await Promise.allSettled([
    stockEntry(kernel, "ISSUE-A", "Material Issue", [aluminiumRow("BUNDLE-ISSUE-A", "Raw", undefined)]),
    stockEntry(kernel, "ISSUE-B", "Material Issue", [aluminiumRow("BUNDLE-ISSUE-B", "Raw", undefined)]),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await store.getTrackedStockBalanceMicros("demo", "ALU-1", "Raw", "LOT-1"), 0);
});
