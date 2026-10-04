import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers, valueIssue, auditOutgoingValuation } from "../dist/packages/clouderp-stock/src/index.js";
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
    items: ["ITEM-1"],
    warehouses: ["Stores"],
    accounts: ["Stock", "SRBNB", "Freight Clearing", "COGS Repost"],
  });
  store.seedMaster("Supplier", "SUP-1");
  store.seedMaster("Warehouse", "Stores", "demo", { company: "Demo", is_group: 0, disabled: 0 });
  store.seedMaster("Item", "ITEM-1", "demo", { is_stock_item: 1, stock_uom: "Nos", valuation_method: "FIFO" });
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  );
  return { store, kernel: new DocumentKernel(registry, store, undefined, () => NOW) };
}

async function submitPo(kernel, name, qty = "2") {
  return createAndSubmit(kernel, {
    doctype: "Purchase Order",
    name,
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      transaction_date: "2026-10-02",
      items: [{ row_id: "PO-ROW", item_code: "ITEM-1", qty, rate: "10" }],
      taxes: [],
    },
  });
}

async function submitReceipt(kernel, name, po, rowId, rate, postingAt) {
  return createAndSubmit(kernel, {
    doctype: "Purchase Receipt",
    name,
    document: {
      supplier: "SUP-1",
      company: "Demo",
      currency: "USD",
      posting_at: postingAt,
      against_purchase_order: po,
      stock_account: "Stock",
      stock_received_but_not_billed: "SRBNB",
      items: [{ row_id: rowId, item_code: "ITEM-1", warehouse: "Stores", qty: "1", rate }],
    },
  });
}

async function submitLcv(kernel, name, receipt, postingAt = "2026-10-02T08:15:00.000Z", repostDifferenceAccount) {
  return createAndSubmit(kernel, {
    doctype: "Landed Cost Voucher",
    name,
    document: {
      posting_at: postingAt,
      basis: "quantity",
      total_cost: "5",
      landed_cost_account: "Freight Clearing",
      ...(repostDifferenceAccount ? { repost_difference_account: repostDifferenceAccount } : {}),
      purchase_receipts: [{ row_id: "SRC-1", purchase_receipt: receipt }],
    },
  });
}

async function issueStock(kernel, name, postingAt = "2026-10-02T08:30:00.000Z") {
  return createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name,
    document: {
      company: "Demo",
      posting_at: postingAt,
      purpose: "Material Issue",
      items: [{ row_id: "ISSUE-1", item_code: "ITEM-1", qty: "0.5", valuation_rate: "10", source_warehouse: "Stores" }],
    },
  });
}

async function deliverStock(kernel, name, postingAt = "2026-10-02T08:30:00.000Z") {
  return createAndSubmit(kernel, {
    doctype: "Delivery Note",
    name,
    document: {
      company: "Demo",
      currency: "USD",
      posting_at: postingAt,
      issue_purpose: "Xuất mẫu",
      items: [{ row_id: "DELIVERY-1", item_code: "ITEM-1", warehouse: "Stores", qty: "0.5", rate: "10" }],
    },
  });
}

