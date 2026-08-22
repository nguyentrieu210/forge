#!/usr/bin/env node
/**
 * Audit Alumdoor theo TẦNG, từ dưới lên: mỗi tầng hỏi "ĐỦ chưa".
 *
 *   node scripts/audit-alumdoor-tung-tang.mjs --d1 <file.sqlite> [--tenant demo] [--output bao-cao.json]
 *
 * Vì sao cần cái này bên cạnh cổng nhập:
 *
 * Cổng `audit-alumdoor-import-gate-local.mjs` là cổng AN TOÀN KHI GHI — nó đếm, và một phần
 * đọc từ artifact tĩnh trên đĩa chứ không phải D1. Nó trả lời được "có bao nhiêu" nhưng không
 * trả lời "tầng trên có thiếu thứ gì mà tầng dưới chưa cấp". Ba lỗi nặng nhất của đợt nhập
 * 22/08 đều lọt cổng: mất 90% BOM do tách nhóm sai, luật V4 ghi −0,05 đáng lẽ −0,03, và bỏ sót
 * nguyên cột công thức của bảng định mức. Cả ba chỉ lộ ra khi đối chiếu tầng này với tầng kia.
 *
 * Nguyên tắc của bộ này: KHÔNG đếm bản ghi. Với mỗi tầng, lấy tập giá trị mà các tầng TRÊN
 * đang thực sự trỏ tới, rồi trừ đi tập mà tầng ĐÓ cung cấp. Phần dư là thiếu — và thiếu thì
 * đích danh, dẫn được về tận bản ghi.
 *
 * CHỈ ĐỌC. Mở SQLite readOnly và từ chối mọi cờ ghi.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
const CO_GHI = ["--apply", "--execute", "--fix", "--import", "--migrate", "--deploy", "--write"];
const camp = argv.filter((a) => CO_GHI.includes(a));
if (camp.length) {
  console.error(`Bộ audit này chỉ đọc; không nhận ${camp.join(", ")}.`);
  process.exit(2);
}
const argOf = (ten, mac) => { const i = argv.indexOf(`--${ten}`); return i >= 0 ? argv[i + 1] : mac; };
const D1 = argOf("d1");
const T = argOf("tenant", "demo");
const OUT = argOf("output");
if (!D1) { console.error("thiếu --d1 <đường dẫn .sqlite>"); process.exit(2); }

const db = new DatabaseSync(path.resolve(D1), { readOnly: true });

/* ---------------------------------------------------------------------------
 * Đọc y hệt runtime: gộp documents ∪ master_records, documents thắng khi trùng
 * (doctype,name) — kể cả bản documents là bia mộ. Fixture disabled bị loại.
 * Nguồn: CATALOG_DOCUMENTS_CTE, packages/document-kernel/src/document-list.ts.
 * Đọc lệch luật này thì mọi kết luận bên dưới đều sai theo.
 * ------------------------------------------------------------------------- */
const CTE = `WITH c AS (
  SELECT name, payload_json AS p, docstatus, 'documents' AS tang
    FROM documents WHERE tenant_id=?1 AND doctype=?2
  UNION ALL
  SELECT m.name, m.data_json, 0, 'fixture'
    FROM master_records m
   WHERE m.tenant_id=?1 AND m.record_type=?2 AND m.disabled=0
     AND NOT EXISTS (SELECT 1 FROM documents o
                      WHERE o.tenant_id=m.tenant_id AND o.doctype=m.record_type AND o.name=m.name)
) SELECT name,p,docstatus,tang FROM c`;

const cache = new Map();
function doc(loai) {
  if (!cache.has(loai)) {
    cache.set(loai, db.prepare(CTE).all(T, loai).map((r) => {
      let payload = {};
      try { payload = JSON.parse(r.p); } catch { /* payload hỏng — bắt ở tầng 0 */ }
      return { name: r.name, payload, tang: r.tang };
    }));
  }
  return cache.get(loai);
}
/* "Còn dùng" phải xét cả cờ trong payload lẫn bia mộ ở tầng documents: một fixture bị người
   dùng vô hiệu hoá sẽ hiện ra là bản documents có disabled=true, không phải bản master mất đi. */
