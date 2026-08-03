import test from "node:test";
import assert from "node:assert/strict";
import { RepostItemValuationIntegrityController } from "../dist/packages/clouderp-stock/src/repost-integrity.js";

const NOW = "2026-08-03T10:00:00.000Z";

function document(overrides = {}) {
  return {
    company: "COMP-A",
    item_code: "ITEM-1",
    warehouse: "WH-A",
    posting_at: "2026-08-03T09:00:00.000Z",
    stock_account: "STOCK-A",
    difference_account: "DIFF-A",
    ...overrides,
  };
}

function staleHistory() {
  return [
    {
      line_key: "IN-1",
      item_code: "ITEM-1",
      warehouse: "WH-A",
      actual_qty_micros: 10_000_000,
      valuation_rate_minor: 100,
      stock_value_difference_minor: 1_000,
      qty_scale: 6,
      currency_scale: 0,
      currency: "VND",
      posting_at: "2026-08-01T08:00:00.000Z",
    },
    {
      line_key: "OUT-STALE",
      item_code: "ITEM-1",
      warehouse: "WH-A",
      actual_qty_micros: -5_000_000,
      valuation_rate_minor: 80,
      stock_value_difference_minor: -400,
      qty_scale: 6,
      currency_scale: 0,
      currency: "VND",
      posting_at: "2026-08-02T08:00:00.000Z",
    },
  ];
}

function reader({ warehouseCompany = "COMP-A", isGroup = 0, lockDate = null, calls = [] } = {}) {
  return {
    async getMasterRecordData(_tenantId, type, name) {
      if (type === "Warehouse") return { company: warehouseCompany, is_group: isGroup };
      if (type === "Company") return { default_currency: "VND", default_valuation_method: "FIFO" };
      if (type === "Currency") return { currency_scale: 0 };
      if (type === "Item") return { item_code: name, valuation_method: "FIFO" };
      if (type === "Account") return { company: "COMP-A" };
      return null;
    },
    async hasMasterRecord() { return true; },
    async getStockLedgerHistory(tenantId, itemCode, warehouse, throughPostingAt) {
      calls.push(["history", tenantId, itemCode, warehouse, throughPostingAt]);
      return staleHistory();
    },
    async getPeriodLockDate(tenantId, company) {
      calls.push(["lock", tenantId, company]);
      return lockDate;
    },
    async getVoucherStockEntries(tenantId, doctype, name, revision) {
      calls.push(["stock", tenantId, doctype, name, revision]);
      return [{
        line_key: "VALUATION-ADJUSTMENT-HISTORICAL",
        item_code: "ITEM-1",
        warehouse: "WH-A",
        actual_qty_micros: 0,
        valuation_rate_minor: 0,
        stock_value_difference_minor: -123,
        qty_scale: 6,
        currency_scale: 0,
        currency: "VND",
        posting_at: "2026-08-03T09:00:00.000Z",
      }];
    },
    async getVoucherGlEntries(tenantId, doctype, name, revision) {
      calls.push(["gl", tenantId, doctype, name, revision]);
      return [
        { line_key: "STOCK-HISTORICAL", account: "STOCK-A", debit_minor: 0, credit_minor: 123, currency: "VND", currency_scale: 0, posting_at: "2026-08-03T09:00:00.000Z" },
        { line_key: "DIFF-HISTORICAL", account: "DIFF-A", debit_minor: 123, credit_minor: 0, currency: "VND", currency_scale: 0, posting_at: "2026-08-03T09:00:00.000Z" },
      ];
    },
  };
}

function context({ data = document(), sourceReader = reader(), action = "save", tenantId = "tenant-a" } = {}) {
  const existingData = action === "cancel"
    ? {
        ...document(),
        valuation_method: "FIFO",
        current_stock_value_minor: 600,
        expected_stock_value_minor: 500,
        adjustment_minor: -100,
        currency: "VND",
        currency_scale: 0,
      }
    : document();
  return {
    command: {
      schema_version: 1,
      command_id: `repost-${action}`,
      tenant_id: tenantId,
      actor: { user_id: "stock@example.test", roles: ["Stock Manager"] },
      aggregate: { doctype: "Repost Item Valuation", name: "RIV-1" },
      action,
      expected_version: 1,
      payload_hash: "a".repeat(64),
      document: data,
    },
    existing: {
      tenant_id: tenantId,
      doctype: "Repost Item Valuation",
      name: "RIV-1",
      owner: "stock@example.test",
      docstatus: action === "cancel" ? 1 : 0,
      status: action === "cancel" ? "Submitted" : "Draft",
      version: action === "cancel" ? 2 : 1,
      created_at: "2026-08-03T08:00:00.000Z",
      modified_at: "2026-08-03T09:00:00.000Z",
      data: existingData,
      children: [],
    },
    nextVersion: action === "cancel" ? 3 : 2,
    now: NOW,
    reader: sourceReader,
  };
}

