#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveBomParentOutput } from './lib/alumdoor-real-bom-gate-semantics.mjs';

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
if (items.item_count !== undefined && Number(items.item_count) !== items.items.length) {
  throw new Error(`Gate A Item payload count mismatch: declared=${items.item_count} actual=${items.items.length}`);
}

const clean = (value) => String(value ?? '').normalize('NFC').trim();
const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const refs = records.filter((row) => row?.source_role === 'bom_reference');
if (refs.length !== Number(strictAudit.source_reference_count ?? strict.source_reference_count)) {
  throw new Error(`strict Gate B source reference count mismatch: source=${refs.length} strict=${strictAudit.source_reference_count ?? strict.source_reference_count}`);
}

// Tra được bằng CẢ mã đang dùng lẫn mã gốc trong bảng tính: tham chiếu đến từ bản trích nguồn
// (mã bảng tính) còn danh sách mặt hàng đã dịch sang mã đang dùng. Chỉ khoá một bên là hàng nghìn
// tham chiếu "mất mặt hàng" dù mặt hàng có đủ.
const itemMap = new Map();
for (const item of items.items) {
  const canonicalCode = String(item.item_code ?? "").trim();
  itemMap.set(canonicalCode, item);
  const originalCode = String(item.source_item_code_original ?? "").trim();
  if (originalCode && !itemMap.has(originalCode)) itemMap.set(originalCode, item);
}

/**
 * Quy một mã bất kỳ về mã ĐANG DÙNG.
 *
 * Chuỗi này đi qua ba không gian mã — mã bảng tính, mã do bộ dựng tự chuẩn hoá, và mã thật trong
 * D1. Thứ ĐẨY VÀO D1 phải là mã thật, nếu không importer báo "mặt hàng không tồn tại" hàng loạt.
 * Không tra được thì trả nguyên mã vào, để lỗi nổi lên đúng chỗ thay vì biến mất.
 */
const liveCode = (code) => {
  const key = String(code ?? "").trim();
  if (!key) return key;
  return String(itemMap.get(key)?.item_code ?? key).trim();
};
const parentMap = new Map(records
  .filter((row) => row?.source_role === 'sellable_product' && Number.isFinite(Number(row.source_parent_row)))
  .map((row) => [Number(row.source_parent_row), row]));
const excludedByRow = new Map((strictAudit.excluded ?? [])
  .filter((entry) => Number.isFinite(Number(entry.source_row)))
  .map((entry) => [Number(entry.source_row), entry]));
const strictLineByRow = new Map();
for (const bom of strict.boms ?? []) {
  for (const line of bom.lines ?? []) {
    const sourceRow = Number(line?.lineage?.source_row);
    if (Number.isFinite(sourceRow)) strictLineByRow.set(sourceRow, line);
  }
}
const blockersByRow = new Map();
for (const blocker of strictAudit.blockers ?? []) {
  const sourceRow = Number(blocker?.source_row);
  if (!Number.isFinite(sourceRow)) continue;
  const list = blockersByRow.get(sourceRow) ?? [];
  list.push(blocker);
  blockersByRow.set(sourceRow, list);
}