const song = (r) => r.payload?.disabled !== true && r.payload?.disabled !== 1;
const ten = (loai) => new Set(doc(loai).filter(song).map((r) => r.name));
const chuoi = (v) => String(v ?? "").normalize("NFC").trim();

const tangs = [];
function ghi(so, ten_tang, muc) {
  const thieu = muc.filter((m) => m.thieu.length);
  tangs.push({ so, ten: ten_tang, muc, dat: thieu.length === 0 });
}

/* ===========================================================================
 * TẦNG 1 — Danh mục nền. Mọi tầng trên đều trỏ vào đây, nên sai ở đây thì audit
 * tầng trên vô nghĩa: không biết đang soi vào bản nào.
 * ========================================================================= */
const items = doc("Item");
const boms = doc("Bill of Materials");
const prices = doc("Item Price");
const bomRules = doc("BOM Rule");
const policies = doc("Cutting Policy");
const profiles = doc("Geometry Profile");

/** Gom mọi giá trị mà tầng trên đang trỏ tới một danh mục, kèm nơi trỏ để còn lần ra. */
function duocTroToi(cap) {
  const m = new Map();
  for (const [gt, nguon] of cap) {
    const v = chuoi(gt);
    if (!v) continue;
    if (!m.has(v)) m.set(v, new Set());
    m.get(v).add(nguon);
  }
  return m;
}
function soi(nhan, coSan, troToi) {
  const thieu = [...troToi.entries()].filter(([v]) => !coSan.has(v))
    .map(([v, ng]) => ({ gia_tri: v, bi_tro_boi: [...ng].slice(0, 3), so_noi_tro: ng.size }));
  const khongAiDung = [...coSan].filter((v) => !troToi.has(v));
  return { nhan, co_san: coSan.size, duoc_tro_toi: troToi.size, thieu, khong_ai_dung: khongAiDung };
}

const capUom = [];
for (const it of items) for (const k of ["stock_uom", "default_purchase_uom", "default_sales_uom"]) {
  if (it.payload[k]) capUom.push([it.payload[k], `Item ${it.name}.${k}`]);
}
for (const b of boms) for (const l of b.payload.items ?? []) {
  if (l.uom) capUom.push([l.uom, `BOM ${b.name}`]);
  if (l.stock_uom) capUom.push([l.stock_uom, `BOM ${b.name}`]);
}
for (const p of prices) if (p.payload.uom) capUom.push([p.payload.uom, `Item Price ${p.name}`]);
for (const r of bomRules) if (r.payload.result_uom) capUom.push([r.payload.result_uom, `BOM Rule ${r.name}`]);

const capMau = [];
for (const b of boms) if (b.payload.color) capMau.push([b.payload.color, `BOM ${b.name}`]);
for (const it of items) if (it.payload.color) capMau.push([it.payload.color, `Item ${it.name}`]);

const capNhom = [];
for (const it of items) if (it.payload.item_group) capNhom.push([it.payload.item_group, `Item ${it.name}`]);
for (const p of prices) if (p.payload.item_group) capNhom.push([p.payload.item_group, `Item Price ${p.name}`]);
for (const g of profiles) for (const row of g.payload.item_groups ?? []) {
  if (row.item_group) capNhom.push([row.item_group, `Geometry Profile ${g.name}`]);
}
/* Nút cha của cây nhóm hàng không bao giờ có hàng trỏ thẳng vào — nó được dùng bằng cách
   LÀM CHA. Bỏ quên cạnh này thì "Tất cả mặt hàng" và 3 nút cha khác hiện ra là rác. */
for (const g of doc("Item Group")) if (g.payload.parent_item_group) {
  capNhom.push([g.payload.parent_item_group, `Item Group ${g.name} (nút cha)`]);
}

const capTruong = [];
for (const g of profiles) for (const f of g.payload.fields ?? []) {
  if (f.geometry_field) capTruong.push([f.geometry_field, `Geometry Profile ${g.name}`]);
}
for (const r of bomRules) for (const k of ["source_field", "source_field_2"]) {
  if (r.payload[k]) capTruong.push([r.payload[k], `BOM Rule ${r.name}`]);
}

const capQuyCachDo = [];
for (const it of items) if (it.payload.measurement_profile) capQuyCachDo.push([it.payload.measurement_profile, `Item ${it.name}`]);
for (const p of doc("Cutting Policy")) if (p.payload.measurement_profile) capQuyCachDo.push([p.payload.measurement_profile, `Cutting Policy ${p.name}`]);

