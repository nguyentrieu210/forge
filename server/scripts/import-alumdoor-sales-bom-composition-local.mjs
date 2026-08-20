#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';
import {
  bomTemplateMetaCompositionGaps,
  buildSalesBomCompositionTemplates,
  salesBomCompositionSignature,
} from './lib/alumdoor-sales-bom-composition.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) {
  throw new Error('Usage: import-alumdoor-sales-bom-composition-local.mjs <bom-importable.json> <result.json> [--validate-only]');
}

const payloadPath = path.resolve(payloadArg);
const source = JSON.parse(readFileSync(payloadPath, 'utf8'));
const templates = buildSalesBomCompositionTemplates(source);
if (!templates.length) throw new Error('Sales BOM composition payload has no full-set parent Item');
const componentRuleCount = templates.reduce((sum, row) => sum + row.component_rules.length, 0);
console.log(`ALUMDOOR_SALES_BOM_COMPOSITION_PAYLOAD_VALID templates=${templates.length} component_rules=${componentRuleCount}`);
if (validateOnly) {
  console.log('ALUMDOOR_SALES_BOM_COMPOSITION_VALIDATE_ONLY_PASS');
  process.exit(0);
}

assertLocalMutationChildContext(['bom-template']);

const origin = (process.env.FORGE_ORIGIN ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing remote Sales BOM composition mutation: ${parsedOrigin.hostname}`);
}
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
    const index = pair.indexOf('=');
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}
function cookieHeader() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}
async function request(urlPath, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader();
  if (cookie) headers.set('cookie', cookie);
  if (csrfToken && options.method && options.method !== 'GET') headers.set('x-frappe-csrf-token', csrfToken);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${origin}${urlPath}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body),
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
  if (!result.response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${urlPath} failed (${result.response.status}): ${result.text}`);
  }
  return result.body;
}
function dataOf(body) {
  return body?.data ?? body?.message ?? body;
}
async function login() {
  await requireOk('/api/method/login', { method: 'POST', body: { usr: adminUser, pwd: adminPassword } });
  const boot = await requireOk('/api/method/metaforge.api.get_boot');
  const message = boot && typeof boot === 'object' && 'message' in boot ? boot.message : boot;
  csrfToken = message?.csrf_token ?? csrfToken;
  if (!csrfToken) throw new Error('login succeeded but boot returned no CSRF token');
}
async function listDocs(doctype, fields) {
  const all = [];
  const encodedFields = encodeURIComponent(JSON.stringify(fields));
  for (let start = 0; ; start += 100) {
    const body = await requireOk(`/api/resource/${encodeURIComponent(doctype)}?fields=${encodedFields}&limit_page_length=100&limit_start=${start}`);
    const rows = dataOf(body);
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}
async function getDoc(doctype, name) {
  const body = await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return dataOf(body);
}
async function deleteDoc(doctype, name) {
  await requireOk(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/**
 * CHỐT CHẶN TRƯỚC KHI XOÁ — bộ nhập này xoá SẠCH rồi mới ghi lại.
 *
 * Nền tảng TỪ CHỐI, không nuốt: trường lạ ném `Unknown field ...`
 * (frappe-model/src/generic-controller.ts:79) và giá trị Select ngoài options ném
 * `... must be one of the configured options` (cùng file, ~170) — kể cả Administrator, vì
 * `normalizeValue` không có cửa admin. Chạy trên một D1 chưa triển khai brief mới thì thứ tự
 * hiện tại là: xoá hết Bill of Materials + BOM Template → POST đầu tiên trả 4xx → `requireOk`
 * ném → D1 còn 0 template và 0 định mức. Mất dữ liệu vì một cột chưa deploy.
 *
 * Nên hỏi META trước khi đụng vào bất cứ thứ gì. `GET /api/resource/DocType/<tên>` trả
 * `toFrappeDocType` (frappe-api/src/meta-shape.ts:130) — có `fields[].fieldname` và
 * `fields[].options`. Đường đọc, không đổi trạng thái.
 */
async function assertBomTemplateMetaReady() {
  const meta = dataOf(await requireOk(`/api/resource/DocType/${encodeURIComponent('BOM Template')}`));
  const gaps = bomTemplateMetaCompositionGaps(meta);
  if (gaps.length) {
    throw new Error(`BOM Template trên D1 chưa khớp brief — ${gaps.join('; ')}. Triển khai brief trước; KHÔNG xoá gì cả.`);
  }
}

await login();
await assertBomTemplateMetaReady();
const existingTemplateRows = await listDocs('BOM Template', ['name', 'template_code', 'item_code', 'disabled', 'modified']);
const existingBomRows = await listDocs('Bill of Materials', ['name', 'item', 'docstatus', 'is_active', 'modified']);
const submittedBoms = existingBomRows.filter((row) => Number(row.docstatus) === 1);
if (submittedBoms.length) {
  throw new Error(`Refusing to delete ${submittedBoms.length} submitted Bill of Materials; cancel/archive them explicitly first.`);
}

const existingTemplates = [];
for (const row of existingTemplateRows) existingTemplates.push(await getDoc('BOM Template', row.name));
/**
 * Gom theo `template_code`, KHÔNG theo `item_code`.
 *
 * Hôm nay hai khoá bằng nhau nên phép kiểm không đổi. Nhưng mục tiêu của cả luồng là một mặt
 * hàng giữ HAI danh sách cấu thành; lúc đó gom theo `item_code` làm hai template rơi vào một
 * rổ, `candidates.length === 1` sai, và bộ nhập báo `template_count_mismatch` cho chính thứ nó
 * vừa cố tình dựng ra. Gom theo khoá tách sẵn thì mỗi (mặt hàng, cách giao) vẫn phải đúng một
 * bản — giữ nguyên sức mạnh của phép kiểm.
 */
const templateKeyOf = (row) => String(row?.template_code ?? row?.item_code ?? '').normalize('NFC').trim();
const expectedByParent = new Map(templates.map((row) => [templateKeyOf(row), salesBomCompositionSignature(row)]));
if (expectedByParent.size !== templates.length) {
  throw new Error(`Sales BOM composition có template_code trùng: ${templates.length} template nhưng chỉ ${expectedByParent.size} khoá phân biệt.`);
}
const existingByParent = new Map();
for (const row of existingTemplates) {
  const parent = templateKeyOf(row);
  const list = existingByParent.get(parent) ?? [];
  list.push(row);
  existingByParent.set(parent, list);
}
const alreadyExact = existingBomRows.length === 0
  && existingTemplates.length === templates.length
  && [...expectedByParent.entries()].every(([parent, signature]) => {
    const candidates = existingByParent.get(parent) ?? [];
    return candidates.length === 1 && salesBomCompositionSignature(candidates[0]) === signature;
  });

const resultPath = path.resolve(resultArg);
mkdirSync(path.dirname(resultPath), { recursive: true });
if (alreadyExact) {
  const result = {
    format: 'alumdoor-sales-bom-composition-local-import-result/v1',
    payload: payloadPath,
    created_count: 0,
    unchanged_count: templates.length,
    deleted_template_count: 0,
    deleted_bom_count: 0,
    template_count: templates.length,
    component_rule_count: componentRuleCount,
    verification_failure_count: 0,
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`ALUMDOOR_SALES_BOM_COMPOSITION_IMPORT_PASS created=0 unchanged=${templates.length} deleted_templates=0 deleted_boms=0`);
  process.exit(0);
}

const existingBoms = [];
for (const row of existingBomRows) existingBoms.push(await getDoc('Bill of Materials', row.name));
const preimagePath = path.join(path.dirname(resultPath), 'sales-bom-preimage.json');
writeFileSync(preimagePath, `${JSON.stringify({
  format: 'alumdoor-sales-bom-preimage/v1',
  captured_at: new Date().toISOString(),
  origin,
  bom_templates: existingTemplates,
  bills_of_materials: existingBoms,
}, null, 2)}\n`);
console.log(`ALUMDOOR_SALES_BOM_PREIMAGE_WRITTEN path=${preimagePath} templates=${existingTemplates.length} boms=${existingBoms.length}`);

for (const row of existingBomRows) await deleteDoc('Bill of Materials', row.name);
for (const row of existingTemplateRows) await deleteDoc('BOM Template', row.name);

const created = [];
for (const template of templates) {
  const body = await requireOk(`/api/resource/${encodeURIComponent('BOM Template')}`, { method: 'POST', body: template });
  const document = dataOf(body);
  created.push({ item_code: template.item_code, name: document?.name ?? null });
}

const postBomRows = await listDocs('Bill of Materials', ['name']);
const postTemplateRows = await listDocs('BOM Template', ['name', 'item_code', 'template_code']);
const postTemplates = [];
for (const row of postTemplateRows) postTemplates.push(await getDoc('BOM Template', row.name));
const postByParent = new Map();
for (const row of postTemplates) {
  const parent = templateKeyOf(row);
  const list = postByParent.get(parent) ?? [];
  list.push(row);
  postByParent.set(parent, list);
}
const failures = [];
if (postBomRows.length) failures.push({ reason: 'bill_of_materials_not_empty', count: postBomRows.length });
for (const [parent, signature] of expectedByParent) {
  const candidates = postByParent.get(parent) ?? [];
  if (candidates.length !== 1) failures.push({ template_code: parent, reason: 'template_count_mismatch', count: candidates.length });
  else if (salesBomCompositionSignature(candidates[0]) !== signature) failures.push({ template_code: parent, reason: 'composition_signature_mismatch' });
}
if (postTemplates.length !== templates.length) {
  failures.push({ reason: 'global_template_count_mismatch', expected: templates.length, actual: postTemplates.length });
}

const result = {
  format: 'alumdoor-sales-bom-composition-local-import-result/v1',
  payload: payloadPath,
  preimage_path: preimagePath,
  created_count: created.length,
  unchanged_count: 0,
  deleted_template_count: existingTemplateRows.length,
  deleted_bom_count: existingBomRows.length,
  template_count: templates.length,
  component_rule_count: componentRuleCount,
  verification_failure_count: failures.length,
  created,
  failures,
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) throw new Error(`ALUMDOOR_SALES_BOM_COMPOSITION_VERIFY_FAILED count=${failures.length}`);
console.log(`ALUMDOOR_SALES_BOM_COMPOSITION_IMPORT_PASS created=${created.length} unchanged=0 deleted_templates=${existingTemplateRows.length} deleted_boms=${existingBomRows.length}`);
