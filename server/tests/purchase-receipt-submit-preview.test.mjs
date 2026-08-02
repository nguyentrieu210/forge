import test from "node:test";
import assert from "node:assert/strict";
import {
  previewPurchaseReceiptSubmission,
  RolloutPurchaseOrderController,
  RolloutPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { InMemoryRolloutPurchaseAllocationMutationStore } from "../dist/packages/document-kernel/src/index.js";

const actor = { user_id: "Administrator", roles: ["System Manager", "Stock Manager"] };
const tenant = "demo";
const now = "2026-07-31T06:00:00.000Z";

function seedMasters(store) {
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
      stock_uom: "Kg",
      conversion_factor: 1,
      rate: 100_000,
    }],
  };
}

function receiptData(qtyBar, postingAt = "2026-07-03T00:00:00.000Z") {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: postingAt,
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

test("submit preview uses bar count for aluminium FIFO while commercial quantity stays kg", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  seedMasters(store);
  const po = new RolloutPurchaseOrderController();
  const receipt = new RolloutPurchaseReceiptController();

  const po1 = await apply(po, store, "create", "PO-01", purchaseOrderData(200, "2026-07-01"), "PO-01-create");
  await apply(po, store, "submit", "PO-01", po1.data, "PO-01-submit");
  const po2 = await apply(po, store, "create", "PO-02", purchaseOrderData(100, "2026-07-02"), "PO-02-create");
  await apply(po, store, "submit", "PO-02", po2.data, "PO-02-submit");
  const draft = await apply(receipt, store, "create", "PR-PREVIEW", receiptData(230), "PR-PREVIEW-create");

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
  assert.equal(preview.kind, "purchase_receipt_fifo");
  assert.deepEqual(preview.rows.map((row) => ({ po: row.destination, qty: row.qty })), [
    { po: "PO-01", qty: "200" },
    { po: "PO-02", qty: "30" },
  ]);
  assert.equal(preview.summary.find((entry) => entry.label === "Tổng nhận")?.value, "230");
  assert.equal(preview.summary.find((entry) => entry.label === "Kg barem")?.value, "644.184");
  assert.match(preview.warnings.join("\n"), /FIFO vẫn theo thứ tự commit/);
  assert.deepEqual(store.snapshot(), before);
});

test("submit preview is absent while purchase allocation rollout is disabled", async () => {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  seedMasters(store);
  const receipt = new RolloutPurchaseReceiptController();
  const draft = await apply(receipt, store, "create", "PR-LEGACY", receiptData(1, now), "PR-LEGACY-create");
  store.setPurchaseAllocationEnabled(false);
  const preview = await previewPurchaseReceiptSubmission({
    tenantId: tenant,
    actor,
    document: draft,
    reader: store,
    now,
  });
  assert.equal(preview, null);
});