/* Bề mặt được trỏ tới từ Item Color, không phải từ Item. Dò nhầm chỗ thì cả bốn bề mặt
   hiện ra là rác trong khi 25 màu đang trỏ vào chúng. */
const capBeMat = [];
for (const c of doc("Item Color")) if (c.payload.surface_finish) capBeMat.push([c.payload.surface_finish, `Item Color ${c.name}`]);
for (const it of items) if (it.payload.surface_finish) capBeMat.push([it.payload.surface_finish, `Item ${it.name}`]);

ghi(1, "Danh mục nền", [
  soi("UOM", ten("UOM"), duocTroToi(capUom)),
  soi("Item Color", ten("Item Color"), duocTroToi(capMau)),
  soi("Item Group", ten("Item Group"), duocTroToi(capNhom)),
  soi("Surface Finish", ten("Surface Finish"), duocTroToi(capBeMat)),
  soi("Geometry Field", ten("Geometry Field"), duocTroToi(capTruong)),
  soi("Measurement Profile", ten("Measurement Profile"), duocTroToi(capQuyCachDo)),
]);

/* ===========================================================================
 * TẦNG 2 — Hàng hoá. "Đủ" ở đây = mọi mã bị trỏ tới đều tồn tại VÀ còn dùng.
 * Tách riêng "không có" với "có nhưng đã ngừng": hai lỗi khác nhau, sửa khác nhau.
 * ========================================================================= */
const itemSong = ten("Item");
const itemMoi = new Set(items.map((r) => r.name));
const capItem = [];
for (const b of boms) {
  if (b.payload.item) capItem.push([b.payload.item, `BOM ${b.name} (thành phẩm)`]);
  for (const l of b.payload.items ?? []) if (l.item_code) capItem.push([l.item_code, `BOM ${b.name}`]);
}
for (const p of prices) if (p.payload.item_code) capItem.push([p.payload.item_code, `Item Price ${p.name}`]);
for (const r of bomRules) {
  const ap = r.payload.applicability ?? [];
  for (const a of ap) if (a.component_item) capItem.push([a.component_item, `BOM Rule ${r.name}`]);
}
const troItem = duocTroToi(capItem);
const itemThieu = [...troItem.entries()].filter(([v]) => !itemMoi.has(v))
  .map(([v, n]) => ({ gia_tri: v, bi_tro_boi: [...n].slice(0, 3), so_noi_tro: n.size }));
const itemNgung = [...troItem.entries()].filter(([v]) => itemMoi.has(v) && !itemSong.has(v))
  .map(([v, n]) => ({ gia_tri: v, bi_tro_boi: [...n].slice(0, 3), so_noi_tro: n.size }));
const thieuTruong = items.filter(song).filter((it) => !it.payload.stock_uom || !it.payload.item_group)
  .map((it) => ({ gia_tri: it.name, bi_tro_boi: [!it.payload.stock_uom && "thiếu stock_uom", !it.payload.item_group && "thiếu item_group"].filter(Boolean), so_noi_tro: 1 }));

ghi(2, "Hàng hoá", [
  { nhan: "Mã hàng bị trỏ tới nhưng KHÔNG CÓ", co_san: itemMoi.size, duoc_tro_toi: troItem.size, thieu: itemThieu, khong_ai_dung: [] },
  { nhan: "Mã hàng bị trỏ tới nhưng ĐÃ NGỪNG DÙNG", co_san: itemSong.size, duoc_tro_toi: troItem.size, thieu: itemNgung, khong_ai_dung: [] },
  { nhan: "Mã hàng thiếu trường bắt buộc", co_san: itemSong.size, duoc_tro_toi: itemSong.size, thieu: thieuTruong, khong_ai_dung: [] },
]);

/* ===========================================================================
 * TẦNG 3 — Quy đổi đơn vị. Xưởng mua theo Kg, dùng theo Mét/Cây: thiếu hệ số thì
 * tồn kho lệch im lặng, không báo lỗi ở đâu cả.
 * ========================================================================= */
