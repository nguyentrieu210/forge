#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorBomItemPromotion } from "./lib/alumdoor-item-evidence-overrides.mjs";
import {
  parseAlumdoorIndexedMarkdownRows,
  parseAlumdoorSourceIndex,
  readAlumdoorCell,
} from "./lib/alumdoor-source-markdown.mjs";
import {
  resolveAlumdoorRealSellableGroup,
  resolveAlumdoorRealStockGroup,
} from "./lib/alumdoor-real-source-group.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const sourceRoot = resolve(repoRoot, "apps", "alumdoor", "docs", "nguon", "ms-lien");
const dmPath = resolve(sourceRoot, "ĐM.md");
const stockPath = resolve(sourceRoot, "Trang-tính29.md");
const outputPath = resolve(process.argv[2] || resolve(repoRoot, "local-imports", "alumdoor-item-source-records.json"));
const reportPath = resolve(process.argv[3] || `${outputPath}.report.json`);

const clean = (value) => String(value ?? "").trim();
const fold = (value) => clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("vi").replace(/[Đ]/g, "D");

function isDmHeader(row) {
  return fold(readAlumdoorCell(row, 1)) === "STT"
    || fold(readAlumdoorCell(row, 3)).includes("MA VAT TU");
}

function isStockHeader(row) {
  return fold(readAlumdoorCell(row, 1)).includes("MA NVL");
}

function isDmSectionBoundary(row) {
  return Number(row?.source_row) === 1904
    && !clean(readAlumdoorCell(row, 1))
    && fold(readAlumdoorCell(row, 2)).replace(/\s+/g, " ") === "PHU KIEN LA DAI LOAN"
    && !clean(readAlumdoorCell(row, 3));
}

