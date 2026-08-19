#!/usr/bin/env node
/**
 * Vá các liên kết treo mà audit nền tảng đo được.
 *
 * Link trong hệ này nằm trong JSON, không có khoá ngoại, nên không gì chặn một giá trị trỏ vào
 * hư không. Hai nhóm còn lại sau khi đã khai `billable_area_sqm`:
 *
 *  A. 3 `BOM Rule.result_uom` mang TỈ SỐ chứ không mang đơn vị: "KG/CÁI", "KG/CẶP", "KG/M2".
 *     Ô đó là Link(UOM) nên tỉ số không bao giờ khớp được. Bản thân giá trị là hằng số kg cho
 *     mỗi đơn vị kia (`result_kind=CONSTANT`, ví dụ nguồn ghi "1 bộ x 4 cặpx0,1925").
 *     Sửa: đơn vị kết quả là `Kg`, còn MẪU SỐ chép sang `source_note` để không mất bằng chứng.
 *
 *  B. 2 `Bill of Materials.item` trỏ vào mã hàng không tồn tại: `TP-CUADL1LY-XN-VK_TRONBO_3-4M`
 *     trong khi mã thật là `TP-CUADL1LY XN-VK_TRONBO_3-4m²` — gạch ngang thay dấu cách, và `M`
 *     thay `m²`. Ai đó gõ tay, và mã có dấu cách là thứ mời gọi đúng lỗi này.
 *     Sửa: dò lại theo dạng CHUẨN HOÁ và chỉ nhận khi ra ĐÚNG MỘT ứng viên.
 */
import fs from 'node:fs';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';

const args = process.argv.slice(2);
const outputPath = args.find((value) => !value.startsWith('--'));
const validateOnly = args.includes('--validate-only');
if (!outputPath) throw new Error('Usage: import-alumdoor-catalog-link-repair-local.mjs <output.json> [--validate-only]');

const RATIO_UOM = /^KG\s*\/\s*(.+)$/i;
const RESULT_UOM = 'Kg';

/**
 * Dạng chuẩn hoá để dò lại mã hàng gõ tay.
 *
 * Bỏ mọi thứ không phải chữ-số rồi viết hoa: `TP-CUADL1LY-XN-VK_TRONBO_3-4M` và
 * `TP-CUADL1LY XN-VK_TRONBO_3-4m²` cùng về `TPCUADL1LYXNVKTRONBO34M`. Đây là phép dò CÓ THỂ
 * nhập nhằng, nên bên dưới chỉ chấp nhận khi ra đúng một ứng viên — nhiều hơn một thì để người
 * quyết, vì gán nhầm định mức cho mặt hàng khác là sai vật tư cả lô.
 */
function normalizeCode(code) {
  return String(code).normalize('NFC').replace(/m²/gi, 'M').replace(/[^0-9A-Za-zÀ-ỹ]/g, '').toUpperCase();
}

if (validateOnly) {
  fs.writeFileSync(outputPath, `${JSON.stringify({ format: 'alumdoor-catalog-link-repair/v1', mode: 'validate-only' }, null, 2)}\n`);
  console.log('ALUMDOOR_LINK_REPAIR_PLAN mode=validate-only');
  process.exit(0);
}

assertLocalMutationChildContext(['link-repair']);

