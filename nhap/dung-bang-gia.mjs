/**
 * DỰNG BẢNG GIÁ — 558 dòng giá cũ → MỘT bảng giá `(mã gốc × bậc diện tích)`.
 *
 * VÌ SAO BẢNG GIÁ KHÔNG CÓ CỘT MÀU, CỘT MÃ GIÁ, CỘT KHÁCH
 * Ba trục đó đã được ĐO trên chính nguồn, không phải giả định:
 *   · 178/558 dòng cũ mang màu trong mã — gộp lại thành cùng ô, 0 ô nào mang hai mức giá
 *   · 227/558 dòng cũ mang `price_variant` khác STANDARD — và 267/267 ô đều có sẵn dòng
 *     STANDARD cùng giá, nên biến thể KHÔNG mang thông tin giá nào cả
 *   · đại lý / bán lẻ nằm ở `Price List.customer_group`, để TRỐNG: một bảng chung cho cả hai
 * Cái gì cộng thêm — phụ thu màu, MSK, chiết khấu đại lý — thuộc TẦNG 5 (Pricing Rule), cộng
 * TRÊN kết quả tra bảng chứ không ghi đè bảng.
 *
 * BẢNG GIÁ Ở THƯA, KHÔNG Ở ĐẶC
 * Chỉ 7 mặt hàng (cửa trọn bộ) thực sự đổi giá theo diện tích → 56 dòng có bậc. 211 dòng còn
 * lại gắn bậc mở `MOI-DIEN-TICH`. Nếu bắt mọi mã phải khai đủ 8 bậc thì riêng phần này đã
 * phình từ 267 lên 1.744 dòng, và 1.688 dòng trong đó chỉ chép lại cùng một con số.
 *
 * CHẠY: node nhap/dung-bang-gia.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = resolve(THU_MUC, "..");

const BANG_GIA = "Alumdoor 2026";
const NGAY_HIEU_LUC = "2026-01-01";
const TIEN_TE = "VND";
const NGUON_DI_TRU = "alumdoor-bang-gia-2026-08-20";

/** Nhãn bậc trong mã cũ → mã bậc trong danh mục `Bậc diện tích` (tầng 07). */
const BAC = {
  "3-4m²": "DT-3-4M2", "4-5m²": "DT-4-5M2", "5-6m²": "DT-5-6M2", "6-7m²": "DT-6-7M2",
  "7-8m²": "DT-7-8M2", "8-9m²": "DT-8-9M2", "9-10m²": "DT-9-10M2", ">10m²": "DT-TREN-10M2",
};
const BAC_MO = "MOI-DIEN-TICH";

const tien = JSON.parse(readFileSync(resolve(GOC, "work/pricing-preimage.json"), "utf8"));
const anhXa = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/anh-xa-ma.json"), "utf8"));

const map = new Map(anhXa.anh_xa.map((r) => [r.ma_cu, r]));
const dongCu = tien.records.item_prices.map((r) => r.doc);

// Gom về ô. Một ô giữ TẬP giá chứ không giữ giá đầu tiên: nếu nguồn có hai mức giá cho cùng ô
// thì phải nổ ra ở đây, chứ không phải im lặng chọn bừa một mức rồi báo giá sai cho khách.
const o = new Map();
const thieuAnhXa = [];

for (const d of dongCu) {
  const m = map.get(d.item_code);
  if (!m) { thieuAnhXa.push(d.item_code); continue; }

  const bac = m.bac ? BAC[m.bac] : BAC_MO;
  if (!bac) throw new Error(`Bậc lạ trong ánh xạ mã: "${m.bac}" (mã cũ ${d.item_code})`);

  const khoa = `${m.ma_moi}|${d.uom}|${bac}`;
  if (!o.has(khoa)) o.set(khoa, { ma: m.ma_moi, uom: d.uom, bac, gia: new Map(), nguon: [] });
  const oNay = o.get(khoa);
  const gia = String(d.rate);
  if (!oNay.gia.has(gia)) oNay.gia.set(gia, []);
  oNay.gia.get(gia).push(`${d.item_code}[${d.price_variant}]`);
  oNay.nguon.push(d.item_code);
}

if (thieuAnhXa.length) {
  throw new Error(`${thieuAnhXa.length} mã cũ trong bảng giá không có trong anh-xa-ma.json: ${[...new Set(thieuAnhXa)].slice(0, 10).join(", ")}`);
}

