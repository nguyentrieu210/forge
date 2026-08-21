/**
 * DỰNG BẢNG GIÁ BÁN từ cột "Giá bán" của sheet ĐM.
 *
 * MỘT GIÁ MỖI MÃ — chủ xưởng chốt 20/08/2026: "ĐM có giá theo từng mã". Sheet ĐM không có cột
 * bậc diện tích (quét 34.678 dòng × 23 cột, 0 dòng nhắc khoảng diện tích), nên mọi dòng gắn bậc
 * mở `MOI-DIEN-TICH`. Giá bậc thang, nếu sau này tìm được nguồn, thêm vào sau mà không phải
 * dựng lại — dòng gắn bậc cụ thể thắng dòng gắn bậc mở.
 *
 * KHỚP THEO TÊN, và tên trong ĐM có ĐUÔI MÀU với ký hiệu SƠN mà danh mục không có:
 *   "ĐỨC AL501N- VK"                → ĐỨC AL501N
 *   "CỬA ÚC KT 6D STĐ MSK"          → CỬA ÚC KT 6D
 *   "CỬA LƯỚI MẮT VÕNG STĐ-Trọn bộ" → CỬA LƯỚI MẮT VÕNG -Trọn bộ
 * Màu và cách sơn là chiều của LÔ, không phải của mặt hàng — ba màu của cùng một cửa cùng một
 * giá (AL501N: VK, GS, MSK đều 1.471.000), nên gộp về một dòng giá là đúng chứ không phải mất mát.
 *
 * CHẠY:  node nhap/dung-bang-gia-dm.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");
const NGUON = "alumdoor-gia-ban-dm-2026-08-20";

const db = new DatabaseSync(resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });
const items = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json));
db.close();

const gia = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/19-gia-ban-tho.json"), "utf8")).dong;

/** Bỏ dấu, chỉ giữ chữ và số — chữ có dấu tồn tại ở hai dạng Unicode nhìn giống hệt nhau. */
const kd = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[đĐ]/g, "D").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Ký hiệu MÀU và CÁCH SƠN dùng trong ĐM — bỏ ở bất kỳ đâu trong tên.
 *
 * Chủ xưởng chốt 20/08/2026: màu và bề mặt là PHỤ THU, không phải biến thể giá. Bằng chứng
 * trong chính bảng giá: `V4_KẼM` 55.000 và `V4_STĐ` 70.000 chênh đúng 15.000, mà dòng
 * `PHỤ THU SƠN RAY MSK` cũng đúng 15.000/mét.
 *
 * KHÔNG bỏ `INOX`: đó là VẬT LIỆU, không phải bề mặt. `CỬA LƯỚI SN PHI 19 STD` 490.000 và
 * bản INOX 1.290.000 là hai mặt hàng khác nhau, gộp lại là mất một cái.
 */
const KY_HIEU = ["XN", "VK", "GS", "MSK", "THO", "CF", "XF", "XR", "KU", "GU", "TR", "XLC",
  "CAFE", "MM", "STD", "STĐ"];
const boKyHieu = (s) => {
  let t = String(s ?? "");
  for (const k of KY_HIEU) {
    t = t.replace(new RegExp(`(^|[\\s\\-–])${k}([\\s\\-–]|$)`, "gi"), "$1 ");
  }
  return t.replace(/\s{2,}/g, " ").replace(/\s*[-–]\s*$/, "").trim();
};

const theoTen = new Map();
for (const x of items) theoTen.set(kd(x.item_name), x);

/**
 * KHỚP THEO MÃ NGUỒN, tên chỉ là đường lui.
 *
 * Lúc nhập, mỗi mặt hàng đã ghi lại mã nguồn nó đến từ (`_ma_cu`, nối bằng dấu cộng khi gộp).
 * Khớp theo mã thì đúng tuyệt đối; khớp theo tên thì lẫn, vì ĐM đặt tên lỏng lẻo:
 * `TP-LUOI-SNPHI19-INOX - TM` lại mang tên "CỬA LƯỚI SN PHI 19 STD - TÁCH MÓN" — chữ INOX chỉ
 * có trong MÃ. Khớp tên sẽ gán giá inox 1.290.000 cho cửa sắt 490.000.
 */
const theoMa = new Map();
/**
 * `_ma_cu` KHÔNG còn trong D1 — kernel loại mọi khoá không phải ô của doctype. Nhưng nó vẫn
 * nằm trong các tệp nguồn đã sinh lúc nhập, và đó chính là bản đồ mã cũ → mã mới.
 */
const theoMaCode = new Map(items.map((x) => [x.item_code, x]));
for (const tep of ["11-hang-thuong", "12-ray-truc", "14-nan-la-cua", "20-cua"]) {
  let ds;
  try { ds = JSON.parse(readFileSync(resolve(THU_MUC, `du-lieu/${tep}.json`), "utf8")).ban_ghi ?? []; }
  catch { continue; }
  for (const r of ds) {
    const item = theoMaCode.get(r.name);
    if (!item) continue;
    for (const m of String(r.payload?._ma_cu ?? "").split("+")) {
      const k = kd(m);
      if (k) theoMa.set(k, item);
    }
  }
}
for (const x of items) theoMa.set(kd(x.item_code), x);

