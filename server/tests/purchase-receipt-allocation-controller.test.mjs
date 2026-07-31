import test from "node:test";
import assert from "node:assert/strict";
import {
  RolloutPurchaseOrderController,
  RolloutPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const actor = { user_id: "Administrator", roles: ["System Manager", "Stock Manager"] };
const tenant = "demo";
const now = "2026-07-30T16:30:00.000Z";

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

async function apply(controller, store, action, name, document, commandId) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  const command = {
    command_id: commandId,
    tenant_id: tenant,
    aggregate: { doctype: controller.doctype, name },
    action,
    expected_version: existing?.version ?? null,
    payload_hash: "0".repeat(64),
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

function purchaseOrderData(qtyBar, transactionDate, rowId = "ROW-1") {
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

function receiptItem(qtyBar, rowId, actualWeightKg) {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    row_id: rowId,
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
  };
}

function receiptData(items, postingAt = "2026-07-03T00:00:00.000Z") {
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: postingAt,
    items,
  };
}

function enabledFixture() {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  seedMasters(store);
  return {
    store,
    poController: new RolloutPurchaseOrderController(),
    receiptController: new RolloutPurchaseReceiptController(),
  };
}

test("rollout disabled keeps the legacy Purchase Order path", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  seedMasters(store);
  const poController = new RolloutPurchaseOrderController();
  const draft = await apply(
    poController,
    store,
    "create",
    "PO-LEGACY",
    purchaseOrderData(10, "2026-06-30"),
    "PO-LEGACY-create",
  );
  await apply(poController, store, "submit", "PO-LEGACY", draft.data, "PO-LEGACY-submit");
  assert.equal(store.snapshot().purchase_obligation_entries.length, 0);
});

test("enabled rollout opens obligations and Receipt 230 allocates FIFO as 200 + 30", async () => {
  const { store, poController, receiptController } = enabledFixture();
  const po1Draft = await apply(poController, store, "create", "PO-01", purchaseOrderData(200, "2026-07-01"), "PO-01-create");
  await apply(poController, store, "submit", "PO-01", po1Draft.data, "PO-01-submit");
  const po2Draft = await apply(poController, store, "create", "PO-02", purchaseOrderData(100, "2026-07-02"), "PO-02-create");
  await apply(poController, store, "submit", "PO-02", po2Draft.data, "PO-02-submit");

  const receiptDraft = await apply(
    receiptController,
    store,
    "create",
    "PR-01",
    receiptData([receiptItem(230, "ROW-1", 630)]),
    "PR-01-create",
  );
  await apply(receiptController, store, "submit", "PR-01", receiptDraft.data, "PR-01-submit");

  const snapshot = store.snapshot();
  assert.deepEqual(snapshot.purchase_allocation_entries.map((entry) => ({
    purchase_order: entry.purchase_order,
    qty_micros: entry.qty_micros,
  })), [
    { purchase_order: "PO-01", qty_micros: 200_000_000 },
    { purchase_order: "PO-02", qty_micros: 30_000_000 },
  ]);
  assert.equal(snapshot.purchase_unapplied_entries.length, 0);
  assert.equal(snapshot.stock_entries.at(-1).actual_qty_micros, 230_000_000);
  assert.equal(snapshot.stock_entries.at(-1).actual_weight_micros, 630_000_000);

  const remaining = await store.listPurchaseAllocationObligations(
    tenant,
    snapshot.purchase_allocation_entries[0].queue_key,
    snapshot.purchase_allocation_entries[0].window_id,
  );
  assert.deepEqual(remaining.map((entry) => ({
    purchase_order: entry.purchase_order,
    remaining_qty_micros: entry.remaining_qty_micros,
  })), [{ purchase_order: "PO-02", remaining_qty_micros: 70_000_000 }]);
});

