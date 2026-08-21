/**
 * BẢNG GIÁ từ 5 ảnh chính thức còn lại — Đức, Úc, Lưới, Siêu Trường, Motor.
 * Tất cả đều ghi "Đơn giá thanh toán tiền mặt - Áp dụng từ 31/07/2026", chưa gồm VAT 8%.
 *
 * MỖI HỌ CỬA CÓ HAI CÁCH BÁN, và đó là hai DÒNG GIÁ của cùng một mã (`price_variant`), không
 * phải hai mặt hàng:
 *    Đức   :  CHI_LA (chỉ lá)          ·  TANG_RAY (tặng ray)
 *    Úc    :  KEO_TAY                  ·  MOTOR_NGOAI
 *    Lưới  :  CHUA_PHU_KIEN (tách món) ·  CO_PHU_KIEN (trọn bộ)
 * Với lưới, hai cách bán ĐÃ là hai mã riêng trong danh mục (đuôi _TM và _TRONBO), nên mỗi mã
 * một dòng giá.
 *
 * CHIẾT KHẤU ĐẠI LÝ 15% tính trên GIÁ CHỈ LÁ, kể cả khi khách lấy bản tặng ray — chủ xưởng
 * nhấn mạnh 20/08/2026. Nên nó là MỘT SỐ TIỀN cố định mỗi m², không phải phần trăm của dòng
 * đang bán. Số tiền ấy ghi sẵn vào ghi chú từng dòng để dựng Pricing Rule sau.
 *
 * CHẠY:  node nhap/dung-gia-anh-chinh-thuc.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-gia-anh-2026-08-20";
const banGhi = [];
const dong = (ma, nhom, uom, bien, rate, note) => banGhi.push({
  name: `Alumdoor 2026:${ma}:${uom}:${bien}:MOI-DIEN-TICH`,
  payload: {
    price_list: "Alumdoor 2026", item_code: ma, item_group: nhom, uom,
    area_tier: "MOI-DIEN-TICH", price_variant: bien, rate: String(rate), currency: "VND",
    note, disabled: false, _migration_source: NGUON,
  },
  title: ma, content: `${ma} ${bien} ${rate}`,
});

// ── CỬA ĐỨC: 15 mã × 2 biến thể, kèm mức chiết khấu đại lý tính sẵn ──────────────────────
const DUC = [
  ["CDUC_TD_AL595", "AL595", 1020000, 1095000],
  ["CDUC_TD_AL71N", "AL71", 1095000, 1170000],
  ["CDUC_TD_AL503N26", "AL503N", 1200000, 1275000],
  ["CDUC_ALD_548N", "AL548N", 1287000, 1362000],
  ["CDUC_TD_AL501N", "AL501N", 1371000, 1446000],
  ["CDUC_TD_AL652N", "AL652", 1431000, 1506000],
  ["CDUC_ALD_DL552", "AL552", 1540000, 1615000],
  ["CDUC_TD_AL752N", "AL752", 1566000, 1641000],
  ["CDUC_TD_AL50", "AL50", 1685000, 1760000],
  ["CDUC_ALVIP50", "VIP50", 1778000, 1853000],
  ["CDUC_ALVIPST500", "VIP-ST500", 2108000, 2183000],
  ["CDUC_ALVIPST700", "VIP-ST700", 2223000, 2298000],
  ["CDUC_TD_AL70", "AL70 (2 LỚP)", 843000, 918000],
  ["CDUC_AL70_1LOP", "AL70 (1 LỚP)", 1146000, 1221000],
  ["CDUC_AL75", "AL75", 1303000, 1378000],
];
for (const [ma, nhan, chiLa, tangRay] of DUC) {
  const ck = Math.round(chiLa * 0.15);
  const chung = `Bảng giá cửa cuốn khe thoáng công nghệ Đức, ${nhan}, áp dụng 31/07/2026. Chiết khấu đại lý = 15% × giá CHỈ LÁ = ${ck.toLocaleString("vi")} đ/m², trừ cho cả hai biến thể.`;
  dong(ma, "Cửa CN Đức", "m2", "CHI_LA", chiLa, `${chung} Đây là giá chỉ lá (mua tách món).`);
  dong(ma, "Cửa CN Đức", "m2", "TANG_RAY", tangRay, `${chung} Đây là giá tặng ray — chỉ áp cho cửa từ 8 m² trở lên.`);
}

// ── CỬA ÚC TẤM LIỀN: giá theo độ dày lá × cách vận hành ──────────────────────────────────
const UC = [
  ["CUC_UC_KT_4D", "KEO_TAY", 365000, "4 Dem"],
  ["CUC_UC_MTN_4D", "MOTOR_NGOAI", 345000, "4 Dem"],
  ["CUC_UC_KT_4_6D", "KEO_TAY", 395000, "4.3 - 4.7 Dem"],
  ["CUC_UC_MTN_4_6D", "MOTOR_NGOAI", 375000, "4.3 - 4.7 Dem"],
  ["CUC_UC_KT_5_5D", "KEO_TAY", 425000, "4.8 - 5.2 Dem"],
  ["CUC_UC_MTN_5_5D", "MOTOR_NGOAI", 405000, "4.8 - 5.2 Dem"],
  ["CUC_UC_KT_6D", "KEO_TAY", 485000, "Sơn tĩnh điện 6 Dem"],
  ["CUC_UC_MTN_6D", "MOTOR_NGOAI", 465000, "Sơn tĩnh điện 6 Dem"],
];
for (const [ma, bien, rate, nhan] of UC) {
  dong(ma, "Cửa tấm liền Úc", "m2", bien, rate,
    `Bảng giá cửa cuốn tấm liền công nghệ Úc, ${nhan}, áp dụng 31/07/2026. Đơn giá ĐÃ gồm phụ kiện hoàn thiện (trục, ray, puly, lò xo, cùm gang, giá đỡ T). Phụ thu 300.000đ nếu cửa dưới 7 m².`);
}
/** AL70 nan nhôm chỉ có một cột giá, và ghi rõ CHƯA gồm ray với khóa ngang. */
for (const ma of ["CDUC_DUC_KT_AL70", "CDUC_DUC_KT_AL70_2_LOP"]) {
  dong(ma, "Cửa tấm liền Úc", "m2", "KEO_TAY", 830000,
    "Bảng giá cửa Úc, dòng AL70 (nan nhôm), áp dụng 31/07/2026. Giá này CHƯA gồm ray và khóa ngang.");
}

