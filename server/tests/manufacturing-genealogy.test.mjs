import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkOrderGenealogy } from "../dist/packages/clouderp-erpnext/src/index.js";

function workOrder(overrides = {}) {
  return {
    tenant_id: "tenant-a",
    doctype: "Work Order",
    name: "WO-1",
    owner: "planner@example.com",
    docstatus: 1,
    status: "In Process",
    version: 2,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T02:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      production_item: "FG",
      bom_no: "BOM-FG",
      bom_checksum: "checksum-1",
      qty: "10.000000",
      qty_micros: 10_000_000,
      ...overrides,
    },
  };
}

function stockEntry(name, purpose, data, version = 1) {
  return {
    tenant_id: "tenant-a",
    doctype: "Stock Entry",
    name,
    owner: "stock@example.com",
    docstatus: 1,
    status: "Submitted",
    version,
    created_at: "2026-08-03T00:00:00.000Z",
    modified_at: "2026-08-03T01:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      posting_at: "2026-08-03T01:00:00.000Z",
      purpose,
      work_order: "WO-1",
      items: [],
      ...data,
    },
  };
}

function ledger(line_key, item_code, warehouse, actual_qty_micros, extra = {}) {
  return {
    line_key,
    item_code,
    warehouse,
    actual_qty_micros,
    valuation_rate_minor: 250,
    stock_value_difference_minor: actual_qty_micros < 0 ? -2500 : 2500,
    qty_scale: 6,
    currency_scale: 2,
    currency: "VND",
    posting_at: "2026-08-03T01:00:00.000Z",
    ...extra,
  };
}

test("genealogy separates WIP transfer from actual consumption and finished goods", () => {
  const transfer = stockEntry("STE-TRANSFER", "Material Transfer", {
    items: [{ row_id: "R1", item_code: "RM", qty: "5", source_warehouse: "RAW", target_warehouse: "WIP", batch_no: "BATCH-RM" }],
  });
  const manufacture = stockEntry("STE-MAKE", "Manufacture", {
    finished_good_item: "FG",
    finished_good_qty: "2",
    target_warehouse: "FG",
    items: [{ row_id: "R1", item_code: "RM", qty: "5", source_warehouse: "WIP", bom_row_id: "BOM-R1", batch_no: "BATCH-RM" }],
  }, 3);
  const result = buildWorkOrderGenealogy("WO-1", workOrder(), [
    {
      document: transfer,
      stock_entries: [
        ledger("SRC-R1", "RM", "RAW", -5_000_000, { batch_no: "BATCH-RM" }),
        ledger("TGT-R1", "RM", "WIP", 5_000_000, { batch_no: "BATCH-RM" }),
      ],
    },
    {
      document: manufacture,
      stock_entries: [
        ledger("SRC-R1", "RM", "WIP", -5_000_000, { batch_no: "BATCH-RM" }),
        ledger("FINISHED", "FG", "FG", 2_000_000, { batch_no: "BATCH-FG" }),
      ],
    },
  ]);

  assert.equal(result.trace_scope, "WORK_ORDER_GROUP");
  assert.equal(result.material_transfers.length, 2);
  assert.equal(result.consumptions.length, 1);
  assert.equal(result.consumptions[0].role, "Consumption");
  assert.equal(result.consumptions[0].bom_row_id, "BOM-R1");
  assert.equal(result.finished_goods.length, 1);
  assert.equal(result.finished_goods[0].role, "Finished Good");
  assert.equal(result.input_lots[0].batch_no, "BATCH-RM");
  assert.equal(result.input_lots[0].qty, "5.000000");
  assert.equal(result.output_lots[0].batch_no, "BATCH-FG");
  assert.equal(result.output_lots[0].qty, "2.000000");
});

test("genealogy classifies scrap and offcut from manufacturing row semantics", () => {
  const manufacture = stockEntry("STE-RECOVERY", "Manufacture", {
    finished_good_item: "FG",
    finished_good_qty: "1",
    target_warehouse: "FG",
    items: [
      { row_id: "S", item_code: "SCRAP", qty: "1", target_warehouse: "SCRAP", manufacturing_kind: "Scrap", physical_identity_key: "scrap-id" },
      { row_id: "O", item_code: "OFFCUT", qty: "1", target_warehouse: "SCRAP", manufacturing_kind: "Offcut", serial_and_batch_bundle: "BUNDLE-O" },
    ],
  });
  const result = buildWorkOrderGenealogy("WO-1", workOrder(), [{
    document: manufacture,
    stock_entries: [
      ledger("SCRAP-S", "SCRAP", "SCRAP", 1_000_000, { batch_no: "B-S" }),
      ledger("OFFCUT-O", "OFFCUT", "SCRAP", 1_000_000, { batch_no: "B-O" }),
      ledger("FINISHED", "FG", "FG", 1_000_000, { batch_no: "B-FG" }),
    ],
  }]);

  assert.deepEqual(result.recoveries.map((row) => row.role), ["Offcut", "Scrap"]);
  assert.equal(result.recoveries.find((row) => row.role === "Offcut").serial_and_batch_bundle, "BUNDLE-O");
  assert.equal(result.recoveries.find((row) => row.role === "Scrap").physical_identity_key, "scrap-id");
});

test("genealogy reports cancelled related Stock Entries without counting them as effective movement", () => {
  const result = buildWorkOrderGenealogy("WO-1", workOrder(), [], ["STE-OLD-2", "STE-OLD-1", "STE-OLD-1"]);
  assert.deepEqual(result.cancelled_stock_entries, ["STE-OLD-1", "STE-OLD-2"]);
  assert.equal(result.effective_stock_entry_count, 0);
  assert.equal(result.consumptions.length, 0);
});

test("genealogy warns when manufacturing movements are not lot tracked", () => {
  const manufacture = stockEntry("STE-UNTRACKED", "Manufacture", {
    finished_good_item: "FG",
    finished_good_qty: "1",
    target_warehouse: "FG",
    items: [{ row_id: "R", item_code: "RM", qty: "1", source_warehouse: "RAW" }],
  });
  const result = buildWorkOrderGenealogy("WO-1", workOrder(), [{
    document: manufacture,
    stock_entries: [
      ledger("SRC-R", "RM", "RAW", -1_000_000),
      ledger("FINISHED", "FG", "FG", 1_000_000),
    ],
  }]);
  assert.equal(result.warnings.includes("UNTRACKED_INPUT_MATERIALS_PRESENT"), true);
  assert.equal(result.warnings.includes("UNTRACKED_FINISHED_GOODS_PRESENT"), true);
});

test("genealogy uses exact decimal scaling when Work Order has no qty_micros snapshot", () => {
  const result = buildWorkOrderGenealogy("WO-1", workOrder({ qty_micros: undefined, qty: "0.123456" }), []);
  assert.equal(result.target_qty_micros, 123456);
  assert.equal(result.target_qty, "0.123456");
});

test("genealogy fails closed on foreign or non-effective Stock Entry snapshots", () => {
  const wrong = stockEntry("STE-X", "Manufacture", { work_order: "WO-OTHER", finished_good_item: "FG", target_warehouse: "FG" });
  assert.throws(
    () => buildWorkOrderGenealogy("WO-1", workOrder(), [{ document: wrong, stock_entries: [] }]),
    /not an effective entry for Work Order/,
  );
});
