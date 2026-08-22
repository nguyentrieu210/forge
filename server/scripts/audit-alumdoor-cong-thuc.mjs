#!/usr/bin/env node
/**
 * Đối chiếu CÔNG THỨC CẮT giữa hai nơi khai chúng, và tìm chỗ khai thiếu.
 *
 *   node scripts/audit-alumdoor-cong-thuc.mjs --d1 <file.sqlite> [--tenant demo]
 *
 * Cùng một kích thước cắt được khai ở hai chỗ, vì hai mục đích:
 *   - `Cutting Policy.geometry_rules` — luật hình học, máy dùng khi tính đơn.
 *   - `BOM Rule` — luật số lượng cho từng dòng cấu kiện.
 * Hai bên lệch nhau thì không màn hình nào kêu: mỗi bên nhìn riêng đều hợp lệ. Đợt nhập
 * 22/08 đã dính đúng kiểu này — luật V4 lấy nhầm công thức của trục, −0,05 thay vì −0,03,
 * và chỉ lộ khi đem hai bên soi vào nhau.
 *
 * Kiểm ba thứ:
 *   1. Mỗi chính sách có đủ luật cho MỌI trường Tự tính của bộ quy cách nó dùng chưa.
 *      Kiểm theo TỪNG CHÍNH SÁCH chứ không gom theo bộ: lúc chạy, `chooseRule` chỉ nhìn
 *      luật của chính sách đang áp, nên hai chính sách chung một bộ không bù được cho nhau.
 *   2. Nhiều chính sách cùng phủ một nhóm hàng → lúc chạy không biết chọn cái nào.
 *   3. BOM Rule và Cutting Policy có nói cùng một con số không.
 *
 * CHỈ ĐỌC.
 */
import path from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
for (const c of ["--apply", "--execute", "--fix", "--import", "--migrate", "--deploy"]) {
  if (argv.includes(c)) { console.error(`Bộ audit này chỉ đọc; không nhận ${c}.`); process.exit(2); }
}
const argOf = (t, d) => { const i = argv.indexOf(`--${t}`); return i >= 0 ? argv[i + 1] : d; };
const D1 = argOf("d1");
const T = argOf("tenant", "demo");
if (!D1) { console.error("thiếu --d1 <đường dẫn .sqlite>"); process.exit(2); }
const db = new DatabaseSync(path.resolve(D1), { readOnly: true });

const M = (rt) => db.prepare("SELECT name,data_json p FROM master_records WHERE tenant_id=? AND record_type=? AND disabled=0").all(T, rt)
  .map((r) => ({ name: r.name, ...JSON.parse(r.p) }));
const s = (v) => String(v ?? "").normalize("NFC").trim();
const num = (v) => Number(v ?? 0) || 0;

const profiles = new Map(M("Geometry Profile").map((g) => [g.name, g]));
const policies = M("Cutting Policy");
const bomRules = M("BOM Rule");

let loi = 0;
const bao = (nhan, ds) => {
  console.log(`\n${ds.length ? "✘" : "✔"} ${nhan}${ds.length ? ` — ${ds.length}` : " — đủ"}`);
  for (const d of ds) console.log(`     ${d}`);
  loi += ds.length;
};

/* ---- 1. chính sách nào thiếu luật ---- */
const thieu = [];
for (const p of policies) {
  const g = profiles.get(s(p.geometry_profile));
  if (!g) { thieu.push(`${p.name}: trỏ bộ quy cách không có (${s(p.geometry_profile) || "trống"})`); continue; }
  const tuTinh = (g.fields ?? []).filter((f) => s(f.role) === "CALCULATED").map((f) => s(f.geometry_field));
  const co = new Set((p.geometry_rules ?? []).map((r) => s(r.target_field)));
  for (const f of tuTinh) if (!co.has(f)) thieu.push(`${p.name}: bộ ${g.name} khai ${f} là Tự tính, chính sách không có luật tính nó`);
}
bao("Chính sách đủ luật cho mọi trường Tự tính", thieu);

/* ---- 2. mỗi MÃ CỬA chỉ được một chính sách ----
 *
 * Kiểm theo MÃ, không theo nhóm hàng. Hai chính sách chung một nhóm là HỢP LỆ: runtime chọn
 * bằng `Item.door_type` (`selectDoorPolicy` lọc door_type trước, item_group chỉ để phân mức
 * cụ thể). Nhóm "Cửa tấm liền Úc" chứa cả 8 cửa Úc (door_type "Cửa Úc", bản lá 0,465) lẫn
 * 2 cửa Đức AL70 kéo tay (door_type "Cửa tấm liền Úc", bản lá 0,068) — đúng theo tài liệu
 * quy trình, mục "ĐƠN HÀNG CỬA ĐỨC KÉO TAY (NHÓM SP CỬA TẤM LIỀN ÚC)".
 *
 * Bản kiểm cũ đếm theo nhóm nên báo cặp này là chồng chéo. Đó là BÁO ĐỘNG GIẢ, và ngày
 * 22/08 tôi đã hành động theo nó: đổi door_type của chính sách, tắt chính sách kia, và
 * chuyển 2 cửa Đức sang nhóm khác — hỏng cả ba, phải hoàn tác.
 */
