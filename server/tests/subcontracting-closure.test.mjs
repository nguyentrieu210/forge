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

function setup(authorizer) {
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
  return { store, kernel: new DocumentKernel(registry, store, authorizer, () => NOW) };
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

async function submitPo(kernel, qty = "2") {
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
      items: [{ row_id: "SERVICE-1", item_code: "SUB-SERVICE", qty, rate: "5" }],
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
    /active Subcontracting Receipt or material return depends/i,
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

test("supplier leftover returns preserve per-order material entitlement and exact reversals", async () => {
  const { store, kernel } = setup();
  await submitBom(kernel);
  await submitPo(kernel);
  await submitOrder(kernel);
  await createAndSubmit(kernel, {
    doctype: "Stock Entry", name: "RETURN-OPEN",
    document: { company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
      items: [{ row_id: "OPEN", item_code: "RAW", qty: "5", valuation_rate: "10", target_warehouse: "Raw" }] },
  });
  await transfer(kernel, "RETURN-XFER", 4);
  await receipt(kernel, "RETURN-SCR", 1);
  const materialReturn = (name, qty) => createAndSubmit(kernel, {
    doctype: "Stock Entry", name,
    document: { company: "Demo", posting_at: NOW, purpose: "Material Transfer",
      subcontracting_order: "SCO-1", subcontracting_material_return: true,
      items: [{ row_id: "RETURN", bom_row_id: "RAW-1", item_code: "RAW", qty: String(qty),
        source_warehouse: "Finished", target_warehouse: "Supplier" }] },
  });
  await assert.rejects(materialReturn("RETURN-OVER", 3), /exceeds unconsumed supplier material|Insufficient valuated stock/i);
  await materialReturn("RETURN-1", 2);
  const returned = await store.getDocument("demo", "Stock Entry", "RETURN-1");
  assert.equal(returned.data.items[0].source_warehouse, "Supplier");
  assert.equal(returned.data.items[0].target_warehouse, "Raw");
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 3 * Q);
  const ledger = await store.getVoucherStockEntries("demo", "Stock Entry", "RETURN-1", returned.version);
  assert.equal(ledger.length, 2);
  assert.equal(ledger.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 0);
  await assert.rejects(receipt(kernel, "RETURN-SCR-UNSUPPLIED", 1), /Insufficient material transferred/i);
  await assert.rejects(mutate(kernel, { commandId: "RETURN-CANCEL-1", doctype: "Stock Entry", name: "RETURN-XFER", action: "cancel", expectedVersion: 2, document: {} }), /Receipt or material return depends/i);

  // Returning leftovers releases the BOM ceiling for a replacement supply.
  await transfer(kernel, "RETURN-REPLACEMENT", 2);
  await assert.rejects(mutate(kernel, { commandId: "RETURN-CANCEL-2", doctype: "Stock Entry", name: "RETURN-1", action: "cancel", expectedVersion: 2, document: {} }), /replacement transfer depends/i);
  await receipt(kernel, "RETURN-SCR-2", 1);
  await assert.rejects(materialReturn("RETURN-CONSUMED", 1), /exceeds unconsumed supplier material|Insufficient valuated stock/i);
  await mutate(kernel, { commandId: "RETURN-CANCEL-3", doctype: "Subcontracting Receipt", name: "RETURN-SCR-2", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "RETURN-CANCEL-4", doctype: "Stock Entry", name: "RETURN-REPLACEMENT", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "RETURN-CANCEL-5", doctype: "Stock Entry", name: "RETURN-1", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 2 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), Q);
  await mutate(kernel, { commandId: "RETURN-CANCEL-6", doctype: "Subcontracting Receipt", name: "RETURN-SCR", action: "cancel", expectedVersion: 2, document: {} });
  await mutate(kernel, { commandId: "RETURN-CANCEL-7", doctype: "Stock Entry", name: "RETURN-XFER", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Raw"), 5 * Q);
});

test("supplier pooled stock cannot fund returns against a different order's material entitlement", async () => {
  const { store, kernel } = setup({ assert() {} });
  await submitBom(kernel);
  await submitPo(kernel);
  await submitOrder(kernel);
  for (const warehouse of ["Raw", "Supplier"]) {
    await createAndSubmit(kernel, { doctype: "Stock Entry", name: `POOL-${warehouse}`,
      document: { company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
        items: [{ row_id: "POOL", item_code: "RAW", qty: "10", valuation_rate: "10", target_warehouse: warehouse }] } });
  }
  await transfer(kernel, "POOL-XFER", 4);
  await receipt(kernel, "POOL-SCR", 1);
  const command = { doctype: "Stock Entry", name: "POOL-RETURN",
    document: { company: "Demo", posting_at: NOW, purpose: "Material Transfer",
      subcontracting_order: "SCO-1", subcontracting_material_return: true,
      items: [{ row_id: "RETURN", bom_row_id: "RAW-1", item_code: "RAW", qty: "3" }] } };
  await mutate(kernel, { ...command, commandId: "POOL-return-create", action: "create", expectedVersion: null });
  await assert.rejects(mutate(kernel, { ...command, commandId: "POOL-return-submit", action: "submit", expectedVersion: 1 }), /exceeds unconsumed supplier material/i);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 12 * Q);
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "POOL-FG-ISSUE",
    document: { company: "Demo", posting_at: NOW, purpose: "Material Issue",
      items: [{ row_id: "FG-ISSUE", item_code: "FG", qty: "1", source_warehouse: "Finished" }] } });
  await assert.rejects(mutate(kernel, { doctype: "Subcontracting Receipt", name: "POOL-SCR", commandId: "POOL-cancel-consumed",
    action: "cancel", expectedVersion: 2, document: {} }), /Insufficient stock/i);
  assert.equal((await store.getDocument("demo", "Subcontracting Receipt", "POOL-SCR")).docstatus, 1);
  store.setPeriodLock("Demo", "2026-10-02");
  await assert.rejects(mutate(kernel, { doctype: "Subcontracting Receipt", name: "POOL-SCR", commandId: "POOL-cancel-locked",
    action: "cancel", expectedVersion: 2, document: {}, actor: { user_id: "clerk", roles: ["Stock User"] } }), /Posting date.*locked/i);
  assert.equal((await store.getDocument("demo", "Subcontracting Receipt", "POOL-SCR")).docstatus, 1);
});

