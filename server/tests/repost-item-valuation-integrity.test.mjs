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

function reader({ warehouseCompany = "COMP-A", isGroup = 0 } = {}) {
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
    async getStockLedgerHistory() {
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
          line_key: "OUT-1",
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
    },
    async getPeriodLockDate() { return null; },
  };
}

function context({ data = document(), sourceReader = reader(), action = "save" } = {}) {
  return {
    command: {
      schema_version: 1,
      command_id: `repost-${action}`,
      tenant_id: "tenant-a",
      actor: { user_id: "stock@example.test", roles: ["Stock Manager"] },
      aggregate: { doctype: "Repost Item Valuation", name: "RIV-1" },
      action,
      expected_version: action === "create" ? null : 1,
      payload_hash: "a".repeat(64),
      document: data,
    },
    nextVersion: 2,
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

test("matching stock scope delegates to canonical FIFO replay and derives exact adjustment", async () => {
  const controller = new RepostItemValuationIntegrityController();
  const normalized = await controller.normalize(context());
  assert.equal(normalized.valuation_method, "FIFO");
  assert.equal(normalized.current_stock_value_minor, 600);
  assert.equal(normalized.expected_stock_value_minor, 500);
  assert.equal(normalized.adjustment_minor, -100);
  assert.equal(normalized.currency, "VND");
  assert.equal(normalized.currency_scale, 0);
});