const items = db.prepare(`SELECT name,payload_json p FROM documents WHERE tenant_id=? AND doctype='Item'`).all(T)
  .map((r) => ({ name: r.name, ...JSON.parse(r.p) }))
  .filter((it) => it.disabled !== true && s(it.door_type));
const nhieuCS = [];
for (const it of items) {
  const hop = policies.filter((p) => s(p.door_type) === s(it.door_type));
  if (hop.length > 1) {
    const cuThe = hop.filter((p) => s(p.item_group) === s(it.item_group));
    if (cuThe.length !== 1) nhieuCS.push(`${it.name} (door_type "${s(it.door_type)}"): ${hop.map((p) => p.name).join("  ·  ")}`);
  } else if (!hop.length) nhieuCS.push(`${it.name}: door_type "${s(it.door_type)}" không chính sách nào nhận`);
}
bao("Mỗi mã cửa đúng một chính sách", nhieuCS);

/* ---- 3. luật trùng mức trong cùng chính sách ---- */
const trungMuc = [];
for (const p of policies) {
  const theoDich = new Map();
  for (const r of p.geometry_rules ?? []) {
    const k = `${s(r.target_field)}|${s(r.customer_group)}|${s(r.ray_type)}|${num(r.priority)}`;
    (theoDich.get(k) ?? theoDich.set(k, []).get(k)).push(r);
  }
  for (const [k, v] of theoDich) {
    if (v.length > 1) trungMuc.push(`${p.name}: ${v.length} luật cùng mức cho ${k.split("|")[0]} — engine sẽ ném lỗi, không đoán`);
  }
}
bao("Không có luật trùng mức (engine từ chối đoán)", trungMuc);

/* ---- 4. đối chiếu BOM Rule ⇄ Cutting Policy ---- */
const csTheoLoai = new Map(policies.map((p) => [s(p.door_type), p]));
/* Cấu kiện nào ứng với trường hình học nào. Suy từ mã: ray→RAY_DAI, trục→TRUC_DAI, v.v. */
const truong = (ma) => /(^|_)V4/.test(ma) ? "V4_DAI"
  : /TRUC|_TR\d/.test(ma) ? "TRUC_DAI"
  : /RAY/.test(ma) ? "RAY_DAI"
  : null;

const lech = [];
const khop = [];
for (const r of bomRules) {
  if (s(r.result_kind) !== "LENGTH") continue;
  for (const a of r.applicability ?? []) {
    const ma = s(a.component_item);
    const tf = truong(ma);
    if (!tf) continue;
    const p = csTheoLoai.get(s(a.door_type));
    if (!p) { lech.push(`${r.name}: loại cửa "${s(a.door_type)}" không có chính sách cắt nào`); continue; }
    const ung = (p.geometry_rules ?? []).filter((x) => s(x.target_field) === tf);
    if (!ung.length) { lech.push(`${r.name}: ${s(a.door_type)} · ${tf} — BOM Rule có công thức, chính sách cắt KHÔNG có luật`); continue; }
    const bom = (s(r.operator) === "SUBTRACT" ? -1 : s(r.operator) === "ADD" ? 1 : 0) * num(r.operand);
    const hop = ung.some((x) => {
      const cs = (s(x.operator) === "SUBTRACT" ? -1 : s(x.operator) === "ADD" ? 1 : 0) * num(x.operand_m);
      return Math.abs(cs - bom) < 1e-9 && s(x.source_field) === s(r.source_field);
    });
    const mo = `${s(r.source_field)} ${bom >= 0 ? "+" : "−"} ${Math.abs(bom).toFixed(3)}`;
    if (hop) khop.push(`${s(a.door_type)} · ${ma} · ${mo}`);
    else {
      lech.push(`${s(a.door_type)} · ${ma} · ${tf}`
        + `\n          BOM Rule       ${mo}   (${r.name})`
        + `\n          Chính sách cắt ${ung.map((x) => `${s(x.source_field)} ${s(x.operator) === "SUBTRACT" ? "−" : "+"} ${num(x.operand_m).toFixed(3)}${s(x.ray_type) ? ` [${s(x.ray_type)}]` : ""}`).join(" | ")}`);
    }
  }
}
bao("BOM Rule khớp Cutting Policy", lech);
console.log(`     (${khop.length} cặp khớp)`);

console.log(`\n${"═".repeat(70)}`);
console.log(`ALUMDOOR_AUDIT_CONG_THUC_${loi ? "FAIL" : "PASS"} lỗi=${loi}`);
db.close();
