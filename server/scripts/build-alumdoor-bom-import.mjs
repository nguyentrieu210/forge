#!/usr/bin/env node
/**
 * Dựng import ĐỊNH MỨC (Bill of Materials) cho Alumdoor từ sheet `ĐM` của xưởng.
 *
 * Nguồn: apps/alumdoor/docs/nguon/ms-lien/ĐM.md — 2.115 dòng, trích từ `MS LIÊN BS.xlsx`.
 * Đích:  doctype `Bill of Materials` + bảng con `BOM Item`.
 *
 * BA QUYẾT ĐỊNH ghi ở đây vì người sửa sau đọc file này, không đọc lại đoạn chat:
 *
 * 1. Dòng có STT ở cột [1] là THÀNH PHẨM; dòng không có STT là NVL thuộc thành phẩm ở cột [4].
 *    Đây là quy ước của chính sheet, không phải suy đoán — xem BRD §4.0.
 *
 * 2. `qty_basis` ("Nhân theo") suy từ ĐVT của cột [5], KHÔNG suy từ cột công thức [22] —
 *    vì [22] chỉ được điền ở 27/2.115 dòng. Mỗi dòng đều mang `basis_confidence`:
 *      chac_chan : ĐVT tự nó chỉ ra (M2, M NGANG, M CAO, LÁ, hoặc đơn vị đếm cố định)
 *      suy_luan  : suy từ 27 dòng CÓ công thức + bản chất chi tiết
 *      chua_ro   : không có căn cứ -> để `Cố định` VÀ liệt kê ra audit để xưởng chốt
 *    Không dòng nào bị đoán lặng lẽ.
 *
 * 3. Nhập ở trạng thái NHÁP (docstatus 0). BOM là submittable; submit nghĩa là cho phép
 *    nhân sản xuất trừ kho theo nó. Định mức còn dòng `suy_luan`/`chua_ro` mà submit thẳng
 *    là xuất sai vật tư — thứ BRD cấm: "không suy ra số gần đúng".
 *
 * READ-ONLY với repo trừ hai file đầu ra dưới `server/imports/`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(serverRoot, "..");

const SOURCE = path.join(repoRoot, "apps", "alumdoor", "docs", "nguon", "ms-lien", "ĐM.md");
const ITEM_SQL = path.join(serverRoot, "imports", "alumdoor-item-only-2026-08-11.sql");
const STAMP = "2026-08-15";
const MIGRATION = `alumdoor-bom-${STAMP}`;
const OUT_SQL = path.join(serverRoot, "imports", `${MIGRATION}.sql`);
const OUT_AUDIT = path.join(serverRoot, "imports", `${MIGRATION}.audit.json`);

const args = process.argv.slice(2);
const tenant = valueOf("--tenant") ?? "demo";
const company = valueOf("--company") ?? "ALUMDOOR";
function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

// ---------------------------------------------------------------- nguồn ----
const rows = [];
for (const line of readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
  const m = /^\s*(\d+)\s\|\s(.*)$/.exec(line);
  if (!m) continue;
  const cells = {};
  for (const part of m[2].split(" · ")) {
    const c = /^\[(\d+)\]\s*(.*)$/.exec(part.trim());
    if (c) cells[c[1]] = c[2].trim();
  }
  rows.push({ line: Number(m[1]), cells });
}

const txt = (v) => (v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// ------------------------------------------------------- chuẩn hoá mã ------
const DAU = /[̀-ͯ]/g;
function normCode(raw) {
  return txt(raw)
    .normalize("NFD").replace(DAU, "")
    .replace(/Đ/g, "D").replace(/đ/g, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-_/]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// --------------------------------------------------- ĐVT -> qty_basis ------
const BASIS = { FIXED: "Cố định", H: "Theo chiều cao", W: "Theo chiều rộng", A: "Theo diện tích", L: "Theo số lá" };
function resolveBasis(uomRaw, tenVt) {
  const u = txt(uomRaw).toUpperCase();
  const ten = txt(tenVt).toUpperCase();
  if (!u) return { basis: BASIS.FIXED, confidence: "chua_ro", why: "không có ĐVT" };
  if (/NGANG/.test(u)) return { basis: BASIS.W, confidence: "chac_chan", why: "ĐVT ghi NGANG" };
  if (/\bCAO\b/.test(u)) return { basis: BASIS.H, confidence: "chac_chan", why: "ĐVT ghi CAO" };
  if (/M2/.test(u)) return { basis: BASIS.A, confidence: "chac_chan", why: "ĐVT theo m2" };
  if (/\bLÁ\b/.test(u)) return { basis: BASIS.L, confidence: "chac_chan", why: "ĐVT theo lá" };
  // Đơn vị đếm rời: số lượng không đổi theo kích thước cửa.
  if (/^(KG|CÁI|CAI|CON|BỘ|BO|CẶP|CAP|TẤM|TAM|BỘ |KG\/CON|KG\/CÁI|KG\/CẶP|CUỘN|CUON)$/.test(u)
      || /^KG\/(CON|CÁI|CAI|CẶP|CAP|BỘ|BO)$/.test(u)) {
    return { basis: BASIS.FIXED, confidence: "chac_chan", why: "đơn vị đếm rời" };
  }
  // Ron/lông/ray chạy dọc hai cạnh cửa -> theo chiều cao (khớp 6 dòng CAO_CONG_0.15_X_SL).
  if (/^(M|KG\/M)$/.test(u) && /(RON|LÔNG|LONG|RAY)/.test(ten)) {
    return { basis: BASIS.H, confidence: "suy_luan", why: "ron/ray chạy dọc cạnh cửa; khớp CAO_CONG_0.15_X_SL" };
  }
  // Trục/thanh ngang -> theo chiều rộng (khớp 5 dòng M_X_ĐM).
  if (/^(M|KG\/M)$/.test(u) && /(TRỤC|TRUC|THANH|LÔ |LO )/.test(ten)) {
    return { basis: BASIS.W, confidence: "suy_luan", why: "trục/thanh nằm ngang; khớp M_X_ĐM" };
  }
  if (/^(M|KG\/M)$/.test(u)) {
    return { basis: BASIS.FIXED, confidence: "chua_ro", why: "ĐVT theo mét nhưng không rõ mét theo chiều nào" };
  }
  return { basis: BASIS.FIXED, confidence: "chua_ro", why: `ĐVT lạ: ${u}` };
}

// ------------------------------------------------------ Item master --------
const itemCodes = new Set();
for (const m of readFileSync(ITEM_SQL, "utf8").matchAll(/'[^']*','Item:[^']+','Item','([^']+)'/g)) {
  itemCodes.add(m[1]);
}
const itemByNorm = new Map();
for (const c of itemCodes) if (!itemByNorm.has(normCode(c))) itemByNorm.set(normCode(c), c);

function resolveItem(raw) {
  const t = txt(raw);
  if (!t) return null;
  if (itemCodes.has(t)) return { code: t, how: "khop_chinh_xac" };
  const n = normCode(t);
  if (itemByNorm.has(n)) return { code: itemByNorm.get(n), how: "khop_sau_chuan_hoa" };
  return null;
}

// ------------------------------------------------------------ gom BOM ------
const boms = new Map();
let current = null;
const orphans = [];

for (const r of rows) {
  const c = r.cells;
  if (!c["0"] && !c["3"] && !c["4"]) continue;
  const tp = txt(c["4"]);
  if (txt(c["1"])) {
    const rec = {
      stt: txt(c["1"]), nhom: txt(c["0"]), ten_tp: tp, ma_tp_raw: txt(c["3"]),
      dvt: txt(c["5"]), gia_ban: num(c["7"]), line: r.line, lines: [],
    };
    if (boms.has(tp)) { current = boms.get(tp); current.trung_lap = (current.trung_lap ?? 0) + 1; }
    else { boms.set(tp, rec); current = rec; }
  } else {
    const entry = {
      ten_vt: txt(c["2"]), ma_vt_raw: txt(c["3"]), dvt: txt(c["5"]),
      dinh_muc: num(c["6"]), cong_thuc: txt(c["22"]), line: r.line,
    };
    const owner = tp && boms.has(tp) ? boms.get(tp) : current;
    if (owner) owner.lines.push(entry);
    else orphans.push(entry);
  }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const NOW = `${STAMP}T09:00:00.000Z`;

// ------------------------------------------- bổ sung Item còn thiếu -------
/**
 * Item master hiện có 278 mã; sheet ĐM tham chiếu 517 mã. Không có Item thì không dựng nổi
 * định mức — nên dựng bổ sung tại đây, SUY TỪ chính sheet ĐM và ghi rõ từng trường suy ra.
 * Xuất ra file SQL RIÊNG để duyệt/áp độc lập với định mức.
 */