test("Landed Cost targets the exact Purchase Receipt row instead of smearing FIFO layers", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-1", "2");
  await submitReceipt(kernel, "PR-1", "PO-1", "PR1-ROW", "10", "2026-10-02T08:00:00.000Z");
  await submitReceipt(kernel, "PR-2", "PO-1", "PR2-ROW", "20", "2026-10-02T08:05:00.000Z");

  await submitLcv(kernel, "LCV-1", "PR-2");

  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-1");
  assert.equal(lcv.docstatus, 1);
  assert.equal(lcv.data.total_cost_minor, 500);
  assert.equal(lcv.data.allocations.length, 1);
  assert.equal(lcv.data.allocations[0].purchase_receipt, "PR-2");
  assert.equal(lcv.data.allocations[0].purchase_receipt_row_id, "PR2-ROW");
  assert.equal(lcv.data.allocations[0].allocated_cost_minor, 500);

  const lcvStock = await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-1", 2);
  assert.equal(lcvStock.length, 1);
  assert.equal(lcvStock[0].actual_qty_micros, 0);
  assert.equal(lcvStock[0].stock_value_difference_minor, 500);
  assert.equal(lcvStock[0].valuation_target_voucher_no, "PR-2");
  assert.equal(lcvStock[0].valuation_target_row_id, "PR2-ROW");

  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  const firstIssue = valueIssue(history, Q, "FIFO", 2);
  assert.equal(firstIssue.stock_value_difference_minor, -1000, "first FIFO layer must remain at the PR-1 cost");
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 3500);

  const snapshot = store.snapshot();
  const lcvGl = snapshot.gl_entries.filter((line) => line.line_key.startsWith("STOCK-ALLOC-") || line.line_key.startsWith("LANDED-ALLOC-"));
  assert.equal(lcvGl.reduce((sum, line) => sum + line.debit_minor, 0), 500);
  assert.equal(lcvGl.reduce((sum, line) => sum + line.credit_minor, 0), 500);

  await assert.rejects(
    mutate(kernel, {
      commandId: "PR-2-cancel-blocked",
      doctype: "Purchase Receipt",
      name: "PR-2",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    /Cancel Landed Cost Voucher LCV-1/i,
  );

  await mutate(kernel, {
    commandId: "LCV-1-cancel",
    doctype: "Landed Cost Voucher",
    name: "LCV-1",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 3000);
  const reversal = await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-1", 3);
  assert.equal(reversal.length, 1);
  assert.equal(reversal[0].stock_value_difference_minor, -500);
});

test("Landed Cost late-arriving FIFO repost splits inventory and consumed expense deterministically", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-2", "1");
  await submitReceipt(kernel, "PR-3", "PO-2", "PR3-ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-BEFORE-LCV");

  await assert.rejects(
    submitLcv(kernel, "LCV-MISSING-ACCOUNT", "PR-3", "2026-10-02T08:45:00.000Z"),
    /repost_difference_account is required/i,
  );

  await submitLcv(kernel, "LCV-REPOST", "PR-3", "2026-10-02T08:45:00.000Z", "COGS Repost");

  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-REPOST");
  assert.equal(lcv.docstatus, 1);
  assert.equal(lcv.data.allocations[0].source_qty_micros, 1_000_000);
  assert.equal(lcv.data.allocations[0].remaining_qty_micros, 500_000);
  assert.equal(lcv.data.allocations[0].inventory_cost_minor, 250);
  assert.equal(lcv.data.allocations[0].consumed_cost_minor, 250);

  const lcvStock = await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-REPOST", 2);
  assert.equal(lcvStock.length, 1);
  assert.equal(lcvStock[0].stock_value_difference_minor, 250);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 750);

  const snapshot = store.snapshot();
  const repostGl = snapshot.gl_entries.filter((line) =>
    line.line_key.startsWith("STOCK-ALLOC-")
    || line.line_key.startsWith("REPOST-ALLOC-")
    || line.line_key.startsWith("LANDED-ALLOC-"));
  assert.equal(repostGl.reduce((sum, line) => sum + line.debit_minor, 0), 500);
  assert.equal(repostGl.reduce((sum, line) => sum + line.credit_minor, 0), 500);
  assert.equal(repostGl.find((line) => line.line_key.startsWith("REPOST-"))?.account, "COGS Repost");
  assert.equal(repostGl.find((line) => line.line_key.startsWith("REPOST-"))?.debit_minor, 250);

  await mutate(kernel, {
    commandId: "LCV-REPOST-cancel",
    doctype: "Landed Cost Voucher",
    name: "LCV-REPOST",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 500);
});

