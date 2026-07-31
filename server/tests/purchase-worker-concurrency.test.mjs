import test from "node:test";
import assert from "node:assert/strict";
import {
  RolloutPurchaseOrderController,
  RolloutPurchaseReceiptController,
} from "../dist/packages/clouderp-core/src/index.js";
import { commandPayloadHash, errors } from "../dist/packages/core/src/index.js";
import {
  ControllerRegistry,
  DocumentKernel,
  InMemoryRolloutPurchaseAllocationMutationStore,
} from "../dist/packages/document-kernel/src/index.js";
import {
  executePurchaseCommandWithRevisionRetry,
  PurchaseCommandSerialExecutor,
  PURCHASE_REVISION_RETRIES,
} from "../dist/apps/tenant-worker/src/purchase-command-retry.js";

const actor = { user_id: "Administrator", roles: ["System Manager", "Stock Manager"] };
const tenant = "demo";
const now = "2026-07-31T09:00:00.000Z";

function fixture(tolerancePct = 5) {
  const store = new InMemoryRolloutPurchaseAllocationMutationStore();
  store.setPurchaseAllocationEnabled(true);
  store.seedMaster("Company", "Alumdoor", tenant, { default_currency: "VND" });
  store.seedMaster("Supplier", "FACTORY-1", tenant, { receipt_tolerance_pct: tolerancePct });
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
  const registry = new ControllerRegistry()
    .register(new RolloutPurchaseOrderController())
    .register(new RolloutPurchaseReceiptController());
  return {
    store,
    kernel: new DocumentKernel(registry, store, { assert() {} }, () => now),
    executor: new PurchaseCommandSerialExecutor(),
  };
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

function receiptData(qtyBar, rowId, actualWeightKg, postingAt = "2026-07-03T00:00:00.000Z") {
  const theoreticalKg = qtyBar * 7.2 * 0.389;
  return {
    supplier: "FACTORY-1",
    company: "Alumdoor",
    currency: "VND",
    posting_at: postingAt,
    items: [{
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
    }],
  };
}

async function makeCommand(store, doctype, name, action, document, commandId) {
  const existing = await store.getDocument(tenant, doctype, name);
  const value = {
    command_id: commandId,
    tenant_id: tenant,
    aggregate: { doctype, name },
    action,
    expected_version: action === "create" ? null : existing?.version ?? null,
    payload_hash: "",
    actor,
    document,
  };
  value.payload_hash = await commandPayloadHash(value);
  return value;
}

async function execute(kernel, store, doctype, name, action, document, commandId) {
  return kernel.execute(await makeCommand(store, doctype, name, action, document, commandId));
}

async function submit(executor, kernel, store, doctype, name, document, commandId) {
  const value = await makeCommand(store, doctype, name, "submit", document, commandId);
  return executor.execute(() => kernel.execute(value));
}

test("worker retry is bounded, selective, and the serial queue releases after failure", async () => {
  let attempts = 0;
  assert.equal(await executePurchaseCommandWithRevisionRetry(async () => {
    attempts += 1;
    if (attempts < PURCHASE_REVISION_RETRIES) throw errors.purchaseAllocationConflict();
    return "ok";
  }), "ok");
  assert.equal(attempts, PURCHASE_REVISION_RETRIES);

  attempts = 0;
  await assert.rejects(
    executePurchaseCommandWithRevisionRetry(async () => {
      attempts += 1;
      throw errors.validation("not retryable");
    }),
    (error) => error.code === "VALIDATION_ERROR",
  );
  assert.equal(attempts, 1);

  const executor = new PurchaseCommandSerialExecutor();
  await assert.rejects(executor.execute(async () => { throw errors.validation("first failed"); }));
  assert.equal(await executor.execute(async () => "next"), "next");
});

test("concurrent Receipt submits on one supplier coordinator do not over-allocate and remain idempotent", async () => {
  const { store, kernel, executor } = fixture(50);
  const po = purchaseOrderData(10, "2026-07-01");
  await execute(kernel, store, "Purchase Order", "PO-RACE", "create", po, "PO-RACE-create");
  await submit(executor, kernel, store, "Purchase Order", "PO-RACE", po, "PO-RACE-submit");

  const prA = receiptData(7, "ROW-A", 20);
  const prB = receiptData(7, "ROW-B", 21, "2026-07-03T00:01:00.000Z");
  await execute(kernel, store, "Purchase Receipt", "PR-RACE-A", "create", prA, "PR-RACE-A-create");
  await execute(kernel, store, "Purchase Receipt", "PR-RACE-B", "create", prB, "PR-RACE-B-create");
  const commandA = await makeCommand(store, "Purchase Receipt", "PR-RACE-A", "submit", prA, "PR-RACE-A-submit");
  const commandB = await makeCommand(store, "Purchase Receipt", "PR-RACE-B", "submit", prB, "PR-RACE-B-submit");

  const [receiptA, receiptB] = await Promise.all([
    executor.execute(() => kernel.execute(commandA)),
    executor.execute(() => kernel.execute(commandB)),
  ]);
  const snapshot = store.snapshot();
  assert.equal(snapshot.purchase_allocation_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 10_000_000);
  assert.equal(snapshot.purchase_unapplied_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 4_000_000);
  assert.equal(snapshot.stock_entries.reduce((sum, entry) => sum + entry.actual_qty_micros, 0), 14_000_000);
  assert.equal(new Set(snapshot.purchase_allocation_entries.map((entry) => entry.entry_id)).size,
    snapshot.purchase_allocation_entries.length);

  const counts = [
    snapshot.purchase_allocation_entries.length,
    snapshot.purchase_unapplied_entries.length,
    snapshot.stock_entries.length,
  ];
  assert.deepEqual(await kernel.execute(commandA), receiptA);
  assert.deepEqual(await kernel.execute(commandB), receiptB);
  const replayed = store.snapshot();
  assert.deepEqual([
    replayed.purchase_allocation_entries.length,
    replayed.purchase_unapplied_entries.length,
    replayed.stock_entries.length,
  ], counts);
});

test("concurrent PO submits consume one unapplied source once with quantity and weight conservation", async () => {
  const { store, kernel, executor } = fixture();
  const seedPo = purchaseOrderData(100, "2026-07-01");
  await execute(kernel, store, "Purchase Order", "PO-SEED", "create", seedPo, "PO-SEED-create");
  await submit(executor, kernel, store, "Purchase Order", "PO-SEED", seedPo, "PO-SEED-submit");
  const sourceReceipt = receiptData(105, "SOURCE", 300);
  await execute(kernel, store, "Purchase Receipt", "PR-SOURCE", "create", sourceReceipt, "PR-SOURCE-create");
  await submit(executor, kernel, store, "Purchase Receipt", "PR-SOURCE", sourceReceipt, "PR-SOURCE-submit");
  const source = store.snapshot().purchase_unapplied_entries.find((entry) => entry.entry_kind === "receive");
  assert.ok(source);

  const poA = purchaseOrderData(3, "2026-07-04", "ROW-A");
  const poB = purchaseOrderData(4, "2026-07-04", "ROW-B");
  await execute(kernel, store, "Purchase Order", "PO-CONSUME-A", "create", poA, "PO-CONSUME-A-create");
  await execute(kernel, store, "Purchase Order", "PO-CONSUME-B", "create", poB, "PO-CONSUME-B-create");
  await Promise.all([
    submit(executor, kernel, store, "Purchase Order", "PO-CONSUME-A", poA, "PO-CONSUME-A-submit"),
    submit(executor, kernel, store, "Purchase Order", "PO-CONSUME-B", poB, "PO-CONSUME-B-submit"),
  ]);

  const snapshot = store.snapshot();
  const applied = snapshot.purchase_allocation_entries.filter((entry) => entry.entry_kind === "apply_unapplied");
  const movements = snapshot.purchase_unapplied_entries.filter((entry) => entry.entry_kind === "apply");
  assert.equal(applied.reduce((sum, entry) => sum + entry.qty_micros, 0), 5_000_000);
  assert.equal(movements.reduce((sum, entry) => sum + entry.qty_micros, 0), -5_000_000);
  assert.equal(source.qty_micros + movements.reduce((sum, entry) => sum + entry.qty_micros, 0), 0);
  assert.equal(source.barem_weight_micros
    + movements.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0), 0);
  assert.equal(source.projected_actual_weight_micros
    + movements.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0), 0);
  assert.equal((await store.listPurchaseUnappliedQueueSources(tenant, source.queue_key, source.window_id)).length, 0);
  assert.equal(snapshot.procurement_entries
    .filter((entry) => entry.voucher_no === "PR-SOURCE")
    .reduce((sum, entry) => sum + entry.qty_micros, 0), 105_000_000);
});

