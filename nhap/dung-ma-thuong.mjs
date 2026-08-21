/**
 * DỰNG DỮ LIỆU NHẬP cho 276 mặt hàng "Hàng thường" — sinh file, KHÔNG tự nhập.
 *
 * Mã: cắt tiền tố loại (TP/NVL/HH/LK) → `VT_`, thân giữ nguyên, chỉ còn A-Z 0-9 - _ .
 *
 * SÁU CẶP TRÙNG MÃ được chủ dự án chốt 2026-08-20 là MỘT món, mua một ĐVT bán một ĐVT —
 * đúng khuôn bù lon. Bản có giá là chiều BÁN, bản không giá là chiều MUA.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const nguon = JSON.parse(readFileSync(resolve(THU_MUC, "du-lieu/06-hang-hoa.json"), "utf8"));

/** Chủ dự án đọc: mã → [ĐVT tồn = ĐVT mua, ĐVT bán]. `Bộ/Bộ` nghĩa là không cần quy đổi. */
const CAP_TRUNG = {
  "VT_HTTD":        ["Bộ", "Bộ"],
  "VT_UPS_YH1000":  ["Bộ", "Bộ"],
  "VT_RON_DD":      ["Kg", "Mét"],   // ron đáy ĐỨC
  "VT_RONDAYUC":    ["Kg", "Mét"],   // ron đáy ÚC — món KHÁC, không gộp với trên
  "VT_GOIGANG":     ["Cái", "Cặp"],
  "VT_BKAN":        ["Cái", "Cặp"],
};
/**
 * Chưa biết hệ số thật thì để **0** (chủ dự án chốt 2026-08-20, đổi từ 10).
 *
 * 0 là chỗ trống nhìn thấy được: nó không giả vờ là một con số dùng được, và mọi phép quy đổi
 * dựa vào nó ra 0 nên sai lộ ra ngay. Số 10 thì ngược lại — trông như đã khai, âm thầm cho ra
 * kết quả sai lệch cả trăm lần (bù lon thật là 0,096 kg/con, không phải 10).
 */
const HE_SO_MAC_DINH = 0;
/** Đã nhập tay theo lời chủ dự án — KHÔNG để nguồn cũ đè lên. */
const GIU_NGUYEN = new Set(["VT_BACDAN", "VT_BULON12.12", "VT_CNHUA", "VT_BATFE"]);
// (mã đã nhập tay dùng dấu chấm/gạch dưới sẵn có, không đụng)

const boDau = (s) => s
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D")
  .replace(/[&+()/]+/g, "-");
const than = (ma) => boDau(ma)
  .replace(/^(TP|NVL|HH|LK)[-_]/i, "")
  // DẤU PHÂN CÁCH TRONG MÃ LÀ GẠCH DƯỚI (chủ dự án chốt 2026-08-20): `VT_RON_DD`, không phải
  // `VT_RON-DD`. Một dấu duy nhất cho mọi mã — trộn hai dấu là chỗ để gõ sai và tìm không ra.
  .replace(/[\s_-]+/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "").toUpperCase();

const thuong = nguon.ban_ghi.filter((r) => r.payload.measurement_profile === "Hàng thường");

const gom = new Map();
for (const r of thuong) {
  const ma = `VT_${than(r.name)}`;
  if (!gom.has(ma)) gom.set(ma, []);
  gom.get(ma).push(r);
}

