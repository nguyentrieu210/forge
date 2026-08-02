import test from "node:test";
import assert from "node:assert/strict";
import {
  previewPurchaseReceiptSubmission,
  RolloutPurchaseOrderController,
  RolloutPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const tenant = "demo";
const actor = { user_id: "Administrator", roles: ["System Manager", "Stock Manager"] };
const now = "2026-08-03T08:00:00.000Z";

function seed(store) {
  store.seedMaster("Company", "Alumdoor", tenant, { default_currency: "VND" });
  store.seedMaster("Supplier", "FACTORY-1", tenant, { receipt_tolerance_pct: 5 });
  store.seedMaster("Currency", "VND", tenant, { currency_scale: 2 });
  store.seedMaster("Warehouse", "Main", tenant);
  store.seedMaster("Item", "AL71", tenant, {
    stock_uom: "Kg",
    default_purchase_uom: "Kg",
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    has_catch_weight: true,
    weight_uom: "Kg",
  });
}

async function apply(controller, store, action, name, document, commandId) {
  const existing = await store.getDocument(tenant, controller.doctype, name);
  const plan = await controller.buildPlan({
    command: {
      schema_version: 1,
      command_id: commandId,
      tenant_id: tenant,
      aggregate: { doctype: controller.doctype, name },
      action,
      expected_version: existing?.version ?? null,
      payload_hash: "0".repeat(64),
      actor,
      document,
    },
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
      stock_uom: "Kg",
      conversion_factor: 1,
      rate: 100_000,
    }],
  };
}

function receiptData(qtyBar) {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: "2026-08-03T00:00:00.000Z",
    items: [{
      row_id: "PR-ROW-1",
      item_code: "AL71",
      warehouse: "Main",
      qty: theoreticalKg.toFixed(3),
      qty_bar: qtyBar,
      theoretical_kg: theoreticalKg.toFixed(3),
      actual_weight_kg: theoreticalKg.toFixed(3),
      length_m: 7.2,
      theoretical_kg_per_m: 0.389,
      color: "GS",
      is_stamped: "Có",
      uom: "Kg",
      stock_uom: "Kg",
      conversion_factor: 1,
      rate: 100_000,
      valuation_rate: 100_000,
    }],
  };
}

test("allocation FIFO counts aluminium bars while commercial voucher quantity remains kg", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  seed(store);
  const po = new RolloutPurchaseOrderController();
  const receipt = new RolloutPurchaseReceiptController();

  const po1 = await apply(po, store, "create", "PO-01", purchaseOrderData(200, "2026-08-01"), "po1-create");
  await apply(po, store, "submit", "PO-01", po1.data, "po1-submit");
  const po2 = await apply(po, store, "create", "PO-02", purchaseOrderData(100, "2026-08-02"), "po2-create");
  await apply(po, store, "submit", "PO-02", po2.data, "po2-submit");
  const draft = await apply(receipt, store, "create", "PR-01", receiptData(230), "pr-create");

  assert.equal(draft.data.items[0].stock_uom, "Kg");
  assert.equal(Number(draft.data.items[0].qty), 644.184);
  assert.equal(Number(draft.data.items[0].qty_bar), 230);

  const before = structuredClone(store.snapshot());
  const preview = await previewPurchaseReceiptSubmission({
    tenantId: tenant,
    actor,
    document: draft,
    reader: store,
    now,
  });
  assert.ok(preview);
  assert.deepEqual(preview.rows.map((row) => ({ po: row.destination, qty: row.qty })), [
    { po: "PO-01", qty: "200" },
    { po: "PO-02", qty: "30" },
  ]);
  assert.equal(preview.summary.find((entry) => entry.label === "Tổng nhận")?.value, "230");
  assert.equal(preview.summary.find((entry) => entry.label === "Kg barem")?.value, "644.184");
  assert.deepEqual(store.snapshot(), before);
});
