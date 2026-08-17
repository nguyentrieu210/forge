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
const excluded = audit.excluded ?? [];
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
function lineForSourceRow(sourceRow) {
  return lines.find((line) => line.lineage?.source_row === sourceRow);
}
function bomForSourceRow(sourceRow) {
  return boms.find((bom) => (bom.lines ?? []).some((line) => line.lineage?.source_row === sourceRow));
}
function sourceRecordForRow(sourceRow, sourceRole = undefined) {
  return records.find((record) => Number(record.source_row) === sourceRow && (!sourceRole || record.source_role === sourceRole));
}
function assertFieldFormula(line, field, multiply, offset = undefined) {
  const formula = JSON.parse(line.quantity_formula_json);
  assert.equal(formula.base?.kind, "FIELD");
  assert.equal(formula.base?.field, field);
  if (offset === undefined) assert.equal(formula.base?.offset, undefined);
  else assert.equal(formula.base?.offset, offset);
  if (multiply === 1) assert.equal(formula.multiply, undefined);
  else assert.equal(formula.multiply, multiply);
}

const sellableRecords = records.filter((record) => record.source_role === "sellable_product");
assert.ok(sellableRecords.every((record) => Number(record.source_parent_row) === Number(record.source_row)), "every sellable row must own a unique source_parent_row");
assert.equal(new Set(sellableRecords.map((record) => Number(record.source_parent_row))).size, sellableRecords.length, "source_parent_row must be unique even when source STT/source_index repeats");
const falseSectionRefs = records.filter((record) => record.source_role === "bom_reference" && Number(record.source_row) >= 1905 && Number(record.source_row) <= 2024);
assert.equal(falseSectionRefs.length, 0, "ĐM section after row 1904 is not an HH-CUAKEODL BOM and must not leak as component references");

const parentLineageContracts = new Map([
  [57, { parentRow: 56, parentItem: "RONNHUA_INOX", outcome: "line" }],
  [58, { parentRow: 56, parentItem: "RONNHUA_INOX", outcome: "line" }],
  [395, { parentRow: 394, parentItem: "TP-YHLD-BDK", outcome: "line" }],
  [396, { parentRow: 394, parentItem: "TP-YHLD-BDK", outcome: "line" }],
  [521, { parentRow: 520, parentItem: "TP-BUOMSAT-DL", outcome: "blocker" }],
  [523, { parentRow: 522, parentItem: "TP-BUOMSAT-ST", outcome: "blocker" }],
  [1897, { parentRow: 1893, parentItem: "NVL-TOLEKEM124_1LY_MSK", outcome: "line" }],
  [1898, { parentRow: 1893, parentItem: "NVL-TOLEKEM124_1LY_MSK", outcome: "line" }],
  [2026, { parentRow: 2025, parentItem: "NVL-TON-DL9.2Dx175-XNVK", outcome: "excluded" }],
]);
for (const [sourceRow, contract] of parentLineageContracts) {
  const record = sourceRecordForRow(sourceRow, "bom_reference");
  assert.ok(record, `source row ${sourceRow} must remain an extracted BOM reference`);
  assert.equal(Number(record.source_parent_row), contract.parentRow, `source row ${sourceRow} must bind to exact parent source row ${contract.parentRow}`);
  if (contract.outcome === "line") {
    const line = lineForSourceRow(sourceRow);
    const bom = bomForSourceRow(sourceRow);
    assert.ok(line && bom, `source row ${sourceRow} must resolve under its exact parent`);
    assert.equal(line.lineage?.source_parent_row, contract.parentRow);
    assert.equal(bom.item, contract.parentItem, `source row ${sourceRow} must not be stolen by duplicate STT/source_index`);
  } else if (contract.outcome === "blocker") {
    const blocker = blockers.find((entry) => entry.source_row === sourceRow);
    assert.ok(blocker, `source row ${sourceRow} must remain fail-closed under its exact parent`);
    assert.equal(blocker.source_parent_row, contract.parentRow);
    assert.equal(blocker.parent_item_code, contract.parentItem);
  } else {
    const entry = excluded.find((candidate) => candidate.source_row === sourceRow);
    assert.ok(entry, `source row ${sourceRow} must remain excluded under its exact parent`);
    assert.equal(entry.source_parent_row, contract.parentRow);
  }
}

for (const bom of boms) {
  for (const line of bom.lines ?? []) {
    assert.notEqual(line.item_code, bom.item, `${bom.item} must never contain itself as a canonical BOM component`);
  }
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
  assertFieldFormula(line, "PB_CAO", 2, -0.1);
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
  assertFieldFormula(line, "PB_CAO", 1, 0.15);
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
  const line = lineForSourceRow(sourceRow);
  assert.ok(line, `source row ${sourceRow} must resolve as an exact rate per canonical BOM output UOM`);
  assert.equal(line.item_code, expected.item_code);
  assert.equal(line.uom, "Kg");
  assert.equal(line.qty, expected.qty);
  assert.equal(line.lineage?.resolution_reason, "rate_per_parent_output");
  assert.equal(blockers.filter((blocker) => blocker.source_row === sourceRow).length, 0);
}

