#!/usr/bin/env node
/**
 * Nạp Customer từ NGUỒN GỐC, không từ bản export đã bị moi ruột.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO BỎ `data/customer-export.xlsx`
 * ─────────────────────────────────────────────────────────────────────────────
 * Bản trước đọc `data/customer-export.xlsx` và pin SHA256 của nó. Hash KHỚP, nhưng file chỉ còn
 * 4 cột × 1 dòng rác ("KH tồn 52412" — ô tổng của bảng tính, không phải tên khách), lại KHÔNG có
 * cột `Nhóm giá`. Bộ nhập chờ 369 dòng nên ném `canonical_count_mismatch expected=369 actual=1`,
 * và người đọc log hiểu nhầm thành "thiếu file nguồn".
 *
 * Bài học đã cưỡng chế: pin hash chỉ chứng minh file KHÔNG ĐỔI KỂ TỪ LÚC PIN — nó không chứng
 * minh file CÓ NỘI DUNG. Nên ở đây không pin hash nữa (nguồn là file markdown trong repo, đã bị
 * ghim chính xác bởi cổng `FORGE_LOCAL_EXPECTED_SHA` + cây làm việc sạch của adapter); thay vào
 * đó chốt bằng HÌNH DẠNG và CON SỐ: tiêu đề cột khít, ngưỡng 400 dòng tối thiểu
 * (`alumdoor-partner-source.mjs`), và `EXPECTED_CANONICAL` dưới đây. Hash nguồn vẫn được ghi vào
 * evidence để truy vết, nhưng không còn là cổng.
 *
 * Nguồn thật: `2026 ĐƠN HÀNG - XUẤT HÀNG.xlsx` sheet `DS KH-NCC`, đã trích ra
 * `apps/alumdoor/docs/nguon/don-hang-xuat-hang/DS-KH-NCC.md`.
 *
 * Bộ đọc `xlsx` bị gỡ khỏi file này: sau khi đổi nguồn thì cả TÊN KHÁCH lẫn bằng chứng ĐẠI LÝ
 * (cột ĐẠI LÝ của 6 sheet tháng T2..T7/2026) đều đọc từ bản trích markdown, không còn chỗ nào
 * cần mở bảng tính. Giữ lại bộ nạp `xlsx` từ pnpm store chỉ làm bộ nhập chết vì lý do không liên
 * quan (thiếu dependency store) trên máy sạch.
 */
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertLocalMutationChildContext } from '../../scripts/local-runner/assert-local-mutation-child-context.mjs';
import {
  buildCustomerRecords,
  buildPartnerPlan,
  loadPartnerSource,
} from '../../server/scripts/lib/alumdoor-partner-source.mjs';

/**
 * SỐ CHỐNG TRÔI NGUỒN: 448 đối tác CÓ TÊN trong `DS-KH-NCC.md` (sha256 c008557f…).
 *
 * Đây là bất biến BẰNG-TUYỆT-ĐỐI duy nhất của lượt nạp, vì nó KHÔNG đổi khi chủ xưởng điền thêm
 * cột phân loại — nó chỉ đổi khi chính nguồn co lại hay phình ra. Bản trước pin `EXPECTED_CANONICAL`
 * bằng-tuyệt-đối và để rơi con số này, hậu quả đo được hai chiều:
 *
 *   - CO LẠI: `MIN_PARTNER_ROWS=400` bắt được, nhưng chỉ tới 400.
 *   - PHÌNH RA: nhân đôi cả khối dữ liệu nguồn → 896 dòng, 462 dòng trùng, mà `customer_count`
 *     vẫn đúng bằng con số cũ nên KHÔNG blocker nào bắn. Rổ `duplicates` là rổ duy nhất trong
 *     bốn rổ không có ngưỡng nào.
 *
 * Pin 448 + kiểm tổng bốn rổ đúng bằng 448 thì cả hai kiểu trôi đều chết ngay ở đây.
 */