test("a later PO consumes unapplied Receipt quantity with source voucher and weight conservation", async () => {
  const { store, poController, receiptController } = enabledFixture();
  const po1Draft = await apply(poController, store, "create", "PO-A", purchaseOrderData(100, "2026-07-01"), "PO-A-create");
  await apply(poController, store, "submit", "PO-A", po1Draft.data, "PO-A-submit");

  const receiptDraft = await apply(
    receiptController,
    store,
    "create",
    "PR-EXCESS",
    receiptData([receiptItem(105, "PR-ROW-1", 300)]),
    "PR-EXCESS-create",
  );
  await apply(receiptController, store, "submit", "PR-EXCESS", receiptDraft.data, "PR-EXCESS-submit");

  let snapshot = store.snapshot();
  const receive = snapshot.purchase_unapplied_entries.find((entry) => entry.entry_kind === "receive");
  assert.ok(receive);
  assert.equal(receive.qty_micros, 5_000_000);
  assert.equal(receive.voucher_no, "PR-EXCESS");
  assert.ok(receive.barem_weight_micros > 0);
  assert.ok(receive.projected_actual_weight_micros > 0);

  const po2Draft = await apply(poController, store, "create", "PO-B", purchaseOrderData(3, "2026-07-04"), "PO-B-create");
  await apply(poController, store, "submit", "PO-B", po2Draft.data, "PO-B-submit");

  snapshot = store.snapshot();
  const applied = snapshot.purchase_allocation_entries.find((entry) =>
    entry.entry_kind === "apply_unapplied" && entry.purchase_order === "PO-B");
  const movement = snapshot.purchase_unapplied_entries.find((entry) =>
    entry.entry_kind === "apply" && entry.allocation_entry_id === applied?.entry_id);
  assert.ok(applied);
  assert.ok(movement);
  assert.equal(applied.qty_micros, 3_000_000);
  assert.equal(applied.voucher_no, "PR-EXCESS");
  assert.equal(applied.voucher_revision, receive.voucher_revision);
  assert.equal(movement.qty_micros, -3_000_000);
  assert.equal(receive.qty_micros + movement.qty_micros, 2_000_000);
  assert.equal(receive.barem_weight_micros + movement.barem_weight_micros,
    (await store.listPurchaseUnappliedQueueSources(tenant, receive.queue_key, receive.window_id))[0].barem_weight_micros);
  assert.equal(receive.projected_actual_weight_micros + movement.projected_actual_weight_micros,
    (await store.listPurchaseUnappliedQueueSources(tenant, receive.queue_key, receive.window_id))[0].projected_actual_weight_micros);

  const compatibility = snapshot.procurement_entries.find((entry) =>
    entry.purchase_order === "PO-B" && entry.qty_micros === 3_000_000);
  assert.equal(compatibility.voucher_type, "Purchase Receipt");
  assert.equal(compatibility.voucher_no, "PR-EXCESS");

  const po3Draft = await apply(poController, store, "create", "PO-C", purchaseOrderData(2, "2026-07-05"), "PO-C-create");
  await apply(poController, store, "submit", "PO-C", po3Draft.data, "PO-C-submit");
  assert.equal((await store.listPurchaseUnappliedQueueSources(tenant, receive.queue_key, receive.window_id)).length, 0);

  const currentReceipt = await store.getDocument(tenant, receiptController.doctype, "PR-EXCESS");
  await apply(receiptController, store, "cancel", "PR-EXCESS", currentReceipt.data, "PR-EXCESS-cancel");
  const cancelled = store.snapshot();
  assert.equal(cancelled.purchase_allocation_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 0);
  assert.equal(cancelled.purchase_unapplied_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 0);
  assert.equal(cancelled.purchase_unapplied_entries.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0), 0);
  assert.equal(cancelled.purchase_unapplied_entries.reduce(
    (sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0), 0);
});

test("multiple Receipt lines create ordered unapplied sources consumed once by a later PO", async () => {
  const { store, poController, receiptController } = enabledFixture();
  const poDraft = await apply(poController, store, "create", "PO-MULTI-1", purchaseOrderData(100, "2026-07-01"), "PO-MULTI-1-create");
  await apply(poController, store, "submit", "PO-MULTI-1", poDraft.data, "PO-MULTI-1-submit");

  const receiptDraft = await apply(
    receiptController,
    store,
    "create",
    "PR-MULTI",
    receiptData([
      receiptItem(102, "ROW-A", 285),
      receiptItem(3, "ROW-B", 9),
    ]),
    "PR-MULTI-create",
  );
  await apply(receiptController, store, "submit", "PR-MULTI", receiptDraft.data, "PR-MULTI-submit");

  let snapshot = store.snapshot();
  const receives = snapshot.purchase_unapplied_entries.filter((entry) => entry.entry_kind === "receive");
  assert.deepEqual(receives.map((entry) => entry.qty_micros), [2_000_000, 3_000_000]);

  const po2Draft = await apply(poController, store, "create", "PO-MULTI-2", purchaseOrderData(4, "2026-07-06"), "PO-MULTI-2-create");
  await apply(poController, store, "submit", "PO-MULTI-2", po2Draft.data, "PO-MULTI-2-submit");
  snapshot = store.snapshot();
  const applied = snapshot.purchase_allocation_entries.filter((entry) =>
    entry.entry_kind === "apply_unapplied" && entry.purchase_order === "PO-MULTI-2");
  assert.deepEqual(applied.map((entry) => ({ row: entry.receipt_item_row_id, qty: entry.qty_micros })), [
    { row: "ROW-A", qty: 2_000_000 },
    { row: "ROW-B", qty: 2_000_000 },
  ]);
  const remainingSources = await store.listPurchaseUnappliedQueueSources(
    tenant,
    receives[0].queue_key,
    receives[0].window_id,
  );
  assert.deepEqual(remainingSources.map((source) => ({ row: source.receipt_item_row_id, qty: source.qty_micros })), [
    { row: "ROW-B", qty: 1_000_000 },
  ]);
});
