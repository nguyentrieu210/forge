#!/usr/bin/env node
/**
 * Áp quy ước mã hàng `docs/ALUMDOOR-QUY-UOC-MA.md` lên D1 local.
 *
 * Chỉ chạy lát AN TOÀN: mã đổi tên MỘT-ĐỔI-MỘT. Hai nhóm bị loại ra có chủ đích:
 *
 *   · mã nằm trong họ GỘP (nhiều mã cũ về một mã mới) — gộp là quyết định nghiệp vụ
 *     "hai mã này có phải cùng một mặt hàng không", máy không trả lời thay được;
 *   · mã mới dài quá 24 ký tự — rút gọn là ĐẶT TÊN, mà tên phải để xưởng đọc được.
 *
 * Đổi tên đi qua `frappe.client.rename_doc` với `cascade`, tức vẫn đi qua guard tham chiếu
 * của kernel. Không có câu SQL thô nào ở đây: nếu cascade bỏ sót một tham chiếu thì guard
 * ném lỗi và cả lệnh đổi tên đó không xảy ra.
 *
 * Sau khi đổi mã còn một việc bắt buộc: khoá đặt tên của `Item Price` NHÚNG mã hàng
 * (`{price_list}:{item_code}:{uom}:{price_variant}`). Bỏ qua bước này thì tên dòng giá còn ôm
 * mã đã chết, và lần chạy sau của importer giá sẽ tính ra tên khác rồi TẠO MỚI thay vì cập
 * nhật — 558 dòng giá trùng, pricing ném "Multiple active Item Price records match".
 */
import fs from 'node:fs';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const MAX_CODE_LENGTH = 24;
const args = process.argv.slice(2);
const outputPath = args.find((value) => !value.startsWith('--'));
const validateOnly = args.includes('--validate-only');
if (!outputPath) throw new Error('Usage: import-alumdoor-item-code-rename-local.mjs <output.json> [--validate-only]');

const mappingPath = new URL('../../docs/alumdoor-item-code-mapping.json', import.meta.url);
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
if (mapping.format !== 'alumdoor-item-code-mapping/v1') {
  throw new Error(`Refusing: unexpected mapping format ${mapping.format}`);
}

const sourcesByTarget = new Map();
for (const row of mapping.mapping) {
  if (!sourcesByTarget.has(row.to)) sourcesByTarget.set(row.to, []);
  sourcesByTarget.get(row.to).push(row.from);
}

const merged = [];
const tooLong = [];
const plan = [];
for (const row of mapping.mapping) {
  if (sourcesByTarget.get(row.to).length > 1) { merged.push(row); continue; }
  if (row.to.length > MAX_CODE_LENGTH) { tooLong.push(row); continue; }
  if (row.from === row.to) continue;
  plan.push({ from: row.from, to: row.to, prefix: row.prefix, why: row.why });
}

// Hai mã cũ không được cùng trỏ về một mã mới trong lát này — nếu có thì lát "1:1" không còn 1:1.
const targets = new Set();
for (const entry of plan) {
  if (targets.has(entry.to)) throw new Error(`Refusing: target ${entry.to} appears twice in the 1:1 slice`);
  targets.add(entry.to);
}
// Và mã mới không được đụng một mã cũ KHÔNG nằm trong kế hoạch, nếu không là đổi tên đè lên nhau.
const untouched = new Set(mapping.mapping.map((row) => row.from));
for (const entry of plan) untouched.delete(entry.from);
for (const entry of plan) {
  if (untouched.has(entry.to)) throw new Error(`Refusing: target ${entry.to} collides with an item left out of this slice`);
}

const summary = {
  format: 'alumdoor-item-code-rename/v1',
  source_count: mapping.mapping.length,
  planned_rename_count: plan.length,
  skipped_merged_family_count: merged.length,
  skipped_too_long_count: tooLong.length,
  max_code_length: MAX_CODE_LENGTH,
};

if (validateOnly) {
  fs.writeFileSync(outputPath, `${JSON.stringify({ ...summary, plan, skipped_too_long: tooLong }, null, 2)}\n`);
  console.log(`ALUMDOOR_ITEM_CODE_RENAME_PLAN planned=${plan.length} skipped_merged=${merged.length} skipped_too_long=${tooLong.length}`);
  process.exit(0);
}

assertLocalMutationChildContext(['item-code-rename']);

const origin = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
const parsedOrigin = new URL(origin);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedOrigin.hostname)) {
  throw new Error(`refusing: item code rename is local-only, got ${parsedOrigin.hostname}`);
}
const user = process.env.FORGE_ADMIN_USER || 'dev@example.com';
const password = process.env.FORGE_ADMIN_PASSWORD || '';
if (!password) throw new Error('FORGE_ADMIN_PASSWORD is required');

