#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveTemplateLineage } from "./lib/alumdoor-real-bom-gate-semantics.mjs";

const [sourceArg,itemArg,bomArg,auditArg] = process.argv.slice(2);
if (!sourceArg || !itemArg || !bomArg || !auditArg) {
  throw new Error("Usage: check-alumdoor-canonical-bom-regressions.mjs <source.json> <items.json> <bom.json> <audit.json>");
}
const readJson = (arg) => JSON.parse(readFileSync(path.resolve(arg), "utf8"));
const source = readJson(sourceArg);
const itemPayload = readJson(itemArg);
const bomPayload = readJson(bomArg);
const audit = readJson(auditArg);
const records = Array.isArray(source) ? source : source.records;
const items = itemPayload.items ?? [];
const boms = bomPayload.boms ?? [];
const blockers = audit.blockers ?? [];
const lines = boms.flatMap((bom) => bom.lines ?? []);
const itemMap = new Map(items.map((item) => [String(item.item_code ?? "").trim(), item]));

assert.equal(items.length, 587, "Gate A canonical Item count must remain 587");
assert.equal(audit.blocker_counts?.missing_component_item ?? 0, 0, "missing_component_item must remain zero");

function linesForSourceItem(code) {
  return lines.filter((line) => line.lineage?.source_item_code === code);
}
function blockersForSourceItem(code) {
  return blockers.filter((blocker) => blocker.source_item_code === code);
}

const boltLines = linesForSourceItem("NVL-BULON12.12");
assert.ok(boltLines.length > 0, "NVL-BULON12.12 must resolve into canonical BOM lines");
assert.ok(boltLines.every((line) => line.item_code === "NVL-BULON12.12"), "NVL-BULON12.12 canonical identity must be preserved");
assert.equal(blockersForSourceItem("NVL-BULON12.12").length, 0, "NVL-BULON12.12 must not regress into a blocker");

const rubberLines = linesForSourceItem("RNHUA/LONG-CR");
assert.ok(rubberLines.length > 0, "RNHUA/LONG-CR must resolve into canonical BOM lines");
assert.ok(rubberLines.every((line) => line.item_code === "RNHUA/LONG-CR"), "RNHUA/LONG-CR canonical identity must be preserved");
assert.equal(blockersForSourceItem("RNHUA/LONG-CR").length, 0, "RNHUA/LONG-CR must not regress into a blocker");

const brushBlockers = blockersForSourceItem("NVL-PHOTLONG4X5");
assert.ok(brushBlockers.length > 0, "NVL-PHOTLONG4X5 must remain fail-closed without authoritative roll conversion evidence");
assert.ok(brushBlockers.every((blocker) => blocker.type === "missing_conversion"), "NVL-PHOTLONG4X5 may only be blocked by missing authoritative conversion evidence");
assert.ok(brushBlockers.every((blocker) => blocker.canonical_item_code === "NVL-PHOTLONG4X5"), "NVL-PHOTLONG4X5 identity must resolve before conversion blocking");
const brushMetresPerRoll = brushBlockers.filter((blocker) => blocker.runtime_uom === "Mét" && blocker.stock_uom === "Cuộn");
assert.ok(brushMetresPerRoll.length > 0, "NVL-PHOTLONG4X5 must explicitly retain at least one authoritative Mét↔Cuộn evidence gap");
assert.equal(linesForSourceItem("NVL-PHOTLONG4X5").length, 0, "NVL-PHOTLONG4X5 must not silently resolve without conversion evidence");

const sealedRayLines = linesForSourceItem("NVL-TOLE1.2x190-CORON")
  .filter((line) => line.lineage?.source_formula_text === "(CAO PB - 10CM)x2");
assert.ok(sealedRayLines.length > 0, "exact sealed-ray height formula must resolve from source-backed 1.78 KG/M evidence");
for (const line of sealedRayLines) {
  assert.equal(line.item_code, "NVL-TOLE1.2x190-RON", "sealed-ray source alias must preserve canonical item identity");
  assert.equal(line.uom, "Mét", "sealed-ray runtime quantity must remain in source length UOM");
  assert.equal(line.conversion_factor, 1.78, "sealed-ray exact source conversion must remain 1.78 KG/M");
  const formula = JSON.parse(line.quantity_formula_json);
  assert.equal(formula.base?.field, "PB_CAO");
  assert.equal(formula.base?.offset, -0.1);
  assert.equal(formula.multiply, 2);
}
assert.equal(
  blockers.filter((blocker) => blocker.source_item_code === "NVL-TOLE1.2x190-CORON" && blocker.source_formula_text === "(CAO PB - 10CM)x2").length,
  0,
  "exact sealed-ray height formula must not regress into a blocker",
);

const inoxBottomSealRows = new Set([24, 28, 32]);
const inoxBottomSealLines = lines.filter((line) => inoxBottomSealRows.has(line.lineage?.source_row));
assert.equal(inoxBottomSealLines.length, 3, "all three exact RNINOX-DR ray rows must resolve");
for (const line of inoxBottomSealLines) {
  assert.equal(line.lineage?.source_item_code, "RNINOX-DR");
  assert.equal(line.item_code, "NVL-RINOX-DR");
  assert.equal(line.uom, "Mét");
  assert.equal(line.conversion_factor, 0.124, "RNINOX-DR exact source conversion must remain 0.124 KG/M");
  const formula = JSON.parse(line.quantity_formula_json);
  assert.equal(formula.base?.field, "PB_CAO");
  assert.equal(formula.base?.offset, 0.15);
}
assert.equal(
  blockers.filter((blocker) => inoxBottomSealRows.has(blocker.source_row)).length,
  0,
  "RNINOX-DR exact conversion rows must not regress into blockers",
);