const EXPECTED_PARTNER_ROWS = 448;

/**
 * SÀN số khách nạp được — KHÔNG phải bằng-tuyệt-đối.
 *
 * 448 chia bốn rổ: 403 khách + 2 nhà cung cấp + 36 hoãn + 7 dòng trùng đã gộp = 448.
 * 403 = 327 dòng tự khai phân loại + 76 dòng suy từ cột ĐẠI LÝ của sheet tháng.
 * Chia theo nhóm giá: 399 `Đại lý` + 4 `Lẻ`.
 *
 * VÌ SAO SÀN CHỨ KHÔNG PHẢI BẰNG: evidence đưa cho chủ xưởng danh sách 36 đối tác hoãn kèm lời
 * nhắn "điền cột `KH/NCC/KH LẺ`". Với bất biến bằng-tuyệt-đối, chủ xưởng làm ĐÚNG việc đó — ví dụ
 * điền `KH` cho dòng 213 TIẾN ĐẠT — thì hoãn còn 35 (qua trần) nhưng khách thành 404 ≠ 403 →
 * blocker `canonical_count_mismatch` → `ALUMDOOR_CUSTOMER_PREFLIGHT_BLOCKED` → 0 khách vào D1,
 * với tên lỗi đọc như là nguồn bị cắt. Tức hành động khắc phục duy nhất được yêu cầu lại làm hỏng
 * cả lượt nạp. Sàn cho rổ hoãn cạn dần, còn `EXPECTED_PARTNER_ROWS` giữ nhiệm vụ chống trôi nguồn.
 */
const EXPECTED_CANONICAL = 403;

/**
 * Trần số đối tác được phép HOÃN. Hoãn không chặn cả lượt nạp — nạp 403 khách đúng rồi bổ sung
 * phần còn lại tốt hơn nạp 0 khách — nhưng hoãn IM LẶNG thì lần sau cả nghìn dòng trôi qua mà
 * không ai biết. Đo được 36 = 34 dòng thiếu thẩm quyền nhóm giá + 2 dòng của cặp khai ngược nhau.
 *
 * Trần chứ không phải bằng: chủ xưởng điền dần cột `KH/NCC/KH LẺ` thì số này phải được phép giảm.
 */
const MAX_DEFERRED = 36;

/**
 * Trần số dòng TRÙNG ĐỊNH DANH đã được gộp vào dòng trước. Đo được 7.
 *
 * Rổ này trước đây không có ngưỡng nào, nên một bản nguồn bị dán lặp cả khối (lỗi copy/trích rất
 * thường gặp) đi qua sạch: 896 dòng vào, 462 dòng rơi vào `duplicates`, `customer_count` không
 * đổi, blocked=0, ghi thẳng vào D1.
 */
const MAX_DUPLICATE_ROWS = 7;

/**
 * Trần số CẶP hai dòng cùng một khách khai phân loại NGƯỢC NHAU. Đo được 1:
 * dòng 86 `ANH HƯỞNG - KHÁCH LẺ` khai `KH`, dòng 236 cùng tên khai `KH LẺ`.
 *
 * Cả hai dòng bị HOÃN chứ không chọn dòng nào — nhóm giá quyết định TIỀN và KÍCH THƯỚC CẮT NHÔM
 * (Đại lý: phủ bì nhựa − 0,02 m; Lẻ: phủ bì ray − 0,08 m), đoán sai là cắt sai mọi đơn của khách.
 * Đây là chỗ thay cho ba cổng `price_group_conflict` / `transaction_group_conflict` /
 * `cross_source_group_conflict` của bản mã cũ, đã bị gỡ khi đổi nguồn mà không có gì thay thế.
 *
 * KHÔNG chặn cả lượt nạp: chặn thì 403 khách đúng cũng không vào được vì 1 cặp mâu thuẫn.
 */
const MAX_KIND_CONFLICT_PAIRS = 1;

