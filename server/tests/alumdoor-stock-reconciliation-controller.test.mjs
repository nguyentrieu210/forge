import assert from "node:assert/strict";
import test from "node:test";
import { StockReconciliationController } from "../dist/packages/clouderp-erpnext/src/alumdoor-inventory.js";

const NOW = "2026-08-02T10:00:00.000Z";
const SNAPSHOT = "2026-08-02T09:00:00.000Z";

function existingData(items = [{
  row_id: "ROW-1", item_code: "AL71",
  book_qty: 10, book_qty_micros: 10_000_000, book_stock_value_minor: 1_000_000,
  counted_qty: 10, variance_qty: 0, variance_qty_micros: 0,
}]) {
  return {
    warehouse: "KHO-1", scope: "Toàn kho", snapshot_at: SNAPSHOT,
    counted_by: "counter@example.test", witnessed_by: "witness@example.test",
    recon_state: "Đang đếm", company: "ALUMDOOR", currency: "VND", currency_scale: 0,
    items,
  };
}

function reader() {
  const trackedReads = [];
  return {
    trackedReads,
    async getMasterRecordData(tenantId, type, name) {
      assert.equal(tenantId, "tenant-a");
      if (type === "Warehouse") return { company: "ALUMDOOR", stock_role: "Kho chính" };
      if (type === "Company") return { default_currency: "VND" };
      if (type === "Currency") return { currency_scale: 0 };
      if (type === "Item") return { item_code: name, has_batch_no: false, has_serial_no: false, has_catch_weight: false };
      return null;
    },
    async listMasterRecordData() { return []; },
    async getPeriodLockDate() { return null; },
    async getTrackedStockState(tenantId, itemCode, warehouse, batchNo, throughPostingAt) {
      assert.equal(tenantId, "tenant-a");
      assert.equal(warehouse, "KHO-1");
      trackedReads.push({ itemCode, batchNo, throughPostingAt });
      if (itemCode === "AL72") return { qty_micros: 3_000_000, weight_micros: null, stock_value_minor: 300_000 };
      return { qty_micros: 99_000_000, weight_micros: null, stock_value_minor: 9_900_000 };
    },
    async getDocument() { return null; },
    async listDocumentsByDoctype() { return []; },
  };
}

function makeContext({ action = "save", document, existing = existingData(), actor } = {}) {
  const sourceReader = reader();
  return {
    sourceReader,
    value: {
      command: {
        schema_version: 1,
        command_id: `cmd-recon-${action}`,
        tenant_id: "tenant-a",
        actor: actor ?? { user_id: "keeper@example.test", roles: ["Thủ kho"] },
        aggregate: { doctype: "Stock Reconciliation", name: "RECON-1" },
        action,
        expected_version: 1,
        payload_hash: "a".repeat(64),
        document: document ?? existing,
      },
      existing: {
        tenant_id: "tenant-a", doctype: "Stock Reconciliation", name: "RECON-1",
        owner: "counter@example.test", docstatus: 0, status: "Đang đếm", version: 1,
        created_at: "2026-08-02T09:00:00.000Z", modified_at: "2026-08-02T09:05:00.000Z",
        data: existing, children: [],
      },
      nextVersion: 2,
      now: NOW,
      reader: sourceReader,
    },
  };
}

test("reconciliation save uses historical snapshot for surplus row and creates no stock ledger", async () => {
  const controller = new StockReconciliationController();
  const existing = existingData();
  const document = {
    ...existing,
    items: [
      { ...existing.items[0], counted_qty: 10 },
      { row_id: "BULK-EXTRA-1", item_code: "AL72", counted_qty: 3 },
    ],
  };
  const { value, sourceReader } = makeContext({ document, existing });
  const plan = await controller.buildPlan(value);

  assert.equal(plan.document.docstatus, 0);
  assert.equal(plan.document.data.items[0].book_qty_micros, 10_000_000);
  assert.equal(plan.document.data.items[1].book_qty_micros, 3_000_000);
  assert.equal(plan.document.data.items[1].variance_qty_micros, 0);
  assert.equal(plan.stock_entries.length, 0);
  assert.deepEqual(sourceReader.trackedReads.map((row) => [row.itemCode, row.throughPostingAt]), [
    ["AL71", SNAPSHOT], ["AL72", SNAPSHOT],
  ]);
});

test("reconciliation submit remains four-eyes and is the only path that posts variance", async () => {
  const controller = new StockReconciliationController();
  const existing = existingData();
  const document = { ...existing, items: [{ ...existing.items[0], counted_qty: 9, variance_reason: "Sai số đếm" }] };

  const self = makeContext({
    action: "submit", document, existing,
    actor: { user_id: "counter@example.test", roles: ["Chủ xưởng"] },
  });
  await assert.rejects(
    () => controller.buildPlan(self.value),
    (error) => error?.code === "PERMISSION_DENIED" && /không được tự duyệt/.test(error.message),
  );

  const approved = makeContext({
    action: "submit", document, existing,
    actor: { user_id: "approver@example.test", roles: ["Chủ xưởng"] },
  });
  const plan = await controller.buildPlan(approved.value);
  assert.equal(plan.document.docstatus, 1);
  assert.equal(plan.document.data.recon_state, "Đã ghi sổ");
  assert.equal(plan.stock_entries.length, 1);
  assert.equal(plan.stock_entries[0].item_code, "AL71");
  assert.equal(plan.stock_entries[0].actual_qty_micros, -1_000_000);
  assert.equal(plan.stock_entries[0].posting_at, SNAPSHOT);
});