const jar = new Map();
let csrfToken = '';
function storeCookies(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  if (values.length === 0) {
    const combined = response.headers.get('set-cookie');
    if (combined) values.push(...combined.split(/,(?=[^;,]+=)/));
  }
  for (const value of values) {
    const [pair] = value.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join('; ');

async function request(pathname, { method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      'cache-control': 'no-cache',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...(csrfToken ? { 'x-frappe-csrf-token': csrfToken } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  storeCookies(response);
  csrfToken = response.headers.get('x-frappe-csrf-token') || csrfToken;
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* trả nguyên văn bên dưới */ }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const detail = parsed?.message ?? parsed?.exception ?? text.slice(0, 500);
    throw new Error(`${method} ${pathname} -> HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return parsed;
}

async function listNames(doctype) {
  const out = new Set();
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const payload = await request(
      `/api/resource/${encodeURIComponent(doctype)}?limit_start=${start}&limit_page_length=${pageSize}&fields=${encodeURIComponent('["name"]')}`,
    );
    const rows = payload?.data ?? [];
    for (const row of rows) out.add(row.name);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function renameOnce(doctype, oldName, newName, cascade) {
  return request('/api/method/frappe.client.rename_doc', {
    method: 'POST',
    body: { doctype, old_name: oldName, new_name: newName, ...(cascade ? { cascade: 1 } : {}) },
  });
}

/**
 * Tên dòng giá là bốn đoạn nối bằng dấu hai chấm, mã hàng ở đoạn thứ hai.
 *
 * Đã kiểm trên toàn bộ 558 dòng: 558 dòng đúng bốn đoạn, đoạn 1 đúng bằng `item_code`, và
 * không mã hàng nào chứa dấu hai chấm. Vì vậy cắt–ghép theo đoạn là phép biến đổi chứng minh
 * được, khác với dựng lại tên từ mẫu `format:` — dựng lại thì phải đoán cách nền tảng xử lý
 * đoạn rỗng ở đuôi, mà đoán sai là đổi tên hàng loạt sang tên sai.
 */
function renamedPriceName(name, renames) {
  const parts = name.split(':');
  if (parts.length !== 4) return null;
  const next = renames.get(parts[1]);
  if (!next) return null;
  parts[1] = next;
  return parts.join(':');
}

async function pass(label, renames) {
  const existing = await listNames('Item');
  let renamedItems = 0;
  let alreadyDone = 0;
  const missing = [];
  for (const [from, to] of renames) {
    if (!existing.has(from)) {
      if (existing.has(to)) { alreadyDone += 1; continue; }
      missing.push(from);
      continue;
    }
    if (existing.has(to)) throw new Error(`Refusing: both ${from} and ${to} exist; rename would collide`);
    await renameOnce('Item', from, to, true);
    renamedItems += 1;
  }
  if (missing.length > 0) {
    throw new Error(`Refusing: ${missing.length} planned items are absent and their target is absent too (first: ${missing.slice(0, 5).join(', ')})`);
  }

  const priceNames = await listNames('Item Price');
  let renamedPrices = 0;
  for (const name of priceNames) {
    const next = renamedPriceName(name, renames);
    if (!next || next === name) continue;
    if (priceNames.has(next)) throw new Error(`Refusing: Item Price ${next} already exists`);
    await renameOnce('Item Price', name, next, false);
    renamedPrices += 1;
  }

  console.log(`${label} items_renamed=${renamedItems} already=${alreadyDone} prices_renamed=${renamedPrices}`);
  return { items_renamed: renamedItems, already_renamed: alreadyDone, prices_renamed: renamedPrices };
}

async function verify(renames) {
  const items = await listNames('Item');
  const stale = [...renames.keys()].filter((from) => items.has(from));
  const arrived = [...renames.values()].filter((to) => items.has(to));
  const prices = await listNames('Item Price');
  const stalePrices = [...prices].filter((name) => renamedPriceName(name, renames) !== null);
  const failures = [];
  if (stale.length > 0) failures.push(`${stale.length} old item codes still present (first: ${stale.slice(0, 5).join(', ')})`);
  if (arrived.length !== renames.size) failures.push(`only ${arrived.length}/${renames.size} new item codes present`);
  if (stalePrices.length > 0) failures.push(`${stalePrices.length} Item Price names still carry an old code (first: ${stalePrices.slice(0, 3).join(', ')})`);
  return { item_count: items.size, price_count: prices.size, failures };
}

const renames = new Map(plan.map((entry) => [entry.from, entry.to]));

await request('/api/method/login', { method: 'POST', body: { usr: user, pwd: password } });

const first = await pass('LOCAL_RENAME_PASS_1', renames);
const verified = await verify(renames);
if (verified.failures.length > 0) {
  throw new Error(`Rename verification failed: ${verified.failures.join('; ')}`);
}

// Lần hai phải KHÔNG đổi gì. Đây là chỗ bắt được cascade ghi nửa vời: nếu tham chiếu chưa theo
// hết thì lần một để lại mã cũ đâu đó, và lần hai sẽ tìm thấy việc để làm.
const second = await pass('LOCAL_RENAME_PASS_2', renames);
if (second.items_renamed !== 0 || second.prices_renamed !== 0) {
  throw new Error(`Local idempotence failed: ${JSON.stringify(second)}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify({
  ...summary,
  pass1: first,
  pass2: second,
  verification: verified,
  verification_failure_count: verified.failures.length,
}, null, 2)}\n`);
console.log(`ALUMDOOR_LOCAL_ITEM_CODE_RENAME_IDEMPOTENCE_PASS renamed=${first.items_renamed} prices=${first.prices_renamed} items=${verified.item_count}`);