const banGhi = [];
const boQua = [];
for (const [ma, ds] of gom) {
  if (GIU_NGUYEN.has(ma)) { boQua.push(ma); continue; }

  // Trong cặp trùng, lấy bản ghi ĐẦY ĐỦ hơn làm gốc: bản có giá mang tên và nhóm đang dùng để bán.
  const goc = ds.length === 1 ? ds[0] : ds.find((x) => /^(TP|HH)[-_]/i.test(x.name)) ?? ds[0];
  const p = goc.payload;

  const cap = CAP_TRUNG[ma];
  const ton = cap ? cap[0] : p.stock_uom;
  // `||` chứ KHÔNG phải `??`: nguồn để CHUỖI RỖNG cho mặt hàng không bán, mà `??` chỉ bắt
  // `undefined`. Dùng `??` thì ĐVT bán thành "" và mọi mã đều bị coi là "mua một đằng bán một nẻo",
  // đẻ ra 158 dòng quy đổi về đơn vị rỗng.
  const ban = cap ? cap[1] : (p.default_sales_uom || p.stock_uom);
  const mua = cap ? cap[0] : (p.default_purchase_uom || p.stock_uom);

  /**
   * Hệ số cho MỌI ĐVT khác ĐVT tồn — cả chiều BÁN lẫn chiều MUA.
   *
   * Trước đó chỉ sinh cho chiều bán, nên `VT_V5_KEM` (tồn Mét, mua Kg) bị server từ chối:
   * "Kg khác ĐVT tồn Mét nhưng chưa có hệ số quy đổi". Server kiểm cả hai chiều — đúng, vì một
   * phiếu nhập tính bằng Kg mà không quy ra Mét thì tồn kho không cộng được.
   */
  const quyDoi = [...new Set([ban, mua])]
    .filter((u) => u && u !== ton)
    .map((u) => ({ uom: u, conversion_factor: HE_SO_MAC_DINH, note: "CHƯA CÓ hệ số thật — để 0 cho tới khi xưởng đọc số" }));

  banGhi.push({
    name: ma,
    payload: {
      item_code: ma,
      item_name: p.item_name,
      item_group: p.item_group,
      item_nature: p.item_nature ?? "Hàng tồn kho",
      material_stage: p.material_stage ?? "Nguyên vật liệu",
      supply_type: p.supply_type ?? "Mua ngoài",
      is_stock_item: Boolean(p.is_stock_item),
      is_purchase_item: Boolean(p.is_purchase_item),
      is_sales_item: Boolean(p.is_sales_item),
      include_item_in_manufacturing: Boolean(p.include_item_in_manufacturing),
      measurement_profile: "Hàng thường",
      stock_uom: ton, default_purchase_uom: mua, default_sales_uom: ban,
      uom_conversions: quyDoi,
      disabled: Boolean(p.disabled),
    },
    _gop_tu: ds.map((x) => x.name),
  });
}

banGhi.sort((a, b) => (a.payload.item_group + a.name).localeCompare(b.payload.item_group + b.name, "vi"));

writeFileSync(resolve(THU_MUC, "du-lieu/11-hang-thuong.json"),
  JSON.stringify({
    doctype: "Item",
    trich_luc_luc: new Date().toISOString(),
    nguon: "06-hang-hoa.json lọc measurement_profile='Hàng thường'; mã chuẩn hoá VT_ + ASCII; 6 cặp trùng gộp theo lời chủ dự án 2026-08-20",
    so_ban_ghi: banGhi.length,
    ban_ghi: banGhi,
  }, null, 1), "utf8");

const gopCap = banGhi.filter((r) => r._gop_tu.length > 1);
const coQuyDoi = banGhi.filter((r) => r.payload.uom_conversions.length);
console.log(`${thuong.length} mã nguồn → ${banGhi.length} mã nhập (bỏ ${boQua.length} mã đã nhập tay: ${boQua.join(", ")})`);
console.log(`\n6 cặp trùng đã gộp:`);
for (const r of gopCap) console.log(`   ${r.name.padEnd(18)} tồn ${r.payload.stock_uom.padEnd(5)} mua ${r.payload.default_purchase_uom.padEnd(5)} bán ${r.payload.default_sales_uom.padEnd(5)} ← ${r._gop_tu.join(" + ")}`);
console.log(`\n${coQuyDoi.length} mã mua một ĐVT bán một ĐVT (hệ số mặc định 10):`);
for (const r of coQuyDoi) console.log(`   ${r.name.padEnd(24)} ${r.payload.stock_uom} → ${r.payload.default_sales_uom}`);
console.log(`\nngừng kinh doanh: ${banGhi.filter((r) => r.payload.disabled).length}`);
