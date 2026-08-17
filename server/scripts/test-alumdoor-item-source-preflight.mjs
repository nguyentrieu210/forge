#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import {
  interpretAlumdoorSourceUom,
  preflightAlumdoorItemSourceRecords,
} from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

let uom = interpretAlumdoorSourceUom(ITEM_SOURCE_ROLES.STOCK_ITEM, "KG/M");
expect(uom.status, "dual_unit_basis", "stock KG/M status");
expect(uom.canonical_uom, "Kg", "stock KG/M canonical UOM");
expect(uom.secondary_uom, "Mét", "stock KG/M secondary UOM");

uom = interpretAlumdoorSourceUom(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, "KG/M");
expect(uom.canonical_uom, "Mét", "sellable KG/M commercial UOM");
expect(uom.weight_uom, "Kg", "sellable KG/M weight UOM");

uom = interpretAlumdoorSourceUom(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, "KG/THÙNG");
expect(uom.status, "dual_unit_basis", "sellable KG/THÙNG status");
expect(uom.canonical_uom, "Thùng", "sellable KG/THÙNG commercial UOM");
expect(uom.weight_uom, "Kg", "sellable KG/THÙNG weight UOM");

uom = interpretAlumdoorSourceUom(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT, "BỘ/4 CẶP");
expect(uom.status, "blocked", "ambiguous package UOM must block");
expect(uom.reason, "ambiguous_compound_uom", "ambiguous package UOM reason");

const cleanAudit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 54,
    source_index: 24,
    item_code: "RON-DD",
    item_name: "TP RON ĐÁY ĐỨC",
    source_uom: "M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: 120,
    item_code: "NVL-RON-DD",
    item_name: "RON ĐÁY ĐỨC",
    source_uom: "KG",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 165,
    item_code: "RON-DD",
    item_name: "Ron đáy đức",
    source_uom: "KG/M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: 86,
    item_code: "NVL-AL501-VK",
    item_name: "AL501",
    source_uom: "KG/M",
    source_color: "VÀNG KEM",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 180,
    item_code: "NVL-TD-AL501N VK",
    item_name: "Lá ruột AL501N VK",
    source_uom: "KG/M2",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 1243,
    source_index: 247,
    item_code: "NVL-V5_KEM_STD",
    item_name: "TP-V5_KẼM",
    source_uom: "M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 1244,
    source_index: 248,
    item_code: "NVL-V5_KEM_STD",
    item_name: "TP-V5_STĐ",
    source_uom: "M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 9000,
    item_code: "TRU-TP_KHONGBDK_TANKER-ALUMAX",
    item_name: "Trừ bộ điều khiển",
    source_uom: "BỘ",
  },
]);

expect(cleanAudit.blocker_count, 0, "clean source audit blockers");
expect(cleanAudit.excluded_count, 1, "clean source audit exclusions");
expect(cleanAudit.alias_count, 2, "clean source audit aliases");
expect(cleanAudit.accepted_count, 4, "clean source audit accepted identities");

const ronSellable = cleanAudit.accepted.find((item) => item.item_code === "RON-DD");
if (!ronSellable) throw new Error("RON-DD sellable identity bị mất");
expect(ronSellable.sales_uoms[0], "Mét", "RON-DD sellable UOM");

const profile = cleanAudit.accepted.find((item) => item.item_code === "NVL-AL501-VK");
if (!profile) throw new Error("NVL-AL501-VK stock identity bị mất");
expect(profile.stock_uom, "Kg", "profile stock UOM must be atomic Kg");
expect(profile.requires_conversion, true, "profile must retain kg/m conversion requirement");

const shared = cleanAudit.accepted.find((item) => item.item_code === "NVL-V5_KEM_STD");
if (!shared) throw new Error("V5 shared identity bị mất");
expect(shared.item_code, "NVL-V5_KEM_STD", "V5 code stays exact");

const evidenceAudit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 398,
    source_index: 80,
    item_code: "TP-YHLD-HDK",
    item_name: "TP-YHLD_HỘP ĐIỀU KHIỂN",
    source_uom: "",
  },
  {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: 200,
    item_code: "HH-HDKMT-YH",
    item_name: "YHLD HỘP ĐIỀU KHIỂN",
    source_uom: "CÁI",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 500,
    item_code: "TP-YHLD-HDK",
    item_name: "YHLD_Hộp điều khiển",
    source_uom: "cái",
  },
  {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: 46,
    item_code: "",
    item_name: "Ron đáy úc",
    source_uom: "KG",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 691,
    item_code: "NVL-RONDAYUC",
    item_name: "RON ĐÁY ÚC",
    source_uom: "KG/M ngang",
  },
]);

expect(evidenceAudit.blocker_count, 0, "evidence override audit blockers");
expect(evidenceAudit.alias_count, 1, "evidence override motor alias count");
expect(evidenceAudit.accepted_count, 3, "evidence override accepted identities");

const yhld = evidenceAudit.accepted.find((item) => item.item_code === "TP-YHLD-HDK");
if (!yhld) throw new Error("TP-YHLD-HDK sellable identity bị mất");
expect(yhld.sales_uoms[0], "Cái", "TP-YHLD-HDK explicit UOM override");
expect(yhld.source_rows[0].uom_origin, "explicit_evidence_override", "TP-YHLD-HDK UOM override trace");

const ronDayUc = evidenceAudit.accepted.find((item) => item.item_code === "NVL-RONDAYUC");
if (!ronDayUc) throw new Error("NVL-RONDAYUC stock identity override bị mất");
expect(ronDayUc.stock_uom, "Kg", "NVL-RONDAYUC stock UOM");
expect(ronDayUc.source_rows[0].source_code_original, "", "NVL-RONDAYUC blank source trace");
expect(ronDayUc.source_rows[0].code_origin, "explicit_evidence_override_for_blank_source", "NVL-RONDAYUC code override trace");

const blockedAudit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "fixture",
    source_row: 1,
    item_code: "TP-DUPLICATE-FIXTURE",
    item_name: "DUPLICATE A",
    source_uom: "CÁI",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "fixture",
    source_row: 2,
    item_code: "TP-DUPLICATE-FIXTURE",
    item_name: "DUPLICATE B",
    source_uom: "CÁI",
  },
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "fixture",
    source_row: 3,
    item_code: "TP-COMPOUND-FIXTURE",
    item_name: "COMPOUND UOM",
    source_uom: "BỘ/4 CẶP",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 9999,
    item_code: "NVL-KHONG-TON-TAI",
    item_name: "Vật tư chưa có master",
    source_uom: "CÁI",
  },
]);

const reasons = new Set(blockedAudit.blockers.map((blocker) => blocker.reason));
for (const expectedReason of [
  "duplicate_sellable_code_for_distinct_names",
  "ambiguous_compound_uom",
  "unresolved_bom_reference",
]) {
  if (!reasons.has(expectedReason)) throw new Error(`Thiếu blocker ${expectedReason}`);
}

console.log("ALUMDOOR_ITEM_SOURCE_PREFLIGHT_V2_PASS");