function isDetachedBomPromotionEvidence(row) {
  const code = clean(readAlumdoorCell(row, 3));
  const promotion = resolveAlumdoorBomItemPromotion(code, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  return Number(row?.source_row) === 2022
    && code === "MŨI MÀI HỘP KIM"
    && fold(readAlumdoorCell(row, 2)) === "MUI MAI HOP KIM"
    && fold(readAlumdoorCell(row, 5)) === "CAI"
    && promotion?.canonical_item_code === code
    && promotion?.canonical_source_uom === "Cái";
}

function makeSellableRecord(row, sourceIndex) {
  const category = readAlumdoorCell(row, 0);
  const itemCode = readAlumdoorCell(row, 3);
  const itemName = readAlumdoorCell(row, 4) || readAlumdoorCell(row, 2) || itemCode;
  const sourceUom = readAlumdoorCell(row, 5);
  return {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: row.source_row,
    source_index: sourceIndex,
    source_parent_row: row.source_row,
    item_code: itemCode,
    item_name: itemName,
    source_uom: sourceUom,
    source_group: resolveAlumdoorRealSellableGroup({
      category,
      item_code: itemCode,
      item_name: itemName,
      source_uom: sourceUom,
    }),
    source_category: category,
    source_rate_or_quantity: readAlumdoorCell(row, 6),
    source_business_note: readAlumdoorCell(row, 8),
    source_formula_code: readAlumdoorCell(row, 22),
  };
}

function makeBomReferenceRecord(row, parentIndex, parentCode, parentRow) {
  const category = readAlumdoorCell(row, 0);
  const itemCode = readAlumdoorCell(row, 3);
  const itemName = readAlumdoorCell(row, 2) || itemCode;
  const sourceUom = readAlumdoorCell(row, 5);
  const sourceFormulaText = readAlumdoorCell(row, 8);
  const sourceFormulaCode = readAlumdoorCell(row, 22);
  return {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: row.source_row,
    source_index: parentIndex,
    source_parent_row: parentRow,
    item_code: itemCode,
    item_name: itemName,
    source_uom: sourceUom,
    source_group: resolveAlumdoorRealStockGroup({
      category,
      item_code: itemCode,
      item_name: itemName,
    }),
    source_category: category,
    parent_item_code: parentCode,
    source_parent_name: readAlumdoorCell(row, 4),
    source_qty_or_formula: readAlumdoorCell(row, 6),
    source_formula_text: sourceFormulaText,
    source_formula_code: sourceFormulaCode,
    source_formula: sourceFormulaCode || sourceFormulaText,
  };
}

function makeEvidenceOnlyBomRecord(row) {
  return {
    ...makeBomReferenceRecord(row, null, "", null),
    source_evidence_only: true,
    source_evidence_reason: "detached_allowlisted_bom_item_promotion",
  };
}

function makeStockRecord(row) {
  const category = readAlumdoorCell(row, 0);
  const itemCode = readAlumdoorCell(row, 1);
  const itemName = readAlumdoorCell(row, 2) || itemCode;
  return {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: row.source_row,
    source_index: null,
    source_parent_row: null,
    item_code: itemCode,
    item_name: itemName,
    source_uom: readAlumdoorCell(row, 5),
    source_group: resolveAlumdoorRealStockGroup({ category, item_code: itemCode, item_name: itemName }),
    source_color: readAlumdoorCell(row, 3),
    source_category: category,
    source_quantity: readAlumdoorCell(row, 4),
    source_date: readAlumdoorCell(row, 6),
  };
}

const [dmText, stockText] = await Promise.all([readFile(dmPath, "utf8"), readFile(stockPath, "utf8")]);
const dmRows = parseAlumdoorIndexedMarkdownRows(dmText);
const stockRows = parseAlumdoorIndexedMarkdownRows(stockText);
const records = [];
let currentParentIndex = null;
let currentParentCode = "";
let currentParentRow = null;
let sellableCount = 0;
let bomReferenceCount = 0;
let bomEvidenceOnlyCount = 0;
for (const row of dmRows) {
  if (isDmHeader(row)) continue;
  if (isDmSectionBoundary(row)) {
    currentParentIndex = null;
    currentParentCode = "";
    currentParentRow = null;
    continue;
  }
  const stt = parseAlumdoorSourceIndex(readAlumdoorCell(row, 1));
  const code = readAlumdoorCell(row, 3);
  const name = readAlumdoorCell(row, 4) || readAlumdoorCell(row, 2);
  const uom = readAlumdoorCell(row, 5);
  if (stt !== null) {
    currentParentIndex = stt;
    currentParentCode = code;
    currentParentRow = row.source_row;
    if (code || name) { records.push(makeSellableRecord(row, stt)); sellableCount += 1; }
    continue;
  }
  if (code && currentParentRow !== null && (name || uom)) {
    records.push(makeBomReferenceRecord(row, currentParentIndex, currentParentCode, currentParentRow));
    bomReferenceCount += 1;
    continue;
  }
  if (code && currentParentRow === null && (name || uom) && isDetachedBomPromotionEvidence(row)) {
    records.push(makeEvidenceOnlyBomRecord(row));
    bomEvidenceOnlyCount += 1;
  }
}
let stockCount = 0;
for (const row of stockRows) {
  if (isStockHeader(row)) continue;
  const code = readAlumdoorCell(row, 1);
  const name = readAlumdoorCell(row, 2);
  const uom = readAlumdoorCell(row, 5);
  if (!code && !name && !uom) continue;
  records.push(makeStockRecord(row));
  stockCount += 1;
}

const unresolvedGroups = records.filter((row) => row.source_role !== ITEM_SOURCE_ROLES.BOM_REFERENCE && !row.source_group);
const groupCounts = {};
for (const row of records) {
  if (!row.source_group || row.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE) continue;
  groupCounts[row.source_group] = (groupCounts[row.source_group] || 0) + 1;
}
const unresolvedSamples = unresolvedGroups.slice(0, 100).map((row) => ({
  source_sheet: row.source_sheet, source_row: row.source_row, source_index: row.source_index,
  source_category: row.source_category, item_code: row.item_code, item_name: row.item_name, source_uom: row.source_uom,
}));
const sellableDualUnitEvidence = records
  .filter((row) => row.source_role === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT && /^KG\//i.test(row.source_uom))
  .map((row) => ({ source_row: row.source_row, source_index: row.source_index, item_code: row.item_code,
    item_name: row.item_name, source_uom: row.source_uom, conversion_factor: Number(row.source_rate_or_quantity) }))
  .filter((row) => Number.isFinite(row.conversion_factor) && row.conversion_factor > 0);
const report = {
  source_authority: {
    sellable: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md numbered rows",
    stock: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md",
    bom_reference: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md component rows bound by unique parent source row",
    bom_item_promotion_evidence: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md detached allowlisted evidence rows",
  },
  dm_row_count: dmRows.length, stock_row_count: stockRows.length, source_record_count: records.length,
  sellable_count: sellableCount, stock_count: stockCount, bom_reference_count: bomReferenceCount,
  bom_evidence_only_count: bomEvidenceOnlyCount,
  unresolved_group_count: unresolvedGroups.length, group_counts: groupCounts,
  unresolved_group_samples: unresolvedSamples, sellable_dual_unit_evidence: sellableDualUnitEvidence,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_REAL_SOURCE_RECORDS_EXTRACTED records=${records.length} sellable=${sellableCount} stock=${stockCount} bom_reference=${bomReferenceCount} bom_evidence_only=${bomEvidenceOnlyCount} unresolved_groups=${unresolvedGroups.length}`);
console.log(`ALUMDOOR_REAL_SOURCE_RECORDS_OUTPUT ${outputPath}`);
console.log(`ALUMDOOR_REAL_SOURCE_RECORDS_REPORT ${reportPath}`);
if (unresolvedGroups.length > 0) {
  console.log("ALUMDOOR_REAL_SOURCE_GROUPS_PENDING");
  for (const row of unresolvedSamples.slice(0, 25)) console.log(JSON.stringify(row));
}
for (const row of sellableDualUnitEvidence) console.log(`DUAL_UNIT_EVIDENCE ${JSON.stringify(row)}`);
if (sellableCount === 0 || stockCount === 0 || bomReferenceCount === 0) {
  throw new Error(`ALUMDOOR_REAL_SOURCE_EMPTY sellable=${sellableCount} stock=${stockCount} bom_reference=${bomReferenceCount}`);
}
