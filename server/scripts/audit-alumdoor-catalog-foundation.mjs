#!/usr/bin/env node
/**
 * Soi nền tảng danh mục Alumdoor: liên kết, công thức, và sự cần thiết của từng màn.
 *
 * ĐỌC-CHỈ. Không ghi gì vào D1. Mục đích là ra được bản đồ nâng cấp có số, không phải cảm tính.
 *
 * Bốn câu hỏi, mỗi câu một phần:
 *
 *  A. LIÊN KẾT CÓ THẬT KHÔNG — mọi trường `Link` phải trỏ tới bản ghi đang tồn tại. Link ở đây
 *     nằm trong JSON, không có khoá ngoại, nên không gì chặn một giá trị treo. Đo trên D1 hôm
 *     19/08 đã thấy 106/209 giá trị `source_item_code` không trỏ tới Item nào.
 *
 *  B. TRƯỜNG TÍNH TOÁN CÓ GIẢI THÍCH KHÔNG — công thức mà không có mô tả tiếng Việt thì người
 *     dùng không kiểm được kết quả, và người sửa sau không biết được ý định.
 *
 *  C. MÀN DANH MỤC CÓ CẦN KHÔNG — doctype khai `group: "Danh mục"` mà rỗng dữ liệu, hoặc không
 *     ai trỏ tới, thì đang chiếm chỗ trên menu mà không phục vụ ai.
 *
 *  D. MÃ CÓ ĐƠN GIẢN KHÔNG — mã nhồi thuộc tính (màu, cách bán, bậc diện tích) là mã đang gánh
 *     việc của một trường khác.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const D1 = process.env.ALUMDOOR_D1_PATH
  || path.join(process.cwd(), 'apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite');
const TENANT = process.env.ALUMDOOR_TENANT || 'demo';
const outPath = process.argv[2];
if (!fs.existsSync(D1)) throw new Error(`Khong thay D1: ${D1}`);
const db = new DatabaseSync(D1, { readOnly: true });

const brief = JSON.parse(fs.readFileSync(new URL('../briefs/alumdoor-v2.json', import.meta.url), 'utf8'));
const doctypes = brief.doctypes ?? [];

/** Brief cho phép khai trường bằng chuỗi rút gọn `ten:Kieu(Tuy chon)! Nhan`. */
function normalizeField(field) {
  if (typeof field !== 'string') {
    return {
      fieldname: field.fieldname,
      fieldtype: field.fieldtype,
      options: field.options ?? '',
      label: field.label ?? '',
      description: field.description ?? field['//'] ?? '',
    };
  }
  const match = /^([a-z_0-9]+):([A-Za-z]+)(\(([^)]*)\))?/.exec(field);
  if (!match) return { fieldname: field, fieldtype: '?', options: '', label: '', description: '' };
  const rest = field.slice(match[0].length).replace(/^[*!=]*\s*/, '').replace(/^\([^)]*\)\s*/, '');
  return { fieldname: match[1], fieldtype: match[2], options: match[4] ?? '', label: rest.trim(), description: '' };
}

const fieldsOf = (dt) => (dt.fields ?? []).map(normalizeField);

// ── nạp dữ liệu ────────────────────────────────────────────────────────────────
const docsByType = new Map();
for (const row of db.prepare('SELECT doctype, name, payload_json FROM documents WHERE tenant_id=?').all(TENANT)) {
  if (!docsByType.has(row.doctype)) docsByType.set(row.doctype, []);
  let data = {};
  try { data = JSON.parse(row.payload_json); } catch { /* bản ghi hỏng thì coi như rỗng */ }
  docsByType.get(row.doctype).push({ name: row.name, data });
}
const masterByType = new Map();
for (const row of db.prepare('SELECT record_type, name, disabled FROM master_records WHERE tenant_id=?').all(TENANT)) {
  if (!masterByType.has(row.record_type)) masterByType.set(row.record_type, new Set());
  masterByType.get(row.record_type).add(row.name);
}
const childRows = db.prepare('SELECT parent_key, child_doctype, fieldname, payload_json FROM document_children WHERE tenant_id=?').all(TENANT);

/** Bộ tên hợp lệ của một doctype là HỢP của hai kho — pickers cũng đọc hợp, nên kiểm phải khớp. */
function namesOf(doctype) {
  const out = new Set();
  for (const row of docsByType.get(doctype) ?? []) out.add(row.name);
  for (const name of masterByType.get(doctype) ?? []) out.add(name);
  return out;
}

