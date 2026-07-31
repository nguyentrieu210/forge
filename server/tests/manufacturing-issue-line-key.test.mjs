import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-07-31T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "WIP", "Finished"],
    accounts: [],
  });
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "WIP", "demo", { company: "Demo", stock_role: "Kho đang sản xuất", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
  for (const [itemCode, stage, supply] of [
    ["RAW", "Nguyên vật liệu", "Mua ngoài"],
    ["FG", "Thành phẩm", "Tự sản xuất"],
  ]) {
    store.seedMaster("Item", itemCode, "demo", {
      item_nature: "Hàng tồn kho",
      material_stage: stage,
      supply_type: supply,
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
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => NOW) };
}

test("split Material Transfer rows keep unique append-only progress keys", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Bill of Materials",
    name: "BOM-SPLIT-ISSUE",
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
  await createAndSubmit(kernel, {
    doctype: "Work Order",
    name: "WO-SPLIT-ISSUE",
    document: {
      company: "Demo",
      production_item: "FG",
      bom_no: "BOM-SPLIT-ISSUE",
      qty: "2",
      source_warehouse: "Raw",
      wip_warehouse: "WIP",
      target_warehouse: "Finished",
      planned_start_date: "2026-07-15",
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "RAW-SPLIT-OPEN",
    document: {
      company: "Demo",
      posting_at: NOW,
      purpose: "Material Receipt",
      items: [{ row_id: "OPEN", item_code: "RAW", qty: "10", valuation_rate: "2", target_warehouse: "Raw" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "ISSUE-SPLIT",
    document: {
      company: "Demo",
      posting_at: NOW,
      purpose: "Material Transfer",
      work_order: "WO-SPLIT-ISSUE",
      items: [
        { row_id: "ISSUE-A", item_code: "RAW", qty: "2", source_warehouse: "Raw", target_warehouse: "WIP", bom_row_id: "RAW-1", manufacturing_kind: "Issue" },
        { row_id: "ISSUE-B", item_code: "RAW", qty: "2", source_warehouse: "Raw", target_warehouse: "WIP", bom_row_id: "RAW-1", manufacturing_kind: "Issue" },
      ],
    },
  });

  const issueEntries = store.snapshot().manufacturing_entries
    .filter((entry) => entry.work_order === "WO-SPLIT-ISSUE" && entry.kind === "Material Transfer" && entry.qty_micros > 0);
  assert.deepEqual(issueEntries.map((entry) => entry.line_key).sort(), [
    "ISSUE-RAW-1-ISSUE-A",
    "ISSUE-RAW-1-ISSUE-B",
  ]);
  assert.equal(new Set(issueEntries.map((entry) => entry.line_key)).size, issueEntries.length);
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-SPLIT-ISSUE", "Material Transfer", "RAW"), 4_000_000);

  await mutate(kernel, {
    commandId: "ISSUE-SPLIT-cancel",
    doctype: "Stock Entry",
    name: "ISSUE-SPLIT",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getManufacturedQuantityMicros("demo", "WO-SPLIT-ISSUE", "Material Transfer", "RAW"), 0);
});
