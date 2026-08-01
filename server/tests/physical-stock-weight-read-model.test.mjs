import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../dist/packages/clouderp-erpnext/src/physical-stock-read-model.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

const base = {
  tenant_id: "alu",
  company: "Alumdoor",
  item_code: "NHOM-CATCH-WEIGHT",
  warehouse: "KHO-NVL",
  posting_at: "2026-08-02T08:00:00.000Z",
  voucher_type: "Stock Entry",
  voucher_row: "ROW-1",
  revision: 1,
  quantity_micros: 10_000_000,
  value_micros: 100_000_000,
  physical_count_micros: 10_000_000,
};

test("physical stock reconciles actual catch weight through lineage and reversal", async () => {
  const { buildPhysicalStockPage, reconcilePhysicalStockPage } = await loadModule();
  const page = buildPhysicalStockPage([
    {
      ...base,
      voucher_no: "STE-WEIGHT-IN",
      weight_micros: 65_700_000,
    },
    {
      ...base,
      posting_at: "2026-08-02T09:00:00.000Z",
      voucher_no: "STE-WEIGHT-OUT",
      quantity_micros: -2_000_000,
      weight_micros: -13_140_000,
      value_micros: -20_000_000,
      physical_count_micros: -2_000_000,
    },
    {
      ...base,
      posting_at: "2026-08-02T10:00:00.000Z",
      voucher_no: "STE-WEIGHT-OUT",
      revision: 2,
      quantity_micros: 2_000_000,
      weight_micros: 13_140_000,
      value_micros: 20_000_000,
      physical_count_micros: 2_000_000,
      reversal_of_voucher_type: "Stock Entry",
      reversal_of_voucher_no: "STE-WEIGHT-OUT",
      reversal_of_voucher_row: "ROW-1",
    },
  ], { tenant_id: "alu", company: "Alumdoor" });

  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].quantity_micros, 10_000_000);
  assert.equal(page.rows[0].weight_micros, 65_700_000);
  assert.equal(page.totals.weight_micros, 65_700_000);
  assert.deepEqual(page.rows[0].lineage.map((event) => event.weight_micros), [65_700_000, -13_140_000, 13_140_000]);
  reconcilePhysicalStockPage(page);
});

test("physical stock never invents kg when quantity lineage contains an unweighed movement", async () => {
  const { buildPhysicalStockPage, reconcilePhysicalStockPage } = await loadModule();
  const page = buildPhysicalStockPage([
    {
      ...base,
      voucher_no: "STE-MEASURED",
      weight_micros: 65_700_000,
    },
    {
      ...base,
      posting_at: "2026-08-02T09:00:00.000Z",
      voucher_no: "STE-LEGACY-NO-WEIGHT",
      quantity_micros: 1_000_000,
      value_micros: 10_000_000,
      physical_count_micros: 1_000_000,
    },
  ], { tenant_id: "alu", company: "Alumdoor" });

  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].quantity_micros, 11_000_000);
  assert.equal("weight_micros" in page.rows[0], false);
  assert.equal("weight_micros" in page.totals, false);
  reconcilePhysicalStockPage(page);
});

test("non catch-weight stock keeps weight absent instead of reporting a fake zero", async () => {
  const { buildPhysicalStockPage, reconcilePhysicalStockPage } = await loadModule();
  const page = buildPhysicalStockPage([
    {
      ...base,
      voucher_no: "STE-NORMAL-ITEM",
    },
  ], { tenant_id: "alu", company: "Alumdoor" });

  assert.equal("weight_micros" in page.rows[0], false);
  assert.equal("weight_micros" in page.totals, false);
  reconcilePhysicalStockPage(page);
});
