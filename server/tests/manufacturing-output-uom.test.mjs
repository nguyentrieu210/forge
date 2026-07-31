import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit } from "./helpers.mjs";

const NOW = "2026-07-31T09:00:00.000Z";

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "Finished"],
    accounts: [],
  });
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
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

test("Work Order scales BOM materials and operating cost by output stock quantity", async () => {
  const { store, kernel } = setup();
  await createAndSubmit(kernel, {
    doctype: "Bill of Materials",
    name: "BOM-BOX",
    document: {
      company: "Demo",
      item: "FG",
      quantity: "2",
      revision: 1,
      bom_status: "Active",
      effective_from: "2026-01-01",
      output_uom: "Box",
      output_conversion_factor: "10",
      operating_cost: "100",
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
    name: "WO-BOX",
    document: {
      company: "Demo",
      production_item: "FG",
      bom_no: "BOM-BOX",
      qty: "20",
      source_warehouse: "Raw",
      target_warehouse: "Finished",
      planned_start_date: "2026-07-15",
    },
  });

  const bom = await store.getDocument("demo", "Bill of Materials", "BOM-BOX");
  const workOrder = await store.getDocument("demo", "Work Order", "WO-BOX");
  assert.equal(bom.data.output_stock_qty_micros, 20_000_000);
  assert.equal(workOrder.data.manufacturing_snapshot.output_qty_micros, 20_000_000);
  assert.equal(workOrder.data.manufacturing_snapshot.rows[0].required_qty_micros, 5_000_000);
  assert.equal(workOrder.data.required_items[0].required_qty_micros, 5_000_000);
  assert.equal(workOrder.data.operating_cost_minor, 10_000);
});
