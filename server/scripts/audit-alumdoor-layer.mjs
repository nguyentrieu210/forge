#!/usr/bin/env node
/**
 * Soi MỘT tầng danh mục cho tới đáy.
 *
 * ĐỌC-CHỈ. Khác `audit-alumdoor-catalog-foundation.mjs` ở chỗ: bản kia quét ngang toàn hệ để ra
 * bản đồ, bản này soi dọc một tầng để đóng nó lại.
 *
 * Bốn câu hỏi cho mỗi danh mục trong tầng:
 *
 *   1. HAI KHO CÓ KHỚP KHÔNG — `documents` và `master_records` cùng phục vụ picker qua một phép
 *      hợp, nên một bản ghi chỉ nằm ở một kho là bản ghi dùng được lúc này và biến mất lúc khác.
 *   2. TRƯỜNG BẮT BUỘC CÓ ĐỦ KHÔNG — theo đúng khai báo `required` trong brief.
 *   3. CÓ TRÙNG KHÔNG — trùng mã, và trùng TÊN (hai mã một món là lỗi tốn tiền nhất).
 *   4. LỰA CHỌN CÓ HỢP LỆ KHÔNG — giá trị `Select` phải nằm trong danh sách đã khai; `Link` phải
 *      trỏ tới bản ghi có thật.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const D1 = process.env.ALUMDOOR_D1_PATH
  || path.join(process.cwd(), 'apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite');
const TENANT = process.env.ALUMDOOR_TENANT || 'demo';

export const LAYERS = {
  L0: { title: 'nền tảng', doctypes: ['UOM', 'Item Group', 'Item Color', 'Surface Finish', 'Warehouse', 'Price List', 'Currency'] },
  L1: { title: 'quy cách kỹ thuật', doctypes: ['Measurement Profile', 'Geometry Field', 'Geometry Profile', 'Material Specification', 'Quy cách cửa'] },
  L2: { title: 'mặt hàng', doctypes: ['Item', 'Supplier Item'] },
  L3: { title: 'giá', doctypes: ['Price List', 'Item Price', 'Bậc diện tích', 'Pricing Scope', 'Pricing Rule'] },
  L4: { title: 'định mức / sản xuất', doctypes: ['Cutting Policy', 'BOM Rule', 'BOM Template', 'Bill of Materials', 'Production Standard', 'Ngưỡng chọn Motor', 'Manufacturing Routing', 'Operation', 'Workstation'] },
  L5: { title: 'đối tác', doctypes: ['Customer', 'Supplier'] },
  L6: { title: 'vận hành / địa bàn', doctypes: ['Tỉnh Thành', 'Phường Xã', 'Địa chỉ giao lắp', 'Lý do huỷ', 'Nguyên nhân chênh lệch', 'Nguyên nhân cửa lỗi', 'Tài khoản ngân hàng'] },
};

const layerKey = (process.argv[2] || '').toUpperCase();
const outPath = process.argv[3];
if (!LAYERS[layerKey]) throw new Error(`Usage: audit-alumdoor-layer.mjs <${Object.keys(LAYERS).join('|')}> [out.json]`);
if (!fs.existsSync(D1)) throw new Error(`Khong thay D1: ${D1}`);

const db = new DatabaseSync(D1, { readOnly: true });
const brief = JSON.parse(fs.readFileSync(new URL('../briefs/alumdoor-v2.json', import.meta.url), 'utf8'));
const byName = new Map((brief.doctypes ?? []).map((row) => [row.name, row]));

/** Brief nhận cả khai rút gọn lẫn khai đủ; ở đây chỉ cần vài thuộc tính nên đọc nông là đủ. */
function fieldsOf(doctype) {
  return (doctype?.fields ?? []).map((field) => {
    if (typeof field !== 'string') {
      return { fieldname: field.fieldname, fieldtype: field.fieldtype, options: field.options ?? '', required: Boolean(field.required) };
    }
    const match = /^([a-z_0-9]+):([A-Za-z][A-Za-z ]*?)(\(([^)]*)\))?([*!]*)(\s|$)/.exec(field);
    if (!match) return { fieldname: field.split(':')[0], fieldtype: '?', options: '', required: false };
    return {
      fieldname: match[1],
      fieldtype: match[2].trim(),
      options: match[4] ?? '',
      required: (match[5] ?? '').includes('*'),
    };
  });
}

