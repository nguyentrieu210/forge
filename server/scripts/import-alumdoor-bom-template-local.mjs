#!/usr/bin/env node
// Persists the deferred BOM knowledge that Gate B (import-alumdoor-canonical-bom-local.mjs)
// deliberately leaves out. Gate B only writes a Bill of Materials line when a component's
// quantity is a resolved, static number — a formula that depends on a specific door's runtime
// geometry (e.g. "(CAO PB - 10CM)x2") or a missing unit conversion cannot be turned into that
// number without inventing one. This script does not invent it either: it records the parent
// item, the component identity, and the raw source formula/reason verbatim as
// source_status=DEFERRED on BOM Template, so the catalog structure is queryable even where the
// quantity is not yet computable. quantity_formula_json is populated with a {kind:"DEFERRED",...}
// envelope carrying only values already present in the source lineage — never a guessed number.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) throw new Error('Usage: import-alumdoor-bom-template-local.mjs <bom-importable.json> <result.json> [--validate-only]');
const payloadPath = path.resolve(payloadArg);
const source = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (source?.format !== 'alumdoor-canonical-bom-importable/v1' || !Array.isArray(source.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v1');

const clean = (v) => String(v ?? '').normalize('NFC').trim();

function buildTemplate(bom) {
  const blanks = Array.isArray(bom.blank_lines) ? bom.blank_lines : [];
  if (!blanks.length) return null;
  const rows = blanks.map((line, index) => {
    const lineage = line.lineage ?? {};
    const envelope = {
      kind: 'DEFERRED',
      reason: line.blank_reason ?? null,
      source_formula: lineage.source_formula_text ?? null,
      source_value: line.source_value ?? null,
    };
    return {
      rule_code: `${bom.item}:${line.item_code}:${index + 1}`,
      component_key: String(line.item_code ?? ''),
      item_code: String(line.item_code ?? ''),
      stock_uom: lineage.source_uom ?? undefined,
      priority: 0,
      sequence: index + 1,
      quantity_formula_json: JSON.stringify(envelope),
      source_row: Number.isFinite(lineage.source_row) ? lineage.source_row : undefined,
      source_uom: lineage.source_uom ?? undefined,
      source_formula: lineage.source_formula_text ?? '',
      note: line.blank_reason ?? '',
    };
  });
  const rowsWithSource = blanks.filter((l) => Number.isFinite(l.lineage?.source_row));
  const minRow = rowsWithSource.length ? Math.min(...rowsWithSource.map((l) => l.lineage.source_row)) : null;
  const maxRow = rowsWithSource.length ? Math.max(...rowsWithSource.map((l) => l.lineage.source_row)) : null;
  const sheet = blanks.find((l) => l.lineage?.source_sheet)?.lineage?.source_sheet ?? '';
  return {
    doctype: 'BOM Template',
    template_code: bom.item,
    item_code: bom.item,
    source_status: 'DEFERRED',
    source_ref: minRow ? `${sheet} row ${minRow}${maxRow && maxRow !== minRow ? `-${maxRow}` : ''}` : sheet,
    deferred_components_json: JSON.stringify(blanks),
    component_rules: rows,
    note: `Gate B left ${blanks.length} component(s) unresolved (missing_conversion or runtime geometry formula); recorded verbatim, no value invented.`,
  };
}

const templates = source.boms.map(buildTemplate).filter(Boolean);
for (const t of templates) {
  if (!t.item_code) throw new Error('BOM Template item_code is blank');
  for (const r of t.component_rules) {
    if (!r.item_code) throw new Error(`${t.template_code}: component rule has blank item_code`);
    if (!r.quantity_formula_json) throw new Error(`${t.template_code}: component rule ${r.rule_code} has blank quantity_formula_json`);
  }
}
console.log(`ALUMDOOR_BOM_TEMPLATE_PAYLOAD_VALID templates=${templates.length} component_rules=${templates.reduce((n,t)=>n+t.component_rules.length,0)}`);
if (validateOnly) { console.log('ALUMDOOR_BOM_TEMPLATE_VALIDATE_ONLY_PASS'); process.exit(0); }
assertLocalMutationChildContext(['bom-template']);

const origin = (process.env.FORGE_ORIGIN ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedOrigin.hostname)) throw new Error(`refusing remote BOM Template mutation: ${parsedOrigin.hostname}`);
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
    const i = pair.indexOf('=');
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
function cookieHeader() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
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
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}
async function requireOk(urlPath, options = {}) {
  const result = await request(urlPath, options);
  if (!result.response.ok) throw new Error(`${options.method ?? 'GET'} ${urlPath} failed (${result.response.status}): ${result.text}`);
  return result.body;
}
async function login() {
  await requireOk('/api/method/login', { method: 'POST', body: { usr: adminUser, pwd: adminPassword } });
  const boot = await requireOk('/api/method/metaforge.api.get_boot');
  const message = boot && typeof boot === 'object' && 'message' in boot ? boot.message : boot;
  csrfToken = message?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error('login succeeded but boot returned no CSRF token');
}
function dataOf(body) { return body?.data ?? body?.message ?? body; }
async function listExisting() {
  const fields = encodeURIComponent(JSON.stringify(['name', 'template_code']));
  const pageSize = 100;
  const all = [];
  for (let start = 0; ; start += pageSize) {
    const body = await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}?fields=${fields}&limit_page_length=${pageSize}&limit_start=${start}`);
    const rows = dataOf(body);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
async function getTemplate(name) {
  const result = await request(`/api/resource/${encodeURIComponent('BOM Template')}/${encodeURIComponent(name)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) throw new Error(`GET BOM Template ${name} failed (${result.response.status}): ${result.text}`);
  return dataOf(result.body);
}
function sameTemplate(expected, actual) {
  if (!actual) return false;
  if (clean(actual.item_code) !== clean(expected.item_code)) return false;
  if (clean(actual.source_status) !== 'DEFERRED') return false;
  const left = JSON.stringify(JSON.parse(clean(actual.deferred_components_json) || '[]'));
  const right = JSON.stringify(JSON.parse(expected.deferred_components_json));
  return left === right;
}