const cauQuyDoi = [];
for (const it of items.filter(song)) {
  const p = it.payload;
  const dvt = new Set([p.stock_uom, p.default_purchase_uom, p.default_sales_uom].map(chuoi).filter(Boolean));
  if (dvt.size <= 1) continue;                       // một đơn vị thì không cần quy đổi
  const qd = Array.isArray(p.uom_conversions) ? p.uom_conversions : [];
  const co = new Set(qd.filter((c) => Number(c.conversion_factor ?? c.factor ?? 0) > 0).map((c) => chuoi(c.uom ?? c.to_uom)));
  const con = [...dvt].filter((u) => u !== chuoi(p.stock_uom) && !co.has(u));
  if (con.length) cauQuyDoi.push({ gia_tri: it.name, bi_tro_boi: [`${chuoi(p.stock_uom)} ↔ ${con.join("/")}`], so_noi_tro: 1 });
}
const heSoXau = items.filter(song).flatMap((it) => (Array.isArray(it.payload.uom_conversions) ? it.payload.uom_conversions : [])
  .filter((c) => !(Number(c.conversion_factor ?? c.factor ?? 0) > 0))
  .map((c) => ({ gia_tri: it.name, bi_tro_boi: [`${chuoi(c.uom ?? c.to_uom)} = ${c.conversion_factor ?? c.factor}`], so_noi_tro: 1 })));

ghi(3, "Quy đổi đơn vị", [
  { nhan: "Hàng nhiều đơn vị mà THIẾU hệ số", co_san: items.filter(song).length, duoc_tro_toi: cauQuyDoi.length, thieu: cauQuyDoi, khong_ai_dung: [] },
  { nhan: "Hệ số quy đổi bằng 0 hoặc không hợp lệ", co_san: 0, duoc_tro_toi: heSoXau.length, thieu: heSoXau, khong_ai_dung: [] },
]);

/* ===========================================================================
 * TẦNG 4 — Hình học. "Đủ" = mỗi bộ quy cách có đủ luật để tính MỌI trường Tự tính
 * của nó. Thiếu một luật thì đơn hàng dùng bộ đó dừng giữa chừng lúc chạy, không
 * phải lúc nhập liệu — nên phải bắt ở đây.
 * ========================================================================= */
const luatTheoBo = new Map();
for (const p of policies) {
  const bo = chuoi(p.payload.geometry_profile);
  if (!luatTheoBo.has(bo)) luatTheoBo.set(bo, []);
  // Trường luật tên là `geometry_rules`. Đoán sai tên trường thì mọi bộ quy cách hiện ra
  // "thiếu luật" và cả tầng này thành báo động giả — đã dính đúng thế ở bản đầu.
  for (const r of p.payload.geometry_rules ?? []) luatTheoBo.get(bo).push({ ...r, tu: p.name });
}
const boThieuLuat = [];
const boThieuNhom = [];
const nhomCua = new Set(items.filter(song).map((it) => chuoi(it.payload.item_group))
  .filter((g) => /^Cửa /.test(g)));
const nhomDuocPhu = new Set();
for (const g of profiles) {
  for (const row of g.payload.item_groups ?? []) nhomDuocPhu.add(chuoi(row.item_group));
  const tuTinh = (g.payload.fields ?? []).filter((f) => chuoi(f.role) === "CALCULATED").map((f) => chuoi(f.geometry_field));
  const luat = luatTheoBo.get(g.name) ?? [];
  const coLuat = new Set(luat.map((r) => chuoi(r.target_field)));
  const con = tuTinh.filter((f) => !coLuat.has(f));
  if (con.length) boThieuLuat.push({ gia_tri: g.name, bi_tro_boi: con.map((f) => `chưa có luật tính ${f}`), so_noi_tro: con.length });
}
for (const n of nhomCua) if (!nhomDuocPhu.has(n)) boThieuNhom.push({ gia_tri: n, bi_tro_boi: ["không bộ quy cách nào phủ nhóm này"], so_noi_tro: 1 });
const boCuaChinhSach = policies.filter((p) => !ten("Geometry Profile").has(chuoi(p.payload.geometry_profile)))
  .map((p) => ({ gia_tri: p.name, bi_tro_boi: [`trỏ bộ quy cách không có: ${chuoi(p.payload.geometry_profile) || "(trống)"}`], so_noi_tro: 1 }));

