#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';
import { canonicalAlumdoorUom } from './lib/alumdoor-uom-catalog.mjs';
import { salesModeTemplateKeys } from './lib/alumdoor-sales-bom-composition.mjs';

const [payloadArg, resultArg, modeArg] = process.argv.slice(2);
const validateOnly = modeArg === '--validate-only';
if (!payloadArg || (!validateOnly && !resultArg)) throw new Error('Usage: import-alumdoor-bom-template-local.mjs <bom-importable.json> <result.json> [--validate-only]');
const payloadPath = path.resolve(payloadArg);
const source = JSON.parse(readFileSync(payloadPath, 'utf8'));
if (source?.format !== 'alumdoor-canonical-bom-importable/v2' || !Array.isArray(source.boms)) throw new Error('Expected alumdoor-canonical-bom-importable/v2');

const clean = (v) => String(v ?? '').normalize('NFC').trim();
const pendingOf = (bom) => Array.isArray(bom.pending_lines) ? bom.pending_lines : (Array.isArray(bom.blank_lines) ? bom.blank_lines : []);
/** Bản ĐANG DÙNG. Dùng chung cho cả bước chọn ứng viên lẫn phép kiểm cuối — hai chỗ lệch nhau
 *  là cách một bản đã nghỉ hưu bị chọn làm đích đổi tên rồi không bao giờ bật lại. */
const active = (doc) => !(doc?.disabled === 1 || doc?.disabled === true || doc?.disabled === '1');
const salesModeKeys = salesModeTemplateKeys(source.boms);