await login();
const existingList = await listExisting();
const existingByCode = new Map(existingList.map((r) => [clean(r.template_code), r.name]));
const planned = [];
const unchanged = [];
for (const t of templates) {
  const existingName = existingByCode.get(clean(t.template_code));
  if (existingName) {
    const full = await getTemplate(existingName);
    if (sameTemplate(t, full)) { unchanged.push({ template_code: t.template_code, name: existingName }); continue; }
  }
  planned.push(t);
}
const created = [];
for (const t of planned) {
  const body = await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}`, { method: 'POST', body: t });
  const doc = dataOf(body);
  created.push({ template_code: t.template_code, name: doc?.name ?? null });
}
const postList = await listExisting();
const postByCode = new Map(postList.map((r) => [clean(r.template_code), r.name]));
const failures = [];
for (const t of templates) {
  const name = postByCode.get(clean(t.template_code));
  const full = name ? await getTemplate(name) : null;
  if (!sameTemplate(t, full)) failures.push({ template_code: t.template_code, reason: 'no_exact_persisted_template' });
}
if (failures.length) {
  writeFileSync(path.resolve(resultArg), `${JSON.stringify({ failures }, null, 2)}\n`);
  throw new Error(`ALUMDOOR_BOM_TEMPLATE_VERIFY_FAILED count=${failures.length}`);
}
const result = {
  format: 'alumdoor-bom-template-local-import-result/v1',
  payload: payloadPath,
  created_count: created.length,
  unchanged_count: unchanged.length,
  template_count: templates.length,
  component_rule_count: templates.reduce((n, t) => n + t.component_rules.length, 0),
  verification_failure_count: 0,
  created,
  unchanged,
};
writeFileSync(path.resolve(resultArg), `${JSON.stringify(result, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_TEMPLATE_IMPORT_PASS created=${created.length} unchanged=${unchanged.length} templates=${templates.length}`);
