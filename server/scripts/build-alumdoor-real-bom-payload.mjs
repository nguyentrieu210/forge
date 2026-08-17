#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyAlumdoorItemSourceCode, ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorBomEvidenceAlias, resolveAlumdoorBomItemPromotion } from "./lib/alumdoor-item-evidence-overrides.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";
import {
  buildBomSourceProvenance,
  resolveBomParentOutput,
  resolveBomQuantitySemantics,
  resolveBomRuntimeUom,
} from "./lib/alumdoor-real-bom-semantics.mjs";

const [sourceArg, itemPayloadArg, outputArg, auditArg] = process.argv.slice(2);
if (!sourceArg || !itemPayloadArg || !outputArg) {
  throw new Error("Usage: node build-alumdoor-real-bom-payload.mjs <source-records.json> <item-payload.json> <bom-payload.json> [bom-audit.json]");
}
const source = JSON.parse(readFileSync(path.resolve(sourceArg), "utf8"));
const records = Array.isArray(source) ? source : source.records;
const itemPayload = JSON.parse(readFileSync(path.resolve(itemPayloadArg), "utf8"));
if (!Array.isArray(records) || !Array.isArray(itemPayload.items)) throw new Error("Invalid source/item payload");
const preflight = preflightAlumdoorItemSourceRecords(records);
if (preflight.blocker_count !== 0) throw new Error(`BOM build requires zero source blockers; got ${preflight.blocker_count}`);

const clean = (value) => String(value ?? "").trim();
const compact = (value, max = 135) => clean(value).replace(/\s+/g, " ").slice(0, max);
const itemMap = new Map(itemPayload.items.map((row) => [clean(row.item_code), row]));
const itemCodes = new Set(itemMap.keys());

