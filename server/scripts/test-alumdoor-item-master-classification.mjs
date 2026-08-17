#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import {
  buildCanonicalAlumdoorItemMaster,
  buildCanonicalAlumdoorItemPayload,
  collectAlumdoorAcceptedSourceGroups,
} from "./lib/alumdoor-item-master-classification.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}
function expectJson(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected=${e} actual=${a}`);
}

const door = buildCanonicalAlumdoorItemPayload({
  item_code: "TP-CUA-DUC-FIXTURE",
  item_name: "Cửa Đức fixture",
  source_groups: ["Cửa CN Đức"],
  identity_roles: [ITEM_SOURCE_ROLES.SELLABLE_PRODUCT],
  stock_uom: "",
  sales_uoms: ["m2"],
  source_rows: [],
  conversion_factors: [],
});
expect(door.status, "accepted", "door accepted");
expect(door.payload.item_group, "Cửa CN Đức", "door group");
expect(door.payload.item_nature, "Hàng tồn kho", "door nature");
expect(door.payload.material_stage, "Thành phẩm", "door stage");
expect(door.payload.supply_type, "Tự sản xuất", "door supply");
expect(door.payload.is_stock_item, 1, "door stock flag");
expect(door.payload.is_purchase_item, 0, "door purchase flag");
expect(door.payload.is_sales_item, 1, "door sales flag");
expect(door.payload.include_item_in_manufacturing, 1, "door manufacturing flag");
expect(door.payload.stock_uom, "m2", "door stock UOM follows source sales UOM");
expect(door.payload.default_sales_uom, "m2", "door sales UOM");
expect(door.payload.measurement_profile, "Thành phẩm theo m2", "door profile");
expectJson(door.payload.uom_conversions, [], "door area UOM is source-native without fake Bộ conversion");

const doorBySet = buildCanonicalAlumdoorItemPayload({
  item_code: "TP-CUA-DUC-BO-FIXTURE",
  item_name: "Cửa Đức bán bộ fixture",
  source_groups: ["Cửa CN Đức"],
  identity_roles: [ITEM_SOURCE_ROLES.SELLABLE_PRODUCT],
  stock_uom: "",
  sales_uoms: ["Bộ"],
  source_rows: [],
  conversion_factors: [],
});
expect(doorBySet.status, "accepted", "door Bộ accepted");
expect(doorBySet.payload.stock_uom, "Bộ", "door Bộ stock UOM follows source");
expect(doorBySet.payload.default_sales_uom, "Bộ", "door Bộ sales UOM");
expectJson(doorBySet.payload.uom_conversions, [], "door Bộ needs no synthetic conversion");

const motor = buildCanonicalAlumdoorItemPayload({
  item_code: "MOTOR-FIXTURE",
  item_name: "Motor fixture",
  source_groups: ["Mô tơ"],
  identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM, ITEM_SOURCE_ROLES.SELLABLE_PRODUCT],
  stock_uom: "Cái",
  sales_uoms: ["Cái"],
  source_rows: [],
  conversion_factors: [],
});
expect(motor.status, "accepted", "motor accepted");
expect(motor.payload.item_group, "Motor", "motor alias group");
expect(motor.payload.material_stage, "Hàng hoá", "motor stage");
expect(motor.payload.supply_type, "Mua ngoài", "motor supply");
expect(motor.payload.is_purchase_item, 1, "motor purchase");
expect(motor.payload.is_sales_item, 1, "motor sales");
expect(motor.payload.measurement_profile, "Hàng thường", "motor profile");

const rawMaterial = buildCanonicalAlumdoorItemPayload({
  item_code: "NVL-NAN-FIXTURE",
  item_name: "Nan fixture",
  source_groups: ["Nan/lá cửa"],
  identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
  stock_uom: "Kg",
  sales_uoms: [],
  source_rows: [],
  conversion_factors: [],
});
expect(rawMaterial.status, "accepted", "raw material accepted");
expect(rawMaterial.payload.material_stage, "Nguyên vật liệu", "raw stage");
expect(rawMaterial.payload.is_purchase_item, 1, "raw purchase");
expect(rawMaterial.payload.is_sales_item, 0, "raw not sales");
expect(rawMaterial.payload.measurement_profile, "Nhôm cây/lá", "nan profile");

const ray = buildCanonicalAlumdoorItemPayload({
  item_code: "NVL-TRUC-FIXTURE",
  item_name: "Trục fixture",
  source_groups: ["Ray và trục"],
  identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
  stock_uom: "Kg",
  sales_uoms: [],
  source_rows: [],
  conversion_factors: [],
});
expect(ray.status, "accepted", "ray/truc accepted");
expect(ray.payload.measurement_profile, "Ống/trục", "kg ray/truc profile");

const lamau = buildCanonicalAlumdoorItemPayload({
  item_code: "NVL-LAMAU-PHE",
  item_name: "LÁ MẪU ĐỨC",
  source_groups: ["Phụ kiện CN Đức"],
  identity_roles: [ITEM_SOURCE_ROLES.SELLABLE_PRODUCT],
  stock_uom: "",
  sales_uoms: ["Thùng"],
  source_rows: [{ conversion_basis: "kg_per_thung" }],
  conversion_factors: [{
    conversion_basis: "kg_per_thung",
    conversion_factor: 1.4,
    source: "dm_numbered_row_kg_per_thung_factor",
  }],
});
expect(lamau.status, "accepted", "Lá Mẫu accepted");
expect(lamau.payload.stock_uom, "Kg", "Lá Mẫu stock Kg");
expect(lamau.payload.default_sales_uom, "Thùng", "Lá Mẫu sales Thùng");
expectJson(lamau.payload.uom_conversions, [{ uom: "Thùng", conversion_factor: 1.4 }], "Lá Mẫu conversion");

for (const [fixture, reason] of [
  [{
    item_code: "NO-GROUP",
    item_name: "No group",
    source_groups: [],
    identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
    stock_uom: "Cái",
    sales_uoms: [],
  }, "missing_item_group_evidence"],
  [{
    item_code: "PARENT-GROUP",
    item_name: "Parent group",
    source_groups: ["Phụ kiện & vật tư"],
    identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
    stock_uom: "Cái",
    sales_uoms: [],
  }, "parent_item_group_not_assignable"],
  [{
    item_code: "CONFLICT-GROUP",
    item_name: "Conflict group",
    source_groups: ["Motor", "Linh kiện motor"],
    identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
    stock_uom: "Cái",
    sales_uoms: [],
  }, "conflicting_item_group_evidence"],
  [{
    item_code: "UNKNOWN-GROUP",
    item_name: "Unknown group",
    source_groups: ["Nhóm không chuẩn"],
    identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
    stock_uom: "Cái",
    sales_uoms: [],
  }, "noncanonical_item_group"],
]) {
  const result = buildCanonicalAlumdoorItemPayload(fixture);
  expect(result.status, "blocked", `${fixture.item_code} blocked`);
  expect(result.reason, reason, `${fixture.item_code} reason`);
}

const missingConversion = buildCanonicalAlumdoorItemPayload({
  item_code: "MOTOR-UOM-CONVERSION",
  item_name: "Motor conversion fixture",
  source_groups: ["Motor"],
  identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM, ITEM_SOURCE_ROLES.SELLABLE_PRODUCT],
  stock_uom: "Cái",
  sales_uoms: ["Bộ"],
  source_rows: [],
  conversion_factors: [],
});
expect(missingConversion.status, "blocked", "missing conversion blocks");
expect(missingConversion.reason, "missing_static_sales_uom_conversion", "missing conversion reason");

const promotedAccepted = {
  item_code: "TP-YHTaiwan-HDK",
  item_name: "Hộp điều khiển Taiwan",
  identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
  stock_uom: "Cái",
  sales_uoms: [],
  source_rows: [{
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 2000,
    source_index: 400,
  }],
  conversion_factors: [],
};
const promotedRaw = [{
  source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
  source_sheet: "ĐM",
  source_row: 2000,
  source_index: 400,
  source_group: "Motor",
}];
expectJson(collectAlumdoorAcceptedSourceGroups(promotedAccepted, promotedRaw), [], "BOM parent group must not leak into promoted Item");
const promoted = buildCanonicalAlumdoorItemPayload(promotedAccepted, promotedRaw);
expect(promoted.status, "blocked", "promotion without group evidence blocked");
expect(promoted.reason, "missing_item_group_evidence", "promotion group blocker");

const rawRecords = [{
  source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
  source_sheet: "Trang tính29",
  source_row: 10,
  source_index: null,
  source_group: "Phụ kiện",
}];
const preflight = {
  accepted: [{
    item_code: "NVL-PK-FIXTURE",
    item_name: "Phụ kiện fixture",
    identity_roles: [ITEM_SOURCE_ROLES.STOCK_ITEM],
    stock_uom: "Cái",
    sales_uoms: [],
    source_rows: [{
      source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
      source_sheet: "Trang tính29",
      source_row: 10,
      source_index: null,
    }],
    conversion_factors: [],
  }],
};
const master = buildCanonicalAlumdoorItemMaster(preflight, rawRecords);
expect(master.source_item_count, 1, "master source count");
expect(master.accepted_count, 1, "master accepted count");
expect(master.blocker_count, 0, "master blocker count");
expect(master.payloads[0].item_group, "Phụ kiện chung", "raw-record group enrichment");

console.log("ALUMDOOR_ITEM_MASTER_CLASSIFICATION_PASS");