function buildTemplate(bom) {
  const pending = pendingOf(bom);
  if (!pending.length) return null;
  const templateCode = salesModeKeys.templateCode(bom);
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
      // Khoá cấu phần theo TEMPLATE, không theo mặt hàng — cùng lý do với bản COMPOSITION:
      // một mặt hàng hai định mức thì hai luật khác nội dung không được mang cùng `rule_code`.
      rule_code: `${templateCode}:SRC-${line.source_row ?? index + 1}`,
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
  /**
   * Cách giao đi lên BẢN GHI — nhưng CHỈ khi nó là thứ phân biệt hai bản ghi của cùng mặt hàng.
   *
   * `salesModeTemplateKeys` đo trên chính lô đang nhập: mặt hàng nào xuất hiện với HAI cách
   * giao thì mới được khai cột và tách khoá. Lý do là một lỗi chặn vận hành đo được:
   * `parseBomTemplateRecord` gộp cột `sales_mode` vào `conditions` (materializer:228), nên ghi
   * cột lên template DEFERRED biến `conditions` từ RỖNG thành `{sales_mode:"Tách món"}` cho 6
   * mã tách món; dòng bán để trống Cách giao thì worker bơm `"Trọn bộ"`
   * (sales-production-core.ts:1200) và `chooseTemplate` không còn ứng viên nào ⇒ 6 mặt hàng đó
   * dựng BOM là NÉM LỖI. Đã chạy thật hai bản: bản không cột OK, bản có cột THROW.
   *
   * Với nguồn hôm nay mỗi cách giao vẫn là một MÃ HÀNG riêng (100/358 mã cha nhồi cách giao,
   * không mã nào có hai), nên `sales_mode_count` = 0 và không khoá nào bị đổi. Con số đó chính
   * là thước đo: nó chỉ lớn hơn 0 sau khi gộp mã, đúng lúc cột là thứ duy nhất còn phân biệt.
   *
   * Chỉ ghi CỘT `sales_mode`, không ghi thêm vào `conditions_json`: `bom-template-materializer.ts`
   * đã gộp cột vào `conditions` (và ném lỗi nếu hai chỗ lệch), nên viết hai chỗ ở đây chỉ tạo
   * thêm một nguồn sự thật để trôi dạt. Bản `COMPOSITION` phải viết cả hai vì nó ĐÃ có
   * `conditions_json` khai `item_code`.
   */
  const salesMode = salesModeKeys.declaredMode(bom);
  return {
    doctype: 'BOM Template',
    template_code: templateCode,
    item_code: bom.item,
    ...(salesMode ? { sales_mode: salesMode } : {}),
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
// `template_code` phải phân biệt được từng template, và chính BỘ NHẬP NÀY là chỗ ép điều đó —
// nền tảng thì KHÔNG: cờ `unique` của `template_code:Data*!` chỉ được phân tích và phơi ra cho
// client, không chỗ nào trong `packages/` đọc nó lúc ghi (ràng buộc SQL duy nhất là
// `UNIQUE (tenant_id, doctype, name)`, mà `name` là số tự tăng). Hai template cùng khoá vì thế
// vào D1 êm ru rồi làm hỏng `existingByCode` và phép kiểm cuối file ở lượt chạy SAU.
// Bắt ở đây, trước khi POST, để lỗi chỉ đúng hai mã đang đụng.
const byTemplateCode = new Map();
for (const t of templates) {
  const previous = byTemplateCode.get(t.template_code);
  if (previous) throw new Error(`BOM Template code trùng: ${t.template_code} dùng cho cả ${previous} và ${t.item_code}`);
  byTemplateCode.set(t.template_code, t.item_code);
}
const salesModeCount = templates.filter((t) => t.sales_mode).length;
console.log(`ALUMDOOR_BOM_TEMPLATE_PAYLOAD_VALID templates=${templates.length} component_rules=${templates.reduce((n,t)=>n+t.component_rules.length,0)} sales_mode=${salesModeCount}`);
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
/**
 * Chỗ lệch đầu tiên giữa bản mong muốn và bản đã ghi — trả tên trường, không trả boolean.
 *
 * ĐÍNH CHÍNH bản viết trước: nền tảng KHÔNG nuốt trường lạ, nó TỪ CHỐI —
 * `generic-controller.ts:79` ném `Unknown field BOM Template.sales_mode`. Nên khi brief chưa
 * triển khai xuống D1, lỗi nổ ngay ở POST/PUT chứ không âm thầm lệch, và nhánh
 * `first_mismatch:'sales_mode'` bên dưới KHÔNG chạy tới trong tình huống đó.
 *
 * Vẫn giữ tên trường vì nó có ích cho các lệch khác (khoá vừa đổi, `deferred_components_json`
 * trôi): một câu chẩn đoán đọc được thay cho vòng lặp "update mãi không xong".
 */
function templateMismatch(expected, actual) {
  if (!actual) return 'missing';
  if (clean(actual.item_code) !== clean(expected.item_code)) return 'item_code';
  if (clean(actual.template_code) !== clean(expected.template_code)) return 'template_code';
  if (clean(actual.sales_mode) !== clean(expected.sales_mode ?? '')) return 'sales_mode';
  if (clean(actual.source_status) !== 'DEFERRED') return 'source_status';
  if (normalizedDeferred(actual.deferred_components_json) !== normalizedDeferred(expected.deferred_components_json)) return 'deferred_components_json';
  return '';
}
function sameTemplate(expected, actual) {
  return templateMismatch(expected, actual) === '';
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
/**
 * Nhận lại bản ghi CŨ khi khoá vừa đổi — đổi tên tại chỗ, không đẻ bản mới.
 *
 * Trước thay đổi này `template_code` bằng đúng mã hàng. Bản ghi cũ vì thế mang khoá trần
 * (`X`), còn bản mong muốn mang khoá tách theo cách giao (`X#TRONBO`). Không nhận lại thì mỗi
 * mặt hàng có cách giao sinh thêm MỘT bản ghi mới, còn bản cũ ở lại và vẫn ĐANG DÙNG với
 * `conditions` rỗng — mà `conditions` rỗng khớp MỌI ngữ cảnh, nên nó cạnh tranh ngang hàng và
 * tuỳ `modified` mà thắng. Đúng kiểu hỏng im lặng.
 *
 * Chỉ nhận bản cũ chưa khai `sales_mode` (tức có trước thay đổi này), và mỗi bản chỉ được nhận
 * MỘT lần, để hai cách giao của cùng mặt hàng không cùng giành một bản ghi.
 *
 * Và chỉ nhận bản ĐANG DÙNG. Vòng nghỉ hưu bên dưới để lại bản `disabled=1` mang đúng khoá
 * trần đó; nhận nhầm nó làm đích thì PUT chỉ đổi `template_code` — thân PUT không có `disabled`
 * nên bản ghi vẫn ngừng dùng — rồi vòng nghỉ hưu tắt nốt bản thật, và phép kiểm cuối file (chỉ
 * đếm bản đang dùng) báo `no_exact_persisted_template` và thoát 1. Fail-closed, nhưng D1 hỏng
 * và phải sửa tay. Dùng chung vị từ `active` với phép kiểm để hai chỗ không lệch nữa.
 */
const claimedLegacy = new Set();
function legacyCandidates(template) {
  const legacyCode = clean(template.item_code);
  if (!template.sales_mode || legacyCode === clean(template.template_code)) return [];
  return (existingByCode.get(legacyCode) ?? [])
    .filter((doc) => active(doc) && !clean(doc.sales_mode) && !claimedLegacy.has(doc.name));
}
const plans = [];
for (const t of templates) {
  let candidates = existingByCode.get(clean(t.template_code)) ?? [];
  if (!candidates.length) {
    candidates = legacyCandidates(t);
    if (candidates.length) claimedLegacy.add(candidates[0].name);
  }
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
const retiredNames = new Set();
for (const t of templates) {
  /**
   * Bản CŨ mang khoá trần cũng là bản thừa, không chỉ bản trùng khoá mới.
   *
   * Nếu một lượt chạy trước đã tạo `X#TRONBO` mà bản `X` vẫn còn (ví dụ lượt đó đứt giữa
   * chừng), thì `X` ở lại và ĐANG DÙNG với `conditions` RỖNG. `matchesConditions` coi điều
   * kiện rỗng là khớp MỌI ngữ cảnh, nên `X` cạnh tranh ngang hàng với bản có cách giao và
   * `chooseTemplate` ném "có 2 BOM Template cùng mức" — hoặc tệ hơn, `X` thắng nhờ `modified`.
   * Chỉ nhận bản chưa khai `sales_mode` để không bao giờ đụng vào bản của cách giao còn lại.
   */
  const legacyCode = t.sales_mode ? clean(t.item_code) : '';
  const candidates = afterMutationFull.filter((doc) => doc
    && (clean(doc.template_code) === clean(t.template_code)
      || (legacyCode && clean(doc.template_code) === legacyCode && !clean(doc.sales_mode))));
  const exact = candidates.find((doc) => sameTemplate(t, doc));
  if (!exact) continue;
  for (const doc of candidates) {
    if (doc.name === exact.name) continue;
    if (clean(doc.source_status) !== 'DEFERRED') continue;
    // Một mặt hàng hai cách giao thì CẢ HAI template cùng nhận ra bản khoá trần là bản thừa.
    // Ghi `disabled` hai lần thì lần sau đứt vì `modified` đã cũ (khoá lạc quan của nền tảng).
    if (retiredNames.has(doc.name)) continue;
    retiredNames.add(doc.name);
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
  // vết), nên đếm cả nó thì phép kiểm luôn báo trùng. `active` khai ở đầu file, dùng chung với
  // `legacyCandidates`.
  const sameCode = postFull.filter((doc) => doc && active(doc) && clean(doc.template_code) === clean(t.template_code));
  const matches = sameCode.filter((doc) => sameTemplate(t, doc));
  if (matches.length !== 1) {
    failures.push({
      template_code: t.template_code,
      reason: matches.length ? 'duplicate_exact_persisted_template' : 'no_exact_persisted_template',
      match_count: matches.length,
      // Trường lệch đầu tiên của bản ghi cùng khoá — nói thẳng ra `sales_mode` khi brief chưa
      // triển khai xuống D1, thay vì để người đọc đoán giữa năm khả năng.
      ...(matches.length ? {} : { first_mismatch: sameCode.length ? templateMismatch(t, sameCode[0]) : 'missing' }),
    });
  }
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
  // Con số phải theo dõi qua từng đợt, và nó ĐANG PHẢI LÀ 0.
  //
  // Bằng 0 nghĩa là chưa mã nào được gộp: mỗi cách giao vẫn là một mặt hàng riêng (181 template
  // dựng từ nguồn hôm nay, 100 trong đó có mã nhồi cách giao, 0 mã mang hai cách giao). Nó chỉ
  // lớn hơn 0 sau đợt gộp mã, và khi đó nó đếm đúng số template mà cách giao là thứ DUY NHẤT
  // phân biệt được — tức mức độ fact đã rời khỏi mã hàng và lên bản ghi.
  sales_mode_count: salesModeCount,
  verification_failure_count: 0,
  created, updated, unchanged, duplicate_removed:duplicateRemoved,
};
writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`ALUMDOOR_BOM_TEMPLATE_IMPORT_PASS created=${created.length} updated=${updated.length} unchanged=${unchanged.length} duplicates_removed=${duplicateRemoved.length} templates=${templates.length} rules=${result.component_rule_count} sales_mode=${salesModeCount}`);