// ── A. liên kết ───────────────────────────────────────────────────────────────
const linkFindings = [];
const childByDoctype = new Map();
for (const row of childRows) {
  if (!childByDoctype.has(row.child_doctype)) childByDoctype.set(row.child_doctype, []);
  let data = {};
  try { data = JSON.parse(row.payload_json); } catch { /* bỏ qua */ }
  childByDoctype.get(row.child_doctype).push({ parent: row.parent_key, data });
}

for (const dt of doctypes) {
  const links = fieldsOf(dt).filter((f) => f.fieldtype === 'Link' && f.options);
  if (links.length === 0) continue;
  const rows = dt.is_child
    ? (childByDoctype.get(dt.name) ?? [])
    : (docsByType.get(dt.name) ?? []).map((r) => ({ parent: r.name, data: r.data }));
  if (rows.length === 0) continue;

  for (const field of links) {
    const valid = namesOf(field.options);
    // Doctype đích không có bản ghi nào thì mọi giá trị đều "treo" một cách vô nghĩa — đó là
    // vấn đề của danh mục đích, báo riêng ở phần C, không nhân bản ở đây.
    if (valid.size === 0) continue;
    const dangling = new Map();
    let filled = 0;
    for (const row of rows) {
      const value = row.data?.[field.fieldname];
      if (value === undefined || value === null || value === '') continue;
      filled += 1;
      if (!valid.has(String(value))) dangling.set(String(value), (dangling.get(String(value)) ?? 0) + 1);
    }
    if (dangling.size === 0) continue;
    const broken = [...dangling.values()].reduce((a, b) => a + b, 0);
    linkFindings.push({
      doctype: dt.name,
      field: field.fieldname,
      target: field.options,
      filled,
      broken,
      distinct_broken: dangling.size,
      samples: [...dangling.keys()].slice(0, 5),
    });
  }
}
linkFindings.sort((a, b) => b.broken - a.broken);

// ── B. trường tính toán có mô tả tiếng Việt không ──────────────────────────────
const COMPUTED_HINT = /formula|cong_thuc|congthuc|_basis|qty_basis|rate|factor|conversion|percent|ty_le|tyle|he_so|heso|_calc|calc_|dinh_muc|dinhmuc|sqm|_qty$|thanh_tien|thanhtien/i;
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const formulaFindings = [];
for (const dt of doctypes) {
  for (const field of fieldsOf(dt)) {
    const looksComputed = COMPUTED_HINT.test(field.fieldname)
      || ['Float', 'Currency', 'Percent'].includes(field.fieldtype) && /formula|basis|factor|rate/i.test(field.fieldname);
    if (!looksComputed) continue;
    const text = `${field.description ?? ''}`.trim();
    const hasVi = VIETNAMESE.test(text) || VIETNAMESE.test(field.label ?? '');
    if (text && hasVi) continue;
    formulaFindings.push({
      doctype: dt.name,
      field: field.fieldname,
      fieldtype: field.fieldtype,
      label: field.label ?? '',
      has_description: Boolean(text),
      description_is_vietnamese: hasVi,
    });
  }
}

// ── C. màn danh mục có cần không ───────────────────────────────────────────────
const navItems = new Set(brief.navigation?.items ?? []);
const referencedBy = new Map();
for (const dt of doctypes) {
  for (const field of fieldsOf(dt)) {
    if (field.fieldtype !== 'Link' || !field.options) continue;
    if (!referencedBy.has(field.options)) referencedBy.set(field.options, new Set());
    referencedBy.get(field.options).add(`${dt.name}.${field.fieldname}`);
  }
}
const screenFindings = [];
for (const dt of doctypes) {
  if (dt.is_child) continue;
  if (dt.group !== 'Danh mục') continue;
  const rows = namesOf(dt.name).size;
  const refs = referencedBy.get(dt.name) ?? new Set();
  const onMenu = navItems.has(dt.name) && dt.menu !== false;
  let verdict = 'ok';
  if (rows === 0 && refs.size === 0) verdict = 'rong_va_khong_ai_dung';
  else if (rows === 0) verdict = 'rong_nhung_co_noi_tro_toi';
  else if (refs.size === 0) verdict = 'co_du_lieu_nhung_khong_ai_tro_toi';
  if (verdict === 'ok') continue;
  screenFindings.push({ doctype: dt.name, rows, referenced_by: [...refs].slice(0, 6), on_menu: onMenu, verdict });
}