/**
 * Trần số CẶP tên chỉ khác nhau ở DẤU. Đo được 6; 3 cặp mang bằng chứng mâu thuẫn:
 *
 *   71 ANH BIỂN 0907 627 145 / 349 ANH BIÊN 0975937881          — hai SĐT khác nhau
 *   297 ANH HÙNG (LƯ CHÍ CƯỜNG) / 364 ANH HƯNG (THÁI SƠN)        — hai người phụ trách
 *   5 ANH HOÁ (LƯ CHÍ CƯỜNG) / 183 ANH HOÀ (THÁI SƠN)            — hai người phụ trách
 *
 * Chúng KHÔNG còn bị gộp (xem `partnerIdentityKey`), và được liệt kê đủ trong evidence để chủ
 * xưởng chốt — cùng một danh sách câu hỏi với 7 số điện thoại dùng chung.
 */
const MAX_NEAR_DUPLICATE_NAME_PAIRS = 6;

/**
 * Trần số ô SĐT chứa HAI số. Đo được 4 (169, 274, 316, 450).
 *
 * `normalizedPhone` của server bỏ mọi ký tự không phải chữ số, nên ô hai số thành một chuỗi 20
 * chữ số đi thẳng vào `Customer.phone`: thợ giao/lắp không gọi được, và `phone` là 1 trong 4 khoá
 * dò trùng của `dry_run` nên lượt nạp sau không bao giờ khớp lại được 4 khách này.
 * Nay tách ở lớp nguồn: số đầu vào `phone`, số còn lại vào `note` theo khuôn `SĐT phụ: …`.
 */
const MAX_MULTI_PHONE_ROWS = 4;

/**
 * Trần số dòng khách bị TRÙNG SỐ ĐIỆN THOẠI với một khách khác trong cùng lượt nạp.
 *
 * Đo được 7 số dùng chung bởi 14 khách, và từng cặp là hai bản ghi KHÁC NHAU:
 *   0948676971 → ANH DUY LONG XUYÊN (38) / ANH DUY AN GIANG (39)
 *   0975199357 → TOÀN PHÁT DOOR (397) / TOÀN PHÁT BUÔN HỒ -ĐẮKLẮK (427)
 *   0978015265 → CỬA MINH CHÂU (346) / CƯẢ MINH CHÂU (399)
 *   (và 4 cặp nữa, liệt kê đủ trong evidence)
 *
 * Cặp 346/399 là cặp MỚI so với bản trước: nó chỉ lộ ra khi thôi gộp hai tên lệch dấu. Trùng SĐT
 * chính là bằng chứng để chủ xưởng chốt xem đó có phải một người không — nên nó xuất hiện ở đây là
 * đúng việc, không phải hồi quy.
 *
 * `alumdoor.customer_import.dry_run` coi trùng số điện thoại là `DUPLICATE_CANDIDATE`, và lớp
 * runner chỉ cho qua `READY_CREATE`/`DUPLICATE_EXACT` — nghĩa là 14 dòng này chặn cả 403 khách.
 *
 * Xử lý theo đúng khuôn của rổ HOÃN: KHÔNG XOÁ số (giữ nguyên văn trong `note`, "nghỉ hưu chứ
 * không xoá"), chỉ thôi khẳng định nó là số định danh duy nhất của một trong hai khách — vì
 * nguồn không nói khách nào sở hữu số đó. Đếm lại và chốt bằng trần này.
 */
const MAX_SHARED_PHONE_ROWS = 14;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const expectIdempotent = args.includes('--expect-idempotent');
const positional = args.filter((x) => !['--apply', '--expect-idempotent'].includes(x));
const [evidenceArg] = positional;
if (!evidenceArg) throw new Error('Usage: node import-alumdoor-customer-local.mjs <evidence.json> [--apply] [--expect-idempotent]');

