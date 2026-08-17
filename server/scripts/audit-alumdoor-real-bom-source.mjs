#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";

const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg) throw new Error("Usage: audit-alumdoor-real-bom-source.mjs <source-records.json> [audit.json]");
const source = JSON.parse(readFileSync(path.resolve(sourceArg), "utf8"));
const records = Array.isArray(source) ? source : source.records;
if (!Array.isArray(records)) throw new Error("Invalid source records");
const clean = (value) => String(value ?? "").trim();
const refs = records.filter((row) => row.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE);
if (refs.length === 0) throw new Error("ALUMDOOR_REAL_BOM_SOURCE_EMPTY");

function countBy(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
}
const uoms = countBy(refs.map((row) => clean(row.source_uom) || "<blank>"));
const formulas = countBy(refs.map((row) => clean(row.source_formula) || "<blank>"));
const qtyOrFormula = countBy(refs.map((row) => clean(row.source_qty_or_formula) || "<blank>"));
const slashUoms = uoms.filter(([uom]) => uom.includes("/"));
const nonNumericQtyRows = refs.filter((row) => {
  const raw = clean(row.source_qty_or_formula).replace(",", ".");
  return raw !== "" && !/^[+-]?\d+(?:\.\d+)?$/.test(raw);
});
const blankQtyRows = refs.filter((row) => clean(row.source_qty_or_formula) === "");
const report = {
  format: "alumdoor-real-bom-source-audit/v1",
  source_reference_count: refs.length,
  distinct_uom_count: uoms.length,
  distinct_formula_count: formulas.length,
  distinct_qty_or_formula_count: qtyOrFormula.length,
  slash_uom_row_count: slashUoms.reduce((sum, [, count]) => sum + count, 0),
  nonnumeric_qty_row_count: nonNumericQtyRows.length,
  blank_qty_row_count: blankQtyRows.length,
  uoms: uoms.map(([value, count]) => ({ value, count })),
  formulas: formulas.map(([value, count]) => ({ value, count })),
  slash_uoms: slashUoms.map(([value, count]) => ({ value, count })),
  nonnumeric_qty_samples: nonNumericQtyRows.slice(0, 100).map((row) => ({
    source_row: row.source_row,
    source_index: row.source_index,
    item_code: row.item_code,
    source_uom: row.source_uom,
    source_qty_or_formula: row.source_qty_or_formula,
    source_formula: row.source_formula,
  })),
  blank_qty_samples: blankQtyRows.slice(0, 100).map((row) => ({
    source_row: row.source_row,
    source_index: row.source_index,
    item_code: row.item_code,
    source_uom: row.source_uom,
    source_formula: row.source_formula,
  })),
};
if (outputArg) writeFileSync(path.resolve(outputArg), `${JSON.stringify(report, null, 2)}\n`);
console.log(`ALUMDOOR_REAL_BOM_SOURCE_AUDIT refs=${refs.length} distinct_uoms=${uoms.length} distinct_formulas=${formulas.length} slash_uom_rows=${report.slash_uom_row_count} nonnumeric_qty=${nonNumericQtyRows.length} blank_qty=${blankQtyRows.length}`);
console.log(`ALUMDOOR_REAL_BOM_UOM_CATALOG ${JSON.stringify(report.uoms)}`);
console.log(`ALUMDOOR_REAL_BOM_FORMULA_CATALOG ${JSON.stringify(report.formulas)}`);
console.log(`ALUMDOOR_REAL_BOM_SLASH_UOMS ${JSON.stringify(report.slash_uoms)}`);
if (nonnumericQtyRows.length) console.log(`ALUMDOOR_REAL_BOM_NONNUMERIC_QTY_SAMPLES ${JSON.stringify(report.nonnumeric_qty_samples)}`);
if (blankQtyRows.length) console.log(`ALUMDOOR_REAL_BOM_BLANK_QTY_SAMPLES ${JSON.stringify(report.blank_qty_samples)}`);
