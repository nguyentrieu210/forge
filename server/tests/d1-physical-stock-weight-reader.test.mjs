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
  constructor(ledgerRows) {
    this.ledgerRows = ledgerRows;
    this.childRows = [{
      doctype: "Stock Entry",
      name: "STE-WEIGHT",
      row_id: "ROW-1",
      payload_json: JSON.stringify({ item_code: "NHOM-CATCH-WEIGHT" }),
    }];
    this.calls = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

function ledger(actualWeightMicros) {
  return {
    tenant_id: "alu",
    voucher_type: "Stock Entry",
    voucher_no: "STE-WEIGHT",
    voucher_revision: 1,
    line_key: "TGT-ROW-1",
    item_code: "NHOM-CATCH-WEIGHT",
    warehouse: "KHO-NVL",
    actual_qty_micros: 10_000_000,
    actual_weight_micros: actualWeightMicros,
    stock_value_difference_minor: 100_000_000,
    posting_at: "2026-08-02T08:00:00.000Z",
    batch_no: null,
    serial_no: null,
    document_payload_json: JSON.stringify({ company: "Alumdoor" }),
  };
}

test("D1 physical stock reader selects and preserves actual_weight_micros", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const database = new FakeDatabase([ledger(65_700_000)]);
  const rows = await new D1PhysicalStockLedgerReader(database, 20).list({ tenant_id: "alu", company: "Alumdoor" });

  assert.equal(rows[0].weight_micros, 65_700_000);
  assert.ok(database.calls[0].sql.includes("s.actual_weight_micros"));
});

test("D1 physical stock reader preserves NULL as unknown weight, not zero", async () => {
  const { D1PhysicalStockLedgerReader } = await loadModule();
  const rows = await new D1PhysicalStockLedgerReader(new FakeDatabase([ledger(null)]), 20)
    .list({ tenant_id: "alu", company: "Alumdoor" });

  assert.equal("weight_micros" in rows[0], false);
});