ghi(4, "Hình học", [
  { nhan: "Nhóm cửa chưa có bộ quy cách", co_san: nhomDuocPhu.size, duoc_tro_toi: nhomCua.size, thieu: boThieuNhom, khong_ai_dung: [] },
  { nhan: "Bộ quy cách thiếu luật cho trường Tự tính", co_san: profiles.length, duoc_tro_toi: profiles.length, thieu: boThieuLuat, khong_ai_dung: [] },
  { nhan: "Chính sách cắt trỏ bộ quy cách không có", co_san: profiles.length, duoc_tro_toi: policies.length, thieu: boCuaChinhSach, khong_ai_dung: [] },
]);

/* ===========================================================================
 * TẦNG 5 — Định mức. Hai câu khác nhau: mã bán nào chưa có BOM, và dòng BOM nào
 * để trống số lượng mà không có luật nào tính ra nó.
 * ========================================================================= */
const maBan = items.filter(song).filter((it) => it.payload.is_sales_item === true).map((r) => r.name);
const coBom = new Set(boms.filter((b) => b.payload.is_active !== false).map((b) => chuoi(b.payload.item)));
/* Hàng MUA NGOÀI thì không có định mức, và đòi nó là đòi sai: bulông, bạc đạn, bình lưu điện
   nhập về bán lại thì lấy đâu ra cấu kiện. Chỉ hỏi định mức ở hàng TỰ SẢN XUẤT. Không lọc chỗ
   này thì 93 trong 114 mã báo thiếu là báo nhầm, và cái thiếu thật bị chôn trong đống đó. */
const tuLam = (m) => chuoi(items.find((i) => i.name === m)?.payload.supply_type) !== "Mua ngoài";
const chuaBom = maBan.filter(tuLam).filter((m) => !coBom.has(m))
  .map((m) => ({ gia_tri: m, bi_tro_boi: [chuoi(items.find((i) => i.name === m)?.payload.item_group)], so_noi_tro: 1 }));

/* Đếm "có BOM" là sai chỗ này. Dòng tiêu đề của bảng định mức mang chính tên thành phẩm; nếu
   bộ dựng BOM không loại nó ra, nó thành một dòng cấu kiện trỏ về chính mã cha. BOM ấy vẫn
   tồn tại, vẫn được đếm là "đã có định mức", nhưng mở ra thì rỗng — hoặc tệ hơn, nổ vòng lặp
   khi bung cấu kiện. Nên tách bạch: dòng tự trỏ, BOM rỗng, và BOM có cấu kiện thật. */
const capThat = (b) => (b.payload.items ?? []).filter((l) => chuoi(l.item_code) !== chuoi(b.payload.item));
const tuTro = boms.filter((b) => capThat(b).length < (b.payload.items ?? []).length)
  .map((b) => ({ gia_tri: `${b.name} · ${chuoi(b.payload.item)}`, bi_tro_boi: ["có dòng cấu kiện trỏ về chính thành phẩm"], so_noi_tro: 1 }));
const bomRong = boms.filter((b) => capThat(b).length === 0)
  .map((b) => ({ gia_tri: `${b.name} · ${chuoi(b.payload.item)}`, bi_tro_boi: ["không có cấu kiện thật nào"], so_noi_tro: 1 }));
const laCua = (m) => /^Cửa /.test(chuoi(items.find((i) => i.name === m)?.payload.item_group));
const bomTheoMa = new Map(boms.map((b) => [chuoi(b.payload.item), b]));
const cuaThieu = maBan.filter(laCua).filter((m) => {
  const b = bomTheoMa.get(m);
  return !b || capThat(b).length === 0;
}).map((m) => ({
  gia_tri: m,
  bi_tro_boi: [bomTheoMa.get(m) ? "có BOM nhưng rỗng" : "chưa có BOM", chuoi(items.find((i) => i.name === m)?.payload.item_group)],
  so_noi_tro: 1,
}));

/* Dòng "Theo kích thước" cố ý để trống số lượng — số chỉ có khi biết kích thước đơn hàng.
   Nó chỉ là lỗi khi KHÔNG có luật nào phủ (loại cửa · mã cấu kiện) đó. */