const rubberBottomSealRows = new Set([23, 27, 31]);
const rubberBottomSealBlockers = blockers.filter((blocker) => rubberBottomSealRows.has(blocker.source_row));
assert.equal(rubberBottomSealBlockers.length, 3, "RNHUA-DR must remain fail-closed while 0.101 and 0.263 KG/M authorities conflict");
assert.ok(rubberBottomSealBlockers.every((blocker) => blocker.type === "missing_conversion"));

const ratePerOutputRows = new Map([
  [55, { item_code: "NVL-RON-DD", qty: 0.117 }],
  [57, { item_code: "NVL-RNHUA-DR", qty: 0.101 }],
  [58, { item_code: "NVL-RINOX-DR", qty: 0.124 }],
  [1125, { item_code: "NVL-TRUC114_2.4LY", qty: 12.8 }],
  [1127, { item_code: "NVL-TRUC168_5LY", qty: 15.6 }],
]);
for (const [sourceRow, expected] of ratePerOutputRows) {
  const line = lines.find((entry) => entry.lineage?.source_row === sourceRow);
  assert.ok(line, `source row ${sourceRow} must resolve as an exact rate per canonical BOM output UOM`);
  assert.equal(line.item_code, expected.item_code);
  assert.equal(line.uom, "Kg");
  assert.equal(line.qty, expected.qty);
  assert.equal(line.lineage?.resolution_reason, "rate_per_parent_output");
  assert.equal(blockers.filter((blocker) => blocker.source_row === sourceRow).length, 0);
}

assert.equal(blockers.filter((blocker) => blocker.type === "parent_missing_conversion").length, 0, "finished-door parent conversion must never be reintroduced");
const finishedDoorBoms = boms.filter((bom) => itemMap.get(bom.item)?.stock_uom === "Bộ");
assert.ok(finishedDoorBoms.length > 0, "expected at least one finished-door BOM with stock UOM Bộ");
for (const bom of finishedDoorBoms) {
  assert.equal(bom.quantity, 1, `${bom.item} parent output quantity must be 1`);
  assert.equal(bom.output_uom, "Bộ", `${bom.item} parent output UOM must be Bộ`);
  assert.equal(bom.configuration_snapshot?.output?.quantity, 1, `${bom.item} snapshot output quantity must be 1`);
  assert.equal(bom.configuration_snapshot?.output?.output_uom, "Bộ", `${bom.item} snapshot output UOM must be Bộ`);
}
for (const item of items.filter((row) => row.stock_uom === "Bộ")) {
  const staticArea = (item.uom_conversions ?? []).filter((row) => /^(m2|m²)$/i.test(String(row.uom ?? "").trim()));
  assert.equal(staticArea.length, 0, `${item.item_code} must not carry static Bộ↔m² conversion`);
}

const leafLine = lines.find((line) => line.lineage?.source_row === 688);
assert.ok(leafLine, "source row 688 must resolve through the corrected 4D template");
const leafFormula = JSON.parse(leafLine.quantity_formula_json);
assert.equal(leafFormula.base?.kind, "PRODUCT");
assert.equal(leafFormula.base?.left?.field, "PB_CAO");
assert.equal(leafFormula.base?.right?.field, "PB_RAY_RONG");
assert.equal(leafFormula.base?.right?.offset, -0.03);
assert.equal(leafFormula.multiply, 3.6);

const bottomBarLine = lines.find((line) => line.lineage?.source_row === 691);
assert.ok(bottomBarLine, "source row 691 must resolve through the corrected 4D template");
const bottomBarFormula = JSON.parse(bottomBarLine.quantity_formula_json);
assert.equal(bottomBarFormula.base?.field, "PB_RAY_RONG");
assert.equal(bottomBarFormula.base?.offset, -0.03);
assert.equal(bottomBarFormula.multiply, 0.6);

const validLineage = resolveTemplateLineage({ source_sheet: "ĐM", source_row: 688, item_code: "NVL-TON3.8D-XN-VK" }, "NVL-TOLE0.35x598-XNVK");
assert.equal(validLineage.status, "mapped");
assert.equal(validLineage.kind, "formula");
assert.equal(validLineage.template_code, "SRC-UC-KT-4D-XN-VK");

const mismatchedLineage = resolveTemplateLineage({ source_sheet: "ĐM", source_row: 688, item_code: "NVL-GIAT" }, "NVL-GIAT");
assert.equal(mismatchedLineage.status, "blocked");
assert.equal(mismatchedLineage.reason, "template_lineage_item_mismatch");
assert.equal(mismatchedLineage.expected_item_code, "NVL-TON3.8D-XN-VK");

const wrongRow = resolveTemplateLineage({ source_sheet: "ĐM", source_row: 687, item_code: "NVL-TON3.8D-XN-VK" }, "NVL-TOLE0.35x598-XNVK");
assert.equal(wrongRow.status, "unmapped", "matching-ish component on the wrong source row must not map to a template formula");

const sourceRows = new Set(records.map((record) => Number(record.source_row)).filter(Number.isFinite));
assert.ok(sourceRows.has(688) && sourceRows.has(691), "regression source rows must exist in extracted source evidence");

console.log("ALUMDOOR_CANONICAL_BOM_REGRESSIONS_PASS");
