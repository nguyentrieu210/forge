#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [bomArg, outArg, auditArg] = process.argv.slice(2);
if (![bomArg, outArg, auditArg].every(Boolean)) {
  throw new Error('Usage: build-alumdoor-bom-rule-importable.mjs <bom-importable.json> <bom-rules.json> <audit.json>');
}
const bomPath = path.resolve(bomArg);
const source = JSON.parse(readFileSync(bomPath, 'utf8'));
if (source?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(source.boms)) {
  throw new Error('Expected alumdoor-canonical-bom-importable/v2');
}

const clean = (value) => String(value ?? '').normalize('NFC').trim();
const fold = (value) => clean(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[Đđ]/g, 'D').toUpperCase();
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1e9) / 1e9;

function parseFormula(value) {
  if (!clean(value)) return null;
  try {
    const parsed = typeof value === 'object' ? value : JSON.parse(clean(value));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
    if (fold(parsed.kind) === 'DEFERRED') return null;
    return structuredClone(parsed);
  } catch { return null; }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function hash(value) { return createHash('sha1').update(value).digest('hex').slice(0, 12).toUpperCase(); }

function fieldFormula(field, multiply = 1, offset = undefined, rounding = undefined) {
  return {
    base: { kind: 'FIELD', field, ...(offset === undefined ? {} : { offset }) },
    ...(Math.abs(multiply - 1) < 1e-12 ? {} : { multiply }),
    ...(rounding ? { rounding } : {}),
  };
}

function resultKind(uom) {
  const value = fold(uom).replaceAll('²', '2');
  if (['M','MET','METRE','MÉT'].includes(value)) return 'LENGTH';
  if (['M2','SQM'].includes(value)) return 'AREA';
  if (['CAI','CON','CAP','BO','TAM','CÁI','CẶP','BỘ','TẤM'].includes(value)) return 'COUNT';
  if (['KG','G'].includes(value)) return 'WEIGHT';
  return 'COUNT';
}

function displayFormula(formula) {
  if (!formula?.base) return '';
  const base = formula.base;
  if (base.kind === 'CONSTANT') return String(base.value);
  if (base.kind === 'FIELD') {
    const offset = number(base.offset, 0);
    let out = clean(base.field);
    if (offset > 0) out += ` + ${offset}`;
    if (offset < 0) out += ` - ${Math.abs(offset)}`;
    const multiply = number(formula.multiply, 1);
    if (Math.abs(multiply - 1) > 1e-12) out = `(${out}) × ${multiply}`;
    if (clean(formula.rounding) && fold(formula.rounding) !== 'NONE') out = `${fold(formula.rounding)}(${out})`;
    return out;
  }
  if (base.kind === 'PRODUCT') return `${operandDisplay(base.left)} × ${operandDisplay(base.right)}${number(formula.multiply,1) !== 1 ? ` × ${number(formula.multiply,1)}` : ''}`;
  if (base.kind === 'QUOTIENT') return `${operandDisplay(base.numerator)} ÷ ${operandDisplay(base.denominator)}`;
  return stable(formula);
}
function operandDisplay(operand) {
  if (operand && Object.hasOwn(operand, 'value')) return String(operand.value);
  const offset = number(operand?.offset, 0);
  return `${clean(operand?.field)}${offset > 0 ? ` + ${offset}` : offset < 0 ? ` - ${Math.abs(offset)}` : ''}`;
}

function decomposition(line) {
  const sourceText = fold(line.source_formula_text);
  const basis = fold(line.qty_basis);
  const item = clean(line.item_code);
  let formula = parseFormula(line.quantity_formula_json);
  if (!formula) return null;
  let resultUom = clean(line.uom) || clean(line.source_uom) || clean(line.stock_uom);
  let authorityType = 'SOURCE';
  let sourceNote = '';
  let conversion = null;

  // Shop-owner correction 19/08/2026: source says +20CM, actual Trục 114 rule is +2CM.
  // Preserve source text and make the effective rule explicit instead of rewriting evidence.
  if (item === 'NVL-TR114-1.8' && sourceText.includes('RPBRAY+20CM')) {
    formula = fieldFormula('PB_RAY_RONG', 1, 0.02);
    resultUom = 'Mét';
    authorityType = 'OWNER_CONFIRMED';
    sourceNote = 'Nguồn ghi RPBRAY+20CM; chủ xưởng xác nhận quy cách thực tế là Rộng PB ray + 2cm ngày 19/08/2026.';
    conversion = { item_code: item, from_uom: 'Mét', to_uom: clean(line.stock_uom) || 'Kg', factor: 4.4, basis: '4.4 kg/m from same-item source evidence' };
    return { formula, resultUom, authorityType, sourceNote, conversion };
  }

  // Explicit count-density formulas: keep pieces as BOM consumption and move kg/piece to Item conversion.
  const countPerM = basis.match(/(\d+(?:[.,]\d+)?)\s*(?:CON|CAI|CÁI)\s*\/\s*M/);
  if (countPerM && formula.base?.kind === 'FIELD') {
    const density = Number(countPerM[1].replace(',', '.'));
    if (Number.isFinite(density) && density > 0) {
      formula = fieldFormula(clean(formula.base.field) || 'PB_RAY_RONG', density, number(formula.base.offset, undefined));
      resultUom = 'Cái';
      const eachKg = basis.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*(?:CON|CAI|CÁI)/)?.[1];
      if (eachKg) conversion = { item_code:item, from_uom:'Cái', to_uom:clean(line.stock_uom)||'Kg', factor:Number(eachKg.replace(',','.')), basis:'kg/cái from source qty basis' };
      if (/64\s*(?:CON|CAI|CÁI)\s*\/\s*M/.test(basis) && /49\s*(?:CON|CAI|CÁI)\s*\/\s*KG/.test(basis)) {
        conversion = { item_code:item, from_uom:'Cái', to_uom:clean(line.stock_uom)||'Kg', factor:1/49, basis:'49 cái/kg from source qty basis' };
      }
      return { formula, resultUom, authorityType, sourceNote, conversion };
    }
  }

  const countPerArea = basis.match(/(\d+(?:[.,]\d+)?)\s*(?:CON|CAI|CÁI)\s*\/\s*M(?:2|²)/);
  if (countPerArea) {
    const density = Number(countPerArea[1].replace(',', '.'));
    formula = fieldFormula('billable_area_sqm', density);
    resultUom = 'Cái';
    return { formula, resultUom, authorityType, sourceNote, conversion };
  }

  // When canonical UOM conversion already says kg per metre, the old formula multiplied that
  // conversion into quantity. BOM Rule stops before stock conversion.
  const conversionFactor = number(line.conversion_factor, null);
  const sourceUom = fold(line.source_uom);
  if (conversionFactor && conversionFactor > 0 && sourceUom === 'M' && clean(line.stock_uom).toLowerCase() === 'kg') {
    if (formula.base?.kind === 'FIELD' && number(formula.multiply, 1) !== 1) {
      const oldMultiply = number(formula.multiply, 1);
      formula.multiply = round(oldMultiply / conversionFactor);
      if (Math.abs(formula.multiply - 1) < 1e-12) delete formula.multiply;
    }
    resultUom = 'Mét';
    conversion = { item_code:item, from_uom:'Mét', to_uom:'Kg', factor:conversionFactor, basis:'canonical BOM conversion_factor' };
    return { formula, resultUom, authorityType, sourceNote, conversion };
  }

  // kg/m² annotation belongs to Item conversion; area is the rule result.
  const kgM2 = basis.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*M(?:2|²)/)?.[1]
    ?? sourceText.match(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*M(?:2|²)/)?.[1];
  if (kgM2 && formula.base?.kind === 'FIELD' && clean(formula.base.field) === 'billable_area_sqm') {
    const factor = Number(kgM2.replace(',', '.'));
    formula = fieldFormula('billable_area_sqm');
    resultUom = 'm2';
    conversion = { item_code:item, from_uom:'m2', to_uom:clean(line.stock_uom)||'Kg', factor, basis:'kg/m² from source formula' };
    return { formula, resultUom, authorityType, sourceNote, conversion };
  }

  return { formula, resultUom, authorityType, sourceNote, conversion };
}

