#!/usr/bin/env node
/**
 * Hội tụ danh mục THEO TẦNG: kéo D1 về đúng những gì brief khai, từng đợt một.
 *
 * Vì sao theo tầng chứ không một lượt: L0 là nền của L1, L1 là nền của L2… Sửa L2 khi L0 còn
 * lệch thì sửa xong lại phải sửa lại. Đi từ dưới lên, mỗi đợt đóng lại một tầng.
 *
 * Nguyên tắc chung, áp cho mọi tầng:
 *
 *   · NGHỈ HƯU, KHÔNG XOÁ. Nền tảng từ chối gỡ một fixture đã khai, và xoá thì mất luôn dấu vết
 *     bản ghi từng tồn tại. `disabled` giữ được cả hai.
 *   · CHỈ ĐỘNG VÀO THỨ KHÔNG AI DÙNG. Một bản ghi rác mà đang được chứng từ tham chiếu thì không
 *     còn là rác — nó là dữ liệu, và phải để người quyết.
 *   · BRIEF LÀ NGUỒN. Bản ghi có trong D1 mà không có trong brief là thứ lọt vào từ lúc dựng
 *     máy, không phải thứ ai đó cố ý khai.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const args = process.argv.slice(2);
const outputPath = args.find((value) => !value.startsWith('--'));
const validateOnly = args.includes('--validate-only');
const layer = (args.find((value) => value.startsWith('--layer='))?.slice('--layer='.length) || 'L0').toUpperCase();
if (!outputPath) throw new Error('Usage: import-alumdoor-layer-converge-local.mjs <output.json> [--layer=L0] [--validate-only]');

const brief = JSON.parse(fs.readFileSync(new URL('../briefs/alumdoor-v2.json', import.meta.url), 'utf8'));
const fixtureNames = (type) => new Set((brief.fixtures ?? []).filter((row) => row.type === type).map((row) => row.name));
const fixtureData = (type) => new Map((brief.fixtures ?? []).filter((row) => row.type === type).map((row) => [row.name, row.data ?? {}]));

/**
 * Việc của từng tầng.
 *
 * `retireUndeclared`: doctype nào mà bản ghi ngoài brief thì cho ngừng dùng — nhưng chỉ khi
 * không chứng từ nào nhắc tới. `alignFields`: trường nào phải khớp lại với brief.
 */
const LAYER_PLAN = {
  L0: {
    retireUndeclared: ['Warehouse'],
    alignFields: { Warehouse: ['warehouse_name', 'parent_warehouse'] },
  },
  L1: { retireUndeclared: [], alignFields: {} },
  L2: { retireUndeclared: [], alignFields: {} },
  L3: { retireUndeclared: [], alignFields: {} },
  L4: { retireUndeclared: [], alignFields: {} },
  L5: { retireUndeclared: [], alignFields: {} },
  L6: { retireUndeclared: [], alignFields: {} },
};
const plan = LAYER_PLAN[layer];
if (!plan) throw new Error(`Tầng không hợp lệ: ${layer}`);

if (validateOnly) {
  fs.writeFileSync(outputPath, `${JSON.stringify({ format: 'alumdoor-layer-converge/v1', layer, plan }, null, 2)}\n`);
  console.log(`ALUMDOOR_LAYER_CONVERGE_PLAN layer=${layer} retire_doctypes=${plan.retireUndeclared.length} align_doctypes=${Object.keys(plan.alignFields).length}`);
  process.exit(0);
}

assertLocalMutationChildContext(['layer-converge']);