const docRows = new Map();
for (const row of db.prepare('SELECT doctype, name, payload_json FROM documents WHERE tenant_id=?').all(TENANT)) {
  if (!docRows.has(row.doctype)) docRows.set(row.doctype, []);
  let data = {};
  try { data = JSON.parse(row.payload_json); } catch { /* bản ghi hỏng coi như rỗng */ }
  docRows.get(row.doctype).push({ name: row.name, data });
}
const masterRows = new Map();
for (const row of db.prepare('SELECT record_type, name, disabled, data_json FROM master_records WHERE tenant_id=?').all(TENANT)) {
  if (!masterRows.has(row.record_type)) masterRows.set(row.record_type, []);
  let data = {};
  try { data = JSON.parse(row.data_json); } catch { /* như trên */ }
  masterRows.get(row.record_type).push({ name: row.name, disabled: Number(row.disabled ?? 0), data });
}

const isDisabled = (data) => {
  const value = data?.disabled;
  return value === 1 || value === true || value === '1';
};
/** Tên dùng được của một doctype = HỢP hai kho, bỏ bản đã ngừng dùng — đúng như picker đọc. */
function activeNames(doctype) {
  const out = new Set();
  for (const row of docRows.get(doctype) ?? []) if (!isDisabled(row.data)) out.add(row.name);
  for (const row of masterRows.get(doctype) ?? []) if (!row.disabled) out.add(row.name);
  return out;
}

