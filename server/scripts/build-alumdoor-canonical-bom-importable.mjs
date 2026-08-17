#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [sourceArg, itemArg, strictBomArg, strictAuditArg, outArg, auditArg] = process.argv.slice(2);
if (![sourceArg, itemArg, strictBomArg, strictAuditArg, outArg, auditArg].every(Boolean)) {
  throw new Error('Usage: build-alumdoor-canonical-bom-importable.mjs <source.json> <items.json> <strict-bom.json> <strict-audit.json> <output.json> <audit.json>');
}
const readJson = (arg) => JSON.parse(readFileSync(path.resolve(arg), 'utf8'));
const source = readJson(sourceArg);
const items = readJson(itemArg);
const strict = readJson(strictBomArg);
const strictAudit = readJson(strictAuditArg);
const records = Array.isArray(source) ? source : source.records;
if (!Array.isArray(records) || !Array.isArray(items?.items) || !Array.isArray(strict?.boms)) throw new Error('invalid Gate B inputs');
if (items.items.length !== 587) throw new Error(`Gate A Item baseline drifted: expected=587 actual=${items.items.length}`);
const refs = records.filter((r) => r?.source_role === 'bom_reference').length;
if (refs !== Number(strictAudit.source_reference_count ?? strict.source_reference_count)) throw new Error('strict Gate B source reference count mismatch');
const clean = (v) => String(v ?? '').trim();
const blankByParent = new Map();
const pushBlank = (parentRow, row) => {
  const key = Number(parentRow);
  const list = blankByParent.get(key) ?? [];
  list.push(row);
  blankByParent.set(key, list);
};
for (const b of strictAudit.blockers ?? []) {
  pushBlank(b.source_parent_row, {
    item_code: clean(b.canonical_item_code || b.source_item_code) || null,
    qty: null,
    uom: null,
    conversion_factor: null,
    quantity_formula_json: null,
    blank_reason: clean(b.type || b.reason) || 'missing_or_invalid_source_value',
    source_value: clean(b.source_qty_or_formula) || null,
    lineage: {
      source_sheet: clean(b.source_sheet) || 'ĐM',
      source_row: Number(b.source_row) || null,
      source_index: Number(b.source_index) || null,
      source_parent_row: Number(b.source_parent_row) || null,
      source_item_code: clean(b.source_item_code) || null,
    },
  });
}
let resolvedSeen = 0;
let blankFromResolved = 0;
const boms = strict.boms.map((bom) => {
  const usable = [];
  const blanks = [...(blankByParent.get(Number(bom.source_row)) ?? []), ...(blankByParent.get(Number(bom.source_parent_row)) ?? [])];
  for (const line of bom.lines ?? []) {
    resolvedSeen += 1;
    const qty = Number(line.qty);
    if (!clean(line.item_code) || !Number.isFinite(qty) || qty <= 0 || line.engineering_inference || line.provisional_assumption) {
      blankFromResolved += 1;
      blanks.push({
        item_code: clean(line.item_code) || null,
        qty: null,
        uom: null,
        conversion_factor: null,
        quantity_formula_json: null,
        blank_reason: line.quantity_formula_json ? 'runtime_formula_not_persistable_as_numeric_bom_item' : 'missing_or_non_authoritative_source_value',
        source_value: clean(line.lineage?.source_qty_or_formula) || null,
        lineage: line.lineage ?? null,
      });
      continue;
    }
    usable.push({ item_code: clean(line.item_code), qty });
  }
  usable.sort((a, b) => a.item_code.localeCompare(b.item_code, 'vi') || a.qty - b.qty);
  blanks.sort((a, b) => Number(a.lineage?.source_row ?? 1e12) - Number(b.lineage?.source_row ?? 1e12));
  const snapshot = { item: bom.item, quantity: 1, lines: usable };
  return {
    item: bom.item,
    company: 'ALUMDOOR',
    quantity: 1,
    output_uom: bom.output_uom,
    bom_status: 'Draft',
    import_fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    lines: usable,
    blank_lines: blanks,
    lineage: { source_row: bom.source_row, source_index: bom.source_index },
  };
}).sort((a, b) => String(a.item).localeCompare(String(b.item), 'vi'));
const attachedBlank = boms.reduce((sum, bom) => sum + bom.blank_lines.length, 0);
const blockerCount = Number(strictAudit.blocker_count ?? (strictAudit.blockers ?? []).length);
const orphanBlankLines = [...blankByParent.entries()]
  .filter(([parentRow]) => !boms.some((bom) => Number(bom.lineage?.source_row) === Number(parentRow)))
  .flatMap(([, rows]) => rows);
const usableReferenceCount = boms.reduce((sum, bom) => sum + bom.lines.length, 0);
const blankReferenceCount = blockerCount + blankFromResolved;
const excludedReferenceCount = Number(strictAudit.excluded_reference_count ?? strict.excluded_reference_count ?? 0);
if (resolvedSeen !== Number(strictAudit.resolved_reference_count ?? strict.resolved_reference_count ?? resolvedSeen)) throw new Error('strict resolved count mismatch');
if (usableReferenceCount + blankReferenceCount + excludedReferenceCount !== refs) {
  throw new Error(`importable coverage mismatch refs=${refs} usable=${usableReferenceCount} blank=${blankReferenceCount} excluded=${excludedReferenceCount}`);
}
const audit = {
  format: 'alumdoor-canonical-bom-importable-audit/v1',
  item_projection_count: items.items.length,
  source_reference_count: refs,
  canonical_bom_count: boms.length,
  usable_reference_count: usableReferenceCount,
  blank_reference_count: blankReferenceCount,
  excluded_reference_count: excludedReferenceCount,
  strict_blocker_count_converted_to_blank: blockerCount,
  non_numeric_resolved_converted_to_blank: blankFromResolved,
  attached_blank_line_count: attachedBlank,
  orphan_blank_line_count: orphanBlankLines.length,
  mutation_blocker_count: 0,
  policy: 'missing_or_invalid_values_are_blank_and_not_mutated',
  orphan_blank_lines: orphanBlankLines,
};
const payload = {
  format: 'alumdoor-canonical-bom-importable/v1',
  source: strict.source,
  item_projection_count: items.items.length,
  source_reference_count: refs,
  usable_reference_count: usableReferenceCount,
  blank_reference_count: blankReferenceCount,
  excluded_reference_count: excludedReferenceCount,
  mutation_blocker_count: 0,
  boms,
};
writeFileSync(path.resolve(outArg), `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(path.resolve(auditArg), `${JSON.stringify(audit, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_IMPORTABLE_PASS items=587 refs=${refs} boms=${boms.length} usable=${usableReferenceCount} blank=${blankReferenceCount} excluded=${excludedReferenceCount}`);
