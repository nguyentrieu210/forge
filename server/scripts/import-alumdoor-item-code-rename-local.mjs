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

/**
 * API chặn cứng 100 dòng mỗi trang, bất kể xin bao nhiêu.
 *
 * Nên KHÔNG được lấy "trả về ít hơn số xin" làm dấu hiệu hết trang: xin 500 thì luôn nhận 100
 * và vòng lặp dừng ngay sau trang đầu. Lỗi đó im lặng một cách khó chịu — nó không ném gì, chỉ
 * làm mọi phép đếm phía sau tính trên 100 bản ghi đầu tiên. Lần chạy 19/08 báo "344 mặt hàng
 * vắng mặt" trong khi cả 587 đều còn nguyên, và bảng kiểm kê khoá dẫn xuất thì soi đúng
 * 100/349 BOM Template.
 *
 * Cách đúng: đi theo số dòng THỰC NHẬN, và chỉ dừng khi nhận về rỗng.
 */
const PAGE_SIZE = 100;
async function listNames(doctype) {
  const out = new Set();
  for (let start = 0; ; ) {
    const payload = await request(
      `/api/resource/${encodeURIComponent(doctype)}?limit_start=${start}&limit_page_length=${PAGE_SIZE}&fields=${encodeURIComponent('["name"]')}`,
    );
    const rows = payload?.data ?? [];
    if (rows.length === 0) break;
    for (const row of rows) out.add(row.name);
    start += rows.length;
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
 * Tên tài liệu nối bằng dấu hai chấm, mã hàng là MỘT ĐOẠN.
 *
 * Hai chỗ dùng dạng này, và cả hai đều tự đặt tên từ mã hàng:
 *   `Item Price`   `{bảng giá}:{mã}:{đvt}:{biến thể}`        — 558/558 dòng
 *   `Pricing Rule` `ALUMDOOR-PR:{mã}:{biến thể}` qua {title} —  56 dòng
 *
 * Cắt theo đoạn chứ không dựng lại từ mẫu `format:`: đã kiểm không mã hàng nào chứa dấu hai
 * chấm, nên phép này chứng minh được. Dựng lại thì phải đoán nền tảng xử lý đoạn rỗng ở đuôi
 * thế nào, mà đoán sai là đổi hàng loạt sang tên sai.
 */
function renamedCompositeName(name, renames) {
  if (!name.includes(':')) return null;
  const parts = name.split(':');
  let changed = false;
  const next = parts.map((part) => {
    const to = renames.get(part);
    if (!to) return part;
    changed = true;
    return to;
  });
  return changed ? next.join(':') : null;
}

/** Đổi tên mọi tài liệu của một doctype mà tên có đoạn là mã hàng vừa đổi. */
async function renameCompositeNamed(doctype, renames) {
  const names = await listNames(doctype);
  let renamed = 0;
  for (const name of names) {
    const next = renamedCompositeName(name, renames);
    if (!next || next === name) continue;
    if (names.has(next)) throw new Error(`Refusing: ${doctype} ${next} already exists`);
    await renameOnce(doctype, name, next, false);
    renamed += 1;
  }
  return renamed;
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

  // Đổi tên Item xong thì cascade đã sửa payload; còn TÊN của hai doctype tự đặt tên từ mã hàng
  // thì phải đổi riêng, vì tên không phải là payload.
  const renamedPrices = await renameCompositeNamed('Item Price', renames);
  const renamedRules = await renameCompositeNamed('Pricing Rule', renames);

  console.log(`${label} items_renamed=${renamedItems} already=${alreadyDone} prices_renamed=${renamedPrices} rules_renamed=${renamedRules}`);
  return { items_renamed: renamedItems, already_renamed: alreadyDone, prices_renamed: renamedPrices, rules_renamed: renamedRules };
}

async function verify(renames) {
  const items = await listNames('Item');
  const stale = [...renames.keys()].filter((from) => items.has(from));
  const arrived = [...renames.values()].filter((to) => items.has(to));
  const prices = await listNames('Item Price');
  const rules = await listNames('Pricing Rule');
  const stalePrices = [...prices, ...rules].filter((name) => renamedCompositeName(name, renames) !== null);
  const failures = [];
  if (stale.length > 0) failures.push(`${stale.length} old item codes still present (first: ${stale.slice(0, 5).join(', ')})`);
  if (arrived.length !== renames.size) failures.push(`only ${arrived.length}/${renames.size} new item codes present`);
  if (stalePrices.length > 0) failures.push(`${stalePrices.length} composite names still carry an old code (first: ${stalePrices.slice(0, 3).join(', ')})`);
  return { item_count: items.size, price_count: prices.size, failures };
}

/**
 * Kiểm kê phần mã hàng mà cascade KHÔNG với tới.
 *
 * Cascade sửa được ba dạng: giá trị lá nguyên vẹn, đoạn trong khoá nối bằng dấu hai chấm, và
 * lá nằm trong JSON serialize thành chuỗi. Hàm này soi đúng phần CÒN LẠI — mã bị nhúng bằng
 * một dấu nối khác, ví dụ `Material Specification.spec_code` = `ĐM-{mã}`.
 *
 * Phải soi phần còn lại chứ không soi tổng, vì nếu cứ thấy mã là chặn thì cổng này sẽ đỏ vĩnh
 * viễn ngay cả khi cascade đã lo xong.
 *
 * Chỗ nào cascade không với tới thì đổi mã xong sẽ để lại một khoá ôm mã đã chết, KHÔNG có gì
 * báo — nên dừng trước khi đổi bất cứ thứ gì vẫn đúng hơn là chạy rồi sửa sau.
 */
function cascadeWouldFix(value, code) {
  if (value === code) return true;
  if (value.includes(':') && value.split(':').includes(code)) return true;
  const trimmed = value.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        // Cascade sửa lá bên trong; ở đây chỉ cần biết mã có thật sự là một LÁ hay không.
        const seen = [];
        (function walk(node) {
          if (typeof node === 'string') { seen.push(node); return; }
          if (Array.isArray(node)) { for (const x of node) walk(x); return; }
          if (node && typeof node === 'object') for (const v of Object.values(node)) walk(v);
        })(parsed);
        if (seen.includes(code)) return true;
      }
    } catch { /* không phải JSON thì cascade cũng để nguyên */ }
  }
  return false;
}