const dungDo = [...o.values()].filter((x) => x.gia.size > 1);
if (dungDo.length) {
  console.error(`\n${dungDo.length} ô mang NHIỀU HƠN MỘT mức giá — mô hình "một ô một giá" không đứng được:`);
  for (const x of dungDo.slice(0, 20)) {
    console.error(`  · ${x.ma} · ${x.uom} · ${x.bac}`);
    for (const [gia, tu] of x.gia) console.error(`      ${gia}  ←  ${tu.join(", ")}`);
  }
  process.exit(1);
}

// Một ô có thể có nhiều `uom`? Không được: đơn giá phải neo vào đúng một đơn vị.
const theoMaBac = new Map();
for (const x of o.values()) {
  const k = `${x.ma}|${x.bac}`;
  if (!theoMaBac.has(k)) theoMaBac.set(k, new Set());
  theoMaBac.get(k).add(x.uom);
}
const daUom = [...theoMaBac].filter(([, v]) => v.size > 1);
if (daUom.length) {
  console.error(`\n${daUom.length} ô (mã × bậc) có nhiều ĐVT khác nhau — phải chốt một ĐVT cho mỗi dòng giá:`);
  for (const [k, v] of daUom.slice(0, 20)) console.error(`  · ${k} → ${[...v].join(", ")}`);
  process.exit(1);
}

const banGhi = [...o.values()]
  .sort((a, b) => a.ma.localeCompare(b.ma, "vi") || a.bac.localeCompare(b.bac))
  .map((x) => {
    const gia = [...x.gia.keys()][0];
    const name = `${BANG_GIA}:${x.ma}:${x.uom}:STANDARD:${x.bac}`;
    return {
      name,
      payload: {
        price_list: BANG_GIA,
        item_code: x.ma,
        uom: x.uom,
        area_tier: x.bac,
        price_variant: "STANDARD",
        rate: gia,
        currency: TIEN_TE,
        disabled: false,
        _migration_source: NGUON_DI_TRU,
        _gop_tu: [...new Set(x.nguon)].join(" · "),
      },
      title: `${x.ma} · ${x.uom} · ${x.bac === BAC_MO ? "mọi diện tích" : x.bac}`,
      content: `${x.ma} ${x.uom} ${x.bac} ${gia}`,
    };
  });

const bangGia = {
  doctype: "Price List",
  trich_luc_luc: new Date().toISOString(),
  nguon: "work/pricing-preimage.json — Price List Alumdoor 2026",
  so_ban_ghi: 1,
  ban_ghi: [{
    name: BANG_GIA,
    payload: {
      price_list_name: BANG_GIA,
      customer_group: "",
      effective_date: NGAY_HIEU_LUC,
      currency: TIEN_TE,
      note: "Bảng giá DUY NHẤT. Để trống `customer_group` là cố ý: đại lý và bán lẻ dùng chung bảng này, phần chênh nằm ở Pricing Rule.",
      disabled: false,
      _migration_source: NGUON_DI_TRU,
    },
    title: BANG_GIA,
    content: `${BANG_GIA} bảng giá bán chung đại lý lẻ`,
  }],
};

const donGia = {
  doctype: "Item Price",
  trich_luc_luc: new Date().toISOString(),
  nguon: `work/pricing-preimage.json (${dongCu.length} dòng cũ) qua nhap/du-lieu/anh-xa-ma.json`,
  so_ban_ghi: banGhi.length,
  dung_tu: { dong_cu: dongCu.length, o: banGhi.length, luc: new Date().toISOString() },
  ban_ghi: banGhi,
};

writeFileSync(resolve(THU_MUC, "du-lieu/08-bang-gia.json"), JSON.stringify(bangGia, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/08-don-gia.json"), JSON.stringify(donGia, null, 1), "utf8");

const coBac = banGhi.filter((r) => r.payload.area_tier !== BAC_MO).length;
const maCoGia = new Set(banGhi.map((r) => r.payload.item_code));
console.log(`${dongCu.length} dòng giá cũ → ${banGhi.length} ô  (0 ô hai giá, 0 ô hai ĐVT)`);
console.log(`  ${banGhi.length - coBac} dòng ở bậc mở MOI-DIEN-TICH`);
console.log(`  ${coBac} dòng có bậc cụ thể — thuộc ${new Set(banGhi.filter((r) => r.payload.area_tier !== BAC_MO).map((r) => r.payload.item_code)).size} mặt hàng`);
console.log(`  ${maCoGia.size} mã hàng có giá`);
const bienThe = new Set(dongCu.map((d) => d.price_variant));
console.log(`  ${bienThe.size - 1} biến thể giá cũ bị bỏ (đều trùng giá STANDARD): ${[...bienThe].filter((v) => v !== "STANDARD").join(", ")}`);