const repoRoot = path.resolve(import.meta.dirname, '../..');
const partnerSourcePath = path.join(repoRoot, 'apps', 'alumdoor', 'docs', 'nguon', 'don-hang-xuat-hang', 'DS-KH-NCC.md');
const evidencePath = path.resolve(evidenceArg);
if (!existsSync(partnerSourcePath)) throw new Error(`Customer source missing: ${partnerSourcePath}`);
const sha256 = (f) => crypto.createHash('sha256').update(readFileSync(f)).digest('hex');
const sourceHash = sha256(partnerSourcePath);

/* ── Dựng danh sách khách từ nguồn gốc ─────────────────────────────────────── */

const partnerSource = await loadPartnerSource(repoRoot);
const plan = buildPartnerPlan(partnerSource);
const blockers = [];

/**
 * `account_manager` là Link tới Employee; trỏ vào bản ghi không tồn tại làm hỏng cả lượt nạp.
 * Chưa có bảng Employee ở bước này nên truyền tập rỗng — `buildCustomerRecords` sẽ giữ tên người
 * phụ trách trong `note` thay vì gán Link. 4 người phụ trách (gộp từ 7 cách viết) vẫn còn nguyên
 * trong evidence để bước nối Employee sau này dùng lại.
 */
const records = buildCustomerRecords(plan.customers, new Set());

/* Trùng số điện thoại trong cùng lượt: hạ số xuống `note`, không xoá, và đếm. */
const phoneKey = (value) => {
  const raw = String(value ?? '').normalize('NFC').trim();
  if (!raw) return '';
  return (raw.startsWith('+') ? '+' : '') + raw.replace(/[^0-9]/g, '');
};
const phoneOwners = new Map();
for (const record of records) {
  const key = phoneKey(record.values.phone);
  if (!key) continue;
  if (!phoneOwners.has(key)) phoneOwners.set(key, []);
  phoneOwners.get(key).push(record);
}
const sharedPhones = [];
for (const [key, owners] of phoneOwners) {
  if (owners.length < 2) continue;
  sharedPhones.push({
    phone: key,
    rows: owners.map((record) => ({ row_number: record.row_number, customer_name: record.values.customer_name })),
  });
  for (const record of owners) {
    const kept = `SĐT dùng chung: ${record.values.phone}`;
    record.values.note = record.values.note ? `${record.values.note} · ${kept}` : kept;
    delete record.values.phone;
  }
}
const sharedPhoneRows = sharedPhones.reduce((total, entry) => total + entry.rows.length, 0);
if (sharedPhoneRows > MAX_SHARED_PHONE_ROWS) {
  blockers.push({ type: 'shared_phone_rows_above_threshold', expected_max: MAX_SHARED_PHONE_ROWS, actual: sharedPhoneRows });
}

const payload = records
  .sort((a, b) => a.row_number - b.row_number)
  .map(({ row_number, values }) => ({ row_number, values }));

/* Nguồn trôi: đếm dòng có tên phải khớp TUYỆT ĐỐI, và bốn rổ phải cộng lại đúng bằng nó. */
if (plan.summary.partner_count !== EXPECTED_PARTNER_ROWS) {
  blockers.push({ type: 'partner_row_count_mismatch', expected: EXPECTED_PARTNER_ROWS, actual: plan.summary.partner_count });
}
const bucketSum = plan.summary.customer_count + plan.summary.supplier_count
  + plan.summary.deferred_count + plan.summary.duplicate_count;