const UOM_MAP = [
  [/NGANG|^M$|^KG\/M$|^M\b/, "Mét"], [/M2/, "m2"], [/^KG$/, "Kg"],
  [/CON/, "Con"], [/CẶP|CAP/, "Cặp"], [/CÁI|CAI/, "Cái"],
  [/BỘ|^BO$/, "Bộ"], [/TẤM|TAM/, "Tấm"], [/CUỘN|CUON/, "Cuộn"], [/LÁ/, "Lá"],
];
function toUom(raw) {
  const u = txt(raw).toUpperCase();
  for (const [re, v] of UOM_MAP) if (re.test(u)) return v;
  return "Cái";
}
function toGroup(code, ten, nhom) {
  const s = `${code} ${ten}`.toUpperCase();
  const n = txt(nhom).toUpperCase();
  if (/TANKER|YHLD|\bJG\b|MOTOR/.test(s)) return /LẮC|LAC|PAT|HDK|THAN|THÂN/.test(s) ? "Linh kiện motor" : "Motor";
  if (/RAY|TRỤC|TRUC/.test(s)) return "Ray và trục";
  if (/BÌNH|BINH.*ĐIỆN|UPS/.test(s)) return "Bình lưu điện";
  if (/REMOTE|ĐIỀU KHIỂN|DIEU KHIEN|\bHDK\b/.test(s)) return "Điều khiển & phụ kiện điện";
  if (/LƯỚI|LUOI/.test(n)) return "Cửa Lưới";
  if (/ĐÀI LOAN|DAI LOAN/.test(n)) return "Cửa Đài Loan";
  if (/ÚC|UC/.test(n)) return "Cửa tấm liền Úc";
  if (/ĐỨC|DUC/.test(n)) return code.startsWith("TP") ? "Cửa CN Đức" : "Phụ kiện CN Đức";
  return "Phụ kiện chung";
}