test("production-shaped cancel reverses allocated and cross-voucher unapplied effects through DocumentKernel", async () => {
  const { store, kernel, executor } = fixture();
  const po1 = purchaseOrderData(100, "2026-07-01");
  await execute(kernel, store, "Purchase Order", "PO-CANCEL-1", "create", po1, "PO-CANCEL-1-create");
  await submit(executor, kernel, store, "Purchase Order", "PO-CANCEL-1", po1, "PO-CANCEL-1-submit");
  const receipt = receiptData(105, "PR-CANCEL-ROW", 300);
  await execute(kernel, store, "Purchase Receipt", "PR-CANCEL", "create", receipt, "PR-CANCEL-create");
  await submit(executor, kernel, store, "Purchase Receipt", "PR-CANCEL", receipt, "PR-CANCEL-submit");
  const po2 = purchaseOrderData(3, "2026-07-04");
  await execute(kernel, store, "Purchase Order", "PO-CANCEL-2", "create", po2, "PO-CANCEL-2-create");
  await submit(executor, kernel, store, "Purchase Order", "PO-CANCEL-2", po2, "PO-CANCEL-2-submit");

  const cancelCommand = await makeCommand(store, "Purchase Receipt", "PR-CANCEL", "cancel", receipt, "PR-CANCEL-cancel");
  const cancelReceipt = await executor.execute(() => kernel.execute(cancelCommand));
  assert.equal(cancelReceipt.aggregate_version, 3);
  assert.equal((await store.getDocument(tenant, "Purchase Receipt", "PR-CANCEL")).docstatus, 2);

  const after = store.snapshot();
  assert.equal(after.purchase_allocation_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 0);
  assert.equal(after.purchase_allocation_entries.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0), 0);
  assert.equal(after.purchase_allocation_entries.reduce((sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0), 0);
  assert.equal(after.purchase_unapplied_entries.reduce((sum, entry) => sum + entry.qty_micros, 0), 0);
  assert.equal(after.purchase_unapplied_entries.reduce((sum, entry) => sum + (entry.barem_weight_micros ?? 0), 0), 0);
  assert.equal(after.purchase_unapplied_entries.reduce(
    (sum, entry) => sum + (entry.projected_actual_weight_micros ?? 0), 0), 0);
  assert.deepEqual(await kernel.execute(cancelCommand), cancelReceipt);
});