async function auditDerivedKeys(renames) {
  const codes = [...renames.keys()];
  const findings = new Map();
  const ownIdentity = new Map();
  let currentName = '';
  const inspect = (value, key) => {
    if (typeof value === 'string') {
      if (!value || /_name$/.test(key)) return; // nhãn hiển thị: cascade cố ý bỏ qua, đúng
      // DANH TÍNH CỦA CHÍNH TÀI LIỆU không phải tham chiếu tới tài liệu khác.
      //
      // `Material Specification` đặt tên `ĐM-{mã}` và trông như dẫn xuất từ mã hàng — nhưng đo
      // ra thì chỉ 5/17 bản ghi có phần sau `ĐM-` ứng với một Item; 12 cái còn lại (`ĐM-TD325`,
      // `ĐM-A282`, `ĐM-RHM8`…) không ứng với mã hàng nào. Tức KHÔNG có luật "spec_code bám theo
      // item_code" — nó là mã độc lập, đôi khi trùng chữ. Và Material Specification không có
      // trường link nào trỏ Item cả.
      //
      // Đổi nó theo mã hàng mới là bịa ra một luật không tồn tại. Nên: ghi nhận để chủ xưởng
      // xác nhận, KHÔNG chặn — chặn cả đợt 359 mã vì 3 bản ghi có lẽ vốn đã đúng là chặn nhầm.
      if (value === currentName) {
        for (const code of codes) {
          if (value.includes(code) && !cascadeWouldFix(value, code)) {
            ownIdentity.set(value, code);
            break;
          }
        }
        return;
      }
      for (const code of codes) {
        if (!value.includes(code)) continue;
        if (cascadeWouldFix(value, code)) continue;
        // Chuỗi con của một mã DÀI HƠN không phải khoá dẫn xuất: `TP-CUA` nằm trong
        // `TP-CUADL1LY` là hai mã khác nhau chứ không phải một mã bị nhúng.
        if (codes.some((other) => other !== code && other.includes(code) && value.includes(other))) continue;
        findings.set(key, (findings.get(key) ?? 0) + 1);
        return;
      }
      return;
    }
    if (Array.isArray(value)) { for (const entry of value) inspect(entry, key); return; }
    if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) inspect(v, k); }
  };

  for (const doctype of ['BOM Template', 'Pricing Rule', 'Material Specification']) {
    for (const name of await listNames(doctype)) {
      const row = { name };
      const doc = await request(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(row.name)}`, { allow404: true });
      const data = doc?.data ?? doc?.message ?? doc;
      currentName = row.name;
      if (data) inspect(data, '');
    }
  }
  return { findings, ownIdentity };
}

const renames = new Map(plan.map((entry) => [entry.from, entry.to]));

await request('/api/method/login', { method: 'POST', body: { usr: user, pwd: password } });

const { findings: derived, ownIdentity } = await auditDerivedKeys(renames);
if (derived.size > 0 && process.env.ALUMDOOR_RENAME_ALLOW_STALE_DERIVED_KEYS !== '1') {
  const detail = [...derived.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key}=${count}`).join(' ');
  throw new Error(
    `Refusing rename: ${derived.size} derived key field(s) embed a planned item code and would keep pointing at a dead code — ${detail}. `
    + 'Mỗi khoá cần một luật tái sinh riêng; chạy tiếp chỉ tạo ra đồ thị link vá nửa vời.',
  );
}
if (ownIdentity.size > 0) {
  // Không chặn — xem chú thích ở `auditDerivedKeys`. Nhưng phải in ra, vì "im lặng" và "đã cân
  // nhắc rồi bỏ qua" nhìn giống hệt nhau ở lần đọc log sau.
  console.log(`ALUMDOOR_RENAME_OWN_IDENTITY_UNTOUCHED count=${ownIdentity.size} names=${[...ownIdentity.keys()].join(', ')}`);
}

const first = await pass('LOCAL_RENAME_PASS_1', renames);
const verified = await verify(renames);
if (verified.failures.length > 0) {
  throw new Error(`Rename verification failed: ${verified.failures.join('; ')}`);
}

// Lần hai phải KHÔNG đổi gì. Đây là chỗ bắt được cascade ghi nửa vời: nếu tham chiếu chưa theo
// hết thì lần một để lại mã cũ đâu đó, và lần hai sẽ tìm thấy việc để làm.
const second = await pass('LOCAL_RENAME_PASS_2', renames);
if (second.items_renamed !== 0 || second.prices_renamed !== 0 || second.rules_renamed !== 0) {
  throw new Error(`Local idempotence failed: ${JSON.stringify(second)}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify({
  ...summary,
  pass1: first,
  pass2: second,
  verification: verified,
  verification_failure_count: verified.failures.length,
  own_identity_untouched: [...ownIdentity.entries()].map(([name, code]) => ({ name, embeds_item_code: code })),
}, null, 2)}\n`);
console.log(`ALUMDOOR_LOCAL_ITEM_CODE_RENAME_IDEMPOTENCE_PASS renamed=${first.items_renamed} prices=${first.prices_renamed} items=${verified.item_count}`);