const ruleBySignature = new Map();
const mappings = [];
const conversionSuggestions = new Map();
const pending = [];
let sourceFormulaRows = 0;

for (const bom of source.boms) {
  for (const line of Array.isArray(bom.lines) ? bom.lines : []) {
    if (!clean(line.quantity_formula_json)) continue;
    sourceFormulaRows += 1;
    const split = decomposition(line);
    if (!split) {
      pending.push({ parent_item:bom.item, component_item:line.item_code, source_row:line.source_row, reason:'formula_not_promoted' });
      continue;
    }
    const formula = split.formula;
    const signature = stable({ formula, result_uom:split.resultUom, qty_per_set:1 });
    const ruleCode = `BR-${hash(signature)}`;
    let rule = ruleBySignature.get(signature);
    if (!rule) {
      rule = {
        rule_code: ruleCode,
        rule_name: displayFormula(formula),
        description: `Quy tắc BOM dùng chung: ${displayFormula(formula)} ${split.resultUom}`.trim(),
        result_kind: resultKind(split.resultUom),
        result_uom: split.resultUom,
        formula_json: JSON.stringify(formula),
        formula_display: displayFormula(formula),
        qty_per_set: 1,
        rounding: clean(formula.rounding) || 'NONE',
        precision: number(formula.precision, 6),
        version: 1,
        disabled: 0,
        authority_type: split.authorityType,
        source_sheet: clean(line.source_sheet),
        source_row: number(line.source_row, null),
        source_formula_text: clean(line.source_formula_text),
        source_formula_code: clean(line.source_formula_code),
        source_note: split.sourceNote,
        confirmed_by: split.authorityType === 'OWNER_CONFIRMED' ? 'Chủ xưởng' : '',
        confirmed_at: split.authorityType === 'OWNER_CONFIRMED' ? '2026-08-19T12:50:00+07:00' : '',
        applicability: [],
        source_evidence: [],
      };
      ruleBySignature.set(signature, rule);
    } else if (rule.authority_type !== 'OWNER_CONFIRMED' && split.authorityType === 'OWNER_CONFIRMED') {
      rule.authority_type = 'OWNER_CONFIRMED';
      rule.source_note = split.sourceNote;
      rule.confirmed_by = 'Chủ xưởng';
      rule.confirmed_at = '2026-08-19T12:50:00+07:00';
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
      parent_item:clean(bom.item), component_item:clean(line.item_code), source_sheet:clean(line.source_sheet),
      source_row:number(line.source_row,null), source_formula_text:clean(line.source_formula_text), qty_basis:clean(line.qty_basis),
    });
    mappings.push({
      parent_item: clean(bom.item),
      component_item: clean(line.item_code),
      component_key: clean(line.component_key),
      source_row: number(line.source_row, null),
      bom_template_code: clean(line.bom_template_code) || clean(bom.item),
      rule_code: ruleCode,
    });
    if (split.conversion) {
      const key = stable(split.conversion);
      conversionSuggestions.set(key, split.conversion);
    }
  }
}

