import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../dist/packages/clouderp-erpnext/src/physical-stock-report-service.js", import.meta.url).href;

async function loadModule() {
  return import(moduleUrl);
}

const actor = { user_id: "stock@example.test", roles: ["Stock Manager"] };

function ledger(overrides = {}) {
  return {
    tenant_id: "alu",
    company: "Alumdoor",
    item_code: "NHOM-AL71",
    warehouse: "KHO-NVL",
    warehouse_role: "RAW_MATERIAL",
    posting_at: "2026-07-31T08:00:00.000Z",
    voucher_type: "Stock Entry",
    voucher_no: "STE-1",
    voucher_row: "ROW-1",
    revision: 1,
    quantity_micros: 3_000_000,
    weight_micros: 19_710_000,
    value_micros: 9_000_000,
    physical_count_micros: 3_000_000,
    physical_identity_key: "NHOM-AL71|XAM|6000000",
    inventory_mode: "Thanh định hình",
    measurement_profile: "PROFILE-ALUMINIUM",
    color: "Xám",
    condition: "Tốt",
    generation: "2026",
    length_micros: 6_000_000,
    batch_no: "LOT-001",
    serial_no: "",
    ...overrides,
  };
}

function policy(scope) {
  return { getScope: async () => scope };
}

test("report service injects authenticated tenant and applies warehouse scope", async () => {
  const { PhysicalStockReportService } = await loadModule();
  const calls = [];
  const service = new PhysicalStockReportService(
    {
      list: async (query) => {
        calls.push(query);
        return [ledger(), ledger({ warehouse: "KHO-BI-MAT", voucher_no: "STE-SECRET" })];
      },
    },
    policy({ companies: ["Alumdoor"], warehouses: ["KHO-NVL"], max_rows: 100 }),
  );

  const page = await service.run(actor, "alu", { company: "Alumdoor", include_lineage: true });
  assert.deepEqual(calls, [{ tenant_id: "alu", company: "Alumdoor" }]);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].warehouse, "KHO-NVL");
  assert.equal(page.rows[0].weight_micros, 19_710_000);
  assert.equal(page.totals.weight_micros, 19_710_000);
  assert.equal(page.lineage_redacted, true);
  assert.equal("lineage" in page.rows[0], false);
});

test("report service exposes weighted lineage only when scope and request permit it", async () => {
  const { PhysicalStockReportService } = await loadModule();
  const service = new PhysicalStockReportService(
    { list: async () => [ledger()] },
    policy({ companies: "*", can_view_lineage: true, max_rows: 100 }),
  );

  const defaultPage = await service.run(actor, "alu", { company: "Alumdoor" });
  assert.equal(defaultPage.lineage_redacted, true);
  assert.equal("lineage" in defaultPage.rows[0], false);

  const page = await service.run(actor, "alu", { company: "Alumdoor", include_lineage: true });
  assert.equal(page.lineage_redacted, false);
  assert.equal(page.rows[0].lineage.length, 1);
  assert.equal(page.rows[0].lineage[0].voucher_no, "STE-1");
  assert.equal(page.rows[0].lineage[0].weight_micros, 19_710_000);
});

test("report service rejects company scope and cross-tenant reader leakage", async () => {
  const { PhysicalStockReportService } = await loadModule();
  const denied = new PhysicalStockReportService(
    { list: async () => [ledger()] },
    policy({ companies: ["Other Company"] }),
  );
  await assert.rejects(
    () => denied.run(actor, "alu", { company: "Alumdoor" }),
    /company scope is not permitted/,
  );

  const leaking = new PhysicalStockReportService(
    { list: async () => [ledger({ tenant_id: "other" })] },
    policy({ companies: "*" }),
  );
  await assert.rejects(
    () => leaking.run(actor, "alu", { company: "Alumdoor" }),
    /outside the authenticated scope/,
  );
});

test("report service caps rows and requires export permission", async () => {
  const { PhysicalStockReportService } = await loadModule();
  const rows = [
    ledger({ item_code: "A", physical_identity_key: "A", voucher_no: "STE-A" }),
    ledger({ item_code: "B", physical_identity_key: "B", voucher_no: "STE-B" }),
  ];
  const noExport = new PhysicalStockReportService(
    { list: async () => rows },
    policy({ companies: "*", max_rows: 1 }),
  );
  const page = await noExport.run(actor, "alu", { company: "Alumdoor", limit: 99 });
  assert.equal(page.rows.length, 1);
  assert.ok(page.next_cursor);
  await assert.rejects(
    () => noExport.exportCsv(actor, "alu", { company: "Alumdoor" }),
    /export is not permitted/,
  );

  const limitedExport = new PhysicalStockReportService(
    { list: async () => rows },
    policy({ companies: "*", max_rows: 1, can_export: true }),
  );
  await assert.rejects(
    () => limitedExport.exportCsv(actor, "alu", { company: "Alumdoor" }),
    /exceeds the 1 row limit/,
  );
});

test("CSV export uses one authorization and scope snapshot", async () => {
  const { PhysicalStockReportService } = await loadModule();
  let scopeReads = 0;
  const service = new PhysicalStockReportService(
    { list: async () => [ledger()] },
    {
      async getScope() {
        scopeReads += 1;
        if (scopeReads > 1) throw new Error("permission scope was re-read during one export");
        return {
          companies: ["Alumdoor"],
          warehouses: ["KHO-NVL"],
          max_rows: 20,
          can_export: true,
        };
      },
    },
  );

  const exported = await service.exportCsv(actor, "alu", { company: "Alumdoor" });
  assert.equal(scopeReads, 1);
  assert.equal(exported.row_count, 1);
});

test("CSV export includes catch weight and remains scoped, BOM-safe and formula safe", async () => {
  const { PhysicalStockReportService } = await loadModule();
  const service = new PhysicalStockReportService(
    { list: async () => [ledger({ item_code: "=2+2", physical_identity_key: "FORMULA", voucher_no: "STE-F" })] },
    policy({ companies: "*", max_rows: 20, can_export: true }),
  );

  const exported = await service.exportCsv(actor, "alu", { company: "Alumdoor" });
  assert.equal(exported.row_count, 1);
  assert.equal(exported.content_type, "text/csv; charset=utf-8");
  assert.match(exported.filename, /^physical-stock-Alumdoor\.csv$/);
  assert.ok(exported.content.startsWith("\uFEFF"));
  assert.match(exported.content, /weight_micros/);
  assert.match(exported.content, /19710000/);
  assert.match(exported.content, /'=2\+2/);
  assert.doesNotMatch(exported.content, /STE-F/);
});
