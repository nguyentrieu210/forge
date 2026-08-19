#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const [resultArg] = process.argv.slice(2);
if (!resultArg) throw new Error('Usage: sync-alumdoor-bom-rule-template-fallback-local.mjs <result.json>');
assertLocalMutationChildContext(['bom-rule']);

const clean = (value) => String(value ?? '').normalize('NFC').trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizedUom = (value) => clean(value).toLocaleLowerCase('vi').replaceAll('²', '2').replaceAll(' ', '');
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`
    : JSON.stringify(value) ?? 'null';

const origin = (process.env.FORGE_ORIGIN ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedOrigin.hostname)) throw new Error(`refusing remote BOM Rule projection: ${parsedOrigin.hostname}`);
const adminUser = process.env.FORGE_ADMIN_USER ?? process.env.FORGE_AUTH_USER ?? '';
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? process.env.FORGE_AUTH_PASSWORD ?? '';
if (!adminUser || !adminPassword) throw new Error('FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required');

const cookies = new Map();
let csrfToken = '';
function rememberCookies(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;
  for (const part of setCookie.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
}
function cookieHeader() { return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '); }
async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (csrfToken && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrfToken);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${urlPath}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
    redirect: 'manual',
  });
  rememberCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') ?? csrfToken;
  const responseText = await response.text();
  let body = null;
  try { body = responseText ? JSON.parse(responseText) : null; } catch { body = responseText; }
  return { response, body, text: responseText };
}
async function requireOk(urlPath, options = {}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) throw new Error(`${options.method ?? 'GET'} ${urlPath} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
function dataOf(body) { return body?.data ?? body?.message ?? body; }
async function login() {
  await requireOk('/api/method/login', { method: 'POST', body: { usr: adminUser, pwd: adminPassword } });
  const boot = dataOf(await requireOk('/api/method/metaforge.api.get_boot'));
  csrfToken = boot?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error('login succeeded but boot returned no CSRF token');
}
async function listDocs(doctype, fields = ['name'], filters = []) {
  const all = [];
  const pageSize = 100;
  for (let start = 0; ; start += pageSize) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_page_length: String(pageSize),
      limit_start: String(start),
    });
    const rows = dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}?${query}`));
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
async function getDoc(doctype, name) {
  const body = dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`));
  return body ?? null;
}
async function updateDoc(doctype, name, doc) {
  return dataOf(await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: 'PUT', body: doc }));
}

function parseFormula(value, ruleCode) {
  try {
    const parsed = typeof value === 'object' ? structuredClone(value) : JSON.parse(clean(value));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || !parsed.base) throw new Error('missing base');
    return parsed;
  } catch (error) {
    throw new Error(`${ruleCode}: formula_json không hợp lệ (${error?.message ?? error}).`);
  }
}

const FIELD_ALIASES = new Map([
  // The legacy materializer exposes PB_RONG, not the newer ray/plastic aliases.
  // This is a compatibility snapshot only; BOM Rule itself keeps canonical field names.
  ['PB_RAY_RONG', 'PB_RONG'],
  ['PB_NHUA_RONG', 'PB_RONG'],
  ['CAO_LUOI', 'mesh_height_m'],
]);
function projectOperand(operand) {
  if (!operand || typeof operand !== 'object' || Array.isArray(operand)) return operand;
  if (Object.hasOwn(operand, 'value')) return { value: finite(operand.value) };
  const field = clean(operand.field);
  return { field: FIELD_ALIASES.get(field) ?? field, ...(finite(operand.offset) ? { offset: finite(operand.offset) } : {}) };
}
function projectFormulaFields(formula) {
  const next = structuredClone(formula);
  const base = next.base ?? {};
  if (base.kind === 'FIELD') next.base = projectOperand(base);
  else if (base.kind === 'PRODUCT') next.base = { ...base, left: projectOperand(base.left), right: projectOperand(base.right) };
  else if (base.kind === 'QUOTIENT') next.base = { ...base, numerator: projectOperand(base.numerator), denominator: projectOperand(base.denominator) };
  return next;
}

function normalizedConversions(item) {
  return (Array.isArray(item?.uom_conversions) ? item.uom_conversions : [])
    .map((row) => ({ uom: clean(row?.uom), conversion_factor: finite(row?.conversion_factor, NaN) }))
    .filter((row) => row.uom && Number.isFinite(row.conversion_factor) && row.conversion_factor > 0);
}

function stockFactor(item, resultUom) {
  const stockUom = clean(item?.stock_uom);
  if (!stockUom) return { ok: false, reason: 'component_item_missing_stock_uom' };
  if (normalizedUom(stockUom) === normalizedUom(resultUom)) return { ok: true, factor: 1, stock_uom: stockUom };
  const conversion = normalizedConversions(item).find((row) => normalizedUom(row.uom) === normalizedUom(resultUom));
  if (!conversion) return { ok: false, reason: `missing_conversion_${clean(resultUom)}_to_${stockUom}` };
  return { ok: true, factor: conversion.conversion_factor, stock_uom: stockUom };
}