test("Landed Cost fully-consumed FIFO source posts only expense correction and cancels exactly", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-2C", "1");
  await submitReceipt(kernel, "PR-3C", "PO-2C", "PR3C-ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-FULL-BEFORE-LCV", "2026-10-02T08:30:00.000Z");

  // The default helper issues 0.5, so issue the remaining 0.5 as a second direct Material Issue.
  await issueStock(kernel, "ISSUE-FULL-BEFORE-LCV-2", "2026-10-02T08:31:00.000Z");

  await submitLcv(kernel, "LCV-FULL-REPOST", "PR-3C", "2026-10-02T08:45:00.000Z", "COGS Repost");

  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-FULL-REPOST");
  assert.equal(lcv.data.allocations[0].remaining_qty_micros, 0);
  assert.equal(lcv.data.allocations[0].inventory_cost_minor, 0);
  assert.equal(lcv.data.allocations[0].consumed_cost_minor, 500);
  assert.equal(
    (await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-FULL-REPOST", 2)).length,
    0,
  );
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 0);

  const snapshot = store.snapshot();
  const repost = snapshot.gl_entries.find((line) =>
    line.line_key.startsWith("REPOST-ALLOC-") && line.account === "COGS Repost");
  assert.equal(repost?.debit_minor, 500);

  await mutate(kernel, {
    commandId: "LCV-FULL-REPOST-cancel",
    doctype: "Landed Cost Voucher",
    name: "LCV-FULL-REPOST",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getDocument("demo", "Landed Cost Voucher", "LCV-FULL-REPOST")).docstatus, 2);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 0);
});

test("Backdated Landed Cost chronologically reposts direct FIFO issues without double valuation", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-2B", "1");
  await submitReceipt(kernel, "PR-3B", "PO-2B", "PR3B-ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-AFTER-BACKDATED-LCV", "2026-10-02T08:30:00.000Z");
  await submitLcv(kernel, "LCV-BACKDATED", "PR-3B", "2026-10-02T08:15:00.000Z", "COGS Repost");
  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-BACKDATED");
  assert.equal(lcv.data.allocations[0].chronological_reposts[0].difference_minor, -250);
  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  assert.equal(history.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 750);
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  const valued = valueIssue(history, 500_000, "FIFO", 2);
  assert.equal(valued.current_stock_value_minor, 750);
  assert.equal(valued.stock_value_difference_minor, -750);
  const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-BACKDATED", 2);
  assert.equal(gl.find(row => row.line_key.startsWith("CHRONO-COGS-"))?.debit_minor, 250);
  assert.equal(gl.find(row => row.line_key.startsWith("CHRONO-COGS-"))?.posting_at, "2026-10-02T08:30:00.000Z");
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0), 0);
  await issueStock(kernel, "ISSUE-REMAINING", "2026-10-02T08:45:00.000Z");
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 0);
});

test("Backdated Landed Cost chronologically reposts Delivery Note FIFO consumption", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-DELIVERY-CHRONO", "1");
  await submitReceipt(kernel, "PR-DELIVERY-CHRONO", "PO-DELIVERY-CHRONO", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await deliverStock(kernel, "DN-AFTER-BACKDATED-LCV", "2026-10-02T08:30:00.000Z");
  await submitLcv(kernel, "LCV-DELIVERY-CHRONO", "PR-DELIVERY-CHRONO", "2026-10-02T08:15:00.000Z", "COGS Repost");

  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-DELIVERY-CHRONO");
  assert.equal(lcv.data.allocations[0].chronological_reposts[0].voucher_type, "Delivery Note");
  assert.equal(lcv.data.allocations[0].chronological_reposts[0].difference_minor, -250);
  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 750);
  const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-DELIVERY-CHRONO", 2);
  assert.equal(gl.find(row => row.line_key.startsWith("CHRONO-COGS-"))?.debit_minor, 250);
});

test("Late Landed Cost treats already-posted Delivery Note consumption as expense rather than inventory", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-DELIVERY-PAST", "1");
  await submitReceipt(kernel, "PR-DELIVERY-PAST", "PO-DELIVERY-PAST", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await deliverStock(kernel, "DN-BEFORE-LCV", "2026-10-02T08:20:00.000Z");
  await submitLcv(kernel, "LCV-DELIVERY-PAST", "PR-DELIVERY-PAST", "2026-10-02T08:45:00.000Z", "COGS Repost");

  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-DELIVERY-PAST");
  assert.equal(lcv.data.allocations[0].remaining_qty_micros, 500_000);
  assert.equal(lcv.data.allocations[0].inventory_cost_minor, 250);
  assert.equal(lcv.data.allocations[0].consumed_cost_minor, 250);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 750);
  const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-DELIVERY-PAST", 2);
  assert.equal(gl.find(row => row.line_key.startsWith("REPOST-"))?.debit_minor, 250);
});