test("commit rejects competing subcontract supply, return and receipt plans against pooled stock", async () => {
  const { makeCommand } = await import("../dist/packages/test-harness/src/index.js");
  const { store, kernel } = setup();
  await submitBom(kernel); await submitPo(kernel, "4"); await submitOrder(kernel);
  for (const warehouse of ["Raw", "Supplier"]) {
    await createAndSubmit(kernel, { doctype: "Stock Entry", name: `RACE-POOL-${warehouse}`,
      document: { company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
        items: [{ row_id: "OPEN", item_code: "RAW", qty: "10", valuation_rate: "10", target_warehouse: warehouse }] } });
  }
  const prepare = async (doctype, name, document) => {
    await mutate(kernel, { doctype, name, document, commandId: `${name}-create`, action: "create", expectedVersion: null });
    return kernel.prepare(await makeCommand({ doctype, name, document, commandId: `${name}-submit`, action: "submit", expectedVersion: 1 }), store);
  };
  const supplyData = (qty, returned = false) => ({ company: "Demo", posting_at: NOW, purpose: "Material Transfer",
    subcontracting_order: "SCO-1", subcontracting_material_return: returned,
    items: [{ row_id: "RAW", bom_row_id: "RAW-1", item_code: "RAW", qty: String(qty) }] });
  const supplyA = await prepare("Stock Entry", "RACE-SUPPLY-A", supplyData(3));
  const supplyB = await prepare("Stock Entry", "RACE-SUPPLY-B", supplyData(3));
  await store.execute(supplyA);
  await assert.rejects(store.execute(supplyB), /material entitlement changed/i);
  assert.equal((await store.getDocument("demo", "Stock Entry", "RACE-SUPPLY-B")).docstatus, 0);
  await transfer(kernel, "RACE-SUPPLY-REST", 1);
  const returnA = await prepare("Stock Entry", "RACE-RETURN-A", supplyData(3, true));
  const returnB = await prepare("Stock Entry", "RACE-RETURN-B", supplyData(3, true));
  await store.execute(returnA);
  await assert.rejects(store.execute(returnB), /material entitlement changed/i);
  await mutate(kernel, { commandId: "RACE-return-cancel", doctype: "Stock Entry", name: "RACE-RETURN-A",
    action: "cancel", expectedVersion: 2, document: {} });
  const receiptData = { subcontracting_order: "SCO-1", posting_at: NOW, received_qty: "1.5",
    stock_account: "Stock", stock_received_but_not_billed: "SRBNB" };
  const receiptA = await prepare("Subcontracting Receipt", "RACE-RECEIPT-A", receiptData);
  const receiptB = await prepare("Subcontracting Receipt", "RACE-RECEIPT-B", receiptData);
  const staleReturn = await prepare("Stock Entry", "RACE-RETURN-AFTER-RECEIPT", supplyData(2, true));
  await store.execute(receiptA);
  const before = store.snapshot();
  await assert.rejects(store.execute(staleReturn), /material entitlement changed/i);
  assert.deepEqual(store.snapshot(), before);
  await assert.rejects(store.execute(receiptB), /material entitlement changed/i);
  assert.deepEqual(store.snapshot(), before);
});

