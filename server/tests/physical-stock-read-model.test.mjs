import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../packages/clouderp-erpnext/dist/physical-stock-read-model.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

const base = {
  tenant_id: "alu",
  company: "Alumdoor",
  item_code: "NHOM-AL71",
  warehouse: "KHO-NVL",
  warehouse_role: "RAW_MATERIAL",
  inventory_mode: "Thanh định hình",
  measurement_profile: "PROFILE-ALUMINIUM",
  color: "Xám",
  condition: "Tốt",
  generation: "2026",
  physical_identity_key: "NHOM-AL71|XAM|6000000",
  length_micros: 6_000_000,
  batch_no: "LOT-001",
  serial_no: "",
  voucher_type: "Stock Entry",
  revision: 1,
};

test("physical stock read model groups identity and reconciles exact reversal", async () => {
  const { buildPhysicalStockPage, reconcilePhysicalStockPage } = await loadModule();
  const page = buildPhysicalStockPage([
    {
      ...base,
      posting_at: "2026-07-31T08:00:00.000Z",
      voucher_no: "STE-RECEIPT-1",
      voucher_row: "ROW-1",
      quantity_micros: 10_000_000,
      value_micros: 25_000_000,
      physical_count_micros: 10_000_000,
    },
    {
      ...base,
      posting_at: "2026-07-31T09:00:00.000Z",
      voucher_no: "STE-ISSUE-1",
      voucher_row: "ROW-1",
      quantity_micros: -4_000_000,
      value_micros: -10_000_000,
      physical_count_micros: -4_000_000,
    },
    {
      ...base,
      posting_at: "2026-07-31T10:00:00.000Z",
      voucher_no: "STE-ISSUE-1-CANCEL",
      voucher_row: "ROW-1",
      quantity_micros: 4_000_000,
      value_micros: 10_000_000,
      physical_count_micros: 4_000_000,
      reversal_of_voucher_type: "Stock Entry",
      reversal_of_voucher_no: "STE-ISSUE-1",
      reversal_of_voucher_row: "ROW-1",
    },
  ], { tenant_id: "alu", company: "Alumdoor" });

  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].quantity_micros, 10_000_000);
  assert.equal(page.rows[0].value_micros, 25_000_000);
  assert.equal(page.rows[0].physical_count_micros, 10_000_000);
  assert.deepEqual(page.rows[0].lineage[2].reversal_of, {
    voucher_type: "Stock Entry",
    voucher_no: "STE-ISSUE-1",
    voucher_row: "ROW-1",
  });
  reconcilePhysicalStockPage(page);
});

test("physical stock read model enforces tenant scope and filters identity dimensions", async () => {
  const { buildPhysicalStockPage } = await loadModule();
  const rows = [
    {
      ...base,
      posting_at: "2026-07-31T08:00:00.000Z",
      voucher_no: "STE-1",
      voucher_row: "ROW-1",
      quantity_micros: 3_000_000,
      value_micros: 9_000_000,
      physical_count_micros: 3_000_000,
    },
    {
      ...base,
      tenant_id: "other",
      posting_at: "2026-07-31T08:00:00.000Z",
      voucher_no: "STE-OTHER",
      voucher_row: "ROW-1",
      quantity_micros: 99_000_000,
      value_micros: 99_000_000,
      physical_count_micros: 99_000_000,
    },
    {
      ...base,
      color: "Đen",
      physical_identity_key: "NHOM-AL71|DEN|6000000",
      posting_at: "2026-07-31T08:00:00.000Z",
      voucher_no: "STE-2",
      voucher_row: "ROW-1",
      quantity_micros: 2_000_000,
      value_micros: 6_000_000,
      physical_count_micros: 2_000_000,
    },
  ];

  const page = buildPhysicalStockPage(rows, {
    tenant_id: "alu",
    company: "Alumdoor",
    color: "Xám",
  });
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].color, "Xám");
  assert.equal(page.totals.quantity_micros, 3_000_000);
});

test("physical stock pagination is deterministic and rejects unknown cursors", async () => {
  const { buildPhysicalStockPage } = await loadModule();
  const rows = ["A", "B", "C"].map((item, index) => ({
    ...base,
    item_code: item,
    physical_identity_key: `${item}|XAM`,
    posting_at: `2026-07-31T0${index + 1}:00:00.000Z`,
    voucher_no: `STE-${item}`,
    voucher_row: "ROW-1",
    quantity_micros: 1_000_000,
    value_micros: 1_000_000,
    physical_count_micros: 1_000_000,
  }));

  const first = buildPhysicalStockPage(rows, { tenant_id: "alu", company: "Alumdoor", limit: 2 });
  assert.deepEqual(first.rows.map((row) => row.item_code), ["A", "B"]);
  assert.ok(first.next_cursor);
  const second = buildPhysicalStockPage(rows, {
    tenant_id: "alu",
    company: "Alumdoor",
    limit: 2,
    cursor: first.next_cursor,
  });
  assert.deepEqual(second.rows.map((row) => row.item_code), ["C"]);
  assert.throws(
    () => buildPhysicalStockPage(rows, { tenant_id: "alu", company: "Alumdoor", cursor: "missing" }),
    /invalid physical stock cursor/,
  );
});

test("physical stock read model excludes fully zero balances unless requested", async () => {
  const { buildPhysicalStockPage } = await loadModule();
  const rows = [
    {
      ...base,
      posting_at: "2026-07-31T08:00:00.000Z",
      voucher_no: "STE-IN",
      quantity_micros: 1_000_000,
      value_micros: 2_000_000,
      physical_count_micros: 1_000_000,
    },
    {
      ...base,
      posting_at: "2026-07-31T09:00:00.000Z",
      voucher_no: "STE-OUT",
      quantity_micros: -1_000_000,
      value_micros: -2_000_000,
      physical_count_micros: -1_000_000,
    },
  ];
  assert.equal(buildPhysicalStockPage(rows, { tenant_id: "alu", company: "Alumdoor" }).rows.length, 0);
  assert.equal(buildPhysicalStockPage(rows, { tenant_id: "alu", company: "Alumdoor", include_zero: true }).rows.length, 1);
});
