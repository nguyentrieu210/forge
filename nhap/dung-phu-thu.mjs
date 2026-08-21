/**
 * PHỤ THU — nhóm mới, gom mọi khoản cộng thêm ngoài đơn giá cửa.
 *
 * Chủ xưởng chốt 20/08/2026: "không có dịch vụ nào hết, toàn bộ là hàng tồn kho". Nên phụ thu
 * khai là mặt hàng bình thường, `item_nature = Hàng tồn kho`, chỉ khác ở chỗ nó không có tồn
 * thật — bán bao nhiêu ghi bấy nhiêu.
 *
 * Ô `Loại cửa áp công thức` giữ mối liên hệ "phụ thu này dùng cho cửa nào" — đó là lý do nguồn
 * xếp bắn bướm vào nhóm Cửa Đài Loan / Siêu Trường / Đài Loan Inox. Xếp vào nhóm cửa thì tưởng
 * chúng LÀ cửa; bỏ nhóm đi thì mất mối liên hệ. Ô này giữ được cả hai.
 *
 * NGUỒN: 5 ảnh bảng giá chính thức + cột "Giá bán" sheet ĐM.
 *
 * CHẠY:  node nhap/dung-phu-thu.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-phu-thu-2026-08-20";
const NHOM = "Phụ thu";

/** [mã, tên, ĐVT, giá, loại cửa áp dụng, nguồn] — `loaiCua` để trống nghĩa là áp cho mọi loại. */
const PT = [
  ["PT_BANBUOM_FE_DL", "Bắn bướm sắt — cửa Đài Loan", "m2", 30000, "Cửa Đài Loan", "sheet ĐM, mã TP-BUOMSAT-DL"],
  ["PT_BANBUOM_FE_ST", "Bắn bướm sắt — cửa Siêu Trường", "m2", 30000, "Cửa Siêu Trường", "sheet ĐM, mã TP-BUOMSAT-ST"],
  ["PT_BANBUOM_INOX", "Bắn bướm inox — cửa Đài Loan Inox", "m2", 60000, "Cửa Đài Loan", "sheet ĐM, mã TP-BUOMINOX"],
  ["PT_SON_VAN_GO_DUC", "Sơn màu vân gỗ — lá Đức", "m2", 360000, "Cửa Đức", "ảnh bảng giá cửa Đức: SƠN MÀU VÂN GỖ phụ thu thêm 360.000đ/m2"],
  ["PT_SON_VAN_GO", "Sơn vân gỗ — lá Đức (theo ĐM)", "m2", 465000, "Cửa Đức", "sheet ĐM, mã PHUTHU-SVG-LADUC. LỆCH với ảnh (360.000) — cần chốt"],
  ["PT_SON_RAY_MSK", "Sơn ray màu MSK", "Mét", 15000, "", "sheet ĐM, mã PHUTHU_SONRAY_MSK"],
  ["PT_CHUYEN_DOI_KEO_TAY", "Chuyển đổi sang cửa kéo tay", "m2", 20000, "", "ảnh bảng giá Đài Loan: cửa cuốn lò xo kéo tay +20.000đ/m2"],
  ["PT_NGANG_6_7M5", "Phụ thu khổ ngang trên 6m đến dưới 7m5", "m2", 40000, "", "ảnh bảng giá Đài Loan và Lưới"],
  ["PT_NGANG_7M5_9M", "Phụ thu khổ ngang trên 7m5 đến dưới 9m", "m2", 60000, "", "ảnh bảng giá Đài Loan và Lưới"],
  ["PT_CUA_NHO_DUOI_7M2", "Phụ thu cửa nhỏ dưới 7 m²", "Bộ", 300000, "", "ảnh bảng giá cửa Úc và cửa Lưới"],
  ["PT_VAN_CHUYEN_DUOI_8M2", "Phụ vận chuyển cửa dưới 8 m²", "Bộ", 300000, "Cửa Đức", "ảnh bảng giá cửa Đức: cửa dưới 8m² phụ vận chuyển 300.000đ/bộ"],
  ["PT_GIAO_HANG_CHUYEN", "Phụ thu giao hàng theo chuyến", "Chuyến", 300000, "", "sheet ĐM: PHUTHU-DUC<8m², PHUTHU-UC-PK<5tr, PHUTHU-DAILOAN<8m², PHUTHU-CUALUOI<8m² — cùng 300.000/chuyến"],
  /** Không phải phụ thu mà là phụ GIẢM — giữ số dương, dấu trừ nằm ở Pricing Rule. */
  ["PT_GIAM_HANG_THO", "Giảm giá hàng thô không sơn", "m2", 70000, "Cửa Lưới", "ảnh bảng giá cửa Lưới: hàng thô không sơn GIẢM 70.000đ/m². Đây là khoản TRỪ, không phải cộng."],
];

const item = [], gia = [];
for (const [ma, ten, uom, rate, loaiCua, nguon] of PT) {
  item.push({
    name: ma,
    payload: {
      item_code: ma, item_name: ten, item_group: NHOM,
      item_nature: "Hàng tồn kho", material_stage: "Vật tư tiêu hao", supply_type: "Tự sản xuất",
      is_stock_item: true, is_purchase_item: false, is_sales_item: true,
      /** Phụ thu là CÔNG xưởng bỏ ra — bắn bướm, sơn, giao hàng — nên nó có mặt trong sản xuất. */
      include_item_in_manufacturing: true,
      measurement_profile: "Hàng thường", stock_uom: uom, default_sales_uom: uom,
      ...(loaiCua ? { door_type: loaiCua } : {}),
      description: nguon, disabled: false, _migration_source: NGUON,
    },
    title: ten, content: `${ma} ${ten}`,
  });
  gia.push({
    name: `Alumdoor 2026:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`,
    payload: {
      price_list: "Alumdoor 2026", item_code: ma, item_group: NHOM, uom,
      area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD",
      rate: String(rate), currency: "VND", note: nguon,
      disabled: false, _migration_source: NGUON,
    },
    title: ten, content: `${ma} ${rate}`,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/24-phu-thu.json"), JSON.stringify({
  doctype: "Item", so_ban_ghi: item.length, nguon: NGUON, ban_ghi: item,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/24-phu-thu-gia.json"), JSON.stringify({
  doctype: "Item Price", so_ban_ghi: gia.length, nguon: NGUON, ban_ghi: gia,
}, null, 1), "utf8");

console.log(`${item.length} mã phụ thu\n`);
console.log("  mã".padEnd(26) + "tên".padEnd(42) + "ĐVT".padEnd(9) + "giá".padStart(10) + "   loại cửa");
for (const [ma, ten, uom, rate, loaiCua] of PT) {
  console.log(`  ${ma.padEnd(24)}${ten.padEnd(42)}${uom.padEnd(9)}${rate.toLocaleString("vi").padStart(10)}   ${loaiCua || "mọi loại"}`);
}