const luatPhu = new Set();
for (const r of bomRules) for (const a of r.payload.applicability ?? []) {
  if (a.component_item) luatPhu.add(`${chuoi(a.door_type)} ${chuoi(a.component_item)}`);
  if (a.component_item) luatPhu.add(`* ${chuoi(a.component_item)}`);
}
/*
 * Loại cửa đọc từ `Item.door_type` trước, chỉ suy từ nhóm hàng khi mã không khai.
 * Nhóm "Cửa tấm liền Úc" chứa cả cửa Úc lẫn cửa Đức AL70 kéo tay — suy từ nhóm là sai 10 mã.
 */
const nhomToLoai = { "Cửa CN Đức": "Cửa Đức", "Cửa tấm liền Úc": "Cửa Úc", "Cửa Đài Loan": "Cửa Đài Loan", "Cửa Đài Loan Inox": "Cửa Đài Loan", "Cửa kéo Đài Loan": "Cửa Đài Loan", "Cửa Lưới": "Cửa Lưới", "Cửa Siêu Trường": "Cửa Siêu Trường" };
const loaiCua = (ma) => {
  const it = items.find((i) => i.name === ma)?.payload ?? {};
  return chuoi(it.door_type) || nhomToLoai[chuoi(it.item_group)] || "*";
};
const dongTrong = [];
for (const b of boms) {
  const loai = loaiCua(chuoi(b.payload.item));
  for (const l of b.payload.items ?? []) {
    const trong = l.qty === null || l.qty === undefined || l.qty === "";
    if (!trong) continue;
    /* Dòng "Theo số lá" cố ý để trống: số lượng do `calculateLeafPlan` tính từ chiều cao và
       bản lá, không phải do BOM Rule. BOM Rule chỉ biết làm tròn NONE/ROUND/CEIL/FLOOR nên
       không diễn được phép chia lá có ngưỡng. Cổng nhập đã bỏ qua loại dòng này; chỗ này
       không bỏ thì hai bộ audit nói ngược nhau về cùng một dòng. */
    if (chuoi(l.qty_basis) === "Theo số lá") continue;
    const ma = chuoi(l.item_code);
    if (luatPhu.has(`${loai} ${ma}`) || luatPhu.has(`* ${ma}`)) continue;
    dongTrong.push({ gia_tri: `${b.name} · ${ma}`, bi_tro_boi: [`${loai}: không luật nào tính số lượng`], so_noi_tro: 1 });
  }
}

ghi(5, "Định mức", [
  { nhan: "BOM tự chứa chính nó", co_san: boms.length, duoc_tro_toi: boms.length, thieu: tuTro, khong_ai_dung: [] },
  { nhan: "BOM rỗng (không cấu kiện thật)", co_san: boms.length, duoc_tro_toi: boms.length, thieu: bomRong, khong_ai_dung: [] },
  { nhan: "Mã CỬA chưa có định mức dùng được", co_san: boms.length, duoc_tro_toi: maBan.filter(laCua).length, thieu: cuaThieu, khong_ai_dung: [] },
  { nhan: "Mã bán (mọi loại) chưa có BOM", co_san: coBom.size, duoc_tro_toi: maBan.length, thieu: chuaBom, khong_ai_dung: [] },
  { nhan: "Dòng BOM trống số lượng mà không có luật", co_san: bomRules.length, duoc_tro_toi: boms.reduce((s, b) => s + (b.payload.items ?? []).length, 0), thieu: dongTrong, khong_ai_dung: [] },
]);

/* ===========================================================================
 * TẦNG 6 — Giá.
 * ========================================================================= */
const bacCo = ten("Bậc diện tích");
const capBac = prices.filter(song).filter((p) => p.payload.area_tier).map((p) => [p.payload.area_tier, `Item Price ${p.name}`]);
const coGia = new Set(prices.filter(song).map((p) => chuoi(p.payload.item_code)));
const chuaGia = maBan.filter((m) => !coGia.has(m))
  .map((m) => ({ gia_tri: m, bi_tro_boi: [chuoi(items.find((i) => i.name === m)?.payload.item_group)], so_noi_tro: 1 }));
const giaTam = prices.filter(song).filter((p) => chuoi(p.payload.price_variant) === "TAM_CHUA_CHOT")
  .map((p) => ({ gia_tri: chuoi(p.payload.item_code), bi_tro_boi: [`${p.name} = ${p.payload.rate}`], so_noi_tro: 1 }));

