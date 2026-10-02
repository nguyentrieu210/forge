import test from "node:test";
import assert from "node:assert/strict";

import { createO2CControllerRegistry } from "../dist/packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../dist/packages/clouderp-core/src/index.js";
import { registerStockControllers, valueIssue } from "../dist/packages/clouderp-stock/src/index.js";
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

test("Landed Cost still fails closed for a backdated voucher before existing downstream consumption", async () => {
  const { store, kernel } = setup();
  await submitPo(kernel, "PO-2B", "1");
  await submitReceipt(kernel, "PR-3B", "PO-2B", "PR3B-ROW", "10", "2026-10-02T08:00:00.000Z");
  await issueStock(kernel, "ISSUE-AFTER-BACKDATED-LCV", "2026-10-02T08:30:00.000Z");

  await assert.rejects(
    submitLcv(kernel, "LCV-BACKDATED-BLOCKED", "PR-3B", "2026-10-02T08:15:00.000Z", "COGS Repost"),
    /backdated before existing downstream stock consumption/i,
  );
  const blocked = await store.getDocument("demo", "Landed Cost Voucher", "LCV-BACKDATED-BLOCKED");
  assert.equal(blocked.docstatus, 0);
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