const rules = [...ruleBySignature.values()]
  .map((rule) => ({ ...rule, applicability: rule.applicability.sort((a,b)=>clean(a.parent_item).localeCompare(clean(b.parent_item),'vi')), source_evidence:rule.source_evidence.sort((a,b)=>Number(a.source_row??0)-Number(b.source_row??0)) }))
  .sort((a,b)=>a.rule_code.localeCompare(b.rule_code,'en'));
mappings.sort((a,b)=>clean(a.parent_item).localeCompare(clean(b.parent_item),'vi') || Number(a.source_row??0)-Number(b.source_row??0));

const payload = {
  format: 'alumdoor-bom-rules/v1',
  source_payload: bomPath,
  generated_at: new Date().toISOString(),
  rule_count: rules.length,
  applicability_count: rules.reduce((sum,rule)=>sum+rule.applicability.length,0),
  component_mapping_count: mappings.length,
  rules,
  component_mappings: mappings,
  conversion_suggestions: [...conversionSuggestions.values()],
};
const audit = {
  format: 'alumdoor-bom-rules-audit/v1',
  source_formula_rows: sourceFormulaRows,
  unique_formula_signatures: rules.length,
  rules_created: rules.length,
  applicability_count: payload.applicability_count,
  rows_mapped: mappings.length,
  rows_pending: pending.length,
  owner_overrides: rules.filter((rule)=>rule.authority_type==='OWNER_CONFIRMED').length,
  engineering_inference_not_promoted: pending.filter((row)=>row.reason==='formula_not_promoted').length,
  conversions_separated: payload.conversion_suggestions.length,
  pending,
};
mkdirSync(path.dirname(path.resolve(outArg)), { recursive:true });
mkdirSync(path.dirname(path.resolve(auditArg)), { recursive:true });
writeFileSync(path.resolve(outArg), `${JSON.stringify(payload,null,2)}\n`);
writeFileSync(path.resolve(auditArg), `${JSON.stringify(audit,null,2)}\n`);
console.log(`ALUMDOOR_BOM_RULES_BUILT rules=${rules.length} applicability=${payload.applicability_count} mapped=${mappings.length} pending=${pending.length} owner_overrides=${audit.owner_overrides} conversions=${audit.conversions_separated}`);