const origin = (process.env.FORGE_ORIGIN || 'http://127.0.0.1:8799').replace(/\/$/, '');
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(origin).hostname)) {
  throw new Error(`refusing: link repair is local-only, got ${new URL(origin).hostname}`);
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

// API chặn cứng 100 dòng mỗi trang; đi theo số dòng THỰC NHẬN, dừng khi rỗng.
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

// ── A. đơn vị kết quả mang tỉ số ────────────────────────────────────────────
// CHỈ đơn vị đang dùng. Lấy cả bản đã ngừng dùng thì `Thùng` trông vẫn hợp lệ — mà nó bị gỡ
// đúng vì E07 cấm, nên ô chọn sẽ không mời nó ra và dòng bán vẫn kẹt. Audit đếm theo bản đang
// dùng; importer phải đếm cùng một kiểu, không thì hai bên nói hai đằng.
const uomNames = new Set(
  (await listAll('UOM', ['name', 'disabled']))
    .filter((row) => !(row.disabled === 1 || row.disabled === true))
    .map((row) => row.name),
);
if (!uomNames.has(RESULT_UOM)) throw new Error(`Refusing: đơn vị ${RESULT_UOM} không có trong danh mục`);

const ruleFixes = [];
for (const row of await listAll('BOM Rule')) {
  const doc = await readDoc('BOM Rule', row.name);
  const current = String(doc?.result_uom ?? '');
  const match = RATIO_UOM.exec(current);
  if (!match) continue;
  const denominator = match[1].trim();
  const note = String(doc?.source_note ?? '').trim();
  const evidence = `Đơn vị nguồn ghi "${current}" — hằng số ${doc?.formula_display ?? '?'} là kg cho mỗi ${denominator}.`;
  ruleFixes.push({
    name: row.name,
    from: current,
    to: RESULT_UOM,
    patch: {
      result_uom: RESULT_UOM,
      source_note: note ? `${note}\n${evidence}` : evidence,
      modified: doc?.modified,
    },
  });
}

// ── B. định mức trỏ vào mã hàng không tồn tại ───────────────────────────────
const itemNames = (await listAll('Item')).map((row) => row.name);
const itemsByNormalized = new Map();
for (const name of itemNames) {
  const key = normalizeCode(name);
  if (!itemsByNormalized.has(key)) itemsByNormalized.set(key, []);
  itemsByNormalized.get(key).push(name);
}
const itemSet = new Set(itemNames);

const bomFixes = [];
const bomConflicts = [];
const bomUnresolved = [];

// Định mức của mặt hàng nào đã có rồi thì biết, để không tạo ra hai định mức cho một mặt hàng.
const bomByItem = new Map();
for (const row of await listAll('Bill of Materials', ['name', 'item'])) {
  const key = String(row.item ?? '');
  if (!key) continue;
  if (!bomByItem.has(key)) bomByItem.set(key, []);
  bomByItem.get(key).push(row.name);
}

for (const row of await listAll('Bill of Materials')) {
  const doc = await readDoc('Bill of Materials', row.name);
  const target = String(doc?.item ?? '');
  if (!target || itemSet.has(target)) continue;
  const candidates = itemsByNormalized.get(normalizeCode(target)) ?? [];
  if (candidates.length !== 1) {
    bomUnresolved.push({ name: row.name, item: target, candidate_count: candidates.length });
    continue;
  }
  const resolved = candidates[0];
  const existing = bomByItem.get(resolved) ?? [];
  if (existing.length > 0) {
    /**
     * Mặt hàng đích ĐÃ CÓ định mức riêng, nên sửa trỏ sẽ thành hai định mức cho một mặt hàng —
     * tệ hơn hiện trạng. Mà cũng không xoá được cái mồ côi: đo ra nó mang SỐ LƯỢNG THẬT
     * (1.312, 11.64) trong khi cái đang gắn đúng mặt hàng để trống 3/4 dòng. Cái nào là bản
     * chuẩn thì chỉ chủ xưởng trả lời được.
     */
    bomConflicts.push({
      name: row.name,
      dead_item: target,
      resolves_to: resolved,
      existing_bom: existing,
      note: 'Mặt hàng đích đã có định mức; hai bản khác nhau về số lượng nên cần chủ xưởng chọn bản chuẩn.',
    });
    continue;
  }
  bomFixes.push({ name: row.name, from: target, to: resolved, patch: { item: resolved, modified: doc?.modified } });
}
if (bomUnresolved.length > 0) {
  throw new Error(`Refusing: ${bomUnresolved.length} định mức trỏ vào mã không tồn tại mà dò không ra đúng một ứng viên: ${JSON.stringify(bomUnresolved.slice(0, 5))}`);
}

// ── C. đơn vị bán mặc định trỏ vào đơn vị đã gỡ ────────────────────────────
//
// `NHOM-LAMAU-PHE` còn để `default_sales_uom = "Thùng"`, mà `Thùng` đã bị gỡ khỏi danh mục đơn
// vị (E07 cấm). Ô chọn sẽ không tìm ra giá trị đó, nên dòng bán mặt hàng này kẹt ngay từ đầu.
//
// Quay về `stock_uom` chứ không đoán: đơn vị tồn kho luôn hợp lệ, và ở ca này nó cũng đúng bằng
// `default_purchase_uom` — tức cả mua lẫn tồn đều là Kg, chỉ mỗi ô bán lạc.
const uomFix = [];
for (const row of await listAll('Item', ['name'])) {
  const doc = await readDoc('Item', row.name);
  const current = String(doc?.default_sales_uom ?? '');
  if (!current || uomNames.has(current)) continue;
  const fallback = String(doc?.stock_uom ?? '');
  if (!fallback || !uomNames.has(fallback)) {
    throw new Error(`Refusing: ${row.name}.default_sales_uom=${current} không hợp lệ và stock_uom=${fallback} cũng không cứu được`);
  }
  uomFix.push({ name: row.name, from: current, to: fallback, patch: { default_sales_uom: fallback, modified: doc?.modified } });
}

// ── ghi ──────────────────────────────────────────────────────────────────────
//
// Mọi phép kiểm ở trên đã chạy xong TRƯỚC dòng này. Bản đầu gộp kiểm với ghi nên lần chạy
// 15:53 đã sửa 3 quy tắc rồi mới dừng ở phiếu định mức — vẫn là trạng thái nửa vời, dù lần đó
// phần đã ghi tình cờ đúng.
for (const fix of ruleFixes) await saveDoc('BOM Rule', fix.name, fix.patch);
for (const fix of uomFix) await saveDoc('Item', fix.name, fix.patch);
for (const fix of bomFixes) await saveDoc('Bill of Materials', fix.name, fix.patch);

// ── kiểm lại ────────────────────────────────────────────────────────────────
const failures = [];
for (const fix of ruleFixes) {
  const doc = await readDoc('BOM Rule', fix.name);
  if (String(doc?.result_uom ?? '') !== RESULT_UOM) failures.push(`BOM Rule ${fix.name} vẫn là ${doc?.result_uom}`);
}
for (const fix of bomFixes) {
  const doc = await readDoc('Bill of Materials', fix.name);
  if (String(doc?.item ?? '') !== fix.to) failures.push(`Bill of Materials ${fix.name} vẫn trỏ ${doc?.item}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify({
  format: 'alumdoor-catalog-link-repair/v1',
  bom_rule_uom_fixed: ruleFixes.length,
  bom_item_repointed: bomFixes.length,
  bom_item_conflicts: bomConflicts,
  sales_uom_fixed: uomFix.length,
  sales_uom_fixes: uomFix.map(({ name, from, to }) => ({ name, from, to })),
  rule_fixes: ruleFixes.map(({ name, from, to }) => ({ name, from, to })),
  bom_fixes: bomFixes.map(({ name, from, to }) => ({ name, from, to })),
  verification_failure_count: failures.length,
  failures,
}, null, 2)}\n`);

if (failures.length > 0) throw new Error(`Link repair verification failed: ${failures.join('; ')}`);
if (bomConflicts.length > 0) {
  // Không chặn: đây là câu hỏi dữ liệu cho chủ xưởng, không phải lỗi kỹ thuật. Nhưng phải in ra,
  // vì "im lặng" và "đã cân nhắc rồi để lại" nhìn giống hệt nhau ở lần đọc log sau.
  console.log(`ALUMDOOR_LINK_REPAIR_BOM_CONFLICT count=${bomConflicts.length} ${bomConflicts.map((row) => `${row.name}→${row.resolves_to}`).join(' ')}`);
}
console.log(`ALUMDOOR_LOCAL_LINK_REPAIR_PASS bom_rule_uom=${ruleFixes.length} bom_item=${bomFixes.length} sales_uom=${uomFix.length} conflicts=${bomConflicts.length}`);
