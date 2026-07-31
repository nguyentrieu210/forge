import test from "node:test";
import assert from "node:assert/strict";
import {
  PurchaseAllocationOverrideController,
  PurchaseSettlementController,
  RolloutPurchaseOrderController,
  RolloutPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const now = "2026-07-31T04:00:00.000Z";
const manager = { user_id: "Administrator", roles: ["System Manager", "Stock Manager"] };

function seedMasters(store) {
  store.seedMaster("Company", "Alumdoor", tenant, { default_currency: "VND" });
  store.seedMaster("Supplier", "FACTORY-1", tenant, { receipt_tolerance_pct: 5 });
  store.seedMaster("Currency", "VND", tenant, { currency_scale: 2 });
  store.seedMaster("Warehouse", "Main", tenant);
  store.seedMaster("Item", "AL71", tenant, {
    stock_uom: "Cây",
    default_purchase_uom: "Kg",
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "AL-BAR",
    has_catch_weight: true,
    weight_uom: "Kg",
  });
}

function fixture() {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  seedMasters(store);
  return {
    store,
    po: new RolloutPurchaseOrderController(),
    receipt: new RolloutPurchaseReceiptController(),
    settlement: new PurchaseSettlementController(),
    override: new PurchaseAllocationOverrideController(),
  };
}

async function apply(controller, store, action, name, document, commandId, actor = manager) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  const command = {
    command_id: commandId,
    tenant_id: tenant,
    aggregate: { doctype: controller.doctype, name },
    action,
    expected_version: existing?.version ?? null,
    payload_hash: "1".repeat(64),
    actor,
    document,
  };
  const plan = await controller.buildPlan({
    command,
    existing,
    now,
    nextVersion: (existing?.version ?? 0) + 1,
    reader: store,
  });
  await store.execute(plan);
  return store.getDocument(tenant, controller.doctype, name);
}

function poData(qtyBar, transactionDate, rowId = "ROW-1") {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    transaction_date: transactionDate,
    taxes: [],
    items: [{
      row_id: rowId,
      item_code: "AL71",
      qty: theoreticalKg.toFixed(3),
      qty_bar: qtyBar,
      theoretical_kg: theoreticalKg.toFixed(3),
      length_m: 7.2,
      theoretical_kg_per_m: 0.389,
      color: "GS",
      is_stamped: "Có",
      uom: "Kg",
      stock_uom: "Cây",
      conversion_factor: (qtyBar / theoreticalKg).toFixed(6),
      rate: 100_000,
    }],
  };
}

function receiptData(qtyBar, actualWeightKg) {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: "2026-07-03T00:00:00.000Z",
    items: [{
      row_id: "PR-ROW-1",
      item_code: "AL71",
      warehouse: "Main",
      qty: theoreticalKg.toFixed(3),
      qty_bar: qtyBar,
      theoretical_kg: theoreticalKg.toFixed(3),
      actual_weight_kg: String(actualWeightKg),
      length_m: 7.2,
      theoretical_kg_per_m: 0.389,
      color: "GS",
      is_stamped: "Có",
      uom: "Kg",
      stock_uom: "Cây",
      conversion_factor: (qtyBar / theoreticalKg).toFixed(6),
      rate: 100_000,
      valuation_rate: 100_000,
    }],
  };
}

async function submitDocument(controller, store, name, data, commandPrefix, actor = manager) {
  const draft = await apply(controller, store, "create", name, data, `${commandPrefix}-create`, actor);
  return apply(controller, store, "submit", name, draft.data, `${commandPrefix}-submit`, actor);
}

test("final delivery can close at the lower tolerance bound and then be reversed", async () => {
  const { store, po, receipt, settlement } = fixture();
  await submitDocument(po, store, "PO-SETTLE", poData(100, "2026-07-01"), "PO-SETTLE");
  await submitDocument(receipt, store, "PR-SETTLE", receiptData(95, 265), "PR-SETTLE");

  const allocation = store.snapshot().purchase_allocation_entries[0];
  const closeData = {
    operation: "Close",
    queue_key: allocation.queue_key,
    window_id: allocation.window_id,
    reason: "Nhà máy xác nhận đây là chuyến giao cuối",
  };
  const closed = await submitDocument(settlement, store, "SETTLE-01", closeData, "SETTLE-01");
  assert.equal(closed.data.nominal_qty_micros, 100_000_000);
  assert.equal(closed.data.received_qty_micros, 95_000_000);
  assert.equal(closed.data.minimum_qty_micros, 95_000_000);
  assert.equal(closed.data.shortage_variance_micros, 5_000_000);

  let state = await store.getPurchaseSettlementWindowState(tenant, allocation.queue_key, allocation.window_id);
  assert.equal(state.window_status, "Settled");
  assert.ok(state.close_entry_id);

  await submitDocument(settlement, store, "SETTLE-REV-01", {
    operation: "Reverse",
    queue_key: allocation.queue_key,
    window_id: allocation.window_id,
    reason: "Nhà máy đính chính xác nhận giao cuối",
  }, "SETTLE-REV-01");
  state = await store.getPurchaseSettlementWindowState(tenant, allocation.queue_key, allocation.window_id);
  assert.equal(state.window_status, "Reversed");
  assert.deepEqual(store.snapshot().purchase_settlement_entries.map((entry) => entry.entry_kind), ["close", "reverse"]);
});

