#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [bomArg, outArg, auditArg, overrideArg] = process.argv.slice(2);
if (![bomArg, outArg, auditArg].every(Boolean)) {
  throw new Error('Usage: build-alumdoor-bom-rule-importable.mjs <bom-importable.json> <bom-rules.json> <audit.json> [owner-overrides.json]');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultOverridePath = path.resolve(here, '../../local-imports/alumdoor-bom-rules/owner-overrides.json');
const overridePath = path.resolve(overrideArg || defaultOverridePath);
const bomPath = path.resolve(bomArg);
const source = JSON.parse(readFileSync(bomPath, 'utf8'));
if (source?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(source.boms)) {
  throw new Error('Expected alumdoor-canonical-bom-importable/v2');
}

const ownerAuthority = existsSync(overridePath)
  ? JSON.parse(readFileSync(overridePath, 'utf8'))
  : { format: 'alumdoor-bom-rule-owner-overrides/v1', overrides: [] };
if (ownerAuthority?.format !== 'alumdoor-bom-rule-owner-overrides/v1' || !Array.isArray(ownerAuthority.overrides)) {
  throw new Error(`Expected alumdoor-bom-rule-owner-overrides/v1: ${overridePath}`);
}

const clean = (value) => String(value ?? '').normalize('NFC').trim();
const fold = (value) => clean(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[Đđ]/g, 'D').toUpperCase();
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function hash(value) { return createHash('sha1').update(value).digest('hex').slice(0, 12).toUpperCase(); }

function parseFormula(value) {
  if (!clean(value)) return null;
  try {
    const parsed = typeof value === 'object' ? value : JSON.parse(clean(value));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
    if (fold(parsed.kind) === 'DEFERRED') return null;
    return structuredClone(parsed);
  } catch {
    return null;
  }
}

function fieldFormula(field, multiply = 1, offset = undefined, rounding = undefined, precision = undefined) {
  return {
    base: { kind: 'FIELD', field, ...(offset === undefined ? {} : { offset }) },
    ...(Math.abs(multiply - 1) < 1e-12 ? {} : { multiply }),
    ...(rounding ? { rounding } : {}),
    ...(precision === undefined ? {} : { precision }),
  };
}
function constantFormula(value, rounding = undefined, precision = undefined) {
  return {
    base: { kind: 'CONSTANT', value },
    ...(rounding ? { rounding } : {}),
    ...(precision === undefined ? {} : { precision }),
  };
}

function operandDisplay(operand) {
  if (operand && Object.hasOwn(operand, 'value')) return String(operand.value);
  const offset = number(operand?.offset, 0);
  const body = `${clean(operand?.field)}${offset > 0 ? ` + ${offset}` : offset < 0 ? ` - ${Math.abs(offset)}` : ''}`;
  return offset ? `(${body})` : body;
}
function displayFormula(formula) {
  if (!formula?.base) return '';
  const base = formula.base;
  let output = '';
  if (base.kind === 'CONSTANT') output = String(base.value);
  else if (base.kind === 'FIELD') output = operandDisplay(base).replace(/^\((.*)\)$/, '$1');
  else if (base.kind === 'PRODUCT') output = `${operandDisplay(base.left)} × ${operandDisplay(base.right)}`;
  else if (base.kind === 'QUOTIENT') output = `${operandDisplay(base.numerator)} ÷ ${operandDisplay(base.denominator)}`;
  else return stable(formula);
  const multiply = number(formula.multiply, 1);
  if (Math.abs(multiply - 1) > 1e-12) output = `(${output}) × ${multiply}`;
  const add = number(formula.add, 0);
  if (add > 0) output = `${output} + ${add}`;
  if (add < 0) output = `${output} - ${Math.abs(add)}`;
  if (clean(formula.rounding) && fold(formula.rounding) !== 'NONE') output = `${fold(formula.rounding)}(${output})`;
  return output;
}

function resultKind(uom, formula) {
  if (formula?.base?.kind === 'CONSTANT') return 'CONSTANT';
  const value = fold(uom).replaceAll('²', '2');
  if (['M', 'MET', 'METRE'].includes(value)) return 'LENGTH';
  if (['M2', 'SQM'].includes(value)) return 'AREA';
  if (['KG', 'G'].includes(value)) return 'WEIGHT';
  return 'COUNT';
}

function uiFields(formula) {
  const base = formula?.base ?? {};
  const common = {
    rounding: clean(formula?.rounding) || 'NONE',
    precision: number(formula?.precision, 6),
    multiply: number(formula?.multiply, 1),
    divide: 1,
    final_add: number(formula?.add, 0),
  };
  if (base.kind === 'CONSTANT') {
    return { ...common, operator: 'CONSTANT', operand: number(base.value, 0), source_field: '', source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
  }
  if (base.kind === 'PRODUCT' || base.kind === 'QUOTIENT') {
    const left = base.kind === 'PRODUCT' ? base.left : base.numerator;
    const right = base.kind === 'PRODUCT' ? base.right : base.denominator;
    return {
      ...common,
      operator: base.kind,
      operand: 0,
      source_field: clean(left?.field),
      source_field_offset: number(left?.offset, 0),
      source_field_2: clean(right?.field),
      source_field_2_offset: number(right?.offset, 0),
    };
  }
  if (base.kind === 'FIELD') {
    const offset = number(base.offset, 0);
    const formulaMultiply = number(formula?.multiply, 1);
    if (offset > 0) return { ...common, operator: 'ADD', operand: offset, multiply: formulaMultiply, source_field: clean(base.field), source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
    if (offset < 0) return { ...common, operator: 'SUBTRACT', operand: Math.abs(offset), multiply: formulaMultiply, source_field: clean(base.field), source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
    if (Math.abs(formulaMultiply - 1) > 1e-12) {
      return { ...common, operator: 'MULTIPLY', operand: formulaMultiply, multiply: 1, source_field: clean(base.field), source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
    }
    return { ...common, operator: 'COPY', operand: 0, source_field: clean(base.field), source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
  }
  return { ...common, operator: 'COPY', operand: 0, source_field: '', source_field_offset: 0, source_field_2: '', source_field_2_offset: 0 };
}

function ownerOverrideFor(line) {
  const componentItem = clean(line.item_code);
  const sourceSheet = clean(line.source_sheet || 'ĐM');
  const sourceFormula = fold(line.source_formula_text);
  return ownerAuthority.overrides.find((entry) => {
    if (clean(entry.component_item) !== componentItem) return false;
    const match = entry.match ?? {};
    if (clean(match.source_sheet) && clean(match.source_sheet) !== sourceSheet) return false;
    if (clean(match.source_formula_text) && fold(match.source_formula_text) !== sourceFormula) return false;
    return true;
  }) ?? null;
}

function ownerSplit(line, override) {
  const effective = override?.effective ?? {};
  const formula = parseFormula(effective.formula_json);
  const resultUom = clean(effective.result_uom);
  if (!formula || !resultUom) {
    throw new Error(`Owner BOM Rule override invalid for ${clean(line.item_code)} source row ${line.source_row ?? '?'}`);
  }
  const conversion = override.conversion
    ? {
        item_code: clean(line.item_code),
        from_uom: clean(override.conversion.from_uom),
        to_uom: clean(override.conversion.to_uom),
        factor: number(override.conversion.factor, null),
        basis: clean(override.conversion.basis),
      }
    : null;
  if (conversion && (!conversion.from_uom || !conversion.to_uom || !(conversion.factor > 0))) {
    throw new Error(`Owner BOM Rule conversion invalid for ${clean(line.item_code)}`);
  }
  return {
    formula,
    resultUom,
    authorityType: clean(override.authority_type) || 'OWNER_CONFIRMED',
    sourceNote: clean(override.source_note),
    confirmedBy: clean(override.confirmed_by),
    confirmedAt: clean(override.confirmed_at),
    conversion,
  };
}

function decomposeRuntimeFormula(line, formula) {
  const override = ownerOverrideFor(line);
  if (override) return ownerSplit(line, override);

  const sourceText = fold(line.source_formula_text);
  const basis = fold(line.qty_basis);
  const item = clean(line.item_code);
  let resultUom = clean(line.uom) || clean(line.source_uom) || clean(line.stock_uom);
  const authorityType = 'SOURCE';
  const sourceNote = '';
  const confirmedBy = '';
  const confirmedAt = '';
  let conversion = null;

  const countPerMetre = basis.match(/(\d+(?:[.,]\d+)?)\s*(?:CON|CAI)\s*\/\s*M/);
  if (countPerMetre && formula.base?.kind === 'FIELD') {
    const density = Number(countPerMetre[1].replace(',', '.'));
    if (Number.isFinite(density) && density > 0) {
      formula = fieldFormula(clean(formula.base.field) || 'PB_RAY_RONG', density, number(formula.base.offset, undefined));
      resultUom = 'Cái';
      const eachKg = basis.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*(?:CON|CAI)/)?.[1];
      if (eachKg) conversion = { item_code: item, from_uom: 'Cái', to_uom: clean(line.stock_uom) || 'Kg', factor: Number(eachKg.replace(',', '.')), basis: 'kg/cái from source qty basis' };
      if (/64\s*(?:CON|CAI)\s*\/\s*M/.test(basis) && /49\s*(?:CON|CAI)\s*\/\s*KG/.test(basis)) {
        conversion = { item_code: item, from_uom: 'Cái', to_uom: clean(line.stock_uom) || 'Kg', factor: 1 / 49, basis: '49 cái/kg from source qty basis' };
      }
      return { formula, resultUom, authorityType, sourceNote, confirmedBy, confirmedAt, conversion };
    }
  }

  const countPerArea = basis.match(/(\d+(?:[.,]\d+)?)\s*(?:CON|CAI)\s*\/\s*M(?:2|²)/);
  if (countPerArea) {
    const density = Number(countPerArea[1].replace(',', '.'));
    return { formula: fieldFormula('billable_area_sqm', density), resultUom: 'Cái', authorityType, sourceNote, confirmedBy, confirmedAt, conversion };
  }

  const conversionFactor = number(line.conversion_factor, null);
  const sourceUom = fold(line.source_uom);
  if (conversionFactor && conversionFactor > 0 && sourceUom === 'M' && fold(line.stock_uom) === 'KG') {
    if (formula.base?.kind === 'FIELD' && number(formula.multiply, 1) !== 1) {
      formula.multiply = round(number(formula.multiply, 1) / conversionFactor);
      if (Math.abs(formula.multiply - 1) < 1e-12) delete formula.multiply;
    }
    return {
      formula,
      resultUom: 'Mét',
      authorityType,
      sourceNote,
      confirmedBy,
      confirmedAt,
      conversion: { item_code: item, from_uom: 'Mét', to_uom: 'Kg', factor: conversionFactor, basis: 'canonical BOM conversion_factor' },
    };
  }

  const kgM2 = basis.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*M(?:2|²)/)?.[1]
    ?? sourceText.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*M(?:2|²)/)?.[1];
  if (kgM2 && formula.base?.kind === 'FIELD' && clean(formula.base.field) === 'billable_area_sqm') {
    const factor = Number(kgM2.replace(',', '.'));
    return {
      formula: fieldFormula('billable_area_sqm'),
      resultUom: 'm2',
      authorityType,
      sourceNote,
      confirmedBy,
      confirmedAt,
      conversion: { item_code: item, from_uom: 'm2', to_uom: clean(line.stock_uom) || 'Kg', factor, basis: 'kg/m² from source formula' },
    };
  }

  return { formula, resultUom, authorityType, sourceNote, confirmedBy, confirmedAt, conversion };
}

function ruleInputForLine(line) {
  const parsed = parseFormula(line.quantity_formula_json);
  if (parsed) return decomposeRuntimeFormula(line, parsed);
  // Owner overrides can rescue a line regardless of whether it carries a raw
  // qty: they substitute their own complete formula, so they must be checked
  // before (not inside) the raw-qty branch below.
  const override = ownerOverrideFor(line);
  if (override) return ownerSplit(line, override);
  const qty = number(line.qty, null);
  /**
   * `qty` here can come from `blockedLine()` in build-alumdoor-canonical-bom-importable.mjs,
   * which best-effort-parses a plain number out of the raw source cell EVEN WHEN the row is
   * `source_value_status=PENDING` (i.e. Gate B explicitly could not resolve its UOM/conversion/
   * formula/rounding authority). That qty is informational carry-through for a human reading the
   * Draft BOM, not an authoritative quantity.
   *
   * Measured on the 2026-08-21 dry run: treating it as authoritative here silently promoted 264
   * still-blocked rows into `authority_type:'SOURCE'` CONSTANT rules — including NVL-BKAN's
   * `0.1925 KG/CẶP` (a rate, not a quantity, on an item whose stock_uom is `Cái`) and
   * NVL-TR114-1.8's `1.7 Kg` (the KG/M rate for a length-formula component, promoted as a flat
   * constant). Both matched their own `rate_uom_stock_mismatch` / `rate_uom_unresolved` strict
   * blockers, so the underlying evidence gap was never actually closed — it was just hidden
   * behind a rule that validates and imports cleanly.
   *
   * Only promote when the row itself is not PENDING: that is the same authority boundary the
   * rest of this pipeline already enforces (BOM Draft rows and BOM Template both keep PENDING
   * values un-authoritative). PENDING rows fall through to `pending[]` below with their real
   * `source_pending_reason`, so the gap stays visible instead of silently resolving.
   */
  const pending = clean(line.source_value_status) === 'PENDING';
  if (qty !== null && qty > 0 && !pending) {
    return {
      formula: constantFormula(qty),
      resultUom: clean(line.uom) || clean(line.stock_uom) || clean(line.source_uom),
      authorityType: 'SOURCE',
      sourceNote: 'Fixed canonical BOM quantity retained as reusable CONSTANT rule.',
      confirmedBy: '',
      confirmedAt: '',
      conversion: null,
    };
  }
  return null;
}

const ruleBySignature = new Map();
const mappings = [];
const conversionSuggestions = new Map();
const pending = [];
let sourceRuntimeFormulaRows = 0;
let fixedQuantityRows = 0;
let componentRows = 0;
let ownerOverrideMatches = 0;

for (const bom of source.boms) {
  for (const line of Array.isArray(bom.lines) ? bom.lines : []) {
    componentRows += 1;
    if (parseFormula(line.quantity_formula_json)) sourceRuntimeFormulaRows += 1;
    // Mirror the authority boundary enforced in ruleInputForLine(): a PENDING row's `qty` is a
    // best-effort carry-through of the raw source cell, not an authoritative fixed quantity, so
    // it must not count as "fixed" here either.
    else if (number(line.qty, null) > 0 && clean(line.source_value_status) !== 'PENDING') fixedQuantityRows += 1;

    const split = ruleInputForLine(line);
    if (!split) {
      pending.push({
        parent_item: clean(bom.item),
        component_item: clean(line.item_code),
        component_key: clean(line.component_key),
        source_row: number(line.source_row, null),
        source_value_status: clean(line.source_value_status),
        reason: clean(line.source_pending_reason) || 'no_authoritative_quantity_rule',
      });
      continue;
    }
    if (split.authorityType === 'OWNER_CONFIRMED') ownerOverrideMatches += 1;

    const formula = split.formula;
    const signature = stable({ formula, result_uom: split.resultUom, qty_per_set: 1 });
    const ruleCode = `BR-${hash(signature)}`;
    let rule = ruleBySignature.get(signature);
    if (!rule) {
      const ui = uiFields(formula);
      rule = {
        rule_code: ruleCode,
        rule_name: displayFormula(formula),
        description: `Quy tắc BOM dùng chung: ${displayFormula(formula)} ${split.resultUom}`.trim(),
        result_kind: resultKind(split.resultUom, formula),
        result_uom: split.resultUom,
        source_field: ui.source_field,
        source_field_offset: ui.source_field_offset,
        source_field_2: ui.source_field_2,
        source_field_2_offset: ui.source_field_2_offset,
        operator: ui.operator,
        operand: ui.operand,
        multiply: ui.multiply,
        divide: ui.divide,
        final_add: ui.final_add,
        formula_json: JSON.stringify(formula),
        formula_display: displayFormula(formula),
        qty_per_set: 1,
        rounding: ui.rounding,
        precision: ui.precision,
        version: 1,
        disabled: 0,
        authority_type: split.authorityType,
        source_sheet: clean(line.source_sheet),
        source_row: number(line.source_row, null),
        source_formula_text: clean(line.source_formula_text),
        source_formula_code: clean(line.source_formula_code),
        source_note: split.sourceNote,
        confirmed_by: split.confirmedBy,
        confirmed_at: split.confirmedAt,
        applicability: [],
        source_evidence: [],
      };
      ruleBySignature.set(signature, rule);
    } else if (rule.authority_type !== 'OWNER_CONFIRMED' && split.authorityType === 'OWNER_CONFIRMED') {
      rule.authority_type = 'OWNER_CONFIRMED';
      rule.source_note = split.sourceNote;
      rule.confirmed_by = split.confirmedBy;
      rule.confirmed_at = split.confirmedAt;
    }

    const applicability = {
      scope_type: 'ITEM',
      parent_item: clean(bom.item),
      component_item: clean(line.item_code),
      priority: 100,
      disabled: 0,
      note: `Canonical BOM source row ${line.source_row ?? ''}`.trim(),
    };
    const appKey = stable(applicability);
    if (!rule.applicability.some((entry) => stable(entry) === appKey)) rule.applicability.push(applicability);
    rule.source_evidence.push({
      parent_item: clean(bom.item),
      component_item: clean(line.item_code),
      source_sheet: clean(line.source_sheet),
      source_row: number(line.source_row, null),
      source_formula_text: clean(line.source_formula_text),
      qty_basis: clean(line.qty_basis),
    });
    mappings.push({
      parent_item: clean(bom.item),
      component_item: clean(line.item_code),
      component_key: clean(line.component_key),
      source_row: number(line.source_row, null),
      bom_template_code: clean(line.bom_template_code) || clean(bom.item),
      rule_code: ruleCode,
    });
    if (split.conversion) conversionSuggestions.set(stable(split.conversion), split.conversion);
  }
}

const rules = [...ruleBySignature.values()]
  .map((rule) => ({
    ...rule,
    applicability: rule.applicability.sort((a, b) => clean(a.parent_item).localeCompare(clean(b.parent_item), 'vi')),
    source_evidence: rule.source_evidence.sort((a, b) => Number(a.source_row ?? 0) - Number(b.source_row ?? 0)),
  }))
  .sort((a, b) => a.rule_code.localeCompare(b.rule_code, 'en'));

mappings.sort((a, b) => clean(a.parent_item).localeCompare(clean(b.parent_item), 'vi') || Number(a.source_row ?? 0) - Number(b.source_row ?? 0));

const payload = {
  format: 'alumdoor-bom-rules/v1',
  source_payload: bomPath,
  owner_override_source: overridePath,
  generated_at: new Date().toISOString(),
  rule_count: rules.length,
  applicability_count: rules.reduce((sum, rule) => sum + rule.applicability.length, 0),
  component_mapping_count: mappings.length,
  rules,
  component_mappings: mappings,
  conversion_suggestions: [...conversionSuggestions.values()],
};

const audit = {
  format: 'alumdoor-bom-rules-audit/v1',
  source_payload: bomPath,
  owner_override_source: overridePath,
  owner_override_records: ownerAuthority.overrides.length,
  owner_override_matches: ownerOverrideMatches,
  component_rows: componentRows,
  source_runtime_formula_rows: sourceRuntimeFormulaRows,
  fixed_quantity_rows: fixedQuantityRows,
  unique_formula_signatures: rules.length,
  rules_created: rules.length,
  applicability_count: payload.applicability_count,
  rows_mapped: mappings.length,
  rows_pending: pending.length,
  owner_overrides: rules.filter((rule) => rule.authority_type === 'OWNER_CONFIRMED').length,
  engineering_inference_not_promoted: pending.filter((row) => fold(row.source_value_status) === 'PENDING').length,
  conversions_separated: payload.conversion_suggestions.length,
  coverage_pct: componentRows ? round((mappings.length / componentRows) * 100) : 100,
  pending,
};

mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true });
mkdirSync(path.dirname(path.resolve(auditArg)), { recursive: true });
writeFileSync(path.resolve(outArg), `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(path.resolve(auditArg), `${JSON.stringify(audit, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_RULES_BUILT rules=${rules.length} applicability=${payload.applicability_count} mapped=${mappings.length}/${componentRows} pending=${pending.length} fixed=${fixedQuantityRows} owner_override_matches=${ownerOverrideMatches} conversions=${audit.conversions_separated}`);