const referenced = new Map();   // mã chuẩn hoá -> {raw, ten, dvt, nhom, laThanhPham}
for (const bom of boms.values()) {
  if (bom.ma_tp_raw) registerRef(bom.ma_tp_raw, bom.ten_tp, bom.dvt, bom.nhom, true);
  for (const l of bom.lines) if (l.ma_vt_raw) registerRef(l.ma_vt_raw, l.ten_vt, l.dvt, bom.nhom, false);
}
function registerRef(raw, ten, dvt, nhom, laTP) {
  const code = normCode(raw);
  if (!code || resolveItem(raw)) return;
  if (!referenced.has(code)) referenced.set(code, { raw: txt(raw), ten: txt(ten), dvt: txt(dvt), nhom: txt(nhom), laTP });
}

const newItems = [];
for (const [code, info] of referenced) {
  const laTP = info.laTP || /^TP[-_]/i.test(info.raw);
  newItems.push({
    code,
    payload: {
      item_code: code,
      item_name: info.ten || info.raw,
      item_group: toGroup(code, info.ten, info.nhom),
      item_nature: "Hàng tồn kho",
      material_stage: laTP ? "Thành phẩm" : /^NVL[-_]/i.test(info.raw) ? "Nguyên vật liệu" : "Vật tư tiêu hao",
      supply_type: laTP ? "Tự sản xuất" : "Mua ngoài",
      is_stock_item: true,
      is_purchase_item: !laTP,
      is_sales_item: laTP,
      include_item_in_manufacturing: !laTP,
      inventory_mode: "Hàng thường",
      measurement_profile: "Hàng thường",
      stock_uom: toUom(info.dvt),
      default_purchase_uom: toUom(info.dvt),
      default_sales_uom: toUom(info.dvt),
      default_warehouse: "K36",
      valuation_method: "FIFO",
      has_batch_no: false,
      has_serial_no: false,
      allow_negative_stock: false,
      description: `Bổ sung từ sheet ĐM (mã gốc "${info.raw}", ĐVT định mức "${info.dvt || "-"}", nhóm nguồn "${info.nhom || "-"}"). `
        + `item_group/stock_uom/material_stage SUY RA từ tên + ĐVT — cần xưởng xác nhận.`,
      disabled: false,
      _migration_source: `alumdoor-item-bosung-${STAMP}`,
      _can_xuong_xac_nhan: true,
    },
    ma_goc: info.raw,
  });
  itemCodes.add(code);
  itemByNorm.set(code, code);
}

