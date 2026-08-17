#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifyAlumdoorItemSourceCode, ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";
import { resolveAlumdoorBomEvidenceAlias, resolveAlumdoorBomItemPromotion } from "./lib/alumdoor-item-evidence-overrides.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

const [sourceArg, itemPayloadArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !itemPayloadArg || !outputArg) {
  throw new Error("Usage: node build-alumdoor-real-bom-payload.mjs <source-records.json> <item-payload.json> <bom-payload.json>");
}
const source = JSON.parse(readFileSync(path.resolve(sourceArg), "utf8"));
const records = Array.isArray(source) ? source : source.records;
const itemPayload = JSON.parse(readFileSync(path.resolve(itemPayloadArg), "utf8"));
if (!Array.isArray(records) || !Array.isArray(itemPayload.items)) throw new Error("Invalid source/item payload");
const preflight = preflightAlumdoorItemSourceRecords(records);
if (preflight.blocker_count !== 0) throw new Error(`BOM build requires zero source blockers; got ${preflight.blocker_count}`);
const itemCodes = new Set(itemPayload.items.map((row) => String(row.item_code ?? "").trim()));

const clean = (v) => String(v ?? "").trim();
const numeric = (v) => {
  const raw = clean(v).replace(",", ".");
  if (!raw || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const compact = (value, max = 135) => clean(value).replace(/\s+/g, " ").slice(0, max);
function canonicalReferenceCode(record) {
  const sourceCode = clean(record.item_code);
  const alias = resolveAlumdoorBomEvidenceAlias(sourceCode, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (alias) return alias.canonical_item_code;
  const promotion = resolveAlumdoorBomItemPromotion(sourceCode, ITEM_SOURCE_ROLES.BOM_REFERENCE);
  if (promotion) return promotion.canonical_item_code;
  const classified = classifyAlumdoorItemSourceCode(sourceCode, {
    source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
    source_index: record.source_index,
  });
  if (classified.status === "excluded") return null;
  if (classified.status === "blocked") {
    throw new Error(`Blocked BOM reference ĐM#${record.source_row} ${sourceCode}: ${classified.reason}`);
  }
  return classified.canonical_item_code || sourceCode;
}
function qtyBasis(record) {
  const formula = `${clean(record.source_formula)} ${clean(record.source_qty_or_formula)} ${clean(record.source_uom)}`.normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("vi");
  if (/SO\s*LA|SỐ\s*LÁ/.test(formula)) return "Theo số lá";
  if (/DIEN\s*TICH|M2|M²|KG\/M2/.test(formula)) return "Theo diện tích";
  if (/CHIEU\s*CAO|CAO\s*PB|\bCAO\b/.test(formula)) return "Theo chiều cao";
  if (/CHIEU\s*RONG|RONG\s*PB|M\s*NGANG|\bNGANG\b/.test(formula)) return "Theo chiều rộng";
  return "Cố định";
}
function childLine(record) {
  const itemCode = canonicalReferenceCode(record);
  if (!itemCode) return null;
  if (!itemCodes.has(itemCode)) throw new Error(`BOM reference target missing from 587 Item payload: ĐM#${record.source_row} ${itemCode}`);
  const rawQty = clean(record.source_qty_or_formula);
  const formula = clean(record.source_formula);
  const parsed = numeric(rawQty);
  const basis = qtyBasis(record);
  const qty = parsed ?? 1;
  return {
    item_code: itemCode,
    qty,
    uom: clean(record.source_uom),
    qty_basis: basis,
    source_note: compact(`ĐM#${record.source_row}; src=${clean(record.item_code)}; rate=${rawQty || "∅"}; formula=${formula || "∅"}`),
    note: compact(formula || (parsed === null ? rawQty : "")),
    _source_row: Number(record.source_row),
    _source_index: Number(record.source_index),
    _source_code: clean(record.item_code),
    _source_formula: formula,
    _source_qty: rawQty,
  };
}

const parents = new Map();
for (const record of records) {
  if (record.source_role !== ITEM_SOURCE_ROLES.SELLABLE_PRODUCT) continue;
  const index = Number(record.source_index);
  if (!Number.isFinite(index)) continue;
  if (!itemCodes.has(clean(record.item_code))) throw new Error(`BOM parent Item missing: ${record.item_code}`);
  parents.set(index, record);
}
const childGroups = new Map();
let excludedReferences = 0;
for (const record of records) {
  if (record.source_role !== ITEM_SOURCE_ROLES.BOM_REFERENCE) continue;
  const line = childLine(record);
  if (!line) { excludedReferences += 1; continue; }
  const index = Number(record.source_index);
  const list = childGroups.get(index) ?? [];
  list.push(line);
  childGroups.set(index, list);
}

const boms = [];
for (const [sourceIndex, children] of [...childGroups.entries()].sort((a,b) => a[0] - b[0])) {
  const parent = parents.get(sourceIndex);
  if (!parent) throw new Error(`BOM children have no numbered parent STT ${sourceIndex}`);
  if (children.length === 0) continue;
  const normalizedChildren = children.map(({ _source_row, _source_index, _source_code, _source_formula, _source_qty, ...row }) => row);
  const fingerprintInput = {
    source_index: sourceIndex,
    item: clean(parent.item_code),
    quantity: numeric(parent.source_rate_or_quantity) ?? 1,
    children: children.map((row) => ({
      source_row: row._source_row,
      source_code: row._source_code,
      item_code: row.item_code,
      qty: row.qty,
      uom: row.uom,
      qty_basis: row.qty_basis,
      formula: row._source_formula,
      source_qty: row._source_qty,
    })),
  };
  const bomFingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");
  boms.push({
    source_index: sourceIndex,
    source_row: Number(parent.source_row),
    item: clean(parent.item_code),
    company: "ALUMDOOR",
    quantity: numeric(parent.source_rate_or_quantity) ?? 1,
    items: normalizedChildren,
    operating_cost: 0,
    is_active: 1,
    note: compact(`Nguồn MS LIÊN BS/ĐM STT ${sourceIndex}, row ${parent.source_row}`),
    bom_template_code: `MSLIEN-DM-${sourceIndex}`,
    bom_fingerprint: bomFingerprint,
    generated_by_configurator: 0,
    configuration_snapshot: JSON.stringify(fingerprintInput),
  });
}

const sourceReferenceCount = records.filter((r) => r.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE).length;
const importedReferenceCount = boms.reduce((sum, bom) => sum + bom.items.length, 0);
if (importedReferenceCount + excludedReferences !== sourceReferenceCount) {
  throw new Error(`BOM coverage mismatch source=${sourceReferenceCount} imported=${importedReferenceCount} excluded=${excludedReferences}`);
}
if (boms.length === 0) throw new Error("Real BOM payload is empty");
const payload = {
  format: "alumdoor-real-bom-payload/v1",
  source: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
  bom_count: boms.length,
  source_reference_count: sourceReferenceCount,
  imported_reference_count: importedReferenceCount,
  excluded_reference_count: excludedReferences,
  boms,
};
writeFileSync(path.resolve(outputArg), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`ALUMDOOR_REAL_BOM_PAYLOAD_PASS boms=${boms.length} refs=${importedReferenceCount} excluded=${excludedReferences}`);
