import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../dist/packages/clouderp-erpnext/src/d1-physical-stock-ledger-reader.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
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
  constructor({ ledgerRows = [], childRows = [] } = {}) {
    this.ledgerRows = ledgerRows;
    this.childRows = childRows;
    this.calls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function ledger(overrides = {}) {
  return {
    tenant_id: "alu",
    voucher_type: "Stock Entry",
    voucher_no: "STE-1",
    voucher_revision: 1,
    line_key: "SRC-ROW-1-B1",
    item_code: "NHOM-AL71",
    warehouse: "KHO-NVL",
    actual_qty_micros: -4_000_000,
    actual_weight_micros: -26_280_000,
    stock_value_difference_minor: -40_000,
    posting_at: "2026-07-31T08:00:00.000Z",
    batch_no: "LOT-1",
    serial_no: null,
    document_payload_json: JSON.stringify({ company: "Alumdoor" }),
    ...overrides,
  };
}

function child(overrides = {}) {
  return {
    doctype: "Stock Entry",
    name: "STE-1",
    row_id: "ROW-1",
    payload_json: JSON.stringify({
      item_code: "NHOM-AL71",
      qty_micros: 10_000_000,
      physical_identity_key: "NHOM-AL71|XAM|6000000",
      inventory_mode: "Thanh định hình",
      measurement_profile: "PROFILE-ALUMINIUM",
      color: "Xám",
      condition: "Tốt",
      generation: "2026",
      length_micros: 6_000_000,
      physical_count_micros: 3_000_000,
      source_warehouse_role: "RAW_MATERIAL",
      target_warehouse_role: "WIP",
    }),
    ...overrides,
  };
}

test("D1 reader binds tenant/company and maps exact weight while allocating tracked physical counts", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const database = new FakeDatabase({
    ledgerRows: [
      ledger(),
      ledger({
        line_key: "SRC-ROW-1-B2",
        actual_qty_micros: -6_000_000,
        actual_weight_micros: -39_420_000,
        stock_value_difference_minor: -60_000,
        batch_no: "LOT-2",
      }),
      ledger({
        voucher_revision: 2,
        line_key: "REV-SRC-ROW-1-B1",
        actual_qty_micros: 4_000_000,
        actual_weight_micros: 26_280_000,
        stock_value_difference_minor: 40_000,
      }),
      ledger({
        voucher_revision: 2,
        line_key: "REV-SRC-ROW-1-B2",
        actual_qty_micros: 6_000_000,
        actual_weight_micros: 39_420_000,
        stock_value_difference_minor: 60_000,
        batch_no: "LOT-2",
      }),
    ],
    childRows: [child()],
  });

  const reader = new D1PhysicalStockLedgerReader(database, 20);
  const rows = await reader.list({ tenant_id: "alu", company: "Alumdoor" });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.weight_micros), [-26_280_000, -39_420_000, 26_280_000, 39_420_000]);
  assert.deepEqual(rows.map((row) => row.physical_count_micros), [-1_200_000, -1_800_000, 1_200_000, 1_800_000]);
  assert.deepEqual(rows.map((row) => row.batch_no), ["LOT-1", "LOT-2", "LOT-1", "LOT-2"]);
  assert.equal(rows[0].physical_identity_key, "NHOM-AL71|XAM|6000000");
  assert.equal(rows[0].warehouse_role, "RAW_MATERIAL");
  assert.equal(rows[0].voucher_row, "ROW-1");
  assert.deepEqual(
    {
      type: rows[2].reversal_of_voucher_type,
      no: rows[2].reversal_of_voucher_no,
      row: rows[2].reversal_of_voucher_row,
    },
    { type: "Stock Entry", no: "STE-1", row: "ROW-1" },
  );
  assert.equal(database.calls.length, 2);
  assert.deepEqual(database.calls.map((call) => call.values), [
    ["alu", "Alumdoor", 21],
    ["alu", "Alumdoor", 21],
  ]);
  assert.ok(database.calls[0].sql.includes("s.tenant_id=?1"));
  assert.ok(database.calls[0].sql.includes("s.actual_weight_micros"));
  assert.ok(database.calls[0].sql.includes("json_extract(d.payload_json,'$.company')=?2"));
});

test("D1 reader preserves null and zero weight as distinct evidence states", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const database = new FakeDatabase({
    ledgerRows: [
      ledger({ line_key: "SRC-ROW-1-NULL", actual_weight_micros: null }),
      ledger({ line_key: "SRC-ROW-1-ZERO", actual_qty_micros: 0, actual_weight_micros: 0, stock_value_difference_minor: 0 }),
    ],
    childRows: [child()],
  });
  const rows = await new D1PhysicalStockLedgerReader(database, 20).list({ tenant_id: "alu", company: "Alumdoor" });
  assert.equal(rows[0].weight_micros, null);
  assert.equal(rows[1].weight_micros, 0);
});

test("D1 reader maps target and finished-good identity snapshots", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const database = new FakeDatabase({
    ledgerRows: [
      ledger({
        line_key: "TGT-ROW-1-B1",
        actual_qty_micros: 4_000_000,
        actual_weight_micros: 26_280_000,
        stock_value_difference_minor: 40_000,
        warehouse: "KHO-WIP",
      }),
      ledger({
        voucher_no: "STE-MFG-1",
        line_key: "FINISHED-B1",
        item_code: "CUA-TP",
        warehouse: "KHO-TP",
        actual_qty_micros: 1_000_000,
        actual_weight_micros: 12_000_000,
        stock_value_difference_minor: 120_000,
        batch_no: "FG-1",
        document_payload_json: JSON.stringify({
          company: "Alumdoor",
          finished_good_physical_identity: {
            physical_identity_key: "CUA-TP|TRANG",
            inventory_mode: "Bộ thành phẩm",
            color: "Trắng",
            physical_count_micros: 1_000_000,
            target_warehouse_role: "FINISHED_GOODS",
          },
        }),
      }),
    ],
    childRows: [child()],
  });

  const rows = await new D1PhysicalStockLedgerReader(database, 20).list({ tenant_id: "alu", company: "Alumdoor" });
  assert.equal(rows[0].warehouse_role, "WIP");
  assert.equal(rows[0].weight_micros, 26_280_000);
  assert.equal(rows[0].physical_count_micros, 3_000_000);
  assert.equal(rows[1].voucher_row, "FINISHED");
  assert.equal(rows[1].warehouse_role, "FINISHED_GOODS");
  assert.equal(rows[1].physical_identity_key, "CUA-TP|TRANG");
  assert.equal(rows[1].weight_micros, 12_000_000);
  assert.equal(rows[1].physical_count_micros, 1_000_000);
});

test("D1 reader fails closed on source overflow and scope leakage", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const overflow = new FakeDatabase({ ledgerRows: [ledger(), ledger({ line_key: "SRC-ROW-2" })] });
  await assert.rejects(
    () => new D1PhysicalStockLedgerReader(overflow, 1).list({ tenant_id: "alu", company: "Alumdoor" }),
    /scan exceeds the 1 row safety limit/,
  );

  const leaked = new FakeDatabase({
    ledgerRows: [ledger({ tenant_id: "other" })],
    childRows: [child()],
  });
  await assert.rejects(
    () => new D1PhysicalStockLedgerReader(leaked, 20).list({ tenant_id: "alu", company: "Alumdoor" }),
    /returned another tenant/,
  );
});
