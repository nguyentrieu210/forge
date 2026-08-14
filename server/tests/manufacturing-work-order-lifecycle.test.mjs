import test from "node:test";
import assert from "node:assert/strict";
import "./manufacturing-lifecycle-api-boundary.test.mjs";

import { buildWorkOrderLifecycleProjection } from "../dist/packages/clouderp-erpnext/src/manufacturing-work-order-lifecycle.js";

function workOrder(extra = {}, status = "Not Started", docstatus = 1) {
  return {
    tenant_id: "tenant-a",
    doctype: "Work Order",
    name: "WO-1",
    owner: "planner@example.com",
    docstatus,
    status,
    version: 1,
    created_at: "2026-08-13T00:00:00.000Z",
    modified_at: "2026-08-13T00:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      production_item: "FG-1",
      bom_no: "BOM-FG-1",
      qty: "2.000000",
      qty_micros: 2_000_000,
      source_warehouse: "RAW",
      target_warehouse: "FG",
      produced_qty: "0.000000",
      produced_qty_micros: 0,
      production_request: "PR-1",
      production_request_line_key: "SO-ROW-1-SET-1",
      against_sales_order: "SO-1",
      sales_order_row_id: "SO-ROW-1",
      required_items: [
        { row_id: "BOM-A", item_code: "RM-A", required_qty: "1.000000", required_qty_micros: 1_000_000, source_warehouse: "RAW" },
        { row_id: "BOM-B", item_code: "RM-B", required_qty: "2.000000", required_qty_micros: 2_000_000, source_warehouse: "RAW" },
      ],
      ...extra,
    },
  };
}

function stock(name, purpose, items, extra = {}, docstatus = 1) {
  return {
    tenant_id: "tenant-a",
    doctype: "Stock Entry",
    name,
    owner: "store@example.com",
    docstatus,
    status: docstatus === 1 ? "Submitted" : "Cancelled",
    version: 1,
    created_at: "2026-08-13T00:00:00.000Z",
    modified_at: "2026-08-13T00:00:00.000Z",
    children: [],
    data: {
      company: "ACME",
      posting_at: "2026-08-13T00:00:00.000Z",
      purpose,
      work_order: "WO-1",
      items,
      ...extra,
    },
  };
}

test("submitted Work Order starts at RELEASED and preserves Production Request lineage", () => {
  const result = buildWorkOrderLifecycleProjection({ work_order: workOrder(), stock_entries: [] });
  assert.equal(result.canonical_status, "Not Started");
  assert.equal(result.stage, "RELEASED");
  assert.equal(result.release_authority, "PRODUCTION_REQUEST");
  assert.equal(result.production_request, "PR-1");
  assert.equal(result.production_request_line_key, "SO-ROW-1-SET-1");
  assert.equal(result.sales_order, "SO-1");
  assert.equal(result.actions.can_issue_materials, true);
  assert.equal(result.actions.can_manufacture, true);
  assert.equal(result.actions.can_cancel_work_order, true);
});

test("material transfer advances lifecycle without changing canonical Work Order status", () => {
  const result = buildWorkOrderLifecycleProjection({
    work_order: workOrder(),
    stock_entries: [stock("STE-ISSUE", "Material Transfer", [
      { row_id: "I1", bom_row_id: "BOM-A", item_code: "RM-A", qty: "0.500000", qty_micros: 500_000, manufacturing_kind: "Issue" },
    ])],
  });
  assert.equal(result.canonical_status, "Not Started");
  assert.equal(result.stage, "MATERIAL_ISSUED");
  assert.equal(result.material_rows[0].issued_qty_micros, 500_000);
  assert.equal(result.material_rows[0].consumed_qty_micros, 0);
  assert.equal(result.actions.can_cancel_work_order, false);
});

test("Scrap and Offcut recovery do not inflate raw-material consumption", () => {
  const result = buildWorkOrderLifecycleProjection({
    work_order: workOrder({ produced_qty: "0.500000", produced_qty_micros: 500_000 }, "In Process"),
    stock_entries: [stock("STE-MFG", "Manufacture", [
      { row_id: "C1", bom_row_id: "BOM-A", item_code: "RM-A", qty: "0.600000", qty_micros: 600_000, manufacturing_kind: "Consumption" },
      { row_id: "O1", bom_row_id: "BOM-A", item_code: "RM-A", qty: "0.200000", qty_micros: 200_000, manufacturing_kind: "Offcut", target_warehouse: "SCRAP" },
      { row_id: "S1", bom_row_id: "BOM-A", item_code: "RM-A", qty: "0.100000", qty_micros: 100_000, manufacturing_kind: "Scrap", target_warehouse: "SCRAP" },
    ], { finished_good_item: "FG-1", finished_good_qty: "0.500000", finished_good_qty_micros: 500_000 })],
  });
  assert.equal(result.stage, "PARTIAL_FINISHED_GOODS");
  assert.equal(result.material_rows[0].consumed_qty_micros, 600_000);
  assert.equal(result.material_rows[0].remaining_to_consume_micros, 400_000);
});

test("hydrated completed Work Order becomes finished-goods complete", () => {
  const result = buildWorkOrderLifecycleProjection({
    work_order: workOrder({ produced_qty: "2.000000", produced_qty_micros: 2_000_000 }, "Completed"),
    stock_entries: [],
  });
  assert.equal(result.stage, "FINISHED_GOODS_COMPLETE");
  assert.equal(result.remaining_qty_micros, 0);
  assert.equal(result.actions.can_manufacture, false);
});

test("legacy Work Order without material snapshot remains readable", () => {
  const legacy = workOrder({ required_items: undefined, production_request: undefined, production_request_line_key: undefined, against_sales_order: "SO-OLD" });
  const result = buildWorkOrderLifecycleProjection({ work_order: legacy, stock_entries: [] });
  assert.equal(result.release_authority, "LEGACY_SALES_ORDER");
  assert.deepEqual(result.material_rows, []);
  assert.ok(result.warnings.includes("LEGACY_WORK_ORDER_NO_REQUIRED_MATERIAL_SNAPSHOT"));
});
