import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_STOCK_RECONCILIATION_BATCH_ROWS,
  buildStockReconciliationBatchDocument,
  stockReconciliationBatchValuesMatch,
} from "../dist/packages/clouderp-erpnext/src/stock-reconciliation-batch.js";
import { StockReconciliationIntegrityController } from "../dist/packages/clouderp-erpnext/src/stock-reconciliation-integrity.js";

const NOW = "2026-08-04T04:00:00.000Z";
const SNAPSHOT = "2026-08-04T03:00:00.000Z";

function snapshotItems() {
  return [
    {
      row_id: "ROW-AL71",
      item_code: "AL71",
      batch_no: "B1",
      book_qty: "10.000000",
      book_qty_micros: 10_000_000,
      book_stock_value_minor: 1_000_000,
      counted_qty: "10.000000",
      variance_qty: "0.000000",
      variance_qty_micros: 0,
    },
    {
      row_id: "ROW-AL72",
      item_code: "AL72",
      batch_no: "B2",
      book_qty: "20.000000",
      book_qty_micros: 20_000_000,
      book_stock_value_minor: 4_000_000,
      counted_qty: "20.000000",
      variance_qty: "0.000000",
      variance_qty_micros: 0,
    },
  ];
}

function baseData(items = snapshotItems()) {
  return {
    warehouse: "KHO-1",
    scope: "Toàn kho",
    snapshot_at: SNAPSHOT,
    counted_by: "counter@example.test",
    witnessed_by: "witness@example.test",
    recon_state: "Đang đếm",
    company: "ALU",
    currency: "VND",
    currency_scale: 0,
    items,
  };
}

function makeContext(document, existing = baseData(), { tenantId = "tenant-a" } = {}) {
  const reads = [];
  return {
    reads,
    context: {
      command: {
        schema_version: 1,
        command_id: "cmd-batch-preview",
        tenant_id: tenantId,
        actor: { user_id: "keeper@example.test", roles: ["Thủ kho"] },
        aggregate: { doctype: "Stock Reconciliation", name: "RECON-BATCH-1" },
        action: "save",
        expected_version: 1,
        payload_hash: "c".repeat(64),
        document,
      },
      existing: {
        tenant_id: tenantId,
        doctype: "Stock Reconciliation",
        name: "RECON-BATCH-1",
        owner: "counter@example.test",
        docstatus: 0,
        status: "Đang đếm",
        version: 1,
        created_at: SNAPSHOT,
        modified_at: SNAPSHOT,
        data: existing,
        children: [],
      },
      nextVersion: 2,
      now: NOW,
      reader: {
        async getMasterRecordData(readTenant, type, name) {
          reads.push(["master", readTenant, type, name]);
          if (type === "Warehouse") return { company: "ALU", stock_role: "Kho chính" };
          if (type === "Company") return { default_currency: "VND" };
          if (type === "Currency") return { currency_scale: 0 };
          if (type === "Item") {
            return {
              item_code: name,
              item_group: name === "AL99" ? "Khác" : "Nhôm",
              has_catch_weight: false,
              has_batch_no: Boolean(name !== "AL73"),
              has_serial_no: false,
            };
          }
          return null;
        },
        async listMasterRecordData() { return []; },
        async getPeriodLockDate(readTenant, company) {
          reads.push(["period", readTenant, company]);
          return null;
        },
        async getTrackedStockState(readTenant, itemCode, warehouse, batchNo, snapshotAt) {
          reads.push(["stock", readTenant, itemCode, warehouse, batchNo ?? "", snapshotAt]);
          if (itemCode === "AL71") return { qty_micros: 999_000_000, weight_micros: null, stock_value_minor: 99_900_000 };
          if (itemCode === "AL72") return { qty_micros: 888_000_000, weight_micros: null, stock_value_minor: 88_800_000 };
          return { qty_micros: 0, weight_micros: null, stock_value_minor: 0 };
        },
        async getDocument() { return null; },
        async listDocumentsByDoctype() { return []; },
      },
    },
  };
}

function counted(itemCode, batchNo, qty, reason = "") {
  return {
    item_code: itemCode,
    ...(batchNo ? { batch_no: batchNo } : {}),
    counted_qty: qty,
    ...(reason ? { variance_reason: reason } : {}),
  };
}

test("batch mapper preserves frozen snapshot identity/order and ignores caller book-state fields", () => {
  const draft = baseData();
  const mapped = buildStockReconciliationBatchDocument(draft, [
    { ...counted("AL72", "B2", 19, "Sai số đếm"), book_qty_micros: 123 },
    { ...counted("AL71", "B1", 10), variance_qty_micros: 456 },
    { ...counted("AL73", "", 2, "Khác"), variance_note: "Tìm thấy hàng ngoài snapshot", valuation_rate: 100000 },
  ]);

  assert.deepEqual(mapped.items.map((row) => [row.row_id, row.item_code, row.batch_no ?? ""]), [
    ["ROW-AL71", "AL71", "B1"],
    ["ROW-AL72", "AL72", "B2"],
    ["BATCH-EXTRA-1", "AL73", ""],
  ]);
  assert.equal(mapped.items[0].book_qty_micros, 10_000_000);
  assert.equal(mapped.items[1].book_qty_micros, 20_000_000);
  assert.equal(mapped.items[0].variance_qty_micros, 0);
  assert.equal(mapped.items[1].counted_qty, 19);
  assert.equal(mapped.items[2].book_qty_micros, undefined);
});

