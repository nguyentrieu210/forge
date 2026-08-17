#!/usr/bin/env node
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import {
  ITEM_SOURCE_BOM_EVIDENCE_ALIASES,
  resolveAlumdoorBomEvidenceAlias,
} from "./lib/alumdoor-item-evidence-overrides.mjs";

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

console.log(`ALUMDOOR_ITEM_EVIDENCE_OVERRIDES_PASS aliases=${Object.keys(ITEM_SOURCE_BOM_EVIDENCE_ALIASES).length}`);