function canonicalReference(record) {
  const code = clean(record.item_code);
  const alias = resolveAlumdoorBomEvidenceAlias(code, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (alias) return { status: "accepted", item_code: alias.canonical_item_code, reason: "evidence_alias" };
  const promotion = resolveAlumdoorBomItemPromotion(code, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (promotion) return { status: "accepted", item_code: promotion.canonical_item_code, reason: "bom_item_promotion" };
  const classified = classifyAlumdoorItemSourceCode(code, {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_index: record.source_index,
  });
  if (classified.status === "excluded") return { status: "excluded", reason: classified.reason ?? "source_policy_excluded" };
  if (classified.status === "blocked") return { status: "blocked", reason: classified.reason ?? "source_reference_blocked" };
  return { status: "accepted", item_code: classified.canonical_item_code || code, reason: "canonical_identity" };
}

const parents = new Map();
const excludedParentIndexes = new Map();
for (const record of records) {
  if (record.source_role !== ITEM_SOURCE_ROLES.SELLABLE_PRODUCT) continue;
  const index = Number(record.source_index);
  if (!Number.isFinite(index)) continue;
  const code = clean(record.item_code);
  if (itemCodes.has(code)) {
    parents.set(index, record);
    continue;
  }
  const classified = classifyAlumdoorItemSourceCode(code, {
    source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
    source_index: index,
  });
  if (classified.status === "excluded") {
    excludedParentIndexes.set(index, classified.reason ?? "source_policy_excluded_parent");
    continue;
  }
  if (classified.status === "blocked") throw new Error(`Blocked numbered BOM parent ĐM#${record.source_row} ${code}: ${classified.reason}`);
  throw new Error(`Numbered BOM parent missing from Item payload: STT ${index} ${code}`);
}

const childGroups = new Map();
const sourceRulesByParent = new Map();
const excluded = [];
const blockers = [];
const uomStats = new Map();
const basisStats = new Map();

function addStat(map, key) {
  const value = clean(key) || "<blank>";
  map.set(value, (map.get(value) ?? 0) + 1);
}

for (const record of records) {
  if (record.source_role !== ITEM_SOURCE_ROLES.BOM_REFERENCE) continue;
  const sourceIndex = Number(record.source_index);
  if (excludedParentIndexes.has(sourceIndex)) {
    excluded.push({
      source_row: record.source_row,
      source_index: sourceIndex,
      source_item_code: clean(record.item_code),
      reason: "excluded_parent",
      parent_reason: excludedParentIndexes.get(sourceIndex),
    });
    continue;
  }

  const reference = canonicalReference(record);
  if (reference.status === "excluded") {
    excluded.push({ source_row: record.source_row, source_index: sourceIndex, source_item_code: clean(record.item_code), reason: reference.reason });
    continue;
  }
  if (reference.status === "blocked") {
    blockers.push({ type: "missing_component_item", source_row: record.source_row, source_index: sourceIndex, source_item_code: clean(record.item_code), reason: reference.reason });
    continue;
  }
  const itemCode = reference.item_code;
  const item = itemMap.get(itemCode);
  if (!item) {
    blockers.push({ type: "missing_component_item", source_row: record.source_row, source_index: sourceIndex, source_item_code: clean(record.item_code), canonical_item_code: itemCode });
    continue;
  }
  const parentRecord = parents.get(sourceIndex);
  const parentItem = parentRecord ? itemMap.get(clean(parentRecord.item_code)) : null;
  if (!parentRecord || !parentItem) {
    blockers.push({ type: "missing_parent_item", source_row: record.source_row, source_index: sourceIndex, canonical_item_code: itemCode });
    continue;
  }

  const uomResolution = resolveBomRuntimeUom(record, item);
  addStat(uomStats, uomResolution.status === "accepted" ? `${clean(record.source_uom)} -> ${uomResolution.runtime_uom}` : `${clean(record.source_uom)} -> BLOCK:${uomResolution.reason}`);
  if (uomResolution.status !== "accepted") {
    blockers.push({
      type: uomResolution.reason,
      source_row: record.source_row,
      source_index: sourceIndex,
      source_item_code: clean(record.item_code),
      canonical_item_code: itemCode,
      source_uom: clean(record.source_uom),
      ...uomResolution,
    });
    continue;
  }

  const quantityResolution = resolveBomQuantitySemantics(record, uomResolution, parentItem);
  const provenance = buildBomSourceProvenance(record, itemCode, uomResolution, quantityResolution);
  if (quantityResolution.status === "excluded") {
    const list = sourceRulesByParent.get(sourceIndex) ?? [];
    list.push(provenance);
    sourceRulesByParent.set(sourceIndex, list);
    excluded.push({ ...provenance, reason: quantityResolution.reason });
    continue;
  }
  if (quantityResolution.status !== "accepted") {
    blockers.push({
      type: quantityResolution.reason ?? "runtime_contract_invalid",
      source_row: record.source_row,
      source_index: sourceIndex,
      source_item_code: clean(record.item_code),
      canonical_item_code: itemCode,
      source_uom: clean(record.source_uom),
      source_qty_or_formula: clean(record.source_qty_or_formula),
      source_formula_code: clean(record.source_formula_code),
      source_formula_text: clean(record.source_formula_text),
      ...quantityResolution,
    });
    continue;
  }
  if (!(Number.isFinite(quantityResolution.qty) && quantityResolution.qty > 0)) {
    blockers.push({ type: "nonpositive_quantity", source_row: record.source_row, source_index: sourceIndex, canonical_item_code: itemCode, quantity: quantityResolution.qty });
    continue;
  }
  addStat(basisStats, quantityResolution.qty_basis);
  const line = {
    item_code: itemCode,
    qty: quantityResolution.qty,
    uom: uomResolution.runtime_uom,
    ...(uomResolution.conversion_factor ? { conversion_factor: uomResolution.conversion_factor } : {}),
    qty_basis: quantityResolution.qty_basis,
    source_note: compact(`ĐM#${record.source_row}; ${clean(record.item_code)}; ${clean(record.source_uom)}; ${clean(record.source_qty_or_formula) || "∅"}`),
    note: compact(clean(record.source_formula_code) || clean(record.source_formula_text)),
    _provenance: provenance,
  };
  const list = childGroups.get(sourceIndex) ?? [];
  list.push(line);
  childGroups.set(sourceIndex, list);
}

const sourceReferenceCount = records.filter((row) => row.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE).length;
const covered = [...childGroups.values()].reduce((sum, rows) => sum + rows.length, 0) + excluded.length + blockers.length;
if (covered !== sourceReferenceCount) throw new Error(`BOM coverage accounting mismatch source=${sourceReferenceCount} covered=${covered}`);

const boms = [];
for (const [sourceIndex, children] of [...childGroups.entries()].sort((a, b) => a[0] - b[0])) {
  const parent = parents.get(sourceIndex);
  if (!parent) {
    blockers.push({ type: "missing_parent_item", source_index: sourceIndex, reason: "children_have_no_numbered_parent" });
    continue;
  }
  const parentItem = itemMap.get(clean(parent.item_code));
  if (!parentItem) {
    blockers.push({ type: "missing_parent_item", source_index: sourceIndex, item_code: clean(parent.item_code) });
    continue;
  }
  const output = resolveBomParentOutput(parentItem);
  if (output.status !== "accepted") {
    blockers.push({ type: output.reason, source_index: sourceIndex, item_code: clean(parent.item_code), ...output });
    continue;
  }
  const normalizedChildren = children.map(({ _provenance, ...row }, index) => ({ row_id: `ROW-${index + 1}`, ...row }));
  const sourceRules = sourceRulesByParent.get(sourceIndex) ?? [];
  const provenanceRows = children.map((row) => row._provenance);
  const snapshot = {
    schema_version: 2,
    source: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
    source_index: sourceIndex,
    source_row: Number(parent.source_row),
    item: clean(parent.item_code),
    output,
    materialized_rows: provenanceRows,
    source_rules: sourceRules,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  boms.push({
    source_index: sourceIndex,
    source_row: Number(parent.source_row),
    item: clean(parent.item_code),
    company: "ALUMDOOR",
    quantity: output.quantity,
    output_uom: output.output_uom,
    ...(output.output_conversion_factor ? { output_conversion_factor: output.output_conversion_factor } : {}),
    revision: 1,
    bom_status: "Draft",
    effective_from: "2026-08-17",
    items: normalizedChildren,
    operating_cost: 0,
    is_active: 1,
    note: compact(`Nguồn MS LIÊN BS/ĐM STT ${sourceIndex}, row ${parent.source_row}`),
    bom_template_code: `MSLIEN-DM-${sourceIndex}`,
    bom_fingerprint: fingerprint,
    generated_by_configurator: sourceRules.length ? 1 : 0,
    configuration_snapshot: JSON.stringify(snapshot),
  });
}

const importedReferenceCount = boms.reduce((sum, bom) => sum + bom.items.length, 0);
const audit = {
  format: "alumdoor-real-bom-audit/v2",
  source_reference_count: sourceReferenceCount,
  source_bom_parent_count: new Set(records.filter((row) => row.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE).map((row) => Number(row.source_index))).size,
  canonical_bom_count: boms.length,
  materialized_reference_count: importedReferenceCount,
  excluded_reference_count: excluded.length,
  blocker_count: blockers.length,
  excluded_parent_count: excludedParentIndexes.size,
  blocker_counts: Object.fromEntries([...blockers.reduce((map, row) => map.set(row.type, (map.get(row.type) ?? 0) + 1), new Map()).entries()].sort()),
  qty_basis_counts: Object.fromEntries([...basisStats.entries()].sort()),
  uom_resolution_counts: Object.fromEntries([...uomStats.entries()].sort()),
  blockers,
  excluded,
};
if (auditArg) writeFileSync(path.resolve(auditArg), `${JSON.stringify(audit, null, 2)}\n`);

if (blockers.length > 0) {
  console.log(`ALUMDOOR_REAL_BOM_PAYLOAD_BLOCKED blockers=${blockers.length} boms_partial=${boms.length} materialized=${importedReferenceCount} excluded=${excluded.length}`);
  console.log(`ALUMDOOR_REAL_BOM_BLOCKER_COUNTS ${JSON.stringify(audit.blocker_counts)}`);
  for (const blocker of blockers.slice(0, 100)) console.log(`ALUMDOOR_REAL_BOM_BLOCKER ${JSON.stringify(blocker)}`);
  throw new Error(`Real BOM payload blocked by ${blockers.length} source/runtime semantic issues`);
}
if (!boms.length) throw new Error("Real BOM payload is empty");
if (importedReferenceCount + excluded.length !== sourceReferenceCount) {
  throw new Error(`BOM coverage mismatch source=${sourceReferenceCount} imported=${importedReferenceCount} excluded=${excluded.length}`);
}
const payload = {
  format: "alumdoor-real-bom-payload/v2",
  source: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
  bom_count: boms.length,
  source_reference_count: sourceReferenceCount,
  imported_reference_count: importedReferenceCount,
  excluded_reference_count: excluded.length,
  excluded_parent_count: excludedParentIndexes.size,
  boms,
};
writeFileSync(path.resolve(outputArg), `${JSON.stringify(payload, null, 2)}\n`);
console.log(`ALUMDOOR_REAL_BOM_PAYLOAD_PASS boms=${boms.length} refs=${importedReferenceCount} excluded=${excluded.length} excluded_parents=${excludedParentIndexes.size}`);