test("batch mapper fails closed on missing, duplicate, ambiguous and oversized row sets", () => {
  const draft = baseData();
  assert.throws(
    () => buildStockReconciliationBatchDocument(draft, [counted("AL71", "B1", 10)]),
    /cover every frozen snapshot row; missing 1/i,
  );
  assert.throws(
    () => buildStockReconciliationBatchDocument(draft, [
      counted("AL71", "B1", 10), counted("AL71", "B1", 10), counted("AL72", "B2", 20),
    ]),
    /duplicate row/i,
  );
  assert.throws(
    () => buildStockReconciliationBatchDocument(draft, [
      counted("AL71", "B1", 10), counted("AL72", "B2", 20), counted("AL71", "", 1, "Sai số đếm"),
    ]),
    /cannot mix aggregate and batch-specific rows/i,
  );
  assert.throws(
    () => buildStockReconciliationBatchDocument(
      { ...draft, items: [] },
      Array.from({ length: MAX_STOCK_RECONCILIATION_BATCH_ROWS + 1 }, (_, index) => counted(`ITEM-${index}`, "", 0)),
    ),
    /at most 500 rows/i,
  );
});

test("mapped batch preview uses canonical controller calculations and produces zero authoritative side effects on save", async () => {
  const existing = baseData();
  const mapped = buildStockReconciliationBatchDocument(existing, [
    counted("AL72", "B2", 20),
    counted("AL71", "B1", 9, "Sai số đếm"),
  ]);
  const controller = new StockReconciliationIntegrityController();
  const { context, reads } = makeContext(mapped, existing);
  const plan = await controller.buildPlan(context);

  assert.equal(plan.command.action, "save");
  assert.equal(plan.document.docstatus, 0);
  assert.deepEqual(plan.document.data.items.map((row) => [row.item_code, row.book_qty_micros, row.counted_qty, row.variance_qty_micros]), [
    ["AL71", 10_000_000, "9.000000", -1_000_000],
    ["AL72", 20_000_000, "20.000000", 0],
  ]);
  assert.equal(plan.stock_entries.length, 0);
  assert.equal(plan.gl_entries.length, 0);
  assert.equal(plan.payment_entries.length, 0);
  assert.equal(plan.fulfillment_entries.length, 0);
  assert.equal(plan.stock_bundle_usages.length, 0);
  assert.ok(reads.length > 0);
  assert.ok(reads.every((entry) => entry[1] === "tenant-a"));
});

test("extra physical rows are left to canonical Stock Reconciliation scope validation", async () => {
  const existing = {
    ...baseData([{ ...snapshotItems()[0] }]),
    scope: "Theo nhóm hàng",
    item_group: "Nhôm",
  };
  const mapped = buildStockReconciliationBatchDocument(existing, [
    counted("AL71", "B1", 10),
    counted("AL99", "B9", 1, "Khác"),
  ]);
  const controller = new StockReconciliationIntegrityController();
  await assert.rejects(
    () => controller.buildPlan(makeContext(mapped, existing).context),
    /nằm ngoài nhóm hàng Nhôm/,
  );
});

test("domain replay comparison is deterministic but does not replace shared executor idempotency", () => {
  const firstRows = [
    counted("AL71", "B1", "9.000000", "Sai số đếm"),
    counted("AL72", "B2", 20),
    { ...counted("AL73", "", 2, "Khác"), variance_note: "Ngoài snapshot", valuation_rate: "100000.000000" },
  ];
  const canonical = buildStockReconciliationBatchDocument(baseData(), firstRows);
  canonical.items[0].book_qty_micros = 10_000_000;
  canonical.items[0].variance_qty_micros = -1_000_000;
  canonical.items[2].book_qty_micros = 0;
  canonical.items[2].variance_qty_micros = 2_000_000;

  assert.equal(stockReconciliationBatchValuesMatch(canonical, [
    counted("AL71", "B1", 9, "Sai số đếm"),
    counted("AL72", "B2", "20.000000"),
    { ...counted("AL73", "", "2.000000", "Khác"), variance_note: "Ngoài snapshot", valuation_rate: 100000 },
  ]), true);
  assert.equal(stockReconciliationBatchValuesMatch(canonical, [
    counted("AL71", "B1", 8, "Sai số đếm"),
    counted("AL72", "B2", 20),
    { ...counted("AL73", "", 2, "Khác"), variance_note: "Ngoài snapshot", valuation_rate: 100000 },
  ]), false);
});
