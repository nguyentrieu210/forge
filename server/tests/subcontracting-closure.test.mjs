import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../dist/packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../dist/packages/clouderp-erpnext/src/index.js";
import { DocumentKernel, InMemoryMutationStore } from "../dist/packages/document-kernel/src/index.js";
import { createAndSubmit, mutate } from "./helpers.mjs";

const NOW = "2026-10-02T09:00:00.000Z";
const Q = 1_000_000;

function setup() {
  const store = new InMemoryMutationStore();
  store.seedO2CMasters({
    company: "Demo",
    customer: "CUST-1",
    currency: "USD",
    items: [],
    warehouses: ["Raw", "Supplier", "Finished"],
    accounts: ["Stock", "SRBNB"],
  });
  store.seedMaster("Supplier", "SUP-1");
  store.seedMaster("Warehouse", "Raw", "demo", { company: "Demo", stock_role: "Kho nguyên vật liệu", is_group: 0 });
  store.seedMaster("Warehouse", "Supplier", "demo", { company: "Demo", stock_role: "Kho chính", is_group: 0 });
  store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", stock_role: "Kho thành phẩm", is_group: 0 });
  store.seedMaster("Item", "RAW", "demo", { is_stock_item: 1, stock_uom: "Nos", valuation_method: "FIFO" });
  store.seedMaster("Item", "FG", "demo", { is_stock_item: 1, stock_uom: "Nos", valuation_method: "FIFO" });
  store.seedMaster("Item", "SUB-SERVICE", "demo", { is_stock_item: 0, stock_uom: "Nos" });

  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => NOW) };
}

async function submitBom(kernel) {
  return createAndSubmit(kernel, {
    doctype: "Bill of Materials",
    name: "BOM-SUB",
    document: {
      company: "Demo",
      item: "FG",
      quantity: "1",
      revision: 1,
      bom_status: "Active",
      effective_from: "2026-01-01",
      items: [{
        row_id: "RAW-1",
        item_code: "RAW",
        qty: "2",
        qty_basis: "Cố định",
        source_warehouse: "Raw",
      }],
    },
  });
}

async function submitPo(kernel) {
  return createAndSubmit(kernel, {
    doctype: "Purchase Order",
    name: "PO-SUB",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-10-02",
      is_subcontracted: true,
      receipt_match_required: true,
      items: [{ row_id: "SERVICE-1", item_code: "SUB-SERVICE", qty: "2", rate: "5" }],
      taxes: [],
    },
  });
}

async function submitOrder(kernel) {
  return createAndSubmit(kernel, {
    doctype: "Subcontracting Order",
    name: "SCO-1",
    document: {
      purchase_order: "PO-SUB",
      purchase_order_row_id: "SERVICE-1",
      service_item: "SUB-SERVICE",
      production_item: "FG",
      bom_no: "BOM-SUB",
      qty: "2",
      transaction_date: "2026-10-02",
      supplier_warehouse: "Supplier",
      target_warehouse: "Finished",
    },
  });
}

async function transfer(kernel, name, qty) {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: NOW,
      purpose: "Material Transfer",
      subcontracting_order: "SCO-1",
      items: [{ row_id: "RAW-XFER", bom_row_id: "RAW-1", item_code: "RAW", qty: String(qty) }],
    },
  });
}

async function receipt(kernel, name, qty) {
  return createAndSubmit(kernel, {
    doctype: "Subcontracting Receipt",
    name,
    document: {
      subcontracting_order: "SCO-1",
      posting_at: NOW,
      received_qty: String(qty),
      stock_account: "Stock",
      stock_received_but_not_billed: "SRBNB",
    },
  });
}

