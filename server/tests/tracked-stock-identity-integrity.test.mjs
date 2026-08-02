import test from "node:test";
import assert from "node:assert/strict";
import { SerialAndBatchBundleIntegrityController } from "../dist/packages/clouderp-stock/src/tracking-integrity.js";

function bundle(overrides = {}) {
  return {
    item_code: "ITEM-A",
    warehouse: "WH-1",
    type: "Inward",
    posting_at: "2026-08-03T09:00:00.000Z",
    entries: [{ row_id: "1", batch_no: "BATCH-1", qty: "2" }],
    ...overrides,
  };
}

function reader({ batchItem = "ITEM-A", serialItem = "ITEM-A", serialExists = true } = {}) {
  return {
    async isStockBundleUsed() { return false; },
    async hasMasterRecord(_tenantId, type) {
      return ["Item", "Warehouse", "Batch"].includes(type);
    },
    async getMasterRecordData(_tenantId, type) {
      if (type === "Batch") return { item_code: batchItem };
      if (type === "Serial No") return serialExists ? { item_code: serialItem } : null;
      return null;
    },
  };
}

function context({ data = bundle(), sourceReader = reader() } = {}) {
  return {
    command: {
      schema_version: 1,
      command_id: "bundle-submit",
      tenant_id: "tenant-a",
      actor: { user_id: "stock@example.test", roles: ["Stock Manager"] },
      aggregate: { doctype: "Serial and Batch Bundle", name: "SABB-1" },
      action: "submit",
      expected_version: 1,
      payload_hash: "a".repeat(64),
      document: data,
    },
    nextVersion: 2,
    now: "2026-08-03T10:00:00.000Z",
    reader: sourceReader,
  };
}

test("inward bundle không được gắn batch của item khác", async () => {
  const controller = new SerialAndBatchBundleIntegrityController();
  await assert.rejects(
    () => controller.normalize(context({ sourceReader: reader({ batchItem: "ITEM-B" }) })),
    /Batch BATCH-1 belongs to ITEM-B, not ITEM-A/,
  );
});

test("serial đã tồn tại phải thuộc đúng item của bundle", async () => {
  const controller = new SerialAndBatchBundleIntegrityController();
  const data = bundle({
    type: "Outward",
    entries: [{ row_id: "1", serial_no: "SER-1", qty: "1" }],
  });
  await assert.rejects(
    () => controller.normalize(context({ data, sourceReader: reader({ serialItem: "ITEM-B" }) })),
    /Serial No SER-1 belongs to ITEM-B, not ITEM-A/,
  );
});

test("tracking master khớp item thì bundle vẫn dùng canonical normalization", async () => {
  const controller = new SerialAndBatchBundleIntegrityController();
  const normalized = await controller.normalize(context());
  assert.equal(normalized.item_code, "ITEM-A");
  assert.equal(normalized.total_qty_micros, 2_000_000);
  assert.equal(normalized.total_qty, "2.000000");
});

test("inward serial chưa có master vẫn giữ đường auto-create hiện hữu", async () => {
  const controller = new SerialAndBatchBundleIntegrityController();
  const data = bundle({ entries: [{ row_id: "1", serial_no: "SER-NEW", qty: "1" }] });
  const normalized = await controller.normalize(context({ data, sourceReader: reader({ serialExists: false }) }));
  assert.equal(normalized.entries[0].serial_no, "SER-NEW");
  assert.equal(normalized.total_qty_micros, 1_000_000);
});
