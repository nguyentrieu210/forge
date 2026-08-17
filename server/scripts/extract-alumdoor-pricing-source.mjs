#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAlumdoorIndexedMarkdownRows,
  parseAlumdoorSourceIndex,
  readAlumdoorCell,
} from "./lib/alumdoor-source-markdown.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const sourcePath = resolve(repoRoot, "apps", "alumdoor", "docs", "nguon", "ms-lien", "ĐM.md");
const outputPath = resolve(process.argv[2] || resolve(repoRoot, "local-imports", "alumdoor-pricing-source.json"));
const reportPath = resolve(process.argv[3] || `${outputPath}.report.json`);

const clean = (value) => String(value ?? "").normalize("NFC").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/[Đ]/g, "D");

function numeric(value) {
  const raw = clean(value).replace(/\s+/g, "").replace(/,/g, ".");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function classify({ stt, itemCode, itemName, price }) {
  const code = fold(itemCode);
  const name = fold(itemName);
  if (code.startsWith("TRU-")) {
    return price < 0
      ? { classification: "DEDUCTION", reason: "explicit_tru_code_negative_price" }
      : { classification: "BLOCKED", reason: "tru_code_must_have_negative_price" };
  }
  if (code.startsWith("PHUTHU") || name.startsWith("PHU THU")) {
    return price > 0
      ? { classification: "SURCHARGE", reason: "explicit_phu_thu_positive_price" }
      : { classification: "BLOCKED", reason: "phu_thu_must_have_positive_price" };
  }
  if (stt === null) {
    return { classification: "NON_PRICING", reason: "unnumbered_component_price_not_sellable" };
  }
  if (price <= 0) {
    return { classification: "BLOCKED", reason: "numbered_base_price_must_be_positive" };
  }
  return { classification: "BASE_PRICE", reason: "numbered_sellable_positive_price" };
}

const dmText = await readFile(sourcePath, "utf8");
const dmRows = parseAlumdoorIndexedMarkdownRows(dmText);
const records = [];
let currentParentCode = "";
let currentParentRow = null;

for (const row of dmRows) {
  const stt = parseAlumdoorSourceIndex(readAlumdoorCell(row, 1));
  const itemCode = clean(readAlumdoorCell(row, 3));
  const itemName = clean(readAlumdoorCell(row, 2)) || clean(readAlumdoorCell(row, 4)) || itemCode;
  const sourceUom = clean(readAlumdoorCell(row, 5));
  if (stt !== null) {
    currentParentCode = itemCode;
    currentParentRow = row.source_row;
  }

  const price = numeric(readAlumdoorCell(row, 7));
  if (price === null || price === 0) continue;
  if (!itemCode) {
    records.push({
      source_file: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
      source_sheet: "ĐM",
      source_row: row.source_row,
      source_index: stt,
      source_category: clean(readAlumdoorCell(row, 0)),
      item_name: itemName,
      item_code: "",
      source_parent_name: clean(readAlumdoorCell(row, 4)),
      source_uom: sourceUom,
      source_rate_or_quantity: clean(readAlumdoorCell(row, 6)),
      source_business_note: clean(readAlumdoorCell(row, 8)),
      source_formula_code: clean(readAlumdoorCell(row, 22)),
      source_price: price,
      classification: "BLOCKED",
      classification_reason: "priced_row_missing_item_code",
    });
    continue;
  }

  const decision = classify({ stt, itemCode, itemName, price });
  records.push({
    source_file: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
    source_sheet: "ĐM",
    source_row: row.source_row,
    source_index: stt,
    source_category: clean(readAlumdoorCell(row, 0)),
    item_name: itemName,
    item_code: itemCode,
    source_parent_name: clean(readAlumdoorCell(row, 4)),
    source_uom: sourceUom,
    source_rate_or_quantity: clean(readAlumdoorCell(row, 6)),
    source_business_note: clean(readAlumdoorCell(row, 8)),
    source_formula_code: clean(readAlumdoorCell(row, 22)),
    source_price: price,
    ...(stt === null && currentParentCode ? {
      parent_item_code: currentParentCode,
      source_parent_row: currentParentRow,
    } : {}),
    classification: decision.classification,
    classification_reason: decision.reason,
  });
}

const counts = records.reduce((out, row) => {
  out[row.classification] = (out[row.classification] || 0) + 1;
  return out;
}, {});
const report = {
  format: "alumdoor-pricing-source-report/v1",
  source_file: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
  parsed_dm_rows: dmRows.length,
  priced_row_count: records.length,
  classification_counts: counts,
  blocked_count: counts.BLOCKED || 0,
  blocked_rows: records.filter((row) => row.classification === "BLOCKED"),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  format: "alumdoor-pricing-source/v1",
  source_file: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
  priced_row_count: records.length,
  records,
}, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(
  `ALUMDOOR_PRICING_SOURCE_EXTRACTED rows=${records.length} base=${counts.BASE_PRICE || 0} surcharge=${counts.SURCHARGE || 0} deduction=${counts.DEDUCTION || 0} non_pricing=${counts.NON_PRICING || 0} blocked=${counts.BLOCKED || 0}`,
);
console.log(`ALUMDOOR_PRICING_SOURCE_OUTPUT ${outputPath}`);
console.log(`ALUMDOOR_PRICING_SOURCE_REPORT ${reportPath}`);
if ((counts.BLOCKED || 0) > 0) process.exitCode = 1;