test("Backdated Landed Cost carries FIFO value through an unconsumed future Material Transfer", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Transit", "demo", { company: "Demo", is_group: 0, disabled: 0 });
  await submitPo(kernel, "PO-LCV-TRANSFER", "1");
  await submitReceipt(kernel, "PR-LCV-TRANSFER", "PO-LCV-TRANSFER", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "TRANSFER-AFTER-LCV",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:30:00.000Z",
      purpose: "Material Transfer",
      items: [{
        row_id: "TRANSFER-ROW",
        item_code: "ITEM-1",
        qty: "0.5",
        source_warehouse: "Stores",
        target_warehouse: "Transit",
      }],
    },
  });

  await submitLcv(kernel, "LCV-TRANSFER", "PR-LCV-TRANSFER", "2026-10-02T08:15:00.000Z");
  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-TRANSFER");
  const repost = lcv.data.allocations[0].chronological_reposts[0];
  assert.equal(repost.kind, "transfer");
  assert.equal(repost.difference_minor, -250);
  assert.equal(repost.target_warehouse, "Transit");
  assert.equal(lcv.data.allocations[0].propagation_fingerprints.length, 1);

  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 750);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 750);
  const lcvStock = await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-TRANSFER", 2);
  assert.equal(lcvStock.filter(row => row.warehouse === "Stores").reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 250);
  assert.equal(lcvStock.filter(row => row.warehouse === "Transit").reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 250);
  const lcvGl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-TRANSFER", 2);
  assert.equal(lcvGl.some(row => row.line_key.startsWith("CHRONO-COGS-")), false);
  assert.equal(lcvGl.reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0), 0);

  await mutate(kernel, {
    commandId: "LCV-TRANSFER-cancel",
    doctype: "Landed Cost Voucher",
    name: "LCV-TRANSFER",
    action: "cancel",
    expectedVersion: 2,
    document: {},
  });
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 500);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 500);
});

test("Backdated Landed Cost corrects terminal consumption from a transferred FIFO layer and cancels exactly", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Transit", "demo", { company: "Demo", is_group: 0, disabled: 0 });
  await submitPo(kernel, "PO-LCV-TRANSFER-CONSUMED", "1");
  await submitReceipt(kernel, "PR-LCV-TRANSFER-CONSUMED", "PO-LCV-TRANSFER-CONSUMED", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "TRANSFER-CONSUMED",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:30:00.000Z",
      purpose: "Material Transfer",
      items: [{ row_id: "TRANSFER-ROW", item_code: "ITEM-1", qty: "0.5", source_warehouse: "Stores", target_warehouse: "Transit" }],
    },
  });
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "ISSUE-FROM-TRANSIT",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:40:00.000Z",
      purpose: "Material Issue",
      items: [{ row_id: "TRANSIT-ISSUE", item_code: "ITEM-1", qty: "0.5", source_warehouse: "Transit" }],
    },
  });
  await submitLcv(kernel, "LCV-TRANSFER-CONSUMED", "PR-LCV-TRANSFER-CONSUMED", "2026-10-02T08:15:00.000Z", "COGS Repost");
  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-TRANSFER-CONSUMED");
  assert.equal(lcv.data.allocations[0].chronological_reposts.length, 2);
  assert.equal(lcv.data.allocations[0].chronological_reposts[1].warehouse, "Transit");
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 750);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 0);
  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Transit");
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-TRANSFER-CONSUMED", 2);
  assert.equal(gl.find(row => row.line_key.startsWith("CHRONO-COGS-"))?.debit_minor, 250);
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0), 0);
  await mutate(kernel, { commandId: "transfer-consumed-cancel", doctype: "Landed Cost Voucher", name: "LCV-TRANSFER-CONSUMED", action: "cancel", expectedVersion: 2, document: {} });
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 500);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 0);
  assert.equal(auditOutgoingValuation(await store.getStockLedgerHistory("demo", "ITEM-1", "Transit"), "FIFO").mismatch_count, 0);
});