// ── CỬA LƯỚI: mỗi cách bán đã là một mã riêng ───────────────────────────────────────────
const LUOI = [
  ["CLUOI_LUOI_MV_TM", 450000, "Lưới mắt võng, sắt sơn tĩnh điện, chưa phụ kiện. Ống Ø13.8 x 1.1mm"],
  ["CLUOI_LUOI_MV_TRONBO", 590000, "Lưới mắt võng, sắt sơn tĩnh điện, có phụ kiện"],
  ["CLUOI_LUOIMV_INOX_TM", 1290000, "Lưới mắt võng, inox 304, chưa phụ kiện. Ống Ø12.7 x 1.1mm"],
  ["CLUOI_LUOIMV_INOX_TRONBO", 1530000, "Lưới mắt võng, inox 304, có phụ kiện"],
  ["CLUOI_LUOI_SN13X26_TACHMON", 570000, "Lưới song ngang 13/26, sắt sơn tĩnh điện, chưa phụ kiện. Ống hộp 13x26 x 1.1mm"],
  ["CLUOI_LUOI_SN13X26_TRONBO", 750000, "Lưới song ngang 13/26, sắt sơn tĩnh điện, có phụ kiện"],
  ["CLUOI_LUOI_SN13X26_INOX_TACHMON", 1500000, "Lưới song ngang 13/26, inox 304, chưa phụ kiện. Ống inox hộp 13x26 x 0.9mm"],
  ["CLUOI_LUOI_SN13X26_INOX_TRONBO", 1710000, "Lưới song ngang 13/26, inox 304, có phụ kiện"],
  ["CLUOI_LUOI_SN_TM", 490000, "Lưới song ngang Ø19, sắt sơn tĩnh điện, chưa phụ kiện. Ống Ø19 x 1.1mm"],
  ["CLUOI_LUOI_SN_TRONBO", 630000, "Lưới song ngang Ø19, sắt sơn tĩnh điện, có phụ kiện"],
  ["CLUOI_LUOI_SNPHI19_INOX_TM", 1290000, "Lưới song ngang Ø19, inox 304, chưa phụ kiện. Ống Ø19 x 0.9mm"],
  ["CLUOI_LUOI_SNPHI19_INOX_TRONBO", 1530000, "Lưới song ngang Ø19, inox 304, có phụ kiện"],
];
for (const [ma, rate, nhan] of LUOI) {
  dong(ma, "Cửa Lưới", "m2", "STANDARD", rate,
    `Bảng giá cửa lưới Đài Loan, ${nhan}. Áp dụng 31/07/2026. Đơn giá hoàn thiện gồm trục, lưới, lá Đài Loan, V đáy, ray 7p-1.2mm. Dưới 7 m² phụ thu 300.000đ/bộ. Hàng thô không sơn GIẢM 70.000đ/m².`);
}