// ── D. mã có đơn giản không ───────────────────────────────────────────────────
const CODE_SMELL = [
  ['cach_ban', /TRONBO|TACHMON|TRON_BO|TACH_MON|-TM$|_TM$/i],
  ['bac_dien_tich', /\d+\s*-\s*\d+\s*m²|m²|TREN\d+|DUOI\d+/i],
  ['mau', /_(GS|VK|THO|TRANG|DEN|NAU|GHI|VANG|XAM)\b|-(GS|VK|THO)$/i],
  ['do_day', /\d+(\.\d+)?\s*(LY|ly)\b/],
  ['co_dau_cach', / /],
];
const codeFindings = [];
for (const [reason, pattern] of CODE_SMELL) {
  const hits = (docsByType.get('Item') ?? []).filter((r) => pattern.test(r.name));
  if (hits.length === 0) continue;
  codeFindings.push({ reason, count: hits.length, samples: hits.slice(0, 4).map((r) => r.name) });
}
// Trùng tên hàng = nhiều mã cho một món.
const byItemName = new Map();
for (const row of docsByType.get('Item') ?? []) {
  const key = String(row.data.item_name ?? '').trim().toUpperCase();
  if (!key) continue;
  if (!byItemName.has(key)) byItemName.set(key, []);
  byItemName.get(key).push(row.name);
}
const duplicateNames = [...byItemName.entries()].filter(([, v]) => v.length > 1)
  .map(([item_name, codes]) => ({ item_name, codes })).sort((a, b) => b.codes.length - a.codes.length);

// ── E. tầng nhập liệu ─────────────────────────────────────────────────────────
const LAYERS = {
  'L0 nền tảng': ['UOM', 'Item Group', 'Item Color', 'Surface Finish', 'Warehouse', 'Price List', 'Currency'],
  'L1 quy cách kỹ thuật': ['Measurement Profile', 'Geometry Field', 'Geometry Profile', 'Material Specification', 'Quy cách cửa'],
  'L2 mặt hàng': ['Item', 'Supplier Item'],
  'L3 giá': ['Item Price', 'Pricing Rule', 'Pricing Scope', 'Bậc diện tích'],
  'L4 định mức / sản xuất': ['BOM Rule', 'BOM Template', 'Bill of Materials', 'Cutting Policy', 'Production Standard', 'Ngưỡng chọn Motor', 'Manufacturing Routing', 'Operation', 'Workstation'],
  'L5 đối tác': ['Customer', 'Supplier'],
  'L6 vận hành / địa bàn': ['Lý do huỷ', 'Nguyên nhân chênh lệch', 'Nguyên nhân cửa lỗi', 'Tỉnh Thành', 'Phường Xã', 'Địa chỉ giao lắp', 'Tài khoản ngân hàng'],
};
const layerReport = {};
for (const [layer, list] of Object.entries(LAYERS)) {
  layerReport[layer] = list.map((name) => ({ doctype: name, rows: namesOf(name).size }));
}

const report = {
  format: 'alumdoor-catalog-foundation-audit/v1',
  generated_at: new Date().toISOString(),
  tenant: TENANT,
  brief_version: brief.version,
  summary: {
    dangling_link_fields: linkFindings.length,
    dangling_link_values: linkFindings.reduce((a, b) => a + b.broken, 0),
    formula_fields_without_vietnamese: formulaFindings.length,
    questionable_screens: screenFindings.length,
    code_smells: codeFindings.reduce((a, b) => a + b.count, 0),
    duplicate_item_name_groups: duplicateNames.length,
  },
  links: linkFindings,
  formulas: formulaFindings,
  screens: screenFindings,
  codes: codeFindings,
  duplicate_item_names: duplicateNames.slice(0, 60),
  layers: layerReport,
};

if (outPath) fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`ALUMDOOR_CATALOG_FOUNDATION_AUDIT version=${brief.version} `
  + `dangling_fields=${report.summary.dangling_link_fields} dangling_values=${report.summary.dangling_link_values} `
  + `formula_no_vi=${report.summary.formula_fields_without_vietnamese} screens=${report.summary.questionable_screens} `
  + `code_smells=${report.summary.code_smells} dup_names=${report.summary.duplicate_item_name_groups}`);
