import assert from "node:assert/strict";
import test from "node:test";
import { StockReconciliationIntegrityController } from "../dist/packages/clouderp-erpnext/src/stock-reconciliation-integrity.js";

const NOW = "2026-08-03T09:00:00.000Z";
const SNAPSHOT = "2026-08-03T08:00:00.000Z";

function baseItems() {
  return [
    { row_id: "ROW-AL71", item_code: "AL71", batch_no: "B1", book_qty: "10.000000", book_qty_micros: 10_000_000, book_stock_value_minor: 1_000_000, counted_qty: "10.000000" },
    { row_id: "ROW-AL72", item_code: "AL72", batch_no: "B2", book_qty: "20.000000", book_qty_micros: 20_000_000, book_stock_value_minor: 4_000_000, counted_qty: "20.000000" },
  ];
}

function baseData(items = baseItems()) {
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

function makeContext(document, existing = baseData()) {
  return {
    command: {
      schema_version: 1,
      command_id: "cmd-save",
      tenant_id: "tenant-a",
      actor: { user_id: "keeper@example.test", roles: ["Thủ kho"] },
      aggregate: { doctype: "Stock Reconciliation", name: "RECON-1" },
      action: "save",
      expected_version: 1,
      payload_hash: "a".repeat(64),
      document,
    },
    existing: {
      tenant_id: "tenant-a",
      doctype: "Stock Reconciliation",
      name: "RECON-1",
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
      async getMasterRecordData(_tenantId, type, name) {
        if (type === "Warehouse") return { company: "ALU", stock_role: "Kho chính" };
        if (type === "Company") return { default_currency: "VND" };
        if (type === "Currency") return { currency_scale: 0 };
        if (type === "Item") return { item_code: name, item_group: name === "AL99" ? "Khác" : "Nhôm", has_catch_weight: false };
        return null;
      },
      async listMasterRecordData() { return []; },
      async getPeriodLockDate() { return null; },
      async getTrackedStockState(_tenantId, itemCode) {
        return itemCode === "AL71"
          ? { qty_micros: 999_000_000, weight_micros: null, stock_value_minor: 99_900_000 }
          : { qty_micros: 888_000_000, weight_micros: null, stock_value_minor: 88_800_000 };
      },
      async getDocument() { return null; },
      async listDocumentsByDoctype() { return []; },
    },
  };
}

test("reorder keeps frozen book values attached to item and batch identity", async () => {
  const controller = new StockReconciliationIntegrityController();
  const existing = baseData();
  const document = {
    ...existing,
    items: [
      { ...existing.items[1], counted_qty: "19", variance_reason: "Sai số đếm" },
      { ...existing.items[0], counted_qty: "9", variance_reason: "Sai số đếm" },
    ],
  };
  const normalized = await controller.normalize(makeContext(document, existing));
  assert.deepEqual(normalized.items.map((row) => row.row_id), ["ROW-AL71", "ROW-AL72"]);
  assert.deepEqual(normalized.items.map((row) => row.book_qty_micros), [10_000_000, 20_000_000]);
  assert.deepEqual(normalized.items.map((row) => row.variance_qty_micros), [-1_000_000, -1_000_000]);
});

test("snapshot envelope cannot move warehouse, scope, snapshot time or counter after capture", async () => {
  const controller = new StockReconciliationIntegrityController();
  const existing = baseData();
  for (const patch of [
    { warehouse: "KHO-2" },
    { scope: "Theo mã hàng", item_code: "AL71" },
    { snapshot_at: "2026-08-03T08:30:00.000Z" },
    { counted_by: "other@example.test" },
  ]) {
    await assert.rejects(
      () => controller.normalize(makeContext({ ...existing, ...patch }, existing)),
      /đã chốt sổ: không được đổi/,
    );
  }
});

test("snapshot rows cannot be deleted and duplicate identities fail closed", async () => {
  const controller = new StockReconciliationIntegrityController();
  const existing = baseData();
  await assert.rejects(
    () => controller.normalize(makeContext({ ...existing, items: [existing.items[0]] }, existing)),
    /không được xoá 1 dòng snapshot/,
  );
  await assert.rejects(
    () => controller.normalize(makeContext({ ...existing, items: [existing.items[0], existing.items[0], existing.items[1]] }, existing)),
    /trùng dòng AL71 \/ lô B1/,
  );
});

test("new physical rows must stay inside the frozen item-group scope", async () => {
  const controller = new StockReconciliationIntegrityController();
  const existing = baseData([{ ...baseItems()[0] }]);
  existing.scope = "Theo nhóm hàng";
  existing.item_group = "Nhôm";
  const document = {
    ...existing,
    items: [...existing.items, { row_id: "EXTRA", item_code: "AL99", batch_no: "B9", counted_qty: "1" }],
  };
  await assert.rejects(
    () => controller.normalize(makeContext(document, existing)),
    /nằm ngoài nhóm hàng Nhôm/,
  );
});