function scaleFormula(formula, scale) {
  const next = projectFormulaFields(formula);
  if (!(scale > 0)) throw new Error(`invalid production projection scale ${scale}`);
  const existingMultiply = finite(next.multiply, 1);
  const existingAdd = finite(next.add, 0);
  const scaledMultiply = existingMultiply * scale;
  if (Math.abs(scaledMultiply - 1) <= 1e-12) delete next.multiply;
  else next.multiply = scaledMultiply;
  if (existingAdd) next.add = existingAdd * scale;
  // Rounding represents a consumption rule (e.g. CEIL pieces). Converting a rounded result
  // to another stock UOM cannot be represented by the legacy flat formula without changing
  // operation order. Fail closed instead of moving rounding after the conversion silently.
  const rounding = clean(next.rounding).toUpperCase();
  if (rounding && rounding !== 'NONE' && Math.abs(scale - 1) > 1e-12) {
    return { ok: false, reason: 'rounded_rule_requires_native_master_materializer' };
  }
  return { ok: true, formula: next };
}

await login();
const ruleRows = await listDocs('BOM Rule', ['name', 'rule_code', 'disabled']);
const rules = new Map();
for (const row of ruleRows) {
  if (Number(row.disabled ?? 0)) continue;
  const doc = await getDoc('BOM Rule', row.name);
  if (doc?.rule_code) rules.set(clean(doc.rule_code), doc);
}
const templateRows = await listDocs('BOM Template', ['name', 'item_code', 'template_code']);
const itemCache = new Map();
async function itemDoc(itemCode) {
  const code = clean(itemCode);
  if (!itemCache.has(code)) itemCache.set(code, await getDoc('Item', code));
  return itemCache.get(code);
}

let templatesUpdated = 0;
let componentRulesUpdated = 0;
let componentRulesUnchanged = 0;
const pending = [];
const aliasesUsed = new Set();
for (const row of templateRows) {
  const template = await getDoc('BOM Template', row.name);
  if (!template || !Array.isArray(template.component_rules)) continue;
  let changed = false;
  const nextRules = [];
  for (const child of template.component_rules) {
    const ruleCode = clean(child.bom_rule);
    if (!ruleCode) {
      nextRules.push(child);
      continue;
    }
    const master = rules.get(ruleCode);
    if (!master) {
      pending.push({ template: template.name, component_item: child.item_code, rule_code: ruleCode, reason: 'bom_rule_not_found_or_disabled' });
      nextRules.push(child);
      continue;
    }
    const item = await itemDoc(child.item_code);
    if (!item) {
      pending.push({ template: template.name, component_item: child.item_code, rule_code: ruleCode, reason: 'component_item_not_found' });
      nextRules.push(child);
      continue;
    }
    const conversion = stockFactor(item, master.result_uom);
    if (!conversion.ok) {
      pending.push({ template: template.name, component_item: child.item_code, rule_code: ruleCode, reason: conversion.reason });
      nextRules.push(child);
      continue;
    }
    const qtyPerSet = finite(master.qty_per_set, 1) > 0 ? finite(master.qty_per_set, 1) : 1;
    const scale = qtyPerSet * conversion.factor;
    const canonical = parseFormula(master.formula_json, ruleCode);
    const projected = scaleFormula(canonical, scale);
    if (!projected.ok) {
      pending.push({ template: template.name, component_item: child.item_code, rule_code: ruleCode, reason: projected.reason });
      nextRules.push(child);
      continue;
    }
    const canonicalString = JSON.stringify(projected.formula);
    for (const [sourceField, alias] of FIELD_ALIASES) {
      if (clean(master.formula_json).includes(`\"field\":\"${sourceField}\"`)) aliasesUsed.add(`${sourceField}->${alias}`);
    }
    const next = {
      ...child,
      stock_uom: conversion.stock_uom,
      quantity_formula_json: canonicalString,
      bom_rule_version: finite(master.version, 1),
      bom_rule_formula_snapshot: JSON.stringify({
        rule_code: master.rule_code,
        rule_name: master.rule_name,
        version: finite(master.version, 1),
        formula_json: master.formula_json,
        formula_display: master.formula_display,
        result_uom: master.result_uom,
        qty_per_set: qtyPerSet,
        production_stock_factor: conversion.factor,
        production_stock_uom: conversion.stock_uom,
        production_formula_json: canonicalString,
        authority_type: master.authority_type,
        source_formula_text: master.source_formula_text,
      }),
    };
    const comparable = (value) => ({
      bom_rule: clean(value.bom_rule),
      stock_uom: clean(value.stock_uom),
      quantity_formula_json: clean(value.quantity_formula_json),
      bom_rule_version: finite(value.bom_rule_version),
      bom_rule_formula_snapshot: clean(value.bom_rule_formula_snapshot),
    });
    if (stable(comparable(child)) === stable(comparable(next))) {
      componentRulesUnchanged += 1;
      nextRules.push(child);
      continue;
    }
    componentRulesUpdated += 1;
    changed = true;
    nextRules.push(next);
  }
  if (changed) {
    await updateDoc('BOM Template', template.name, { component_rules: nextRules });
    templatesUpdated += 1;
  }
}

const result = {
  format: 'alumdoor-bom-rule-template-projection/v1',
  templates_scanned: templateRows.length,
  templates_updated: templatesUpdated,
  component_rules_updated: componentRulesUpdated,
  component_rules_unchanged: componentRulesUnchanged,
  pending_count: pending.length,
  pending,
  compatibility_aliases: [...aliasesUsed].sort(),
};
const resultPath = path.resolve(resultArg);
mkdirSync(path.dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_RULE_TEMPLATE_PROJECTION_PASS templates_updated=${templatesUpdated} rules_updated=${componentRulesUpdated} unchanged=${componentRulesUnchanged} pending=${pending.length}`);