const australiaBottomSealLine = lineForSourceRow(686);
assert.ok(australiaBottomSealLine, "RONDAYUC source row 686 must resolve to the raw bottom-seal Item");
assert.equal(australiaBottomSealLine.lineage?.source_item_code, "RONDAYUC");
assert.equal(australiaBottomSealLine.item_code, "NVL-RONDAYUC");
assert.equal(australiaBottomSealLine.uom, "Kg");
assert.equal(australiaBottomSealLine.qty, 0.0077);
assert.equal(australiaBottomSealLine.lineage?.resolution_reason, "rate_per_parent_output");
assert.equal(blockers.filter((blocker) => blocker.source_row === 686).length, 0);

for (const sourceRow of [679, 1129, 2026]) {
  assert.ok(
    excluded.some((entry) => entry.source_row === sourceRow && entry.reason === "canonical_self_reference_non_bom"),
    `canonical self-reference source row ${sourceRow} must be excluded from BOM construction`,
  );
  assert.equal(blockers.filter((blocker) => blocker.source_row === sourceRow).length, 0);
}

const dl632VnLine = lineForSourceRow(1346);
const dl632XlcLine = lineForSourceRow(1352);
assert.ok(dl632VnLine && dl632XlcLine, "both exact 6.32 kg/m² DL 5.2D color variants must resolve");
for (const line of [dl632VnLine, dl632XlcLine]) {
  assert.equal(line.uom, "Kg");
  const formula = JSON.parse(line.quantity_formula_json);
  assert.equal(formula.base?.kind, "PRODUCT");
  assert.equal(formula.base?.left?.field, "PB_CAO");
  assert.equal(formula.base?.right?.field, "PB_RAY_RONG");
  assert.equal(formula.base?.right?.offset, -0.03);
  assert.equal(formula.multiply, 6.32);
}
assert.equal(dl632XlcLine.item_code, "NVL-TON-DL5.2Dx124-XNXLC");
assert.equal(dl632XlcLine.lineage?.source_uom, "M2", "row 1352 must retain the anomalous source UOM in lineage");
assert.equal(dl632XlcLine.lineage?.resolution_reason, "source_exact_dl_leaf_632");
assert.equal(blockers.filter((blocker) => blocker.source_row === 1352).length, 0);

const meshBracket = lineForSourceRow(1112);
assert.ok(meshBracket, "mesh bracket source row 1112 must resolve through exact source UOM evidence");
assert.equal(meshBracket.item_code, "NVL-BAT-MV");
assert.equal(meshBracket.uom, "Cái");
assert.equal(meshBracket.lineage?.source_uom, "m");
assert.equal(meshBracket.lineage?.resolution_reason, "exact_source_row_1112");
assertFieldFormula(meshBracket, "PB_RAY_RONG", 7);

for (const sourceRow of [1113, 1153]) {
  const line = lineForSourceRow(sourceRow);
  assert.ok(line, `mesh rivet source row ${sourceRow} must resolve through exact source UOM evidence`);
  assert.equal(line.item_code, "NVL-DINHTAN-MV");
  assert.equal(line.uom, "Kg");
  assert.equal(line.lineage?.source_uom, "M NGANG");
  assert.equal(line.lineage?.resolution_reason, `exact_source_row_${sourceRow}`);
  assertFieldFormula(line, "PB_RAY_RONG", 0.0105);
}
for (const sourceRow of [1114, 1154]) {
  const line = lineForSourceRow(sourceRow);
  assert.ok(line, `mesh rivet-nut source row ${sourceRow} must resolve through exact source UOM evidence`);
  assert.equal(line.item_code, "NVL-CONTAN-MV");
  assert.equal(line.uom, "Kg");
  assert.equal(line.lineage?.source_uom, "M NGANG");
  assert.equal(line.lineage?.resolution_reason, `exact_source_row_${sourceRow}`);
  assertFieldFormula(line, "PB_RAY_RONG", 0.0056);
}
for (const [sourceRow, sourceUom] of [[1208, "M2"], [1217, ""]]) {
  const line = lineForSourceRow(sourceRow);
  assert.ok(line, `mesh V4 source row ${sourceRow} must resolve through exact source UOM evidence`);
  assert.equal(line.item_code, "TP-V4_INOX");
  assert.equal(line.uom, "Mét");
  assert.equal(line.lineage?.source_uom, sourceUom);
  assert.equal(line.lineage?.resolution_reason, `exact_source_row_${sourceRow}`);
  assertFieldFormula(line, "PB_RAY_RONG", 2, -0.03);
}
for (const sourceRow of [1112, 1113, 1114, 1153, 1154, 1208, 1217]) {
  assert.equal(blockers.filter((blocker) => blocker.source_row === sourceRow).length, 0, `exact mesh source row ${sourceRow} must not remain blocked`);
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

const leafLine = lineForSourceRow(688);
assert.ok(leafLine, "source row 688 must resolve through the corrected 4D template");
const leafFormula = JSON.parse(leafLine.quantity_formula_json);
assert.equal(leafFormula.base?.kind, "PRODUCT");
assert.equal(leafFormula.base?.left?.field, "PB_CAO");
assert.equal(leafFormula.base?.right?.field, "PB_RAY_RONG");
assert.equal(leafFormula.base?.right?.offset, -0.03);
assert.equal(leafFormula.multiply, 3.6);

const bottomBarLine = lineForSourceRow(691);
assert.ok(bottomBarLine, "source row 691 must resolve through the corrected 4D template");
assertFieldFormula(bottomBarLine, "PB_RAY_RONG", 0.6, -0.03);

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
