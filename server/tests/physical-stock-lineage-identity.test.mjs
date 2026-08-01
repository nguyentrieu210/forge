import assert from "node:assert/strict";
import test from "node:test";

const readerUrl = new URL("../dist/packages/clouderp-erpnext/src/d1-physical-stock-ledger-reader.js", import.meta.url).href;
const readModelUrl = new URL("../dist/packages/clouderp-erpnext/src/physical-stock-read-model.js", import.meta.url).href;

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  bind(...values) {
    this.database.calls.push({ sql: this.sql, values });
    return this;
  }

  async all() {
    if (this.sql.includes("FROM stock_ledger_entries")) return { results: this.database.ledgerRows };
    if (this.sql.includes("FROM documents d")) return { results: this.database.childRows };
    throw new Error(`Unexpected SQL: ${this.sql}`);
  }
}

class FakeDatabase {
  constructor(ledgerRows, childRows) {
    this.ledgerRows = ledgerRows;
    this.childRows = childRows;
    this.calls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function ledger({ rowId, voucherNo, batchNo, qty, weight }) {
  return {
    tenant_id: "alu",
    voucher_type: "Stock Entry",
    voucher_no: voucherNo,
    voucher_revision: 1,
    line_key: `TGT-${rowId}-${batchNo}`,
    item_code: "AL71N",
    warehouse: "KHO-NVL",
    actual_qty_micros: qty,
    actual_weight_micros: weight,
    stock_value_difference_minor: qty,
    posting_at: "2026-08-02T08:00:00.000Z",
    batch_no: batchNo,
    serial_no: null,
    document_payload_json: JSON.stringify({ company: "ALUMDOOR" }),
  };
}

function child({ rowId, voucherNo, identity, bundle }) {
  return {
    doctype: "Stock Entry",
    name: voucherNo,
    row_id: rowId,
    payload_json: JSON.stringify({
      item_code: "AL71N",
      physical_identity_key: identity,
      serial_and_batch_bundle: bundle,
      inventory_mode: "Thanh định hình",
      measurement_profile: "PROFILE-ALUMINIUM",
      color: "Ghi sáng",
      condition: "Tốt",
      generation: "2026",
      length_micros: 7_200_000,
      physical_count_micros: 10_000_000,
      target_warehouse_role: "RAW_MATERIAL",
    }),
  };
}

test("physical stock lineage preserves voucher row, batch, bundle, item and warehouse without identity mixing", async () => {
  const [{ D1PhysicalStockLedgerReader }, { buildPhysicalStockPage, reconcilePhysicalStockPage }] = await Promise.all([
    import(readerUrl),
    import(readModelUrl),
  ]);

  const database = new FakeDatabase(
    [
      ledger({ rowId: "ROW-A", voucherNo: "STE-A", batchNo: "BATCH-A", qty: 10_000_000, weight: 65_700_000 }),
      ledger({ rowId: "ROW-B", voucherNo: "STE-B", batchNo: "BATCH-B", qty: 8_000_000, weight: 52_560_000 }),
    ],
    [
      child({ rowId: "ROW-A", voucherNo: "STE-A", identity: "AL71N|BATCH-A|7200000", bundle: "SBB-A" }),
      child({ rowId: "ROW-B", voucherNo: "STE-B", identity: "AL71N|BATCH-B|7200000", bundle: "SBB-B" }),
    ],
  );

  const rows = await new D1PhysicalStockLedgerReader(database, 20).list({ tenant_id: "alu", company: "ALUMDOOR" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.serial_and_batch_bundle), ["SBB-A", "SBB-B"]);

  const page = buildPhysicalStockPage(rows, { tenant_id: "alu", company: "ALUMDOOR", include_zero: true });
  assert.equal(page.rows.length, 2);

  const batchA = page.rows.find((row) => row.batch_no === "BATCH-A");
  const batchB = page.rows.find((row) => row.batch_no === "BATCH-B");
  assert.ok(batchA);
  assert.ok(batchB);

  assert.deepEqual(batchA.lineage.map((event) => ({
    voucher_type: event.voucher_type,
    voucher_no: event.voucher_no,
    voucher_row: event.voucher_row,
    item_code: event.item_code,
    warehouse: event.warehouse,
    physical_identity_key: event.physical_identity_key,
    batch_no: event.batch_no,
    bundle: event.serial_and_batch_bundle,
  })), [{
    voucher_type: "Stock Entry",
    voucher_no: "STE-A",
    voucher_row: "ROW-A",
    item_code: "AL71N",
    warehouse: "KHO-NVL",
    physical_identity_key: "AL71N|BATCH-A|7200000",
    batch_no: "BATCH-A",
    bundle: "SBB-A",
  }]);

  assert.deepEqual(batchB.lineage.map((event) => ({
    voucher_no: event.voucher_no,
    voucher_row: event.voucher_row,
    physical_identity_key: event.physical_identity_key,
    batch_no: event.batch_no,
    bundle: event.serial_and_batch_bundle,
  })), [{
    voucher_no: "STE-B",
    voucher_row: "ROW-B",
    physical_identity_key: "AL71N|BATCH-B|7200000",
    batch_no: "BATCH-B",
    bundle: "SBB-B",
  }]);

  assert.equal(batchA.lineage.some((event) => event.batch_no === "BATCH-B" || event.serial_and_batch_bundle === "SBB-B"), false);
  assert.equal(batchB.lineage.some((event) => event.batch_no === "BATCH-A" || event.serial_and_batch_bundle === "SBB-A"), false);
  reconcilePhysicalStockPage(page);
});
