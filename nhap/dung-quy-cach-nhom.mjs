/**
 * QUY CÁCH cho họ NHÔM CÂY — tách theo NHÀ CUNG CẤP.
 *
 * Bảng `data/trong-luong-nhom.json` ghi hai đến ba kg/m cho cùng một mã nhôm. Đó không phải
 * lỗi bảng: cùng biên dạng AL71 nhưng Tiến Đạt cán ra 0,389 kg/m còn MTH 0,377 — khác khuôn,
 * khác độ dày thành. Ép về một số là bịa; lấy trung bình còn tệ hơn, vì lúc đối chiếu cân
 * thực tế sẽ lệch với CẢ HAI nguồn.
 *
 * Nên mỗi (biên dạng × nhà cung cấp) là MỘT quy cách, mang đúng con số của nguồn đó.
 *
 * Item chỉ trỏ được tới MỘT quy cách. Mã nào chỉ có một nguồn thì gắn luôn; mã nào nhiều nguồn
 * thì ĐỂ TRỐNG chờ chủ xưởng chọn — gắn bừa một cái là chọn hộ nhà cung cấp cho xưởng.
 *
 * CHẠY:  node nhap/dung-quy-cach-nhom.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const NGUON = "alumdoor-quy-cach-nhom-2026-08-20";

/** Bảng dùng mã NHÀ CUNG CẤP, danh mục dùng mã nhôm — khai thẳng cặp nào ứng cặp nào. */
const ANH_XA = {
  AL595: ["TD-AL595"], AL71: ["TD-AL71N", "TD-MTH-AL71M6"], AL503: ["TD-AL503", "TD-AL503N26"],
  AL548: ["TD-AL548N", "TD-ALD-548"], AL501: ["TD-AL501", "TD-AL501N"], AL652: ["MTH-B652M5", "TD-MTH-B652"],
  AL552: ["ALD-DL552", "TD-ALD-DL552"], AL752: ["TD-AL752N", "TD-MITH-AL752M7"], AL50: ["AL50", "TD-AL50"],
  ALVIP50: ["ALVIP50", "TD-ALVIP50"], ALVIPST500: ["VIPST500", "TD-VIPST500"], ALVIPST700: ["VIPST700", "TD-VIPST700"],
  AL70_1LOP: ["AL70-1 LỚP"], AL70_2LOP: ["TD-AL70", "TD-AL70 (CŨ)", "TD-AL70-15mm"], AL75: ["AL75"],
};
/**
 * MỖI MÃ NHÀ CUNG CẤP = MỘT QUY CÁCH. Khoá mã quy cách theo mã NCC, không theo (biên dạng × NCC).
 *
 * Chủ xưởng xác nhận hậu tố `N`, `M5`, `M6`, `M7`, `N26` là BIẾN THỂ THẬT — khác khuôn, khác
 * trọng lượng. `TD-AL501` nặng 0,504 kg/m còn `TD-AL501N` 0,466, lệch 8%: gộp lại là mất một
 * con số, và mất im lặng vì bản ghi sau ghi đè bản trước mà không báo gì.
 *
 * Khoá theo mã NCC còn cho một lợi ích nữa: nhìn quy cách là truy ngược được đúng dòng trong
 * bảng trọng lượng gốc.
 */
const NCC = { TD: "Tiến Đạt", MTH: "MTH", ALD: "ALD", MITH: "MITH", CHUNG: "không ghi nguồn" };
function nhaCC(ma) {
  const t = String(ma).toUpperCase();
  if (/^TD-MITH|MITH/.test(t)) return "MITH";
  if (/^TD-MTH|^MTH-/.test(t)) return "MTH";
  if (/^TD-ALD|^ALD-/.test(t)) return "ALD";
  if (/^TD-/.test(t)) return "TD";
  return "CHUNG";
}

const w = JSON.parse(readFileSync(resolve(GOC, "data/trong-luong-nhom.json"), "utf8")).weights;
const tra = new Map(w.map((x) => [x.supplier_code, x]));

