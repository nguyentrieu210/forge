import test from "node:test";
import assert from "node:assert/strict";
import {
  D1PurchaseSupplierDebtReportService,
  buildPurchaseSupplierDebtReport,
} from "../dist/packages/document-kernel/src/index.js";

const material = JSON.stringify({
  schema_version: 1,
  item_code: "AL-6063",
  length_m_micros: 6_000_000,
  theoretical_kg_per_m_micros: 1_250_000,
  color: "Trắng sứ",
  is_stamped: 1,
  measurement_profile: "ALU-BAR",
  stock_uom: "Cây",
});

const ledgerRow = {
  queue_key: "q".repeat(64),
  company: "Alumdoor",
  supplier: "NCC Nhôm",
  material_snapshot_json: material,
  window_id: "WINDOW-1",
  window_sequence: 1,
  window_status: "Open",
  tolerance_bps: 500,
  opened_at: "2026-07-01T00:00:00.000Z",
  ordered_qty_micros: 300_000_000,
  allocated_qty_micros: 230_000_000,
  unapplied_qty_micros: 20_000_000,
  barem_weight_micros: 625_000_000,
  actual_weight_micros: 630_000_000,
  actual_weight_value_count: 2,
  oldest_open_po_date: "2026-07-10",
};

test("supplier debt projection keeps nominal debt separate from unapplied receipts", () => {
  const report = buildPurchaseSupplierDebtReport(
    [ledgerRow],
    "2026-07-31T12:00:00.000Z",
    { supplier: "NCC Nhôm" },
  );

  assert.equal(report.kind, "purchase_supplier_debt_report");
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].material, "AL-6063 · 6 m · Trắng sứ · Dập · Cây");
  assert.equal(report.rows[0].ordered_qty, "300");
  assert.equal(report.rows[0].allocated_qty, "230");
  assert.equal(report.rows[0].received_qty, "250");
  assert.equal(report.rows[0].nominal_remaining_qty, "70");
  assert.equal(report.rows[0].unapplied_receipt_qty, "20");
  assert.equal(report.rows[0].tolerance, "5%");
  assert.equal(report.rows[0].oldest_open_po_age_days, 21);
  assert.equal(report.rows[0].barem_weight_kg, "625");
  assert.equal(report.rows[0].actual_weight_kg, "630");
  assert.deepEqual(report.summary.map((entry) => entry.value), ["1", "1", "1", "300", "230", "70", "20"]);
});

test("supplier debt projection omits actual weight when the ledger has no measured value", () => {
  const report = buildPurchaseSupplierDebtReport([
    { ...ledgerRow, actual_weight_micros: 0, actual_weight_value_count: 0, oldest_open_po_date: null },
  ], "2026-07-31T12:00:00.000Z");
  assert.equal(report.rows[0].actual_weight_kg, null);
  assert.equal(report.rows[0].oldest_open_po_age_days, null);
});

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    this.db.firstSql.push(this.sql);
    return { enabled: this.db.rolloutEnabled ? 1 : 0 };
  }

  async all() {
    this.db.reportSql = this.sql;
    this.db.reportBindings = this.values;
    return { results: [ledgerRow] };
  }
}

class FakeD1 {
  rolloutEnabled = true;
  firstSql = [];
  reportSql = "";
  reportBindings = [];

  withSession() {
    return this;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

test("D1 supplier debt query reads only allocation ledger tables and binds tenant filters", async () => {
  const db = new FakeD1();
  const report = await new D1PurchaseSupplierDebtReportService(db).run(
    "tenant-a",
    {
      company: "Alumdoor",
      supplier: "NCC Nhôm",
      item_code: "AL-6063",
      status: "Open",
      from_date: "2026-07-01",
      to_date: "2026-07-31",
      limit: 25,
    },
    "2026-07-31T12:00:00.000Z",
  );

  assert.equal(report?.rows[0].supplier, "NCC Nhôm");
  assert.match(db.reportSql, /FROM purchase_obligation_queues queue/);
  assert.match(db.reportSql, /purchase_window_obligation_entries/);
  assert.match(db.reportSql, /purchase_receipt_allocation_entries/);
  assert.match(db.reportSql, /purchase_unapplied_receipt_entries/);
  assert.doesNotMatch(db.reportSql, /procurement_entries|purchase_order_progress/i);
  assert.deepEqual(db.reportBindings, [
    "tenant-a",
    "Alumdoor",
    "NCC Nhôm",
    "AL-6063",
    "Open",
    "2026-07-01",
    "2026-07-31",
    25,
  ]);
});

test("supplier debt report stays unavailable while FIFO rollout is disabled", async () => {
  const db = new FakeD1();
  db.rolloutEnabled = false;
  const report = await new D1PurchaseSupplierDebtReportService(db).run("tenant-a");
  assert.equal(report, null);
  assert.equal(db.reportSql, "");
});