if (bucketSum !== plan.summary.partner_count) {
  blockers.push({ type: 'partner_bucket_sum_mismatch', expected: plan.summary.partner_count, actual: bucketSum });
}
/* Sàn, không phải bằng: rổ hoãn cạn dần thì số này chỉ được phép TĂNG. */
if (payload.length < EXPECTED_CANONICAL) {
  blockers.push({ type: 'canonical_count_below_floor', expected_min: EXPECTED_CANONICAL, actual: payload.length });
}
if (plan.deferred.length > MAX_DEFERRED) {
  blockers.push({ type: 'deferred_above_threshold', expected_max: MAX_DEFERRED, actual: plan.deferred.length });
}
if (plan.summary.duplicate_count > MAX_DUPLICATE_ROWS) {
  blockers.push({ type: 'duplicate_rows_above_threshold', expected_max: MAX_DUPLICATE_ROWS, actual: plan.summary.duplicate_count });
}
if (plan.summary.kind_conflict_count > MAX_KIND_CONFLICT_PAIRS) {
  blockers.push({ type: 'kind_conflict_above_threshold', expected_max: MAX_KIND_CONFLICT_PAIRS, actual: plan.summary.kind_conflict_count, rows: plan.kind_conflicts });
}
if (plan.summary.near_duplicate_name_count > MAX_NEAR_DUPLICATE_NAME_PAIRS) {
  blockers.push({ type: 'near_duplicate_names_above_threshold', expected_max: MAX_NEAR_DUPLICATE_NAME_PAIRS, actual: plan.summary.near_duplicate_name_count });
}
if (plan.summary.multi_phone_count > MAX_MULTI_PHONE_ROWS) {
  blockers.push({ type: 'multi_phone_rows_above_threshold', expected_max: MAX_MULTI_PHONE_ROWS, actual: plan.summary.multi_phone_count });
}
/* Ô SĐT còn dính nhiều số mà không tách được theo dấu nào — ghi ra, KHÔNG cắt bừa chuỗi số. */
if (plan.summary.unsplittable_phone_count > 0) {
  blockers.push({ type: 'unsplittable_multi_phone', count: plan.summary.unsplittable_phone_count, rows: plan.unsplittable_phones });
}
/* Ô phân loại có chữ nhưng không đọc được là dữ liệu mới, không phải ô trống — không đoán. */
if (plan.summary.unknown_kind_count > 0) {
  blockers.push({ type: 'unrecognized_partner_kind', count: plan.summary.unknown_kind_count, rows: plan.unknown_kind });
}

/* ── Kết nối và tiền kiểm ──────────────────────────────────────────────────── */

const origin=(process.env.FORGE_ORIGIN??'http://127.0.0.1:8799').replace(/\/$/,'');const parsed=new URL(origin);if(!['127.0.0.1','localhost','::1'].includes(parsed.hostname))throw new Error(`refusing remote Customer mutation: ${parsed.hostname}`);
const user=process.env.FORGE_ADMIN_USER??process.env.FORGE_AUTH_USER??'';const password=process.env.FORGE_ADMIN_PASSWORD??process.env.FORGE_AUTH_PASSWORD??'';if(!user||!password)throw new Error('FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD are required');
const cookies=new Map();let csrf='';
async function req(url,opts={}){const headers=new Headers(opts.headers??{});const cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');if(cookie)headers.set('cookie',cookie);if(csrf&&opts.method&&opts.method!=='GET')headers.set('x-frappe-csrf-token',csrf);if(opts.body!==undefined)headers.set('content-type','application/json');const r=await fetch(`${origin}${url}`,{...opts,headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body),redirect:'manual'});const sc=r.headers.get('set-cookie');if(sc)for(const part of sc.split(/,(?=[^;,]+=)/)){const p=part.split(';',1)[0],j=p.indexOf('=');if(j>0)cookies.set(p.slice(0,j).trim(),p.slice(j+1).trim());}csrf=r.headers.get('x-frappe-csrf-token')??csrf;const text=await r.text();let body;try{body=text?JSON.parse(text):null;}catch{body=text;}if(!r.ok)throw new Error(`${opts.method??'GET'} ${url} failed ${r.status}: ${text.slice(0,300)}`);return body;}
await req('/api/method/login',{method:'POST',body:{usr:user,pwd:password}});const boot=await req('/api/method/metaforge.api.get_boot');csrf=(boot?.message??boot)?.csrf_token??csrf;if(!csrf)throw new Error('Missing CSRF token');
const call=async(method,argsBody)=>(await req(`/api/method/${method}`,{method:'POST',body:{args:argsBody}}))?.message;
const dry=await call('alumdoor.customer_import.dry_run',{rows:payload});
const statuses=(dry?.rows??[]).reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{});const serverBlocked=(dry?.rows??[]).filter((r)=>!['READY_CREATE','DUPLICATE_EXACT'].includes(r.status)).map((r)=>({type:'server_preflight',row:r.row_number,status:r.status}));blockers.push(...serverBlocked);
const ready=statuses.READY_CREATE??0, exact=statuses.DUPLICATE_EXACT??0;