const specs = [], gan = [];
for (const [maNhom, dsNcc] of Object.entries(ANH_XA)) {
  const co = dsNcc.filter((c) => tra.has(c));
  const cua = [];
  for (const c of co) {
    const nh = nhaCC(c);
    /** Mã quy cách = mã NCC làm sạch. 1-1 với bảng gốc nên không thể đụng nhau. */
    const specCode = `NHOM-${String(c).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    cua.push(specCode);
    specs.push({
      name: specCode,
      payload: {
        spec_code: specCode,
        spec_name: `Nhôm ${maNhom.replace(/_/g, " ")} — ${c} (${NCC[nh]})`,
        material_grade: "NHOM",
        item_group: "Tôn & nhôm cây", section_code: maNhom.replace(/_/g, " "),
        theoretical_kg_per_m: tra.get(c).kg_per_m,
        note: `kg/m lấy từ data/trong-luong-nhom.json, dòng "${c}". Tệp nguồn tự ghi rằng cách đọc kg/mét-dài (thay vì kg/m2) là SUY RA, chưa xác nhận — lô nhập đầu tiên đối chiếu cân thực tế sẽ tự lộ đúng sai.`,
        disabled: false, _migration_source: NGUON,
      },
      title: `Nhôm ${maNhom}`, content: `${specCode} ${maNhom} ${c} ${NCC[nh]}`,
    });
  }
  /**
   * CHỌN SẴN MỘT QUY CÁCH khi có nhiều nguồn — chủ xưởng vẫn đổi được, nhưng ô không bỏ trống.
   *
   * Luật, theo thứ tự:
   *   1. Ưu tiên TIẾN ĐẠT — nhà cung cấp chính; chính code cũng để sẵn dung sai giao nhận 5%
   *      riêng cho họ, tức hệ thống đã coi đây là nguồn mặc định từ trước.
   *   2. Bỏ bản ĐỜI CŨ và bản dày riêng (15mm) — chúng là biến thể, không phải hàng thường mua.
   *   3. Hết cách thì lấy dòng đầu, còn hơn để trống.
   */
  const uu = (ma) => {
    const t = String(ma).toUpperCase();
    let d = 0;
    if (/^TD-/.test(t)) d += 100;                 // Tiến Đạt trước
    if (/CŨ|CU\)/.test(t)) d -= 50;                // đời cũ sau cùng
    if (/\d+MM/.test(t)) d -= 30;                  // bản dày riêng, không phải hàng thường
    return d;
  };
  const chon = [...co].sort((a, b) => uu(b) - uu(a))[0];
  const specChon = chon ? cua[co.indexOf(chon)] : null;
  gan.push({ ma: `NHOM_${maNhom}`, so_nguon: cua.length, spec: specChon, tu_dong: cua.length > 1, cac_spec: cua });
}

writeFileSync(resolve(THU_MUC, "du-lieu/15-quy-cach-nhom.json"), JSON.stringify({
  doctype: "Material Specification", so_ban_ghi: specs.length,
  nguon: "data/trong-luong-nhom.json, tách theo nhà cung cấp",
  ban_ghi: specs.map((s) => ({ ...s, payload: Object.fromEntries(Object.entries(s.payload).filter(([, v]) => v !== undefined)) })),
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/15-gan-quy-cach-nhom.json"), JSON.stringify(gan, null, 1), "utf8");

console.log(`${specs.length} quy cách cho 15 mã nhôm\n`);
for (const s of specs) console.log(`  ${s.name.padEnd(30)}${String(s.payload.theoretical_kg_per_m).padStart(6)} kg/m   ${s.payload.spec_name}`);
const motNguon = gan.filter((g) => g.spec), nhieu = gan.filter((g) => !g.spec);
console.log(`\ngắn được ngay (một nguồn): ${motNguon.length} mã`);
for (const g of motNguon) console.log(`   ${g.ma.padEnd(20)}→ ${g.spec}`);
console.log(`\nĐỂ TRỐNG chờ chủ xưởng chọn nguồn: ${nhieu.length} mã → ${nhieu.map((g) => g.ma).join(", ")}`);
