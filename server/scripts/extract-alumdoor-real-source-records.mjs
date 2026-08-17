#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
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
    || fold(readAlumdoorCell(row, 3)).includes("MA SAN PHAM");
}

function isStockHeader(row) {
  return fold(readAlumdoorCell(row, 2)).includes("MA NVL");
}

function makeSellableRecord(row, sourceIndex) {
  const category = readAlumdoorCell(row, 0);
  const itemCode = readAlumdoorCell(row, 3);
  const itemName = readAlumdoorCell(row, 4) || readAlumdoorCell(row, 2) || itemCode;
  const sourceUom = readAlumdoorCell(row, 6);
  return {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_sheet: "ĐM",
    source_row: row.source_row,
    source_index: sourceIndex,
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
  };
}

function makeBomReferenceRecord(row, parentIndex, parentCode) {
  const itemCode = readAlumdoorCell(row, 3);
  const itemName = readAlumdoorCell(row, 4) || readAlumdoorCell(row, 2) || itemCode;
  const sourceUom = readAlumdoorCell(row, 6);
  return {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_sheet: "ĐM",
    source_row: row.source_row,
    source_index: parentIndex,
    item_code: itemCode,
    item_name: itemName,
    source_uom: sourceUom,
    source_group: "",
    source_category: readAlumdoorCell(row, 0),
    parent_item_code: parentCode,
    source_qty_or_formula: readAlumdoorCell(row, 7),
  };
}

function makeStockRecord(row) {
  const category = readAlumdoorCell(row, 1);
  const itemCode = readAlumdoorCell(row, 2);
  const itemName = readAlumdoorCell(row, 3) || itemCode;
  return {
    source_role: ITEM_SOURCE_ROLES.STOCK_ITEM,
    source_sheet: "Trang tính29",
    source_row: row.source_row,
    source_index: null,
    item_code: itemCode,
    item_name: itemName,
    source_uom: readAlumdoorCell(row, 6),
    source_group: resolveAlumdoorRealStockGroup({
      category,
      item_code: itemCode,
      item_name: itemName,
    }),
    source_color: readAlumdoorCell(row, 4),
    source_category: category,
    source_quantity: readAlumdoorCell(row, 5),
    source_date: readAlumdoorCell(row, 7),
  };
}

const [dmText, stockText] = await Promise.all([
  readFile(dmPath, "utf8"),
  readFile(stockPath, "utf8"),
]);
const dmRows = parseAlumdoorIndexedMarkdownRows(dmText);
const stockRows = parseAlumdoorIndexedMarkdownRows(stockText);

const records = [];
let currentParentIndex = null;
let currentParentCode = "";
let sellableCount = 0;
let bomReferenceCount = 0;
for (const row of dmRows) {
  if (isDmHeader(row)) continue;
  const stt = parseAlumdoorSourceIndex(readAlumdoorCell(row, 1));
  const code = readAlumdoorCell(row, 3);
  const name = readAlumdoorCell(row, 4) || readAlumdoorCell(row, 2);
  const uom = readAlumdoorCell(row, 6);

  if (stt !== null) {
    currentParentIndex = stt;
    currentParentCode = code;
    if (code || name) {
      records.push(makeSellableRecord(row, stt));
      sellableCount += 1;
    }
    continue;
  }

  // Only code-bearing component rows are BOM references. Text-only notes,
  // separators and pricing descriptions must not become Item evidence.
  if (code && currentParentIndex !== null && (name || uom)) {
    records.push(makeBomReferenceRecord(row, currentParentIndex, currentParentCode));
    bomReferenceCount += 1;
  }
}

let stockCount = 0;
for (const row of stockRows) {
  if (isStockHeader(row)) continue;
  const code = readAlumdoorCell(row, 2);
  const name = readAlumdoorCell(row, 3);
  const uom = readAlumdoorCell(row, 6);
  // Keep named stock rows even when code/UOM is blank so explicit evidence
  // overrides can resolve known source defects fail-closed.
  if (!code && !name && !uom) continue;
  records.push(makeStockRecord(row));
  stockCount += 1;
}

const unresolvedGroups = records.filter((row) => (
  row.source_role !== ITEM_SOURCE_ROLES.BOM_REFERENCE && !row.source_group
));
const groupCounts = {};
for (const row of records) {
  if (!row.source_group) continue;
  groupCounts[row.source_group] = (groupCounts[row.source_group] || 0) + 1;
}
const unresolvedSamples = unresolvedGroups.slice(0, 100).map((row) => ({
  source_sheet: row.source_sheet,
  source_row: row.source_row,
  source_index: row.source_index,
  source_category: row.source_category,
  item_code: row.item_code,
  item_name: row.item_name,
  source_uom: row.source_uom,
}));

const report = {
  source_authority: {
    sellable: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md numbered rows",
    stock: "apps/alumdoor/docs/nguon/ms-lien/Trang-tính29.md",
    bom_reference: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md component rows",
  },
  dm_row_count: dmRows.length,
  stock_row_count: stockRows.length,
  source_record_count: records.length,
  sellable_count: sellableCount,
  stock_count: stockCount,
  bom_reference_count: bomReferenceCount,
  unresolved_group_count: unresolvedGroups.length,
  group_counts: groupCounts,
  unresolved_group_samples: unresolvedSamples,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `ALUMDOOR_REAL_SOURCE_RECORDS_EXTRACTED records=${records.length} sellable=${sellableCount} stock=${stockCount} bom_reference=${bomReferenceCount} unresolved_groups=${unresolvedGroups.length}`,
);
console.log(`ALUMDOOR_REAL_SOURCE_RECORDS_OUTPUT ${outputPath}`);
console.log(`ALUMDOOR_REAL_SOURCE_RECORDS_REPORT ${reportPath}`);
if (unresolvedGroups.length > 0) {
  console.log("ALUMDOOR_REAL_SOURCE_GROUPS_PENDING");
  for (const row of unresolvedSamples.slice(0, 25)) console.log(JSON.stringify(row));
}