function pureNumericSourceValue(value) {
  const raw = clean(value);
  if (!/^[+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function reasonCategory(reason) {
  const value = clean(reason).toLowerCase();
  if (!value) return 'nguyên nhân khác';
  if (value.includes('missing_component_item') || value.includes('missing_parent_item') || value.includes('item_not_found')) return 'Item chưa tồn tại';
  if (value.includes('alias') || value.includes('mapping') || value.includes('canonical_identity') || value.includes('promotion')) return 'Item mapping sai';
  if (value.includes('normalize') || value.includes('normaliz')) return 'normalize sai';
  if (value.includes('parser') || value.includes('lineage') || value.includes('unrepresented')) return 'source parser bỏ sót';
  if (value.includes('duplicate') || value.includes('collapse')) return 'duplicate bị collapse sai';
  if (value.includes('conversion') || value.includes('uom') || value.includes('unit')) return 'UOM mismatch';
  if (value.includes('classif') || value.includes('source_policy')) return 'component bị classify nhầm';
  if (value.includes('builder')) return 'BOM builder bỏ sót';
  return 'nguyên nhân khác';
}

function sourceLineage(record, resolutionReason) {
  return {
    source_sheet: clean(record?.source_sheet) || null,
    source_row: Number.isFinite(Number(record?.source_row)) ? Number(record.source_row) : null,
    source_index: Number.isFinite(Number(record?.source_index)) ? Number(record.source_index) : null,
    source_parent_row: Number.isFinite(Number(record?.source_parent_row)) ? Number(record.source_parent_row) : null,
    source_item_code: clean(record?.item_code) || null,
    source_item_name: clean(record?.item_name) || null,
    source_uom: clean(record?.source_uom) || null,
    source_qty_or_formula: clean(record?.source_qty_or_formula) || null,
    source_formula_code: clean(record?.source_formula_code) || null,
    source_formula_text: clean(record?.source_formula_text) || null,
    resolution_reason: clean(resolutionReason) || null,
  };
}

function resolvedLine(record, strictLine, sequence) {
  const itemCode = clean(strictLine?.item_code);
  const hasNumericQty = finitePositive(strictLine?.qty);
  const pending = !hasNumericQty;
  const pendingReason = pending
    ? (strictLine?.quantity_formula_json ? 'runtime_formula_requires_geometry' : 'missing_or_non_authoritative_source_value')
    : null;
  return {
    item_code: liveCode(itemCode) || null,
    qty: hasNumericQty ? Number(strictLine.qty) : null,
    uom: clean(strictLine?.uom) || null,
    stock_uom: clean(itemMap.get(itemCode)?.stock_uom) || null,
    conversion_factor: finitePositive(strictLine?.conversion_factor) ? Number(strictLine.conversion_factor) : null,
    qty_basis: clean(strictLine?.qty_basis) || null,
    quantity_formula_json: clean(strictLine?.quantity_formula_json) || null,
    bom_template_code: clean(strictLine?.bom_template_code) || null,
    component_key: clean(strictLine?.component_key) || null,
    source_value_status: pending ? 'PENDING' : 'RESOLVED',
    source_pending_reason: pendingReason,
    source_value: clean(record?.source_qty_or_formula) || null,
    source_sequence: sequence,
    ...sourceLineage(record, pendingReason || strictLine?.lineage?.resolution_reason || 'strict_resolved'),
  };
}

function blockedLine(record, blockers, sequence) {
  const blocker = blockers[0] ?? {};
  const itemCode = clean(blocker.canonical_item_code);
  const pendingReason = clean(blocker.type || blocker.reason) || 'strict_source_evidence_gap';
  const sourceQty = pureNumericSourceValue(record?.source_qty_or_formula);
  return {
    item_code: liveCode(itemCode) || null,
    qty: sourceQty,
    uom: clean(blocker.runtime_uom) || clean(record?.source_uom) || null,
    stock_uom: clean(blocker.stock_uom) || clean(itemMap.get(itemCode)?.stock_uom) || null,
    conversion_factor: finitePositive(blocker.conversion_factor) ? Number(blocker.conversion_factor) : null,
    qty_basis: null,
    quantity_formula_json: null,
    bom_template_code: clean(blocker.template_code) || null,
    component_key: clean(blocker.component_key) || null,
    source_value_status: 'PENDING',
    source_pending_reason: pendingReason,
    source_value: clean(record?.source_qty_or_formula) || null,
    source_sequence: sequence,
    ...sourceLineage(record, pendingReason),
  };
}

const candidatesByParent = new Map();
const structuralIssues = [];
const missingItems = new Map();
const representedRows = new Set();
for (const record of refs) {
  const sourceRow = Number(record.source_row);
  if (excludedByRow.has(sourceRow)) continue;
  const parentRow = Number(record.source_parent_row);
  if (!Number.isFinite(parentRow)) {
    structuralIssues.push({ source_row: sourceRow, source_item_code: clean(record.item_code), reason: 'source_parser_missing_parent_lineage', reason_category: 'source parser bỏ sót' });
    continue;
  }
  const list = candidatesByParent.get(parentRow) ?? [];
  list.push(record);
  candidatesByParent.set(parentRow, list);
}

const boms = [];
const bomAudits = [];
for (const [parentRow, sourceRows] of [...candidatesByParent.entries()].sort((a, b) => a[0] - b[0])) {
  const parent = parentMap.get(parentRow);
  const finishedItemCode = liveCode(clean(parent?.item_code));
  const finishedItem = itemMap.get(finishedItemCode);
  const localIssues = [];
  if (!parent) {
    localIssues.push({ reason: 'source_parser_parent_record_missing', reason_category: 'source parser bỏ sót', source_parent_row: parentRow });
  }
  if (!finishedItemCode || !finishedItem) {
    localIssues.push({ reason: 'finished_item_not_found', reason_category: 'Item chưa tồn tại', finished_item: finishedItemCode || null, source_parent_row: parentRow });
    if (finishedItemCode) missingItems.set(finishedItemCode, { item_code: finishedItemCode, role: 'finished_item', source_parent_row: parentRow });
  }

  const output = finishedItem ? resolveBomParentOutput(finishedItem) : { status: 'blocked', reason: 'finished_item_not_found' };
  if (output.status !== 'accepted') {
    localIssues.push({ reason: clean(output.reason) || 'parent_output_uom_invalid', reason_category: reasonCategory(output.reason || 'uom'), finished_item: finishedItemCode || null, source_parent_row: parentRow });
  }

  const lines = [];
  const previouslyOmitted = [];
  const sourceComponents = [];
  const ordered = [...sourceRows].sort((a, b) => Number(a.source_row) - Number(b.source_row) || Number(a.source_index ?? 0) - Number(b.source_index ?? 0));
  for (const [index, record] of ordered.entries()) {
    const sourceRow = Number(record.source_row);
    const strictLine = strictLineByRow.get(sourceRow);
    const blockers = blockersByRow.get(sourceRow) ?? [];
    let line = null;
    if (strictLine) line = resolvedLine(record, strictLine, index + 1);
    else if (blockers.length) line = blockedLine(record, blockers, index + 1);
    else {
      const issue = {
        source_row: sourceRow,
        source_parent_row: parentRow,
        raw_material_code: clean(record.item_code) || null,
        raw_material_name: clean(record.item_name) || null,
        reason: 'canonical_bom_builder_unrepresented_source_component',
        reason_category: 'BOM builder bỏ sót',
      };
      localIssues.push(issue);
      structuralIssues.push(issue);
      continue;
    }

    if (!line.item_code) {
      const reason = blockers[0]?.type || blockers[0]?.reason || 'canonical_item_mapping_missing';
      const issue = {
        source_row: sourceRow,
        source_parent_row: parentRow,
        raw_material_code: clean(record.item_code) || null,
        raw_material_name: clean(record.item_name) || null,
        reason,
        reason_category: reasonCategory(reason),
      };
      localIssues.push(issue);
      structuralIssues.push(issue);
      continue;
    }
    if (!itemMap.has(line.item_code)) {
      const issue = {
        source_row: sourceRow,
        source_parent_row: parentRow,
        raw_material_code: clean(record.item_code) || null,
        raw_material_name: clean(record.item_name) || null,
        canonical_item_code: line.item_code,
        reason: 'component_item_not_found',
        reason_category: 'Item chưa tồn tại',
      };
      localIssues.push(issue);
      structuralIssues.push(issue);
      missingItems.set(line.item_code, { item_code: line.item_code, role: 'component', source_row: sourceRow, source_parent_row: parentRow });
      continue;
    }

    representedRows.add(sourceRow);
    lines.push(line);
    const componentAudit = {
      source_sequence: index + 1,
      source_row: sourceRow,
      raw_material_code: clean(record.item_code) || null,
      raw_material_name: clean(record.item_name) || null,
      canonical_item_code: line.item_code,
      qty: line.qty,
      uom: line.uom,
      conversion_factor: line.conversion_factor,
      source_value_status: line.source_value_status,
      source_pending_reason: line.source_pending_reason,
      reason_category: line.source_pending_reason ? reasonCategory(line.source_pending_reason) : null,
    };
    sourceComponents.push(componentAudit);
    if (line.source_value_status === 'PENDING') previouslyOmitted.push(componentAudit);
  }

  const structurallyComplete = localIssues.length === 0 && lines.length === ordered.length;
  const status = structurallyComplete ? 'complete' : (lines.length ? 'incomplete' : 'blocked');
  const bomAudit = {
    bom_code: finishedItemCode || null,
    bom_name: clean(parent?.item_name) || null,
    finished_item: finishedItemCode || null,
    source_parent_row: parentRow,
    source_component_count: ordered.length,
    buildable_component_count: lines.length,
    pending_value_count: lines.filter((line) => line.source_value_status === 'PENDING').length,
    missing_components: localIssues,
    previously_omitted_components: previouslyOmitted,
    source_components: sourceComponents,
    status,
  };
  bomAudits.push(bomAudit);

  if (!structurallyComplete || !parent || !finishedItem || output.status !== 'accepted') continue;
  const managedLines = lines.map((line) => ({
    item_code: line.item_code,
    qty: line.qty,
    uom: line.uom,
    stock_uom: line.stock_uom,
    conversion_factor: line.conversion_factor,
    qty_basis: line.qty_basis,
    quantity_formula_json: line.quantity_formula_json,
    bom_template_code: line.bom_template_code,
    component_key: line.component_key,
    source_value_status: line.source_value_status,
    source_pending_reason: line.source_pending_reason,
    source_value: line.source_value,
    source_sequence: line.source_sequence,
    source_sheet: line.source_sheet,
    source_row: line.source_row,
    source_index: line.source_index,
    source_parent_row: line.source_parent_row,
    source_item_code: line.source_item_code,
    source_item_name: line.source_item_name,
    source_uom: line.source_uom,
    source_qty_or_formula: line.source_qty_or_formula,
    source_formula_code: line.source_formula_code,
    source_formula_text: line.source_formula_text,
    resolution_reason: line.resolution_reason,
  }));
  const snapshot = { item: finishedItemCode, quantity: 1, output_uom: output.output_uom, lines: managedLines };
  const pendingLines = managedLines.filter((line) => line.source_value_status === 'PENDING');
  boms.push({
    item: finishedItemCode,
    item_name: clean(parent.item_name) || finishedItemCode,
    company: 'ALUMDOOR',
    quantity: 1,
    output_uom: output.output_uom,
    bom_status: 'Draft',
    import_fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    lines: managedLines,
    pending_lines: pendingLines,
    // Compatibility for the existing BOM Template projection while it is reconciled.
    blank_lines: pendingLines,
    lineage: { source_row: Number(parent.source_row), source_index: Number(parent.source_index), source_parent_row: parentRow },
  });
}

boms.sort((a, b) => Number(a.lineage.source_row) - Number(b.lineage.source_row) || a.item.localeCompare(b.item, 'vi'));
bomAudits.sort((a, b) => Number(a.source_parent_row) - Number(b.source_parent_row));
const excludedReferenceCount = excludedByRow.size;
const expectedComponentCount = refs.length - excludedReferenceCount;
const componentReferenceCount = boms.reduce((sum, bom) => sum + bom.lines.length, 0);
const pendingValueCount = boms.reduce((sum, bom) => sum + bom.pending_lines.length, 0);
const missingComponentCount = structuralIssues.length;
const missingItemCount = missingItems.size;
const completeCount = bomAudits.filter((bom) => bom.status === 'complete').length;
const incompleteCount = bomAudits.filter((bom) => bom.status === 'incomplete').length;
const blockedCount = bomAudits.filter((bom) => bom.status === 'blocked').length;
const uncoveredRows = refs
  .filter((record) => !excludedByRow.has(Number(record.source_row)) && !representedRows.has(Number(record.source_row)))
  .map((record) => Number(record.source_row));
const mutationBlockerCount = missingComponentCount + uncoveredRows.length + incompleteCount + blockedCount;

const audit = {
  format: 'alumdoor-canonical-bom-importable-audit/v2',
  source_authority: strict.source,
  item_projection_count: items.items.length,
  source_reference_count: refs.length,
  excluded_reference_count: excludedReferenceCount,
  expected_component_count: expectedComponentCount,
  canonical_bom_count: bomAudits.length,
  importable_bom_count: boms.length,
  component_reference_count: componentReferenceCount,
  pending_value_count: pendingValueCount,
  missing_component_count: missingComponentCount,
  missing_item_count: missingItemCount,
  complete_count: completeCount,
  incomplete_count: incompleteCount,
  blocked_count: blockedCount,
  mutation_blocker_count: mutationBlockerCount,
  strict_resolved_reference_count: Number(strictAudit.resolved_reference_count ?? strict.resolved_reference_count ?? 0),
  strict_blocker_count: Number(strictAudit.blocker_count ?? (strictAudit.blockers ?? []).length),
  strict_importable_component_set_converged: componentReferenceCount === expectedComponentCount && uncoveredRows.length === 0,
  policy: 'all canonical source components are persisted; unresolved qty/UOM/conversion values remain null on Draft BOM rows and production validation stays fail-closed',
  missing_items: [...missingItems.values()],
  uncovered_source_rows: uncoveredRows,
  structural_issues: structuralIssues,
  boms: bomAudits,
};
const payload = {
  format: 'alumdoor-canonical-bom-importable/v2',
  source: strict.source,
  item_projection_count: items.items.length,
  source_reference_count: refs.length,
  excluded_reference_count: excludedReferenceCount,
  expected_component_count: expectedComponentCount,
  component_reference_count: componentReferenceCount,
  pending_value_count: pendingValueCount,
  missing_component_count: missingComponentCount,
  missing_item_count: missingItemCount,
  mutation_blocker_count: mutationBlockerCount,
  bom_count: boms.length,
  boms,
};
writeFileSync(path.resolve(outArg), `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(path.resolve(auditArg), `${JSON.stringify(audit, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_SOURCE_COMPLETE items=${items.items.length} refs=${refs.length} excluded=${excludedReferenceCount} expected_components=${expectedComponentCount} boms=${boms.length} components=${componentReferenceCount} pending_values=${pendingValueCount} missing_components=${missingComponentCount} missing_items=${missingItemCount}`);
if (componentReferenceCount + uncoveredRows.length !== expectedComponentCount) {
  throw new Error(`source component coverage mismatch expected=${expectedComponentCount} represented=${componentReferenceCount} uncovered=${uncoveredRows.length}`);
}
if (mutationBlockerCount !== 0) {
  throw new Error(`source-complete BOM payload remains blocked: mutation_blocker_count=${mutationBlockerCount}`);
}
console.log('ALUMDOOR_BOM_SOURCE_COMPLETE_PASS');
