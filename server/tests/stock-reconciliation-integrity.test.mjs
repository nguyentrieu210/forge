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

function submittedContext({ actor, cancelReason = "", lockDate = null, tenantId = "tenant-a" } = {}) {
  const submitted = baseData([
    {
      row_id: "ROW-IN",
      item_code: "ITEM-IN",
      batch_no: "B-IN",
      serial_and_batch_bundle: "BUNDLE-IN",
      book_qty: "10.000000",
      book_qty_micros: 10_000_000,
      book_stock_value_minor: 1_000,
      counted_qty: "12.000000",
      variance_qty: "2.000000",
      variance_qty_micros: 2_000_000,
      variance_reason: "Sai số đếm",
    },
    {
      row_id: "ROW-OUT",
      item_code: "ITEM-OUT",
      batch_no: "B-OUT",
      serial_and_batch_bundle: "BUNDLE-OUT",
      book_qty: "10.000000",
      book_qty_micros: 10_000_000,
      book_stock_value_minor: 1_000,
      counted_qty: "9.000000",
      variance_qty: "-1.000000",
      variance_qty_micros: -1_000_000,
      variance_reason: "Sai số đếm",
    },
  ]);
  submitted.recon_state = "Đã ghi sổ";
  const requestedActor = actor ?? { user_id: "manager@example.test", roles: ["Chủ xưởng"] };
  const originalStock = [
    {
      line_key: "RECON-ROW-IN",
      item_code: "ITEM-IN",
      warehouse: "KHO-1",
      batch_no: "B-IN",
      actual_qty_micros: 2_000_000,
      valuation_rate_minor: 100,
      stock_value_difference_minor: 200,
      qty_scale: 6,
      currency_scale: 0,
      currency: "VND",
      posting_at: SNAPSHOT,
      allow_negative_stock: false,
    },
    {
      line_key: "RECON-ROW-OUT",
      item_code: "ITEM-OUT",
      warehouse: "KHO-1",
      batch_no: "B-OUT",
      actual_qty_micros: -1_000_000,
      valuation_rate_minor: 100,
      stock_value_difference_minor: -100,
      qty_scale: 6,
      currency_scale: 0,
      currency: "VND",
      posting_at: SNAPSHOT,
      allow_negative_stock: false,
    },
  ];
  const calls = [];
  return {
    calls,
    context: {
      command: {
        schema_version: 1,
        command_id: "cmd-cancel",
        tenant_id: tenantId,
        actor: requestedActor,
        aggregate: { doctype: "Stock Reconciliation", name: "RECON-1" },
        action: "cancel",
        expected_version: 2,
        payload_hash: "b".repeat(64),
        document: cancelReason ? { cancel_reason: cancelReason } : {},
      },
      existing: {
        tenant_id: tenantId,
        doctype: "Stock Reconciliation",
        name: "RECON-1",
        owner: "counter@example.test",
        docstatus: 1,
        status: "Đã ghi sổ",
        version: 2,
        created_at: SNAPSHOT,
        modified_at: NOW,
        data: submitted,
        children: [],
      },
      nextVersion: 3,
      now: NOW,
      reader: {
        async getVoucherStockEntries(...args) {
          calls.push(args);
          return structuredClone(originalStock);
        },
        async getPeriodLockDate(readTenant, company) {
          assert.equal(readTenant, tenantId);
          assert.equal(company, "ALU");
          return lockDate;
        },
      },
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

test("positive, negative and zero variance produce only authoritative stock-ledger deltas", async () => {
  const controller = new StockReconciliationIntegrityController();
  const data = baseData([
    { row_id: "PLUS", item_code: "PLUS", book_qty_micros: 10_000_000, book_stock_value_minor: 1_000, counted_qty: "12", variance_qty_micros: 2_000_000, variance_reason: "Sai số đếm" },
    { row_id: "MINUS", item_code: "MINUS", book_qty_micros: 20_000_000, book_stock_value_minor: 4_000, counted_qty: "15", variance_qty_micros: -5_000_000, variance_reason: "Sai số đếm" },
    { row_id: "ZERO", item_code: "ZERO", book_qty_micros: 7_000_000, book_stock_value_minor: 700, counted_qty: "7", variance_qty_micros: 0 },
  ]);
  const ctx = makeContext(data, data);
  ctx.command.action = "submit";
  ctx.command.actor = { user_id: "manager@example.test", roles: ["Chủ xưởng"] };
  ctx.reader.getMasterRecordData = async (_tenantId, type, name) => {
    if (type === "Item") return { item_code: name, has_batch_no: false, has_serial_no: false };
    return null;
  };
  const ledgers = await controller.ledger(ctx, data);
  assert.deepEqual(
    ledgers.stock.map((line) => [line.line_key, line.actual_qty_micros, line.stock_value_difference_minor]),
    [
      ["RECON-PLUS", 2_000_000, 200],
      ["RECON-MINUS", -5_000_000, -1_000],
    ],
  );
  assert.equal(ledgers.bundleUsages.length, 0);
});

test("standard cancel reverses exact submitted revision append-only and releases bundle usage", async () => {
  const controller = new StockReconciliationIntegrityController();
  const { context, calls } = submittedContext();
  const plan = await controller.buildPlan(context);
  assert.equal(plan.document.docstatus, 2);
  assert.equal(plan.document.status, "Đã đảo kiểm kê");
  assert.equal(plan.document.data.cancel_reason, undefined);
  assert.deepEqual(calls, [["tenant-a", "Stock Reconciliation", "RECON-1", 2]]);
  assert.deepEqual(
    plan.stock_entries.map((line) => [line.line_key, line.actual_qty_micros, line.stock_value_difference_minor]),
    [
      ["REV-RECON-ROW-IN", -2_000_000, -200],
      ["REV-RECON-ROW-OUT", 1_000_000, 100],
    ],
  );
  assert.deepEqual(
    plan.stock_bundle_usages.map((line) => [line.bundle_name, line.direction, line.usage_delta]),
    [
      ["BUNDLE-IN", "Inward", -1],
      ["BUNDLE-OUT", "Outward", -1],
    ],
  );
});

test("optional cancellation reason is retained in audit document", async () => {
  const controller = new StockReconciliationIntegrityController();
  const { context } = submittedContext({ cancelReason: "Đếm nhầm lô" });
  const plan = await controller.buildPlan(context);
  assert.equal(plan.document.data.cancel_reason, "Đếm nhầm lô");
});

test("reconciliation reversal requires authority, separation of duties and open period", async () => {
  const controller = new StockReconciliationIntegrityController();
  await assert.rejects(
    () => controller.buildPlan(submittedContext({ actor: { user_id: "keeper@example.test", roles: ["Thủ kho"] } }).context),
    /Chỉ Chủ xưởng được đảo/,
  );
  await assert.rejects(
    () => controller.buildPlan(submittedContext({ actor: { user_id: "counter@example.test", roles: ["Chủ xưởng"] } }).context),
    /Người đếm không được tự đảo/,
  );
  await assert.rejects(
    () => controller.buildPlan(submittedContext({ lockDate: "2026-08-03" }).context),
    /thuộc kỳ đã khoá/,
  );
});