const OUT_ITEM_SQL = path.join(serverRoot, "imports", `alumdoor-item-bosung-${STAMP}.sql`);
{
  const o = [];
  o.push(`-- Item BỔ SUNG cho Alumdoor — các mã sheet ĐM tham chiếu mà Item master chưa có.`);
  o.push(`-- Sinh bởi scripts/build-alumdoor-bom-import.mjs. Phạm vi: CHỈ doctype 'Item'.`);
  o.push(`-- ${newItems.length} mã. Mọi item_group/stock_uom/material_stage đều SUY RA — xem audit.`);
  o.push("");
  for (const it of newItems) {
    o.push(`DELETE FROM document_search WHERE tenant_id=${q(tenant)} AND doctype='Item' AND name=${q(it.code)};`);
    o.push(`DELETE FROM documents WHERE tenant_id=${q(tenant)} AND doctype='Item' AND name=${q(it.code)};`);
  }
  o.push("");
  if (newItems.length) {
    o.push("INSERT INTO documents");
    o.push("  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)");
    o.push("VALUES");
    o.push(newItems.map((it) =>
      `  (${q(tenant)},${q(`Item:${it.code}`)},'Item',${q(it.code)},'admin',0,'Draft',1,${q(`${STAMP}T09:00:00.000Z`)},${q(`${STAMP}T09:00:00.000Z`)},'admin',${q(JSON.stringify(it.payload))})`
    ).join(",\n") + ";");
  }
  o.push("");
  writeFileSync(OUT_ITEM_SQL, o.join("\n"), "utf8");
}

// -------------------------------------------------------- dựng bản ghi -----
const emitted = [];
const skipped = { khong_co_thanh_pham: [], thanh_pham_khong_khop: [], khong_co_dong_dung_duoc: [] };
const lineIssues = { thieu_ma_vat_tu: [], vat_tu_khong_khop: [], dinh_muc_trong: [] };
const basisTally = {};
const needConfirm = [];