for (const purpose of ["Material Issue", "Delivery Note", "Material Transfer"]) {
  test(`Transferred FIFO landed cost handles ${purpose} within its declared boundary`, async () => {
    const { store, kernel } = setup();
    store.seedMaster("Warehouse", "Transit", "demo", { company: "Demo", is_group: 0, disabled: 0 });
    store.seedMaster("Warehouse", "Finished", "demo", { company: "Demo", is_group: 0, disabled: 0 });
    await submitPo(kernel, "PO-DESTINATION", "1");
    await submitReceipt(kernel, "PR-DESTINATION", "PO-DESTINATION", "ROW", "10", "2026-10-02T08:00:00.000Z");
    await createAndSubmit(kernel, { doctype: "Stock Entry", name: "TRANSFER-DESTINATION", document: {
      company: "Demo", posting_at: "2026-10-02T08:30:00.000Z", purpose: "Material Transfer",
      items: [{ row_id: "ROW", item_code: "ITEM-1", qty: "0.5", source_warehouse: "Stores", target_warehouse: "Transit" }],
    } });
    await createAndSubmit(kernel, { doctype: purpose === "Delivery Note" ? "Delivery Note" : "Stock Entry", name: "DESTINATION-CONSUMER", document: {
      company: "Demo", currency: "USD", posting_at: "2026-10-02T08:40:00.000Z", purpose, issue_purpose: "Xuất mẫu",
      items: [{ row_id: "ROW", item_code: "ITEM-1", qty: "0.25", source_warehouse: "Transit", warehouse: "Transit", target_warehouse: "Finished", rate: "10" }],
    } });
    if (purpose === "Material Transfer") {
      await assert.rejects(submitLcv(kernel, "LCV-DESTINATION", "PR-DESTINATION", "2026-10-02T08:15:00.000Z", "COGS Repost"), /transfer\/manufacturing\/cancelled chains/i);
      assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 250);
      return;
    }
    await assert.rejects(submitLcv(kernel, "LCV-MISSING-ACCOUNT", "PR-DESTINATION"), /repost_difference_account/i);
    await submitLcv(kernel, "LCV-DESTINATION", "PR-DESTINATION", "2026-10-02T08:15:00.000Z", "COGS Repost");
    assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 375);
    assert.equal(auditOutgoingValuation(await store.getStockLedgerHistory("demo", "ITEM-1", "Transit"), "FIFO").mismatch_count, 0);
    const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-DESTINATION", 2);
    assert.equal(gl.find(row => row.line_key.startsWith("CHRONO-COGS-"))?.debit_minor, 125);
    await createAndSubmit(kernel, { doctype: "Stock Entry", name: "LATER-ISSUE", document: {
      company: "Demo", posting_at: "2026-10-02T08:50:00.000Z", purpose: "Material Issue",
      items: [{ row_id: "ROW", item_code: "ITEM-1", qty: "0.1", source_warehouse: "Transit" }],
    } });
    await assert.rejects(mutate(kernel, { commandId: "destination-cancel-stale", doctype: "Landed Cost Voucher", name: "LCV-DESTINATION", action: "cancel", expectedVersion: 2, document: {} }), /history|mutations|repost/i);
  });
}

