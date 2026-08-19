#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';
import { canonicalAlumdoorUom } from './lib/alumdoor-uom-catalog.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) throw new Error('Usage: import-alumdoor-bom-template-local.mjs <bom-importable.json> <result.json> [--validate-only]');
const payloadPath = path.resolve(payloadArg);
const source = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (source?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(source.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v2');

const clean = (v) => String(v ?? '').normalize('NFC').trim();
const pendingOf = (bom) => Array.isArray(bom.pending_lines) ? bom.pending_lines : (Array.isArray(bom.blank_lines) ? bom.blank_lines : []);

function buildTemplate(bom) {
  const pending = pendingOf(bom);
  if (!pending.length) return null;
  const rows = pending.map((line, index) => {
    const envelope = line.quantity_formula_json
      ? clean(line.quantity_formula_json)
      : JSON.stringify({
          kind: 'DEFERRED',
          reason: line.source_pending_reason ?? null,
          source_formula: line.source_formula_text ?? null,
          source_value: line.source_value ?? null,
        });
    return {
      rule_code: `${bom.item}:SRC-${line.source_row ?? index + 1}`,
      component_key: clean(line.component_key) || clean(line.item_code),
      item_code: clean(line.item_code),
      stock_uom: clean(line.stock_uom) || undefined,
      priority: 0,
      sequence: Number(line.source_sequence ?? index + 1),
      quantity_formula_json: envelope,
      source_row: Number.isFinite(Number(line.source_row)) ? Number(line.source_row) : undefined,
      source_uom: clean(line.source_uom) || undefined,
      source_formula: clean(line.source_formula_text),
      note: clean(line.source_pending_reason),
    };
  });
  const rowsWithSource = pending.filter((l) => Number.isFinite(Number(l.source_row)));
  const minRow = rowsWithSource.length ? Math.min(...rowsWithSource.map((l) => Number(l.source_row))) : null;
  const maxRow = rowsWithSource.length ? Math.max(...rowsWithSource.map((l) => Number(l.source_row))) : null;
  const sheet = clean(pending.find((l) => clean(l.source_sheet))?.source_sheet);
  return {
    doctype: 'BOM Template',
    template_code: bom.item,
    item_code: bom.item,
    source_status: 'DEFERRED',
    source_ref: minRow ? `${sheet} row ${minRow}${maxRow && maxRow !== minRow ? `-${maxRow}` : ''}` : sheet,
    deferred_components_json: JSON.stringify(pending),
    component_rules: rows,
    note: `Canonical source retains ${pending.length} component value gap(s); identity is persisted on Draft BOM and unresolved values remain blank until authoritative evidence exists.`,
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
assertLocalMutationChildContext(['bom-template', 'bom']);

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
function normalizedDeferred(value) {
  try { return JSON.stringify(JSON.parse(clean(value) || '[]')); }
  catch { return clean(value); }
}
function sameTemplate(expected, actual) {
  if (!actual) return false;
  if (clean(actual.item_code) !== clean(expected.item_code)) return false;
  if (clean(actual.template_code) !== clean(expected.template_code)) return false;
  if (clean(actual.source_status) !== 'DEFERRED') return false;
  if (normalizedDeferred(actual.deferred_components_json) !== normalizedDeferred(expected.deferred_components_json)) return false;
  return true;
}

await login();
const existingList = await listExisting();
const existingFull = [];
for (const row of existingList) existingFull.push(await getTemplate(row.name));
const existingByCode = new Map();
for (const doc of existingFull.filter(Boolean)) {
  const code = clean(doc.template_code);
  const list = existingByCode.get(code) ?? [];
  list.push(doc);
  existingByCode.set(code, list);
}
const plans = [];
for (const t of templates) {
  const candidates = existingByCode.get(clean(t.template_code)) ?? [];
  const exact = candidates.find((doc) => sameTemplate(t, doc));
  if (exact) plans.push({ action:'noop', template:t, existing:exact });
  else if (candidates.length) plans.push({ action:'update', template:t, existing:candidates[0] });
  else plans.push({ action:'create', template:t, existing:null });
}
const resultPath = path.resolve(resultArg);
mkdirSync(path.dirname(resultPath), { recursive: true });
writeFileSync(`${resultPath}.preimage.json`, `${JSON.stringify({
  format:'alumdoor-bom-template-local-preimage/v2',
  created_at:new Date().toISOString(),
  payload:payloadPath,
  existing_count:existingFull.length,
  planned_create_count:plans.filter((p)=>p.action==='create').length,
  planned_update_count:plans.filter((p)=>p.action==='update').length,
  unchanged_count:plans.filter((p)=>p.action==='noop').length,
  existing:existingFull,
}, null, 2)}\n`);

const created = []; const updated = []; const unchanged = [];
for (const plan of plans) {
  if (plan.action === 'noop') { unchanged.push({template_code:plan.template.template_code,name:plan.existing.name}); continue; }
  if (plan.action === 'create') {
    const body = await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}`, { method: 'POST', body: plan.template });
    const doc = dataOf(body); created.push({template_code:plan.template.template_code,name:doc?.name??null});
  } else {
    const body = await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}/${encodeURIComponent(plan.existing.name)}`, { method: 'PUT', body: plan.template });
    const doc = dataOf(body); updated.push({template_code:plan.template.template_code,name:doc?.name??plan.existing.name});
  }
}

// Remove only redundant DEFERRED templates for the same canonical code. This importer owns
// those records and the local state has already been backed up by the adapter.
const afterMutationList = await listExisting();
const afterMutationFull = [];
for (const row of afterMutationList) afterMutationFull.push(await getTemplate(row.name));
const duplicateRemoved = [];
for (const t of templates) {
  const candidates = afterMutationFull.filter((doc) => doc && clean(doc.template_code) === clean(t.template_code));
  const exact = candidates.find((doc) => sameTemplate(t, doc));
  if (!exact) continue;
  for (const doc of candidates) {
    if (doc.name === exact.name) continue;
    if (clean(doc.source_status) !== 'DEFERRED') continue;
    // NGHỈ HƯU, KHÔNG XOÁ.
    //
    // Nền tảng từ chối `DELETE` với "Role is not allowed to delete BOM Template" — và nó từ chối
    // đúng: bản trùng này vẫn mang lịch sử nguồn (`source_status=DEFERRED`), xoá là mất hẳn.
    // `disabled` đạt cùng mục đích (thôi được dùng) mà giữ lại dấu vết.
    //
    // Phép kiểm bên dưới vì thế phải đếm bản ĐANG DÙNG, không đếm tất cả.
    await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}/${encodeURIComponent(doc.name)}`, {
      method: 'PUT',
      body: JSON.stringify({ disabled: 1, modified: doc.modified }),
      headers: { 'content-type': 'application/json' },
    });
    duplicateRemoved.push({template_code:t.template_code,name:doc.name,action:'disabled'});
  }
}

const postList = await listExisting();
const postFull = [];
for (const row of postList) postFull.push(await getTemplate(row.name));
const failures = [];
for (const t of templates) {
  // Chỉ đếm bản ĐANG DÙNG: bản trùng đã cho nghỉ hưu ở trên vẫn còn trong D1 (cố ý, để giữ dấu
  // vết), nên đếm cả nó thì phép kiểm luôn báo trùng.
  const active = (doc) => !(doc.disabled === 1 || doc.disabled === true || doc.disabled === '1');
  const matches = postFull.filter((doc) => doc && active(doc) && clean(doc.template_code) === clean(t.template_code) && sameTemplate(t, doc));
  if (matches.length !== 1) failures.push({ template_code: t.template_code, reason: matches.length ? 'duplicate_exact_persisted_template' : 'no_exact_persisted_template', match_count:matches.length });
}
if (failures.length) {
  writeFileSync(resultPath, `${JSON.stringify({ failures }, null, 2)}\n`);
  throw new Error(`ALUMDOOR_BOM_TEMPLATE_VERIFY_FAILED count=${failures.length}`);
}
const result = {
  format: 'alumdoor-bom-template-local-import-result/v2',
  payload: payloadPath,
  created_count: created.length,
  updated_count: updated.length,
  unchanged_count: unchanged.length,
  duplicate_removed_count: duplicateRemoved.length,
  template_count: templates.length,
  component_rule_count: templates.reduce((n, t) => n + t.component_rules.length, 0),
  verification_failure_count: 0,
  created, updated, unchanged, duplicate_removed:duplicateRemoved,
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_TEMPLATE_IMPORT_PASS created=${created.length} updated=${updated.length} unchanged=${unchanged.length} duplicates_removed=${duplicateRemoved.length} templates=${templates.length} rules=${result.component_rule_count}`);