/**
 * Evidence bump v1 → v2: nguồn đổi từ `data/customer-export.xlsx` sang bản trích markdown, và
 * thêm ba rổ (`deferred`/`suppliers`/`duplicates`) mà v1 không có chỗ chứa. Bản v1 cũ đọc lẫn với
 * v2 sẽ hiểu sai `source.file`, nên đổi số hiệu thay vì im lặng đổi nghĩa.
 *
 * Đối tác HOÃN vào đây với ĐỦ TÊN + LÝ DO: đây là danh sách chủ xưởng cầm đi điền cột phân loại.
 */
const evidence = {
  format: 'alumdoor-customer-local-import/v2',
  captured_at: new Date().toISOString(),
  source: {
    file: path.basename(partnerSourcePath),
    sha256: sourceHash,
    sheet: 'DS KH-NCC',
    header_row: 2,
    raw_candidates: plan.summary.partner_count,
    monthly_sheet_count: partnerSource.monthly_sheet_count,
    dealer_reference_count: partnerSource.dealerRefs.size,
    nameless_rows: partnerSource.nameless,
  },
  canonical_rows: payload.length,
  partner_rows: { count: plan.summary.partner_count, expected: EXPECTED_PARTNER_ROWS, bucket_sum: bucketSum },
  canonical_floor: EXPECTED_CANONICAL,
  groups: {
    dealer: payload.filter((r) => r.values.price_group === 'Đại lý').length,
    retail: payload.filter((r) => r.values.price_group === 'Lẻ').length,
  },
  authority: {
    declared: plan.summary.customer_declared,
    sales_history: plan.summary.customer_from_sales_history,
  },
  deferred: {
    count: plan.deferred.length,
    threshold: MAX_DEFERRED,
    /* Chở luôn SĐT/địa chỉ/ghi chú: dòng hoãn KHÔNG vào D1, nên evidence là chỗ duy nhất còn giữ
       chúng. Ví dụ dòng 236 mang 0987603754 + "216/148 Đường số 5, phường Bình Hưng Hòa…". */
    rows: plan.deferred.map((row) => ({
      row_number: row.source_row,
      partner_name: row.partner_name,
      kind_raw: row.kind_raw,
      account_manager: row.account_manager,
      phone: row.phone ?? null,
      extra_phones: row.extra_phones ?? [],
      address: row.address ?? null,
      note: row.note ?? null,
      reason: row.defer_reason,
    })),
  },
  suppliers: plan.suppliers.map((row) => ({ row_number: row.source_row, partner_name: row.partner_name })),
  /**
   * `duplicates` chở ĐỦ dữ liệu của dòng bị gộp (kind_raw/phone/địa chỉ/ghi chú/người phụ trách)
   * chứ không chỉ `{source_row, partner_name}` như bản trước — bản trước vứt 6 SĐT và 2 địa chỉ
   * mà không còn chỗ nào lấy lại, trái luật "nghỉ hưu, không xoá". `merged_fields` cho biết
   * trường nào đã được kéo sang dòng giữ.
   */
  duplicates: plan.duplicates,
  /* Hai rổ CÂU HỎI cho chủ xưởng — không phải kết luận, không dòng nào bị đoán thay. */
  kind_conflicts: { count: plan.summary.kind_conflict_count, threshold: MAX_KIND_CONFLICT_PAIRS, groups: plan.kind_conflicts },
  near_duplicate_names: {
    count: plan.summary.near_duplicate_name_count,
    conflicting_evidence: plan.summary.near_duplicate_conflicting_count,
    threshold: MAX_NEAR_DUPLICATE_NAME_PAIRS,
    groups: plan.near_duplicate_names,
  },
  multi_phones: { count: plan.summary.multi_phone_count, threshold: MAX_MULTI_PHONE_ROWS, rows: plan.multi_phones },
  shared_phones: { rows: sharedPhoneRows, threshold: MAX_SHARED_PHONE_ROWS, groups: sharedPhones },
  account_managers: [...new Set(plan.customers.map((row) => row.account_manager).filter(Boolean))].sort(),
  preflight: { ready, exact, blocked: blockers.length, statuses },
  blockers,
};
mkdirSync(path.dirname(evidencePath),{recursive:true});const save=(v)=>writeFileSync(evidencePath,`${JSON.stringify(v,null,2)}\n`,'utf8');save(evidence);
console.log(`ALUMDOOR_CUSTOMER_PREFLIGHT canonical=${payload.length} ready=${ready} exact=${exact} blocked=${blockers.length} deferred=${plan.deferred.length}`);
console.log(`ALUMDOOR_CUSTOMER_SOURCE_SHA256 ${sourceHash}`);
if(blockers.length)throw new Error(`ALUMDOOR_CUSTOMER_PREFLIGHT_BLOCKED count=${blockers.length}; writes=0`);if(expectIdempotent&&ready!==0)throw new Error(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_BLOCKED ready=${ready}`);if(!apply){console.log('ALUMDOOR_CUSTOMER_DRY_RUN_PASS writes=0');process.exit(0);}
/* `batch_id` bám vào hash nguồn: nguồn không đổi thì hai lượt chạy dùng chung một lô. */
assertLocalMutationChildContext(['customer']);const batchId=`customer-local-${crypto.createHash('sha256').update(sourceHash).digest('hex').slice(0,20)}`;const commit=await call('alumdoor.customer_import.commit',{rows:payload,dry_run_token:dry.dry_run_token,batch_id:batchId});if(Number(commit?.failed??0)!==0)throw new Error(`Customer commit failed=${commit?.failed}`);if(Number(commit?.imported??0)!==ready)throw new Error(`Customer imported mismatch imported=${commit?.imported} expected=${ready}`);
const verify=await call('alumdoor.customer_import.dry_run',{rows:payload});const verifyBad=(verify?.rows??[]).filter((r)=>r.status!=='DUPLICATE_EXACT');const final={...evidence,commit:{batch_id:batchId,imported:Number(commit?.imported??0),skipped:Number(commit?.skipped??0),failed:Number(commit?.failed??0)},verify:{exact:(verify?.rows??[]).filter((r)=>r.status==='DUPLICATE_EXACT').length,blocked:verifyBad.length,statuses:(verify?.rows??[]).reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{})},verify_blockers:verifyBad.map((r)=>({row:r.row_number,status:r.status}))};save(final);if(verifyBad.length)throw new Error(`ALUMDOOR_CUSTOMER_POST_VERIFY_FAILED count=${verifyBad.length}`);if(expectIdempotent&&Number(commit?.imported??0)!==0)throw new Error(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_FAILED imported=${commit?.imported}`);console.log(`ALUMDOOR_CUSTOMER_LOCAL_IMPORT_PASS canonical=${payload.length} imported=${commit?.imported??0} exact=${final.verify.exact}`);if(expectIdempotent)console.log(`ALUMDOOR_CUSTOMER_IDEMPOTENCY_PASS canonical=${payload.length} imported=0`);
