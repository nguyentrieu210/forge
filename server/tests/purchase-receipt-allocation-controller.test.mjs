import test from "node:test";
import assert from "node:assert/strict";
import {
  AllocatingPurchaseOrderController,
  AllocatingPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

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

function purchaseOrderData(qtyBar, transactionDate) {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    transaction_date: transactionDate,
    taxes: [],
    items: [{
      row_id: "ROW-1",
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

test("PO submit opens obligations and Receipt 230 allocates FIFO as 200 + 30", async () => {
  const store = new InMemoryPurchaseAllocationMutationStore();
  seedMasters(store);
  const poController = new AllocatingPurchaseOrderController();
  const receiptController = new AllocatingPurchaseReceiptController();

  const po1Draft = await apply(poController, store, "create", "PO-01", purchaseOrderData(200, "2026-07-01"), "PO-01-create");
  await apply(poController, store, "submit", "PO-01", po1Draft.data, "PO-01-submit");
  const po2Draft = await apply(poController, store, "create", "PO-02", purchaseOrderData(100, "2026-07-02"), "PO-02-create");
  await apply(poController, store, "submit", "PO-02", po2Draft.data, "PO-02-submit");

  const receiptData = {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: "2026-07-03T00:00:00.000Z",
    items: [{
      row_id: "ROW-1",
      item_code: "AL71",
      warehouse: "Main",
      qty: "644.184",
      qty_bar: 230,
      theoretical_kg: "644.184",
      actual_weight_kg: "630",
      length_m: 7.2,
      theoretical_kg_per_m: 0.389,
      color: "GS",
      is_stamped: "Có",
      uom: "Kg",
      stock_uom: "Cây",
      conversion_factor: (230 / 644.184).toFixed(6),
      rate: 100_000,
      valuation_rate: 100_000,
    }],
  };
  const receiptDraft = await apply(
    receiptController,
    store,
    "create",
    "PR-01",
    receiptData,
    "PR-01-create",
  );
  await apply(receiptController, store, "submit", "PR-01", receiptDraft.data, "PR-01-submit");

  const snapshot = store.snapshot();
  assert.deepEqual(snapshot.purchase_obligation_entries.map((entry) => ({
    purchase_order: entry.purchase_order,
    qty_micros: entry.qty_micros,
  })), [
    { purchase_order: "PO-01", qty_micros: 200_000_000 },
    { purchase_order: "PO-02", qty_micros: 100_000_000 },
  ]);
  assert.deepEqual(snapshot.purchase_allocation_entries.map((entry) => ({
    purchase_order: entry.purchase_order,
    qty_micros: entry.qty_micros,
  })), [
    { purchase_order: "PO-01", qty_micros: 200_000_000 },
    { purchase_order: "PO-02", qty_micros: 30_000_000 },
  ]);
  assert.equal(snapshot.purchase_unapplied_entries.length, 0);
  assert.equal(snapshot.stock_entries.at(-1).actual_qty_micros, 230_000_000,
    "stock and factory obligation use exact bar count, not barem kg");
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