const origin = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(origin).hostname)) {
  throw new Error(`refusing: layer converge is local-only, got ${new URL(origin).hostname}`);
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
async function request(pathname, { method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      'cache-control': 'no-cache',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
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
    const detail = parsed?.message ?? parsed?.exception ?? text.slice(0, 400);
    throw new Error(`${method} ${pathname} -> HTTP ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  return parsed;
}

// API chặn cứng 100 dòng/trang; đi theo số dòng THỰC NHẬN, dừng khi rỗng.
const PAGE_SIZE = 100;
async function listAll(doctype, fields = ['name']) {
  const out = [];
  for (let start = 0; ; ) {
    const payload = await request(
      `/api/resource/${encodeURIComponent(doctype)}?limit_start=${start}&limit_page_length=${PAGE_SIZE}&fields=${encodeURIComponent(JSON.stringify(fields))}`,
    );
    const rows = payload?.data ?? [];
    if (rows.length === 0) break;
    out.push(...rows);
    start += rows.length;
  }
  return out;
}
const readDoc = async (doctype, name) => {
  const payload = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { allow404: true });
  return payload?.data ?? payload?.message ?? payload ?? null;
};
const saveDoc = (doctype, name, patch) => request(
  `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
  { method: 'PUT', body: patch },
);

await request('/api/method/login', { method: 'POST', body: { usr: user, pwd: password } });

/**
 * Bản ghi này có ai nhắc tới không?
 *
 * Đếm bằng cách soi giá trị lá của mọi chứng từ, và BỎ QUA chính bản ghi đó. Thô nhưng đúng
 * hướng thận trọng: thà giữ lại một bản ghi rác còn hơn cho nghỉ hưu một bản ghi đang dùng.
 */
async function buildReferenceIndex(excludeDoctype) {
  const counts = new Map();
  for (const meta of brief.doctypes ?? []) {
    if (meta.is_child) continue;
    let rows;
    try { rows = await listAll(meta.name, ['name']); } catch { continue; }
    if (rows.length === 0) continue;
    for (const row of rows) {
      const doc = await readDoc(meta.name, row.name);
      if (!doc) continue;
      const seen = new Set();
      (function walk(value) {
        if (typeof value === 'string') { seen.add(value); return; }
        if (Array.isArray(value)) { for (const entry of value) walk(entry); return; }
        if (value && typeof value === 'object') for (const entry of Object.values(value)) walk(entry);
      })(doc);
      for (const value of seen) {
        if (meta.name === excludeDoctype && value === row.name) continue;
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const retired = [];
const keptBecauseUsed = [];
const aligned = [];

for (const doctype of plan.retireUndeclared) {
  const declared = fixtureNames(doctype);
  const rows = await listAll(doctype, ['name']);
  const references = await buildReferenceIndex(doctype);
  for (const row of rows) {
    if (declared.has(row.name)) continue;
    const doc = await readDoc(doctype, row.name);
    if (!doc || doc.disabled === 1 || doc.disabled === true) continue;
    const used = references.get(row.name) ?? 0;
    if (used > 0) { keptBecauseUsed.push({ doctype, name: row.name, referenced_by: used }); continue; }
    await saveDoc(doctype, row.name, { disabled: 1, modified: doc.modified });
    retired.push({ doctype, name: row.name });
  }
}

for (const [doctype, fields] of Object.entries(plan.alignFields)) {
  const declared = fixtureData(doctype);
  for (const [name, data] of declared) {
    const doc = await readDoc(doctype, name);
    if (!doc) continue;
    const patch = {};
    for (const field of fields) {
      const want = data[field];
      if (want === undefined) continue;
      if (String(doc[field] ?? '') === String(want)) continue;
      patch[field] = want;
    }
    if (Object.keys(patch).length === 0) continue;
    aligned.push({ doctype, name, changes: { ...patch } });
    await saveDoc(doctype, name, { ...patch, modified: doc.modified });
  }
}

fs.writeFileSync(outputPath, `${JSON.stringify({
  format: 'alumdoor-layer-converge/v1',
  layer,
  retired_count: retired.length,
  aligned_count: aligned.length,
  kept_because_used: keptBecauseUsed,
  retired,
  aligned,
}, null, 2)}\n`);

if (keptBecauseUsed.length > 0) {
  console.log(`ALUMDOOR_LAYER_CONVERGE_KEPT count=${keptBecauseUsed.length} ${keptBecauseUsed.map((row) => `${row.name}(${row.referenced_by})`).join(' ')}`);
}
console.log(`ALUMDOOR_LOCAL_LAYER_CONVERGE_PASS layer=${layer} retired=${retired.length} aligned=${aligned.length} kept=${keptBecauseUsed.length}`);