const findings = [];
const summary = [];
for (const name of LAYERS[layerKey].doctypes) {
  const meta = byName.get(name);
  const docs = docRows.get(name) ?? [];
  const masters = masterRows.get(name) ?? [];
  const fields = fieldsOf(meta);

  // 1. hai kho khớp nhau
  //
  // Một tên chỉ có ở MỘT kho là chuyện thường: fixture bổ sung bản ghi mà kho documents không
  // có, và ngược lại. Bản đầu báo cả những ca đó nên L0 đỏ vì `Currency` chỉ có USD ở fixture —
  // nhiễu thuần tuý.
  //
  // Cái đáng báo là CÙNG MỘT TÊN mà hai kho nói ngược nhau: một bên đang dùng, bên kia đã ngừng.
  // Picker đọc HỢP hai kho nên bản ghi đó lúc hiện lúc không, tuỳ đường nào chạm tới trước.
  const docState = new Map(docs.map((row) => [row.name, isDisabled(row.data)]));
  const masterState = new Map(masters.map((row) => [row.name, Boolean(row.disabled)]));
  const contradictions = [];
  for (const [key, docDisabled] of docState) {
    if (!masterState.has(key)) continue;
    if (masterState.get(key) !== docDisabled) contradictions.push({ name: key, documents_disabled: docDisabled, master_disabled: masterState.get(key) });
  }
  if (contradictions.length > 0) {
    findings.push({ doctype: name, kind: 'hai_kho_noi_nguoc_nhau', count: contradictions.length, samples: contradictions.slice(0, 5) });
  }

  // 2. trường bắt buộc
  const required = fields.filter((field) => field.required);
  const missing = new Map();
  // Bản ghi đã ngừng dùng thì không phải giữ đủ trường — nó ngoài vòng sử dụng.
  const liveForRequired = [
    ...docs.filter((row) => !isDisabled(row.data)),
    ...masters.filter((row) => !row.disabled).map((entry) => ({ name: entry.name, data: entry.data })),
  ];
  for (const row of liveForRequired) {
    for (const field of required) {
      const value = row.data?.[field.fieldname];
      if (value === undefined || value === null || value === '') {
        if (!missing.has(field.fieldname)) missing.set(field.fieldname, []);
        missing.get(field.fieldname).push(row.name);
      }
    }
  }
  for (const [field, rows] of missing) {
    findings.push({ doctype: name, kind: 'thieu_truong_bat_buoc', field, count: rows.length, samples: rows.slice(0, 5) });
  }

  // 3. trùng tên hiển thị — TRONG CÙNG MỘT PHẠM VI
  //
  // Trùng tên chỉ là lỗi khi hai bản ghi thật sự là một thứ. `Phường Xã` có 243 nhóm trùng tên
  // nhưng KHÔNG nhóm nào trùng trong cùng một tỉnh — đó là 243 cặp phường khác nhau ở tỉnh khác
  // nhau, hoàn toàn bình thường. Bản đầu báo hết, tức là chôn hai lỗi thật của `Item` dưới 243
  // dòng nhiễu.
  //
  // Phạm vi lấy trường Link ĐẦU TIÊN của doctype: với phường là tỉnh, với mặt hàng là nhóm hàng.
  // Thô, nhưng đúng hướng — và khi doctype không có Link nào thì quay về so tên trần.
  const labelField = fields.find((field) => /_(name|ten)$/.test(field.fieldname) && field.fieldtype === 'Data')?.fieldname;
  const scopeField = fields.find((field) => field.fieldtype === 'Link')?.fieldname;
  if (labelField) {
    const groups = new Map();
    for (const row of docs.filter((entry) => !isDisabled(entry.data))) {
      const label = String(row.data?.[labelField] ?? '').trim().toUpperCase();
      if (!label) continue;
      const scope = scopeField ? String(row.data?.[scopeField] ?? '') : '';
      const key = `${scope} ${label}`;
      if (!groups.has(key)) groups.set(key, { label, scope, codes: [] });
      groups.get(key).codes.push(row.name);
    }
    const dups = [...groups.values()].filter((entry) => entry.codes.length > 1);
    if (dups.length > 0) {
      findings.push({
        doctype: name, kind: 'trung_ten_trong_cung_pham_vi', field: labelField, scope_field: scopeField ?? null,
        group_count: dups.length, affected: dups.reduce((a, entry) => a + entry.codes.length, 0),
        samples: dups.slice(0, 5).map((entry) => ({ label: entry.label, scope: entry.scope, codes: entry.codes })),
      });
    }
  }

  // 4. Select ngoài danh sách, Link trỏ hư không
  for (const field of fields) {
    if (field.fieldtype !== 'Select' && field.fieldtype !== 'Link') continue;
    const allowed = field.fieldtype === 'Select'
      ? new Set(String(field.options ?? '').split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean))
      : activeNames(field.options);
    if (allowed.size === 0) continue;
    const bad = new Map();
    // Bản ghi đã ngừng dùng trỏ vào bản ghi đã ngừng dùng là bình thường — cả hai đều ngoài
    // vòng sử dụng. Soi chúng thì mỗi lần cho một nhóm nghỉ hưu lại đẻ ra một loạt báo giả.
    const liveRows = [
      ...docs.filter((row) => !isDisabled(row.data)),
      ...masters.filter((row) => !row.disabled).map((entry) => ({ name: entry.name, data: entry.data })),
    ];
    for (const row of liveRows) {
      const value = row.data?.[field.fieldname];
      if (value === undefined || value === null || value === '') continue;
      if (!allowed.has(String(value))) bad.set(String(value), (bad.get(String(value)) ?? 0) + 1);
    }
    if (bad.size > 0) {
      findings.push({
        doctype: name, kind: field.fieldtype === 'Select' ? 'select_ngoai_danh_sach' : 'link_treo',
        field: field.fieldname, target: field.options,
        broken: [...bad.values()].reduce((a, b) => a + b, 0),
        samples: [...bad.keys()].slice(0, 5),
      });
    }
  }

  summary.push({ doctype: name, documents: docs.length, master_records: masters.length, active: activeNames(name).size });
}

const report = {
  format: 'alumdoor-layer-audit/v1',
  layer: layerKey,
  title: LAYERS[layerKey].title,
  generated_at: new Date().toISOString(),
  summary,
  finding_count: findings.length,
  findings,
};
if (outPath) fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`ALUMDOOR_LAYER_AUDIT layer=${layerKey} doctypes=${summary.length} findings=${findings.length}`);
for (const row of findings) console.log(`  ${row.kind.padEnd(24)} ${row.doctype}${row.field ? '.' + row.field : ''} ${row.count ?? row.broken ?? row.group_count ?? ''}`);
