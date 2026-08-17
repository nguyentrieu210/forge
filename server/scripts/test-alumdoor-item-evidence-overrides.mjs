#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import {
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES,
  ITEM_SOURCE_BOM_ITEM_PROMOTIONS,
  resolveAlumdoorBomEvidenceAlias,
  resolveAlumdoorBomItemPromotion,
} from "./lib/alumdoor-item-evidence-overrides.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

const cases = [
  ["TP-YHLD-Than300kg", "HH-TMT-YHLD300"],
  ["TP-YHLD-Than800kg", "HH-TMT-YHLD800"],
  ["TP-Tanker-Than800kg", "HH-TMT-TK800"],
  ["TP-Alumax-Than400kg", "HH-TMT-AL400"],
  ["TP-JG-Than1500kg", "HH-TMT-JG1500"],
  ["TP-LacJG400-500-600KG", "HH-LMT-JG300-600"],
  ["TP-MTT_BOSTEC-DOI_THAN(P)", "HH-TMTDOI-BOS-PHAI"],
  ["TP-MTT_BOSTEC-DON_THAN(T)", "HH-TMTDON-BOS-TRAI"],
  ["NVL-TOLEKEM124_6D", "NVL-TON-DL6Dx124-STD"],
  ["NVL-TOLEKEM124_6D_MSK", "NVL-TON-DL6Dx124-STD"],
  ["NVL-TOLEKEM124_8D_MSK", "NVL-TON-DL8Dx124-STD"],
  ["NVL-TOLEKEM124_1LY", "NVL-TON-DL1LYx124-STD"],
  ["TP-BUOMSAT", "NVL-BANBUOM-FE"],
  ["NVL-BATSNPHI19", "NVL-BAT-SN"],
  ["NVL-NHANSNPHI19", "NVL-NHAN"],
  ["NVL-BOSNPHI19", "NVL-BOLSN"],
  ["NVL-MONGNGUASNPHI19", "NVL-BOLSN"],
  ["NVL-TOLEKEM70_8D-YEMMV", "TP-TD327"],
  ["NVL-TON3.8D-GU KU", "NVL-TOLE0.35x598-XNVK"],
];

for (const [source, target] of cases) {
  const result = resolveAlumdoorBomEvidenceAlias(source, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (!result) throw new Error(`Thiếu evidence alias: ${source}`);
  expect(result.status, "alias", `${source} status`);
  expect(result.canonical_item_code, target, `${source} target`);
  expect(result.source_code_original, source, `${source} trace`);

  const forbidden = resolveAlumdoorBomEvidenceAlias(source, ITEM_SOURCE_ROLES.SELLABLE_PRODUCT);
  expect(forbidden, null, `${source} must not rewrite sellable identity`);
}

expect(
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES["NVL-TOLEKEM124_6D"],
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES["NVL-TOLEKEM124_6D_MSK"],
  "Đài Loan 6D MSK must share raw stock identity",
);
expect(
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES["NVL-TOLEKEM124_8D"],
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES["NVL-TOLEKEM124_8D_MSK"],
  "Đài Loan 8D MSK must share raw stock identity",
);

const promotionCases = [
  ["TP-YHTaiwan-HDK", "Cái"],
  ["TP-YHTaiwan-PATCD", "Bộ"],
  ["TP_JG_PATCD", "Cái"],
  ["TP-TANKER_PATCD", "Bộ"],
  ["TP_YHLD_PATCD", "Cái"],
  ["TP-ALUMAX_PATCD", "Bộ"],
  ["TP-LUOISN13x26_INOX", "m2"],
  ["NVL-LUOISNPHI19_STD", "Kg"],
  ["RONNHUAVANGCẢNHAY_RSU100", "Kg"],
  ["RONNHUAVANGCANHAY_RSU70", "Kg"],
  ["NVL-LUOIMV_STD", "KG/M"],
  ["NVL-TRUC114_2.4LY", "KG/M"],
  ["NVL-TRUC168_5LY", "KG/M"],
];
for (const [source, uom] of promotionCases) {
  const result = resolveAlumdoorBomItemPromotion(source, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (!result) throw new Error(`Thiếu BOM Item promotion: ${source}`);
  expect(result.status, "promoted_item", `${source} promotion status`);
  expect(result.canonical_item_code, source, `${source} promotion must preserve exact code`);
  expect(result.canonical_source_uom, uom, `${source} promotion UOM`);
  expect(result.identity_role, ITEM_SOURCE_ROLES.STOCK_ITEM, `${source} promotion role`);

  expect(
    resolveAlumdoorBomItemPromotion(source, ITEM_SOURCE_ROLES.SELLABLE_PRODUCT),
    null,
    `${source} promotion must be BOM-only`,
  );
}

const promotionAudit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 633,
    item_code: "TP-YHTaiwan-HDK",
    item_name: "YHTAIWAN_HopDK",
    source_uom: "",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 1135,
    item_code: "RONNHUAVANGCẢNHAY_RSU100",
    item_name: "RONNHUAVANGCANHAY_RSU100",
    source_uom: "KG/M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 1108,
    item_code: "NVL-LUOIMV_STD",
    item_name: "LƯỚI MV STĐ",
    source_uom: "KG/M",
  },
]);
expect(promotionAudit.blocker_count, 0, "promotion audit blockers");
expect(promotionAudit.accepted_count, 3, "promotion audit accepted Item count");
expect(promotionAudit.promotion_count, 3, "promotion audit promotion count");
const taiwan = promotionAudit.accepted.find((item) => item.item_code === "TP-YHTaiwan-HDK");
if (!taiwan) throw new Error("TP-YHTaiwan-HDK promotion bị mất");
expect(taiwan.stock_uom, "Cái", "YHTaiwan Hộp ĐK promoted stock UOM");
expect(taiwan.source_rows[0].uom_origin, "explicit_bom_item_promotion", "YHTaiwan promotion audit trace");
const ron = promotionAudit.accepted.find((item) => item.item_code === "RONNHUAVANGCẢNHAY_RSU100");
if (!ron) throw new Error("RON U100 promotion bị mất");
expect(ron.stock_uom, "Kg", "RON U100 must use DANH MỤC KG, not BOM KG/M rate");
const luoi = promotionAudit.accepted.find((item) => item.item_code === "NVL-LUOIMV_STD");
if (!luoi) throw new Error("NVL-LUOIMV_STD promotion bị mất");
expect(luoi.stock_uom, "Kg", "Lưới MV STĐ stock UOM must be atomic Kg");
expect(luoi.requires_conversion, true, "Lưới MV STĐ KG/M must retain conversion requirement");

const yemAudit = preflightAlumdoorItemSourceRecords([
  {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: 44,
    source_index: 16,
    item_code: "TP-TD327",
    item_name: "TP-LÁ YẾM",
    source_uom: "M",
  },
  {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: 1112,
    item_code: "NVL-TOLEKEM70_8D-YEMMV",
    item_name: "LÁ YẾM",
    source_uom: "M",
  },
]);
expect(yemAudit.blocker_count, 0, "yếm alias blockers");
expect(yemAudit.alias_count, 1, "yếm alias count");
expect(yemAudit.accepted_count, 1, "yếm canonical Item count");
expect(yemAudit.accepted[0].item_code, "TP-TD327", "yếm canonical Item identity");

console.log(`ALUMDOOR_ITEM_EVIDENCE_OVERRIDES_PASS aliases=${Object.keys(ITEM_SOURCE_BOM_EVIDENCE_ALIASES).length} promotions=${Object.keys(ITEM_SOURCE_BOM_ITEM_PROMOTIONS).length}`);