test("Landed Cost rejects shared transfer destinations until combined replay is available", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Transit", "demo", { company: "Demo", is_group: 0, disabled: 0 });
  await submitPo(kernel, "PO-SHARED", "1");
  await submitReceipt(kernel, "PR-SHARED", "PO-SHARED", "ROW", "10", "2026-10-02T08:00:00.000Z");
  for (const [name, postingAt] of [["TRANSFER-SHARED-1", "2026-10-02T08:30:00.000Z"], ["TRANSFER-SHARED-2", "2026-10-02T08:40:00.000Z"]]) {
    await createAndSubmit(kernel, { doctype: "Stock Entry", name, document: {
      company: "Demo", posting_at: postingAt, purpose: "Material Transfer",
      items: [{ row_id: "ROW", item_code: "ITEM-1", qty: "0.25", source_warehouse: "Stores", target_warehouse: "Transit" }],
    } });
  }
  await assert.rejects(submitLcv(kernel, "LCV-SHARED", "PR-SHARED"), /multiple transfers.*combined chronological replay/i);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Transit")).stock_value_minor, 500);
});

test("Stock Entry transfer keeps one stable source-row identity across both warehouses", async () => {
  const { store, kernel } = setup();
  store.seedMaster("Warehouse", "Transit", "demo", { company: "Demo", is_group: 0, disabled: 0 });
  await submitPo(kernel, "PO-TRANSFER-ID", "1");
  await submitReceipt(kernel, "PR-TRANSFER-ID", "PO-TRANSFER-ID", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await createAndSubmit(kernel, {
    doctype: "Stock Entry",
    name: "TRANSFER-ID",
    document: {
      company: "Demo",
      posting_at: "2026-10-02T08:30:00.000Z",
      purpose: "Material Transfer",
      items: [{
        row_id: "TRANSFER-ROW",
        item_code: "ITEM-1",
        qty: "0.5",
        source_warehouse: "Stores",
        target_warehouse: "Transit",
      }],
    },
  });

  const rows = await store.getVoucherStockEntries("demo", "Stock Entry", "TRANSFER-ID", 2);
  const transferRows = rows.filter(row => row.item_code === "ITEM-1");
  assert.equal(transferRows.length, 2);
  assert.ok(transferRows.every(row => row.source_row_id === "TRANSFER-ROW"));
  assert.deepEqual(new Set(transferRows.map(row => row.warehouse)), new Set(["Stores", "Transit"]));
  assert.equal(transferRows.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 0);
});

test("Landed Cost exact cancellation is blocked after downstream stock consumption", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-3", "1");
  await submitReceipt(kernel, "PR-4", "PO-3", "PR4-ROW", "10", "2026-10-02T08:00:00.000Z");
  await submitLcv(kernel, "LCV-2", "PR-4");
  await issueStock(kernel, "ISSUE-AFTER-LCV");

  await assert.rejects(
    mutate(kernel, {
      commandId: "LCV-2-cancel-blocked",
      doctype: "Landed Cost Voucher",
      name: "LCV-2",
      action: "cancel",
      expectedVersion: 2,
      document: {},
    }),
    /historical COGS repost is required/i,
  );
  assert.equal((await store.getDocument("demo", "Landed Cost Voucher", "LCV-2")).docstatus, 1);
});

test("Chronological landed cost reverses unchanged issue history exactly", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-CANCEL-CHRONO", "1");
  await submitReceipt(kernel, "PR-CANCEL-CHRONO", "PO-CANCEL-CHRONO", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-CHRONO-CANCEL");
  await submitLcv(kernel, "LCV-CHRONO-CANCEL", "PR-CANCEL-CHRONO", "2026-10-02T08:15:00.000Z", "COGS Repost");
  await mutate(kernel, { commandId: "chrono-cancel", doctype: "Landed Cost Voucher", name: "LCV-CHRONO-CANCEL", action: "cancel", expectedVersion: 2, document: {} });
  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(history.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 500);
  assert.equal(valueIssue(history, 500_000, "FIFO", 2).current_stock_value_minor, 500);
  const gl = await store.getVoucherGlEntries("demo", "Landed Cost Voucher", "LCV-CHRONO-CANCEL", 3);
  assert.equal(gl.reduce((sum, row) => sum + row.debit_minor - row.credit_minor, 0), 0);
});

