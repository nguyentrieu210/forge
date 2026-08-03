import test from "node:test";
import assert from "node:assert/strict";
import { StockEntryIntegrityController } from "../dist/packages/clouderp-erpnext/src/stock-entry-integrity.js";

function context({ warehouse = { company: "COMP-B", is_group: 0 }, data } = {}) {
  return {
    command: {
      schema_version: 1,
      command_id: "stock-submit",
      tenant_id: "tenant-a",
      actor: { user_id: "stock@example.test", roles: ["Stock Manager"] },
      aggregate: { doctype: "Stock Entry", name: "STE-1" },
      action: "submit",
      expected_version: 1,
      payload_hash: "a".repeat(64),
      document: data ?? {
        company: "COMP-A",
        posting_at: "2026-08-03T09:00:00.000Z",
        purpose: "Material Issue",
        items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", source_warehouse: "WH-1" }],
      },
    },
    nextVersion: 2,
    now: "2026-08-03T10:00:00.000Z",
    reader: {
      async getMasterRecordData(_tenantId, type, name) {
        if (type === "Warehouse" && name === "WH-1") return warehouse;
        if (type === "Warehouse" && name === "FG-WH") return warehouse;
        return null;
      },
    },
  };
}

test("Stock Entry submit fail closed khi source warehouse thuộc công ty khác", async () => {
  const controller = new StockEntryIntegrityController();
  await assert.rejects(
    () => controller.buildPlan(context()),
    /Warehouse WH-1 belongs to COMP-B, not COMP-A/,
  );
});

test("Stock Entry submit không cho target warehouse group hoặc disabled", async () => {
  const controller = new StockEntryIntegrityController();
  const data = {
    company: "COMP-A",
    posting_at: "2026-08-03T09:00:00.000Z",
    purpose: "Material Receipt",
    items: [{ row_id: "1", item_code: "ITEM-1", qty: "1", target_warehouse: "WH-1" }],
  };
  await assert.rejects(
    () => controller.buildPlan(context({ data, warehouse: { company: "COMP-A", is_group: 1 } })),
    /disabled or is a group/,
  );
});

test("Manufacture top-level finished-good warehouse cũng bị khóa company scope", async () => {
  const controller = new StockEntryIntegrityController();
  const data = {
    company: "COMP-A",
    posting_at: "2026-08-03T09:00:00.000Z",
    purpose: "Manufacture",
    work_order: "WO-1",
    target_warehouse: "FG-WH",
    finished_good_item: "FG-1",
    finished_good_qty: "1",
    items: [],
  };
  await assert.rejects(
    () => controller.buildPlan(context({ data })),
    /Warehouse FG-WH belongs to COMP-B, not COMP-A/,
  );
});

test("Stock Entry submit fail closed khi warehouse master không tồn tại", async () => {
  const controller = new StockEntryIntegrityController();
  await assert.rejects(
    () => controller.buildPlan(context({ warehouse: null })),
    /Warehouse WH-1 does not exist/,
  );
});