test("subcontracting closes material-send -> consume -> finished-good receipt with exact correction", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitPo(kernel);
  await submitOrder(kernel);

  const order = await store.getDocument("demo", "Subcontracting Order", "SCO-1");
  assert.equal(order.docstatus, 1);
  assert.equal(order.data.service_amount_minor, 1000);
  assert.equal(order.data.supplied_items[0].required_qty_micros, 4 * Q);

  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "RAW-OPEN",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:00:00.000Z",
      purpose: "Material Receipt",
      items: [{ row_id: "OPEN", item_code: "RAW", qty: "5", valuation_rate: "10", target_warehouse: "Raw" }],
    },
  });

  await assert.rejects(receipt(kernel, "SCR-BEFORE-XFER", 1), /Insufficient material transferred/i);

  await transfer(kernel, "SUB-XFER", 4);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 1 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 4 * Q);
  const sent = await store.getDocument("demo", "Stock Entry", "SUB-XFER");
  assert.equal(sent.data.subcontracting_order, "SCO-1");
  assert.equal(sent.data.items[0].bom_row_id, "RAW-1");

  await assert.rejects(transfer(kernel, "SUB-XFER-OVER", "0.000001"), /exceeds Subcontracting Order requirement/i);

  await receipt(kernel, "SCR-1", 1);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 2 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1 * Q);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Receipt", "SUB-SERVICE"), 1 * Q);

  const first = await store.getDocument("demo", "Subcontracting Receipt", "SCR-1");
  assert.equal(first.data.material_cost_minor, 2000);
  assert.equal(first.data.service_cost_minor, 500);
  assert.equal(first.data.finished_good_value_minor, 2500);

  const snapshotAfterFirst = store.snapshot();
  const firstGl = snapshotAfterFirst.gl_entries.filter((line) => ["SERVICE-STOCK", "SERVICE-SRBNB"].includes(line.line_key));
  assert.equal(firstGl.reduce((sum, line) => sum + line.debit_minor, 0), 500);
  assert.equal(firstGl.reduce((sum, line) => sum + line.credit_minor, 0), 500);

  await receipt(kernel, "SCR-2", 1);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 2 * Q);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Receipt", "SUB-SERVICE"), 2 * Q);

  await assert.rejects(receipt(kernel, "SCR-OVER", "0.000001"), /exceeds Subcontracting Order quantity/i);

  await mutate(kernel, {
    commandId: "SCR-2-cancel",
    doctype: "Subcontracting Receipt",
    name: "SCR-2",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 2 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1 * Q);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Receipt", "SUB-SERVICE"), 1 * Q);

  await assert.rejects(
    mutate(kernel, {
      commandId: "SUB-XFER-cancel-too-early",
      doctype: "Stock Entry",
      name: "SUB-XFER",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    /active Subcontracting Receipt consumed/i,
  );

  await mutate(kernel, {
    commandId: "SCR-1-cancel",
    doctype: "Subcontracting Receipt",
    name: "SCR-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  await mutate(kernel, {
    commandId: "SUB-XFER-cancel",
    doctype: "Stock Entry",
    name: "SUB-XFER",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 5 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);

  await mutate(kernel, {
    commandId: "SCO-1-cancel",
    doctype: "Subcontracting Order",
    name: "SCO-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getDocument("demo", "Subcontracting Order", "SCO-1")).docstatus, 2);
});

test("subcontracting receipt cannot be cancelled below matched AP billing quantity", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitPo(kernel);
  await submitOrder(kernel);
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "RAW-OPEN",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:00:00.000Z",
      purpose: "Material Receipt",
      items: [{ row_id: "OPEN", item_code: "RAW", qty: "4", valuation_rate: "10", target_warehouse: "Raw" }],
    },
  });
  await transfer(kernel, "SUB-XFER", 4);
  await receipt(kernel, "SCR-1", 1);

  await createAndSubmit(kernel, {
    doctype: "Purchase Invoice",
    name: "PI-SUB",
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: NOW,
      against_purchase_order: "PO-SUB",
      credit_to: "SRBNB",
      items: [{ row_id: "SERVICE-1", item_code: "SUB-SERVICE", qty: "1", rate: "5", expense_account: "SRBNB" }],
      taxes: [],
    },
  });
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Billing", "SUB-SERVICE"), 1 * Q);

  await assert.rejects(
    mutate(kernel, {
      commandId: "SCR-1-cancel-blocked",
      doctype: "Subcontracting Receipt",
      name: "SCR-1",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    /matched Purchase Invoice quantity depends on it/i,
  );
});