test("manual override reassigns part of one Receipt allocation and conserves quantity and weight", async () => {
  const { store, po, receipt, override } = fixture();
  await submitDocument(po, store, "PO-OLD", poData(100, "2026-07-01", "PO-OLD-ROW"), "PO-OLD");
  await submitDocument(po, store, "PO-NEW", poData(100, "2026-07-02", "PO-NEW-ROW"), "PO-NEW");
  await submitDocument(receipt, store, "PR-OVERRIDE", receiptData(150, 420), "PR-OVERRIDE");

  const before = store.snapshot();
  const source = before.purchase_allocation_entries.find((entry) => entry.purchase_order === "PO-OLD");
  assert.ok(source);
  const totalQtyBefore = before.purchase_allocation_entries.reduce((sum, entry) => sum + entry.qty_micros, 0);
  const totalBaremBefore = before.purchase_allocation_entries.reduce((sum, entry) => sum + entry.barem_weight_micros, 0);
  const totalActualBefore = before.purchase_allocation_entries.reduce(
    (sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0);

  await submitDocument(override, store, "OVERRIDE-01", {
    source_allocation_entry_id: source.entry_id,
    target_purchase_order: "PO-NEW",
    target_purchase_order_item_row_id: "PO-NEW-ROW",
    qty: 20,
    reason: "Nhà máy xác nhận 20 cây thuộc đơn PO-NEW",
  }, "OVERRIDE-01");

  const after = store.snapshot();
  const poOldNet = after.purchase_allocation_entries
    .filter((entry) => entry.purchase_order === "PO-OLD")
    .reduce((sum, entry) => sum + entry.qty_micros, 0);
  const poNewNet = after.purchase_allocation_entries
    .filter((entry) => entry.purchase_order === "PO-NEW")
    .reduce((sum, entry) => sum + entry.qty_micros, 0);
  assert.equal(poOldNet, 80_000_000);
  assert.equal(poNewNet, 70_000_000);
  assert.equal(after.purchase_allocation_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), totalQtyBefore);
  assert.equal(after.purchase_allocation_entries.reduce((sum, entry) => sum + entry.barem_weight_micros, 0), totalBaremBefore);
  assert.equal(after.purchase_allocation_entries.reduce(
    (sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0), totalActualBefore);

  const manual = after.purchase_allocation_entries.find((entry) => entry.entry_kind === "manual_allocate");
  assert.equal(manual.voucher_no, "PR-OVERRIDE");
  assert.match(manual.reason, /PO-NEW/);
  const progressDelta = after.procurement_entries
    .filter((entry) => entry.voucher_no === "PR-OVERRIDE"
      && entry.line_key.startsWith("OVERRIDE-"))
    .reduce((sum, entry) => sum + entry.qty_micros, 0);
  assert.equal(progressDelta, 0);
});

test("manual override is rejected without an authorized server role", async () => {
  const { store, override } = fixture();
  const clerk = { user_id: "sales@example.com", roles: ["Kinh doanh"] };
  const draft = await apply(override, store, "create", "OVERRIDE-DENIED", {
    source_allocation_entry_id: "ALLOC:missing",
    target_purchase_order: "PO-MISSING",
    target_purchase_order_item_row_id: "ROW-1",
    qty: 1,
    reason: "Thử điều chỉnh không có quyền",
  }, "OVERRIDE-DENIED-create", clerk);
  await assert.rejects(
    () => apply(override, store, "submit", "OVERRIDE-DENIED", draft.data, "OVERRIDE-DENIED-submit", clerk),
    (error) => error?.code === "PERMISSION_DENIED",
  );
});