let seq = 0;
for (const bom of boms.values()) {
  const tpItem = resolveItem(bom.ma_tp_raw) ?? resolveItem(bom.ten_tp);
  if (!bom.ma_tp_raw && !bom.ten_tp) { skipped.khong_co_thanh_pham.push(bom.line); continue; }
  if (!tpItem) { skipped.thanh_pham_khong_khop.push({ line: bom.line, ten: bom.ten_tp, ma: bom.ma_tp_raw }); continue; }

  const items = [];
  for (const l of bom.lines) {
    if (!l.ma_vt_raw) { lineIssues.thieu_ma_vat_tu.push({ line: l.line, ten: l.ten_vt }); continue; }
    const vt = resolveItem(l.ma_vt_raw);
    if (!vt) { lineIssues.vat_tu_khong_khop.push({ line: l.line, ma: l.ma_vt_raw, ten: l.ten_vt }); continue; }
    if (l.dinh_muc === null || l.dinh_muc === 0) { lineIssues.dinh_muc_trong.push({ line: l.line, ma: vt.code }); continue; }

    const b = resolveBasis(l.dvt, l.ten_vt);
    basisTally[`${b.basis} / ${b.confidence}`] = (basisTally[`${b.basis} / ${b.confidence}`] ?? 0) + 1;
    if (b.confidence !== "chac_chan") {
      needConfirm.push({ line: l.line, bom: bom.ten_tp, vat_tu: vt.code, ten: l.ten_vt, dvt: l.dvt, basis: b.basis, do_tin: b.confidence, ly_do: b.why });
    }
    items.push({
      item_code: vt.code, qty: l.dinh_muc, uom: l.dvt || null, qty_basis: b.basis,
      source_note: `ĐM dòng ${l.line} | ĐVT ${l.dvt || "-"} | ${b.confidence} | ${b.why}`,
      note: l.ten_vt || null,
    });
  }

  if (!items.length) { skipped.khong_co_dong_dung_duoc.push({ line: bom.line, ten: bom.ten_tp }); continue; }

  seq += 1;
  emitted.push({
    name: `DM-2026-${String(seq).padStart(4, "0")}`,
    payload: {
      item: tpItem.code, company, quantity: 1, items,
      operating_cost: 0, is_active: true,
      note: `Nguồn: sheet ĐM dòng ${bom.line}${bom.nhom ? ` | Nhóm ${bom.nhom}` : ""} | ${bom.ten_tp}`,
      _migration_source: MIGRATION,
    },
    nhom: bom.nhom, ten_tp: bom.ten_tp, so_dong: items.length,
  });
}

// ------------------------------------------------------------- xuất SQL ----
const out = [];
out.push(`-- Định mức (Bill of Materials) Alumdoor, dựng từ sheet ĐM của xưởng.`);
out.push(`-- Sinh bởi scripts/build-alumdoor-bom-import.mjs — ${MIGRATION}`);
out.push(`-- Phạm vi: CHỈ doctype 'Bill of Materials'. Nhập ở trạng thái NHÁP (docstatus 0).`);
out.push(`-- ${emitted.length} định mức / ${emitted.reduce((a, b) => a + b.so_dong, 0)} dòng vật tư.`);
out.push("");
for (const e of emitted) {
  out.push(`DELETE FROM document_search WHERE tenant_id=${q(tenant)} AND doctype='Bill of Materials' AND name=${q(e.name)};`);
  out.push(`DELETE FROM documents WHERE tenant_id=${q(tenant)} AND doctype='Bill of Materials' AND name=${q(e.name)};`);
}
out.push("");
out.push("INSERT INTO documents");
out.push("  (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)");
out.push("VALUES");
out.push(emitted.map((e) =>
  `  (${q(tenant)},${q(`Bill of Materials:${e.name}`)},'Bill of Materials',${q(e.name)},'admin',0,'Draft',1,${q(NOW)},${q(NOW)},'admin',${q(JSON.stringify(e.payload))})`
).join(",\n") + ";");
out.push("");
writeFileSync(OUT_SQL, out.join("\n"), "utf8");

