import test from "node:test";
import assert from "node:assert/strict";
import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import {
  BillOfMaterialsController,
  PhysicalStockEntryController,
  WorkOrderController,
  registerErpNextCoreControllers,
} from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const now = () => "2026-07-31T09:00:00.000Z";

function baseRegistry() {
  return registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry()));
}

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
  store.seedMaster("Item", "RAW", "demo", { valuation_method: "FIFO", standard_rate: "2", stock_uom: "Nos" });
  store.seedMaster("Item", "FG", "demo", { valuation_method: "FIFO", standard_rate: "5", stock_uom: "Nos" });

  const legacyRegistry = baseRegistry()
    .register(new BillOfMaterialsController())
    .register(new WorkOrderController())
    .register(new PhysicalStockEntryController());
  const currentRegistry = registerErpNextCoreControllers(baseRegistry());
  return {
    store,
    legacyKernel: new DocumentKernel(legacyRegistry, store, undefined, now),
    currentKernel: new DocumentKernel(currentRegistry, store, undefined, now),
  };
}

async function createLegacyWorkOrder(kernel) {
  await createAndSubmit(kernel, {
    doctype: "Bill of Materials",
    name: "BOM-LEGACY",
    document: {
      company: "Demo",
      item: "FG",
      quantity: "1",
      operating_cost: "0",
      items: [{ row_id: "RAW-1", item_code: "RAW", qty: "2", source_warehouse: "Raw" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Work Order",
    name: "WO-LEGACY",
    document: {
      company: "Demo",
      production_item: "FG",
      bom_no: "BOM-LEGACY",
      qty: "2",
      source_warehouse: "Raw",
      target_warehouse: "Finished",
    },
  });
}

test("submitted pre-Slice-C Work Orders keep their legacy manufacture and cancel path", async () => {
  const { store, legacyKernel, currentKernel } = setup();
  await createLegacyWorkOrder(legacyKernel);
  const legacy = await store.getDocument("demo", "Work Order", "WO-LEGACY");
  assert.equal(legacy.data.manufacturing_snapshot, undefined);
  assert.equal(legacy.data.bom_checksum, undefined);

  store.seedStock({ itemCode: "RAW", warehouse: "Raw", qty: "4.000000", valuationRate: "2.00" });
  await createAndSubmit(currentKernel, {
    doctype: "Stock Entry",
    name: "MFG-LEGACY",
    document: {
      company: "Demo",
      posting_at: now(),
      purpose: "Manufacture",
      work_order: "WO-LEGACY",
      source_warehouse: "Raw",
      finished_good_item: "FG",
      finished_good_qty: "2",
      target_warehouse: "Finished",
      items: [{ row_id: "RAW-1", item_code: "RAW", qty: "4", source_warehouse: "Raw" }],
    },
  });

  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2_000_000);
  const posted = await store.getDocument("demo", "Stock Entry", "MFG-LEGACY");
  assert.equal(posted.data.items[0].bom_row_id, undefined);
  assert.equal(posted.data.items[0].work_order_bom_checksum, undefined);

  await mutate(currentKernel, {
    commandId: "MFG-LEGACY-cancel",
    doctype: "Stock Entry",
    name: "MFG-LEGACY",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 4_000_000);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);
});