test("valuation repost không cho posting_at ở tương lai", async () => {
  const controller = new RepostItemValuationIntegrityController();
  await assert.rejects(
    () => controller.normalize(context({ data: document({ posting_at: "2026-08-04T00:00:00.000Z" }) })),
    /cannot be in the future/,
  );
});

test("valuation repost không post vào warehouse group", async () => {
  const controller = new RepostItemValuationIntegrityController();
  await assert.rejects(
    () => controller.normalize(context({ sourceReader: reader({ isGroup: 1 }) })),
    /is a group/,
  );
});

test("valuation repost fail closed khi warehouse thuộc công ty khác", async () => {
  const controller = new RepostItemValuationIntegrityController();
  await assert.rejects(
    () => controller.normalize(context({ sourceReader: reader({ warehouseCompany: "COMP-B" }) })),
    /belongs to COMP-B.*COMP-A/,
  );
});

test("backdated stale issue replays FIFO and derives exact current stock adjustment", async () => {
  const controller = new RepostItemValuationIntegrityController();
  const calls = [];
  const normalized = await controller.normalize(context({ sourceReader: reader({ calls }) }));
  assert.equal(normalized.valuation_method, "FIFO");
  assert.equal(normalized.current_stock_value_minor, 600);
  assert.equal(normalized.expected_stock_value_minor, 500);
  assert.equal(normalized.adjustment_minor, -100);
  assert.equal(normalized.currency, "VND");
  assert.equal(normalized.currency_scale, 0);
  assert.deepEqual(calls[0], ["history", "tenant-a", "ITEM-1", "WH-A", "2026-08-03T09:00:00.000Z"]);
});

test("repost submit keeps Stock Ledger adjustment equal to balanced GL adjustment", async () => {
  const controller = new RepostItemValuationIntegrityController();
  const plan = await controller.buildPlan(context({ action: "submit" }));
  assert.deepEqual(
    plan.stock_entries.map((line) => [line.actual_qty_micros, line.stock_value_difference_minor]),
    [[0, -100]],
  );
  assert.deepEqual(
    plan.gl_entries.map((line) => [line.account, line.debit_minor, line.credit_minor]),
    [
      ["STOCK-A", 0, 100],
      ["DIFF-A", 100, 0],
    ],
  );
  const stockDelta = plan.stock_entries.reduce((sum, line) => sum + line.stock_value_difference_minor, 0);
  const stockAccountDelta = plan.gl_entries
    .filter((line) => line.account === "STOCK-A")
    .reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0);
  assert.equal(stockDelta, stockAccountDelta);
  assert.equal(
    plan.gl_entries.reduce((sum, line) => sum + line.debit_minor - line.credit_minor, 0),
    0,
  );
});

test("repost cancel reverses exact submitted Stock and GL rows instead of recomputing", async () => {
  const controller = new RepostItemValuationIntegrityController();
  const calls = [];
  const plan = await controller.buildPlan(context({ action: "cancel", sourceReader: reader({ calls }) }));
  assert.equal(plan.document.docstatus, 2);
  assert.deepEqual(
    plan.stock_entries.map((line) => [line.line_key, line.actual_qty_micros, line.stock_value_difference_minor]),
    [["REV-VALUATION-ADJUSTMENT-HISTORICAL", 0, 123]],
  );
  assert.deepEqual(
    plan.gl_entries.map((line) => [line.line_key, line.account, line.debit_minor, line.credit_minor]),
    [
      ["REV-STOCK-HISTORICAL", "STOCK-A", 123, 0],
      ["REV-DIFF-HISTORICAL", "DIFF-A", 0, 123],
    ],
  );
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["stock", "tenant-a", "Repost Item Valuation", "RIV-1", 2])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["gl", "tenant-a", "Repost Item Valuation", "RIV-1", 2])));
});

test("repost cancel obeys historical accounting lock", async () => {
  const controller = new RepostItemValuationIntegrityController();
  await assert.rejects(
    () => controller.buildPlan(context({ action: "cancel", sourceReader: reader({ lockDate: "2026-08-03" }) })),
    /is locked for COMP-A/,
  );
});
