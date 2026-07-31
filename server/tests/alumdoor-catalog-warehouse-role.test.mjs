import test from "node:test";
import assert from "node:assert/strict";
import { planAlumdoorCatalogAudit } from "../scripts/alumdoor-catalog-audit-planner.mjs";

function records() {
  return [
    { doctype: "UOM", name: "Cái", data: { uom_name: "Cái" } },
    { doctype: "Item Group", name: "Nguyên vật liệu", data: { item_group_name: "Nguyên vật liệu" } },
    { doctype: "Item Group", name: "Thành phẩm", data: { item_group_name: "Thành phẩm" } },
    { doctype: "Item", name: "RAW", data: {
      item_code: "RAW", item_group: "Nguyên vật liệu", item_nature: "Hàng tồn kho",
      material_stage: "Nguyên vật liệu", supply_type: "Mua ngoài", is_stock_item: 1,
      is_purchase_item: 1, include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Cái",
    } },
    { doctype: "Item", name: "FG", data: {
      item_code: "FG", item_group: "Thành phẩm", item_nature: "Hàng tồn kho",
      material_stage: "Thành phẩm", supply_type: "Tự sản xuất", is_stock_item: 1,
      include_item_in_manufacturing: 1, inventory_mode: "Hàng thường", stock_uom: "Cái",
    } },
    { doctype: "Bill of Materials", name: "BOM-FG", data: {
      item: "FG", quantity: 1, revision: 1,
      items: [{ item_code: "RAW", qty: 1, uom: "Cái", qty_basis: "Cố định" }],
    } },
    { doctype: "Warehouse", name: "NVL", data: { warehouse_name: "NVL", stock_role: "Kho nguyên vật liệu" } },
    { doctype: "Warehouse", name: "WIP", data: { warehouse_name: "WIP", stock_role: "Kho đang sản xuất" } },
    { doctype: "Warehouse", name: "TP", data: { warehouse_name: "TP", stock_role: "Kho thành phẩm" } },
    { doctype: "Warehouse", name: "QC", data: { warehouse_name: "QC", stock_role: "Kho chờ kiểm" } },
    { doctype: "Warehouse", name: "DT", data: { warehouse_name: "DT", stock_role: "Kho đầu thừa" } },
    { doctype: "Warehouse", name: "PHE", data: { warehouse_name: "PHE", stock_role: "Kho phế" } },
    { doctype: "Warehouse", name: "MAIN", data: { warehouse_name: "MAIN", stock_role: "Kho chính" } },
  ];
}

test("Vietnamese stock_role values map to canonical production roles", () => {
  const report = planAlumdoorCatalogAudit({ metadataVersion: "2.0.34", records: records() });
  assert.deepEqual(report.counts.warehouse_roles, {
    FINISHED_GOODS: 1,
    GENERAL: 1,
    QUARANTINE: 1,
    RAW_MATERIAL: 1,
    SCRAP_OFFCUT: 2,
    WIP: 1,
  });
  const codes = report.findings.map((finding) => finding.code);
  assert.ok(!codes.includes("WAREHOUSE_ROLE_UNKNOWN"));
  assert.ok(!codes.includes("WAREHOUSE_ROLE_COVERAGE_MISSING"));
  assert.equal(report.counts.high, 0);
});