/**
 * TÌM MẶT HÀNG cho một dòng giá.
 *
 * Thứ tự quan trọng: dòng CẤU THÀNH trong ĐM mang tên SẢN PHẨM CHA ở cột "TÊN THÀNH PHẨM",
 * nên khớp theo cột đó trước là gán giá của một con vít cho cả cái cửa. Đo được: dòng
 * `NVL-VAIHAMXO` giá 2 đồng mang tên thành phẩm "CỬA ÚC KT 4D XN-VK", suýt thành giá cửa.
 *
 * Nên: chỉ dùng "TÊN THÀNH PHẨM" khi mã nguồn là mã THÀNH PHẨM (`TP-`); còn lại dùng tên vật tư.
 */
const laThanhPham = (ma) => /^TP[-_ ]/i.test(String(ma ?? "").trim());
const tim = (dong) => {
  const theoMaHit = theoMa.get(kd(dong.ma_nguon));
  if (theoMaHit) return theoMaHit;
  const uu = laThanhPham(dong.ma_nguon)
    ? [dong.ten_thanh_pham, dong.ten_vat_tu]
    : [dong.ten_vat_tu];
  for (const u of uu) {
    if (!u) continue;
    for (const v of [u, boKyHieu(u)]) {
      const h = theoTen.get(kd(v));
      if (h) return h;
    }
  }
  return null;
};

/** Dòng có ký hiệu sơn tĩnh điện — giá của nó đã gồm phụ thu, không dùng làm giá gốc. */
const coSonTinhDien = (dong) => /ST[DĐ]/i.test(`${dong.ten_thanh_pham ?? ""} ${dong.ten_vat_tu ?? ""} ${dong.ma_nguon ?? ""}`);

/** Gom theo mã: nhiều dòng ĐM (mỗi màu một dòng) về một mặt hàng. */
const gom = new Map();
const chuaKhop = new Map();
for (const g of gia) {
  const h = tim(g);
  if (!h) {
    const k = `${g.ten_thanh_pham || g.ten_vat_tu}  [${g.dvt}]`;
    chuaKhop.set(k, (chuaKhop.get(k) ?? 0) + 1);
    continue;
  }
  if (!gom.has(h.item_code)) gom.set(h.item_code, { item: h, dong: [] });
  gom.get(h.item_code).dong.push(g);
};

const banGhi = [], lechGia = [], phuThu = [];
for (const [ma, { item, dong }] of gom) {
  /**
   * GIÁ GỐC là giá của bản KHÔNG sơn tĩnh điện. Phần chênh của bản có sơn là PHỤ THU, tách
   * riêng chứ không nhét vào giá mặt hàng — nếu không thì bán hàng thô cũng thu tiền sơn.
   */
  const goc = dong.filter((d) => !coSonTinhDien(d));
  const dungDe = goc.length ? goc : dong;
  const mucGia = [...new Set(dungDe.map((d) => Number(d.gia_ban)))].sort((a, b) => a - b);
  const mucSon = [...new Set(dong.filter(coSonTinhDien).map((d) => Number(d.gia_ban)))].sort((a, b) => a - b);
  if (mucGia.length > 1) lechGia.push({ ma, ten: item.item_name, mucGia, tu: dungDe.map((d) => d.ten_thanh_pham || d.ten_vat_tu) });
  if (mucSon.length && mucGia.length === 1) phuThu.push({ ma, ten: item.item_name, goc: mucGia[0], son: mucSon, chenh: mucSon.map((x) => x - mucGia[0]) });
  const rate = mucGia.at(-1);
  const uom = item.default_sales_uom || item.stock_uom;
  const name = `Alumdoor 2026:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`;
  banGhi.push({
    name,
    payload: {
      price_list: "Alumdoor 2026", item_code: ma, item_group: item.item_group,
      uom, area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD",
      rate: String(rate), currency: "VND",
      ...(mucGia.length > 1 ? { note: `ĐM có ${mucGia.length} giá cho mã này (${mucGia.join(" / ")}), lấy giá cao nhất — cần chủ xưởng chốt.` } : {}),
      disabled: false, _migration_source: NGUON,
    },
    title: item.item_name, content: `${ma} ${item.item_name}`,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/21-gia-ban.json"), JSON.stringify({
  doctype: "Item Price", so_ban_ghi: banGhi.length, nguon: NGUON, ban_ghi: banGhi,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/21-gia-chua-khop.json"), JSON.stringify({
  ghi_chu: "Tên có giá trong ĐM nhưng không khớp mặt hàng nào — cần chủ xưởng đối chiếu.",
  so_ten: chuaKhop.size,
  ten: [...chuaKhop].map(([ten, lan]) => ({ ten, so_dong: lan })),
}, null, 1), "utf8");

console.log(`${gia.length} dòng giá ĐM  →  khớp ${gia.length - [...chuaKhop.values()].reduce((a, b) => a + b, 0)} dòng  →  ${banGhi.length} dòng giá\n`);
const theoNhom = {};
for (const r of banGhi) theoNhom[r.payload.item_group] = (theoNhom[r.payload.item_group] ?? 0) + 1;
for (const [k, v] of Object.entries(theoNhom).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(4)}  ${k}`);
const r0 = banGhi.map((r) => Number(r.payload.rate)).sort((a, b) => a - b);
console.log(`\nkhoảng giá: ${r0[0].toLocaleString("vi")} … ${r0.at(-1).toLocaleString("vi")} đ`);
if (lechGia.length) {
  console.log(`\nmã có nhiều giá — lấy CAO NHẤT, đã ghi chú: ${lechGia.length}`);
  for (const l of lechGia) console.log(`   ${l.ma.padEnd(26)}${l.mucGia.join("  /  ")}     ← ${[...new Set(l.tu)].join(" | ").slice(0, 60)}`);
}
console.log(`\ntên có giá mà chưa có mã: ${chuaKhop.size} tên → du-lieu/21-gia-chua-khop.json`);