// ── CỬA SIÊU TRƯỜNG bản 100 ─────────────────────────────────────────────────────────────
dong("LA_DLM_1LY_K175", "Cửa Siêu Trường", "m2", "STANDARD", 440000,
  "Bảng giá cửa cuốn siêu trường bản 100, lá Đài Loan mạ màu 1.0 LY (±8%). Áp dụng 31/07/2026.");

// ── MOTOR & BÌNH LƯU ĐIỆN ───────────────────────────────────────────────────────────────
const MOTOR = [
  ["MOTOR TANKER 400KG", 1750000, "<15m²"], ["MOTOR TANKER 600KG", 1850000, "<18m²"],
  ["MOTOR TANKER 800KG", 3700000, "<27m²"], ["MOTOR ALUMAX 400KG", 2200000, "<15m²"],
  ["MOTOR ALUMAX 600KG", 2300000, "<25m²"], ["MOTOR JG 300KG", 3550000, "<18m²"],
  ["MOTOR JG 400KG", 4050000, "<28m²"], ["MOTOR JG 600KG", 4250000, "<36m²"],
  ["MOTOR JG 800KG", 5250000, "<42m²"], ["MOTOR JG 1000KG", 7650000, "<48m²"],
  ["MOTOR JG 1500KG", 8050000, "<55m²"], ["MOTOR YH LD 300KG", 2750000, "<15m²"],
  ["MOTOR YH LD 500KG", 2850000, "<15m²"], ["MOTOR YH LD 800KG", 5900000, "<25m²"],
  ["MOTOR YH LD 1000KG", 7000000, "<35m²"],
  ["ALUMAX UPS E-800KG", 1800000, "motor <600KG, 9 AH"], ["ALUMAX UPS E-1000KG", 2700000, "motor <1000KG, 12 AH"],
];

writeFileSync(resolve(THU_MUC, "du-lieu/23-gia-anh.json"), JSON.stringify({
  doctype: "Item Price", so_ban_ghi: banGhi.length, nguon: NGUON, ban_ghi: banGhi,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/23-motor-can-khop.json"), JSON.stringify({
  ghi_chu: "Giá motor và bình lưu điện từ ảnh — chưa khớp mã vì tên trong danh mục viết khác. Cần đối chiếu tay.",
  dong: MOTOR.map(([ten, rate, dung]) => ({ ten, rate, dien_tich_dung: dung })),
}, null, 1), "utf8");

const theoNhom = {};
for (const r of banGhi) theoNhom[r.payload.item_group] = (theoNhom[r.payload.item_group] ?? 0) + 1;
console.log(`${banGhi.length} dòng giá từ 5 ảnh\n`);
for (const [k, v] of Object.entries(theoNhom)) console.log(`   ${String(v).padStart(3)}  ${k}`);
console.log("\ncửa Đức — chiết khấu đại lý tính sẵn (15% giá chỉ lá):");
for (const [ma, nhan, chiLa, tangRay] of DUC.slice(0, 5)) {
  const ck = Math.round(chiLa * 0.15);
  console.log(`   ${nhan.padEnd(12)}chỉ lá ${chiLa.toLocaleString("vi").padStart(10)}  tặng ray ${tangRay.toLocaleString("vi").padStart(10)}   đại lý trừ ${ck.toLocaleString("vi")}/m²`);
}
console.log(`   … và ${DUC.length - 5} mã nữa`);
console.log(`\n${MOTOR.length} dòng motor/bình lưu điện chưa khớp mã → du-lieu/23-motor-can-khop.json`);