ghi(6, "Giá", [
  soi("Bậc diện tích", bacCo, duocTroToi(capBac)),
  { nhan: "Mã BÁN chưa có giá", co_san: coGia.size, duoc_tro_toi: maBan.length, thieu: chuaGia, khong_ai_dung: [] },
  { nhan: "Giá còn cắm cờ tạm", co_san: prices.length, duoc_tro_toi: giaTam.length, thieu: giaTam, khong_ai_dung: [] },
]);

/* ===========================================================================
 * TẦNG 7 — Chứng từ & sổ sách. Sổ không có khoá ngoại về documents, nên bút toán
 * mồ côi không bao giờ tự lộ ra — phải hỏi thẳng.
 * ========================================================================= */
const SO = ["gl_entries", "stock_ledger_entries", "payment_ledger_entries", "purchase_order_progress_entries"];
const moCoi = [];
for (const s of SO) {
  for (const r of db.prepare(`SELECT DISTINCT voucher_type vt,voucher_no vn FROM ${s} WHERE tenant_id=?`).all(T)) {
    const co = db.prepare("SELECT COUNT(*) c FROM documents WHERE tenant_id=? AND doctype=? AND name=?").get(T, r.vt, r.vn).c;
    if (!co) moCoi.push({ gia_tri: `${r.vt} ${r.vn}`, bi_tro_boi: [`${s}: chứng từ không còn`], so_noi_tro: 1 });
  }
}
const fk = db.prepare("PRAGMA foreign_key_check").all();

ghi(7, "Chứng từ & sổ sách", [
  { nhan: "Bút toán mồ côi (chứng từ đã mất)", co_san: 0, duoc_tro_toi: moCoi.length, thieu: moCoi, khong_ai_dung: [] },
  { nhan: "Vi phạm khoá ngoại", co_san: 0, duoc_tro_toi: fk.length, thieu: fk.map((r) => ({ gia_tri: JSON.stringify(r), bi_tro_boi: [], so_noi_tro: 1 })), khong_ai_dung: [] },
]);

/* ------------------------------- in ra -------------------------------- */
const W = 46;
console.log(`\nAUDIT THEO TẦNG — tenant ${T}\n${"═".repeat(74)}`);
for (const t of tangs) {
  console.log(`\nTẦNG ${t.so} — ${t.ten}   ${t.dat ? "✔ ĐỦ" : "✘ THIẾU"}`);
  for (const m of t.muc) {
    const n = m.thieu.length;
    console.log(`   ${n ? "✘" : "✔"} ${m.nhan.padEnd(W)} ${n ? `thiếu ${n}` : "đủ"}`
      + (m.khong_ai_dung?.length ? `   · ${m.khong_ai_dung.length} mục không ai dùng` : ""));
    for (const x of m.thieu.slice(0, 6)) console.log(`        ${chuoi(x.gia_tri).slice(0, 44).padEnd(46)} ← ${(x.bi_tro_boi ?? []).join(" · ").slice(0, 68)}`);
    if (n > 6) console.log(`        … và ${n - 6} mục nữa`);
  }
}
const dat = tangs.filter((t) => t.dat).length;
console.log(`\n${"═".repeat(74)}`);
console.log(`TẦNG ĐẠT: ${dat}/${tangs.length}`);
console.log(`Tầng thấp nhất chưa đạt: ${tangs.find((t) => !t.dat)?.so ?? "—"}  ← sửa từ đây, sửa tầng trên trước là phải làm lại`);
console.log(`ALUMDOOR_AUDIT_TANG_${dat === tangs.length ? "PASS" : "FAIL"} dat=${dat}/${tangs.length}`);

if (OUT) {
  fs.writeFileSync(path.resolve(OUT), JSON.stringify({
    format: "alumdoor-audit-tung-tang/v1", generated_at: new Date().toISOString(),
    mode: "read-only", tenant: T, d1: path.resolve(D1), tang_dat: dat, tang_tong: tangs.length, tangs,
  }, null, 2), "utf8");
  console.log(`\nbáo cáo đầy đủ: ${path.resolve(OUT)}`);
}
db.close();