test("Chronological landed cost fully consumed source leaves no stock value", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-FULL-CHRONO", "1");
  await submitReceipt(kernel, "PR-FULL-CHRONO", "PO-FULL-CHRONO", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-CHRONO-FULL-1");
  await issueStock(kernel, "ISSUE-CHRONO-FULL-2", "2026-10-02T08:31:00.000Z");
  await submitLcv(kernel, "LCV-CHRONO-FULL", "PR-FULL-CHRONO", "2026-10-02T08:15:00.000Z", "COGS Repost");
  const history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(history.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 0);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 0);
});

test("Landed Cost rejects Moving Average source rather than applying FIFO assumptions", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-MA", "1");
  await submitReceipt(kernel, "PR-MA", "PO-MA", "ROW", "10", "2026-10-02T08:00:00.000Z");
  store.seedMaster("Item", "ITEM-1", "demo", { is_stock_item: 1, stock_uom: "Nos", valuation_method: "Moving Average" });
  await assert.rejects(submitLcv(kernel, "LCV-MA", "PR-MA"), /supports FIFO items only/i);
});

test("Cumulative landed cost credits cannot make a receipt FIFO layer negative", async () => {
  const { kernel } = setup();
  await submitPo(kernel, "PO-CREDIT", "1");
  await submitReceipt(kernel, "PR-CREDIT", "PO-CREDIT", "ROW", "10", "2026-10-02T08:00:00.000Z");
  for (const name of ["LCV-CREDIT-1", "LCV-CREDIT-2"]) {
    const command = { doctype: "Landed Cost Voucher", name, document: {
      posting_at: "2026-10-02T08:15:00.000Z", basis: "quantity", total_cost: "-6",
      landed_cost_account: "Freight Clearing", purchase_receipts: [{ row_id: "REF", purchase_receipt: "PR-CREDIT" }],
    } };
    if (name.endsWith("1")) await createAndSubmit(kernel, command);
    else await assert.rejects(createAndSubmit(kernel, command), /cumulative adjustments.*negative/i);
  }
});

test("Chronological landed cost aborts when a later issue races with submit planning", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-RACE", "1");
  await submitReceipt(kernel, "PR-RACE", "PO-RACE", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-RACE-ORIGINAL");
  const execute = store.execute.bind(store);
  let raced = false;
  store.execute = async (plan) => {
    if (!raced && plan.command.aggregate.doctype === "Landed Cost Voucher" && plan.command.action === "submit") {
      raced = true;
      await issueStock(kernel, "ISSUE-RACE-LATER", "2026-10-02T08:50:00.000Z");
    }
    return execute(plan);
  };
  await assert.rejects(submitLcv(kernel, "LCV-RACE", "PR-RACE", "2026-10-02T08:15:00.000Z", "COGS Repost"), /stock history changed after planning/i);
  assert.equal((await store.getDocument("demo", "Landed Cost Voucher", "LCV-RACE")).docstatus, 0);
  assert.equal((await store.getVoucherStockEntries("demo", "Landed Cost Voucher", "LCV-RACE", 2)).length, 0);
});

test("Multiple backdated landed costs repost only incremental FIFO difference and reverse latest exactly", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-CHAIN", "1");
  await submitReceipt(kernel, "PR-CHAIN", "PO-CHAIN", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-CHAIN");
  await submitLcv(kernel, "LCV-CHAIN-1", "PR-CHAIN", "2026-10-02T08:15:00.000Z", "COGS Repost");
  await submitLcv(kernel, "LCV-CHAIN-2", "PR-CHAIN", "2026-10-02T08:15:00.000Z", "COGS Repost");
  const second = await store.getDocument("demo", "Landed Cost Voucher", "LCV-CHAIN-2");
  assert.equal(second.data.allocations[0].chronological_reposts[0].difference_minor, -250);
  let history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  assert.equal(history.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 1000);
  assert.equal(valueIssue(history, 500_000, "FIFO", 2).current_stock_value_minor, 1000);
  await mutate(kernel, { commandId: "chain-2-cancel", doctype: "Landed Cost Voucher", name: "LCV-CHAIN-2", action: "cancel", expectedVersion: 2, document: {} });
  history = await store.getStockLedgerHistory("demo", "ITEM-1", "Stores");
  assert.equal(auditOutgoingValuation(history, "FIFO").mismatch_count, 0);
  assert.equal(history.reduce((sum, row) => sum + row.stock_value_difference_minor, 0), 750);
  assert.equal(valueIssue(history, 500_000, "FIFO", 2).current_stock_value_minor, 750);
  await assert.rejects(mutate(kernel, { commandId: "chain-1-cancel", doctype: "Landed Cost Voucher", name: "LCV-CHAIN-1", action: "cancel", expectedVersion: 2, document: {} }), /additional stock mutations/i);
});