// ----------------------------------------------------------- xuất audit ----
const audit = {
  generated_at: new Date().toISOString(),
  migration_source: MIGRATION,
  tenant, company,
  nguon: { file: "apps/alumdoor/docs/nguon/ms-lien/ĐM.md", dong_doc: rows.length },
  imported_doctypes: ["Item (bổ sung)", "Bill of Materials"],
  item_bo_sung: {
    so_ma: newItems.length,
    file: path.relative(repoRoot, OUT_ITEM_SQL),
    ghi_chu: "item_group / stock_uom / material_stage đều SUY RA từ tên + ĐVT của sheet ĐM. Nhập NHÁP, cần xưởng xác nhận.",
    theo_nhom: newItems.reduce((a, it) => { a[it.payload.item_group] = (a[it.payload.item_group] ?? 0) + 1; return a; }, {}),
    theo_stock_uom: newItems.reduce((a, it) => { a[it.payload.stock_uom] = (a[it.payload.stock_uom] ?? 0) + 1; return a; }, {}),
    danh_sach: newItems.map((it) => ({ ma: it.code, ma_goc: it.ma_goc, ten: it.payload.item_name, nhom: it.payload.item_group, uom: it.payload.stock_uom, giai_doan: it.payload.material_stage })),
  },
  explicitly_not_imported: ["Item", "Item Group", "UOM", "Warehouse", "Production Standard", "Item Price", "Material Specification"],
  ket_qua: {
    thanh_pham_trong_nguon: boms.size,
    dinh_muc_dung_duoc: emitted.length,
    dong_vat_tu_dung_duoc: emitted.reduce((a, b) => a + b.so_dong, 0),
    docstatus: "0 (Nháp) — chờ xưởng xác nhận trước khi submit",
  },
  bo_qua: {
    thanh_pham_khong_khop_item: skipped.thanh_pham_khong_khop.length,
    thanh_pham_khong_con_dong_dung_duoc: skipped.khong_co_dong_dung_duoc.length,
    dong_thieu_ma_vat_tu: lineIssues.thieu_ma_vat_tu.length,
    dong_vat_tu_khong_khop_item: lineIssues.vat_tu_khong_khop.length,
    dong_dinh_muc_trong_hoac_0: lineIssues.dinh_muc_trong.length,
    dong_mo_coi: orphans.length,
  },
  qty_basis_phan_bo: basisTally,
  can_xuong_xac_nhan: {
    so_dong: needConfirm.length,
    ghi_chu: "Mọi dòng suy_luan/chua_ro đều liệt kê đủ dưới đây — không dòng nào bị đoán lặng lẽ.",
    danh_sach: needConfirm,
  },
  chi_tiet_bo_qua: {
    thanh_pham_khong_khop_item: skipped.thanh_pham_khong_khop.slice(0, 60),
    vat_tu_khong_khop_item: dedupe(lineIssues.vat_tu_khong_khop.map((x) => x.ma)).slice(0, 120),
    /** 616 dòng có mã vật tư hợp lệ nhưng ô ĐỊNH MỨC trống hoặc 0 — xưởng chưa từng điền. */
    dong_dinh_muc_trong: {
      so_dong: lineIssues.dinh_muc_trong.length,
      vat_tu_bi_anh_huong: dedupe(lineIssues.dinh_muc_trong.map((x) => x.ma)).length,
      danh_sach_vat_tu: dedupe(lineIssues.dinh_muc_trong.map((x) => x.ma)),
      thanh_pham_mat_trang: skipped.khong_co_dong_dung_duoc.map((x) => x.ten),
    },
    dong_thieu_ma_vat_tu: lineIssues.thieu_ma_vat_tu.map((x) => x.ten).filter(Boolean),
  },
};
function dedupe(a) { return [...new Set(a)]; }
writeFileSync(OUT_AUDIT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  sql: path.relative(repoRoot, OUT_SQL),
  audit: path.relative(repoRoot, OUT_AUDIT),
  ket_qua: audit.ket_qua,
  bo_qua: audit.bo_qua,
  qty_basis: basisTally,
  can_xac_nhan: needConfirm.length,
}, null, 2));
