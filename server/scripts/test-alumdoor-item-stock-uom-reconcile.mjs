#!/usr/bin/env node
import { classifyFinishedDoorStockUomReconciliation } from "./lib/alumdoor-item-stock-uom-reconcile.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

const expectedDoor = {
  item_code: "TP-CUA-FIXTURE",
  item_name: "Cửa fixture",
  item_group: "Cửa CN Đức",
  item_nature: "Hàng tồn kho",
  material_stage: "Thành phẩm",
  supply_type: "Tự sản xuất",
  is_stock_item: 1,
  is_purchase_item: 0,
  is_sales_item: 1,
  is_fixed_asset: 0,
  include_item_in_manufacturing: 1,
  is_sub_contracted_item: 0,
  stock_uom: "Bộ",
  default_purchase_uom: "",
  default_sales_uom: "m2",
  measurement_profile: "Thành phẩm theo m2",
  disabled: 0,
  uom_conversions: [],
};

const legacyDoor = { ...expectedDoor, stock_uom: "m2" };
expect(
  classifyFinishedDoorStockUomReconciliation(expectedDoor, legacyDoor).status,
  "reconcile_stock_uom",
  "known legacy finished-door mismatch",
);
expect(
  classifyFinishedDoorStockUomReconciliation(expectedDoor, expectedDoor).status,
  "exact",
  "exact canonical record",
);
expect(
  classifyFinishedDoorStockUomReconciliation(expectedDoor, null).status,
  "missing",
  "missing Item",
);

const wrongGroup = { ...legacyDoor, item_group: "Phụ kiện chung" };
expect(
  classifyFinishedDoorStockUomReconciliation(expectedDoor, wrongGroup).status,
  "blocked",
  "other managed mismatch blocks",
);

const expectedMaterial = {
  ...expectedDoor,
  item_code: "NVL-FIXTURE",
  item_name: "Material fixture",
  item_group: "Phụ kiện chung",
  material_stage: "Nguyên vật liệu",
  supply_type: "Mua ngoài",
  is_purchase_item: 1,
  is_sales_item: 0,
  stock_uom: "Kg",
  default_purchase_uom: "Kg",
  default_sales_uom: "",
  measurement_profile: "Hàng thường",
};
const legacyMaterial = { ...expectedMaterial, stock_uom: "m2" };
expect(
  classifyFinishedDoorStockUomReconciliation(expectedMaterial, legacyMaterial).status,
  "blocked",
  "non-finished Item UOM mismatch blocks",
);

const wrongLegacyDoor = { ...expectedDoor, stock_uom: "Cái" };
expect(
  classifyFinishedDoorStockUomReconciliation(expectedDoor, wrongLegacyDoor).status,
  "blocked",
  "unknown historical value blocks",
);

console.log("ALUMDOOR_ITEM_STOCK_UOM_RECONCILE_TEST_PASS");
