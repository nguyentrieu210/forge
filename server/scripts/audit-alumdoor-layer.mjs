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
  const docActive = new Set(docs.filter((row) => !isDisabled(row.data)).map((row) => row.name));
  const masterActive = new Set(masters.filter((row) => !row.disabled).map((row) => row.name));
  const onlyDoc = [...docActive].filter((row) => !masterActive.has(row));
  const onlyMaster = [...masterActive].filter((row) => !docActive.has(row));
  // Danh mục chỉ tồn tại ở MỘT kho là bình thường (fixture thuần, hoặc doctype thuần). Chỉ báo
  // khi cả hai kho đều có dữ liệu mà lại lệch nhau — đó mới là hai bản ghi tranh nhau.
  if (docActive.size > 0 && masterActive.size > 0 && (onlyDoc.length || onlyMaster.length)) {
    findings.push({ doctype: name, kind: 'hai_kho_lech', only_documents: onlyDoc.slice(0, 8), only_master_records: onlyMaster.slice(0, 8), counts: { documents: docActive.size, master_records: masterActive.size } });
  }

  // 2. trường bắt buộc
  const required = fields.filter((field) => field.required);
  const missing = new Map();
  for (const row of [...docs, ...masters.map((entry) => ({ name: entry.name, data: entry.data }))]) {
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

  // 3. trùng tên hiển thị
  const labelField = fields.find((field) => /_(name|ten)$/.test(field.fieldname) && field.fieldtype === 'Data')?.fieldname;
  if (labelField) {
    const groups = new Map();
    for (const row of docs) {
      const key = String(row.data?.[labelField] ?? '').trim().toUpperCase();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row.name);
    }
    const dups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
    if (dups.length > 0) {
      findings.push({ doctype: name, kind: 'trung_ten', field: labelField, group_count: dups.length, affected: dups.reduce((a, [, rows]) => a + rows.length, 0), samples: dups.slice(0, 5).map(([label, rows]) => ({ label, codes: rows })) });
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
    for (const row of [...docs, ...masters.map((entry) => ({ name: entry.name, data: entry.data }))]) {
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