test("rejected finished units require explicit payment policy and segregate exact stock value", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Rejected", "demo", { company: "Demo", is_group: 0 });
  store.seedMaster("Warehouse", "Foreign", "demo", { company: "Other", is_group: 0 });
  await submitBom(kernel);
  await submitPo(kernel);
  await submitOrder(kernel);
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "OPEN-REJECTION", document: {
    company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
    items: [{ row_id: "OPEN", item_code: "RAW", qty: "4", valuation_rate: "10", target_warehouse: "Raw" }],
  }});
  await transfer(kernel, "SEND-REJECTION", 4);
  const base = { subcontracting_order: "SCO-1", posting_at: NOW, received_qty: "2", rejected_qty: "0.5",
    rejected_warehouse: "Rejected", stock_account: "Stock", stock_received_but_not_billed: "SRBNB" };
  const submit = (name, data) => createAndSubmit(kernel, { doctype: "Subcontracting Receipt", name, document: data });
  await assert.rejects(submit("NO-POLICY", base), /explicit Pay Full Service/);
  await assert.rejects(submit("BAD-QTY", { ...base, rejected_qty: "2.000001" }), /between zero and total/);
  await assert.rejects(submit("NEG-QTY", { ...base, rejected_qty: "-1" }), /between zero and total/);
  const payable = { ...base, rejected_service_policy: "Pay Full Service" };
  await assert.rejects(submit("BAD-WH", { ...payable, rejected_warehouse: "Finished" }), /separate rejected warehouse/);
  await assert.rejects(submit("WRONG-COMPANY", { ...payable, rejected_warehouse: "Foreign" }), /belongs to Other/i);
  const { makeCommand } = await import("../dist/packages/test-harness/src/index.js");
  await mutate(kernel, { doctype: "Subcontracting Receipt", name: "TAMPERED-REJECT", document: payable,
    action: "create", expectedVersion: null, commandId: "tampered-reject-create" });
  const plan = await kernel.prepare(await makeCommand({ doctype: "Subcontracting Receipt", name: "TAMPERED-REJECT",
    document: payable, action: "submit", expectedVersion: 1, commandId: "tampered-reject-submit" }), store);
  const tampered = structuredClone(plan);
  delete tampered.document.data.rejected_service_policy;
  await assert.rejects(store.execute(tampered), /material entitlement changed/i);
  assert.equal((await store.getDocument("demo", "Subcontracting Receipt", "TAMPERED-REJECT")).docstatus, 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 0);
  await submit("REJECT-SPLIT", payable);
  const result = await store.getDocument("demo", "Subcontracting Receipt", "REJECT-SPLIT");
  assert.equal(result.data.accepted_qty_micros, 1.5 * Q);
  assert.equal(result.data.rejected_qty_micros, 0.5 * Q);
  assert.equal(result.data.material_cost_minor, 4000);
  assert.equal(result.data.service_cost_minor, 1000);
  assert.equal(result.data.accepted_value_minor, 3750);
  assert.equal(result.data.rejected_value_minor, 1250);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 1.5 * Q);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 0.5 * Q);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Receipt", "SUB-SERVICE", "SERVICE-1"), 2 * Q);
  const gl = await store.getVoucherGlEntries("demo", "Subcontracting Receipt", "REJECT-SPLIT", result.version);
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor, 0), 1000);
  assert.equal(gl.reduce((sum, row) => sum + row.credit_minor, 0), 1000);
  await mutate(kernel, { doctype: "Subcontracting Receipt", name: "REJECT-SPLIT", action: "cancel", expectedVersion: result.version, document: {} });
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "RAW", "Supplier"), 4 * Q);
  assert.equal(await store.getProcuredQuantityMicros("demo", "PO-SUB", "Receipt", "SUB-SERVICE", "SERVICE-1"), 0);
});