test("Chronological repost preserves one-cent rounding with tied issue timestamps", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-ROUND", "1");
  await submitReceipt(kernel, "PR-ROUND", "PO-ROUND", "ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-ROUND-1");
  await issueStock(kernel, "ISSUE-ROUND-2");
  await createAndSubmit(kernel, { doctype: "Landed Cost Voucher", name: "LCV-ROUND", document: {
    posting_at: "2026-10-02T08:15:00.000Z", basis: "quantity", total_cost: "0.01",
    landed_cost_account: "Freight Clearing", repost_difference_account: "COGS Repost",
    purchase_receipts: [{ row_id: "REF", purchase_receipt: "PR-ROUND" }],
  } });
  const lcv = await store.getDocument("demo", "Landed Cost Voucher", "LCV-ROUND");
  assert.deepEqual(lcv.data.allocations[0].chronological_reposts.map(row => row.difference_minor), [-1]);
  assert.equal((await store.getTrackedStockState("demo", "ITEM-1", "Stores")).stock_value_minor, 0);
});

for (const [label, accountName, accountData, docstatus] of [
  ["foreign company clearing account", "Freight Clearing", { company: "Other" }, 0],
  ["foreign company difference account", "COGS Repost", { company: "Other" }, 0],
  ["foreign company receipt stock account", "Stock", { company: "Other" }, 0],
  ["group flag string", "Freight Clearing", { company: "Demo", is_group: "1" }, 0],
  ["disabled flag string", "COGS Repost", { company: "Demo", disabled: "true" }, 0],
  ["cancelled canonical account", "Stock", { company: "Demo" }, 2],
]) {
  test(`Landed Cost rejects ${label} before ledger changes, despite a seeded master`, async () => {
    const { store, kernel } = setup();
    await submitPo(kernel, "PO-ACCT", "1");
    await submitReceipt(kernel, "PR-ACCT", "PO-ACCT", "ROW", "10", "2026-10-02T08:00:00.000Z");
    store.seedDocument("Account", accountName, "demo", accountData, docstatus);
    const before = store.snapshot();
    await assert.rejects(submitLcv(kernel, "LCV-ACCT", "PR-ACCT", "2026-10-02T08:15:00.000Z", "COGS Repost"), /Account .*another company|posting account|does not exist or is disabled/i);
    assert.deepEqual(store.snapshot().gl_entries, before.gl_entries);
    assert.deepEqual(store.snapshot().stock_entries, before.stock_entries);
    assert.equal((await store.getDocument("demo", "Landed Cost Voucher", "LCV-ACCT")).docstatus, 0);
  });
}

test("Landed Cost accepts active same-company leaf accounts with unchecked string flags", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-ACCT-OK", "1");
  await submitReceipt(kernel, "PR-ACCT-OK", "PO-ACCT-OK", "ROW", "10", "2026-10-02T08:00:00.000Z");
  for (const account of ["Stock", "COGS Repost", "Freight Clearing"]) {
    store.seedDocument("Account", account, "demo", { company: "Demo", is_group: "0", disabled: "false" });
  }
  await submitLcv(kernel, "LCV-ACCT-OK", "PR-ACCT-OK", "2026-10-02T08:15:00.000Z", "COGS Repost");
  assert.equal((await store.getDocument("demo", "Landed Cost Voucher", "LCV-ACCT-OK")).docstatus, 1);
});