test("all rejected receipt creates no accepted stock and reverses exactly", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Rejected", "demo", { company: "Demo", is_group: 0 });
  await submitBom(kernel); await submitPo(kernel); await submitOrder(kernel);
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "OPEN-ALL", document: {
    company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
    items: [{ row_id: "OPEN", item_code: "RAW", qty: "4", valuation_rate: "10", target_warehouse: "Raw" }],
  }});
  await transfer(kernel, "SEND-ALL", 4);
  await createAndSubmit(kernel, { doctype: "Subcontracting Receipt", name: "ALL-REJECTED", document: {
    subcontracting_order: "SCO-1", posting_at: NOW, received_qty: "2", rejected_qty: "2",
    rejected_service_policy: "Pay Full Service", rejected_warehouse: "Rejected",
    stock_account: "Stock", stock_received_but_not_billed: "SRBNB",
  }});
  const doc = await store.getDocument("demo", "Subcontracting Receipt", "ALL-REJECTED");
  assert.equal(doc.data.accepted_value_minor, 0);
  assert.equal(doc.data.rejected_value_minor, 5000);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 2 * Q);
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "REJECTED-ISSUE", document: {
    company: "Demo", posting_at: "2026-10-02T10:00:00.000Z", purpose: "Material Issue",
    items: [{ row_id: "ISSUE", item_code: "FG", qty: "1", source_warehouse: "Rejected" }],
  }});
  await assert.rejects(mutate(kernel, { doctype: "Subcontracting Receipt", name: doc.name,
    action: "cancel", expectedVersion: doc.version, document: {}, commandId: "blocked-rejected-reversal" }), /Insufficient stock/i);
  assert.equal((await store.getDocument("demo", "Subcontracting Receipt", doc.name)).docstatus, 1);
  const issue = await store.getDocument("demo", "Stock Entry", "REJECTED-ISSUE");
  await mutate(kernel, { doctype: "Stock Entry", name: issue.name, commandId: "cancel-rejected-issue", action: "cancel", expectedVersion: issue.version, document: {} });
  await mutate(kernel, { doctype: "Subcontracting Receipt", name: doc.name, commandId: "cancel-all-rejected", action: "cancel", expectedVersion: doc.version, document: {} });
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 0);
});

test("tracked accepted and rejected receipt splits rounded value and releases both bundles on cancel", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Rejected", "demo", { company: "Demo", is_group: 0 });
  store.seedMaster("Item", "FG", "demo", { is_stock_item: 1, stock_uom: "Nos", valuation_method: "FIFO", has_batch_no: 1 });
  for (const batch of ["GOOD-BATCH", "BAD-BATCH"]) store.seedMaster("Batch", batch, "demo", { item: "FG" });
  await submitBom(kernel); await submitPo(kernel); await submitOrder(kernel);
  await createAndSubmit(kernel, { doctype: "Stock Entry", name: "OPEN-BATCH-REJECT", document: {
    company: "Demo", posting_at: "2026-10-02T08:00:00.000Z", purpose: "Material Receipt",
    items: [{ row_id: "OPEN", item_code: "RAW", qty: "4", valuation_rate: "10", target_warehouse: "Raw" }],
  }});
  await transfer(kernel, "SEND-BATCH-REJECT", 4);
  for (const [name, warehouse, batch, qty] of [
    ["ACCEPTED-BUNDLE", "Finished", "GOOD-BATCH", "0.666667"],
    ["REJECTED-BUNDLE", "Rejected", "BAD-BATCH", "0.333333"],
  ]) await createAndSubmit(kernel, { doctype: "Serial and Batch Bundle", name, document: {
    item_code: "FG", warehouse, type: "Inward", posting_at: NOW, entries: [{ row_id: "B", batch_no: batch, qty }],
  }});
  await createAndSubmit(kernel, { doctype: "Subcontracting Receipt", name: "TRACKED-REJECT", document: {
    subcontracting_order: "SCO-1", posting_at: NOW, received_qty: "1", rejected_qty: "0.333333",
    rejected_service_policy: "Pay Full Service", rejected_warehouse: "Rejected",
    finished_good_bundle: "ACCEPTED-BUNDLE", rejected_good_bundle: "REJECTED-BUNDLE",
    stock_account: "Stock", stock_received_but_not_billed: "SRBNB",
  }});
  const doc = await store.getDocument("demo", "Subcontracting Receipt", "TRACKED-REJECT");
  assert.equal(doc.data.accepted_value_minor, 1667);
  assert.equal(doc.data.rejected_value_minor, 833);
  const lines = await store.getVoucherStockEntries("demo", "Subcontracting Receipt", doc.name, doc.version);
  assert.equal(lines.find(row => row.batch_no === "GOOD-BATCH").stock_value_difference_minor, 1667);
  assert.equal(lines.find(row => row.batch_no === "BAD-BATCH").stock_value_difference_minor, 833);
  await mutate(kernel, { doctype: "Subcontracting Receipt", name: doc.name, commandId: "cancel-tracked-reject",
    action: "cancel", expectedVersion: doc.version, document: {} });
  for (const bundle of ["ACCEPTED-BUNDLE", "REJECTED-BUNDLE"]) {
    assert.equal(store.snapshot().stock_bundle_usages.filter(row => row.bundle_name === bundle).reduce((sum, row) => sum + row.usage_delta, 0), 0);
  }
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Finished"), 0);
  assert.equal(await store.getStockBalanceMicros("demo", "FG", "Rejected"), 0);
});
