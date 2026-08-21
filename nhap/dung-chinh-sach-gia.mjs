/**
 * CHÍNH SÁCH GIÁ — phụ thu, phụ giảm, chiết khấu đại lý.
 *
 * BẢN CHỐT của chủ xưởng ngày 21/08/2026 (thay bản đọc từ ảnh ngày 20/08):
 *    · Sơn vân gỗ         465.000/m²  cho cửa Đức + Úc + Siêu Trường + Đài Loan
 *    · Ray sơn vân gỗ      55.000/m   cho ray hộp TD · ray hộp TD U100 · ray đơn TD · ray sắt không ron
 *    · Sơn ray màu khác    15.000/m   cùng bộ ray đó, TRỪ vàng kem và ghi sần
 *    · Vận chuyển         300.000/bộ  cửa Đức và Lưới dưới 8m²
 *    · Cửa Úc             300.000/bộ  trên 4m² và dưới 7m²
 *    · Cửa Úc dưới 4m²    tính theo BỘ, không theo m²
 *    · V4/V5 sơn tĩnh điện 15.000/m
 *
 * BẢN NÀY GIẢI QUYẾT MÂU THUẪN 360.000 ↔ 465.000: là 465.000, tức con số của sheet ĐM. Và nó
 * trùng gần như nguyên văn với `alumdoorExperimentalAdjustmentRules`
 * (clouderp-selling/src/adjustment-policy.ts:237) — bộ luật ấy hoá ra là ĐẶC TẢ ĐÚNG, chỉ chưa
 * bao giờ được nối dây: nó được export mà không nơi nào gọi, và điều kiện của nó dựa vào
 * `finish_class`/`rail_type` là những ô không hề được điền lên dòng bán. Bản ghi ở đây là cùng
 * bộ luật đó, viết lại bằng những ô mà dòng bán THẬT SỰ có.
 *
 * BA KIỂU TÁC ĐỘNG mà doctype cho:
 *    ADJUSTMENT        cộng/trừ một số tiền vào DÒNG hàng
 *    ORDER_ADJUSTMENT  cộng/trừ vào cả ĐƠN
 *    DISCOUNT_PERCENT  giảm theo phần trăm
 * và bốn cách nhân: FIXED · AREA_SQM · LENGTH_M · SET_COUNT.
 *
 * ĐIỀU KIỆN phải là MẢNG các ô {field, operator, value} — `parseConditions`
 * (clouderp-pricing/src/commercial-policy.ts:236) ném lỗi nếu không phải mảng, và chỉ nhận
 * toán tử eq/neq/in/not_in/lt/lte/gt/gte.
 *
 * TÊN "FACT" LẤY THEO `trustedCommercialFacts` (commercial-sales-order-controller.ts:319):
 * item_code · item_group · door_type · customer_group · color · width_m · height_m ·
 * area_per_set_sqm · billable_area_sqm · length_m · set_count · has_butterfly_bracket.
 * Hai cái `finish_type`/`finish_class` CÓ trong facts nhưng KHÔNG phải ô trên dòng bán nên luôn
 * rỗng — điều kiện dựa vào chúng sẽ không bao giờ ăn. Màu dùng `color`, vốn đã có sẵn VAN_GO,
 * THÔ, VÀNG KEM, GHI SẦN trong danh mục Màu.
 *
 * NGƯỠNG CỬA NHỎ đo bằng `area_per_set_sqm` (diện tích MỖI BỘ) chứ không phải
 * `billable_area_sqm` (diện tích cả dòng). Đặt hai cửa 5m² thì billable là 10m² — dùng nhầm ô
 * là cả hai cửa nhỏ đều thoát phụ thu.
 *
 * PHẠM VI GIÁ (`Pricing Scope`) dùng cho những luật áp lên MỘT DANH SÁCH mã cụ thể — bảy mã ray
 * không nằm gọn trong nhóm nào, mà `item_code` trên luật chỉ nhận đúng một mã. Một phạm vi
 * thay cho bảy bản luật chép tay, và sửa danh sách về sau chỉ phải sửa một chỗ.
 *
 * CHẠY:  node nhap/dung-chinh-sach-gia.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-chinh-sach-gia-2026-08-21";
const BANG_GIA = "Alumdoor 2026";

/** Bảy mã ray chủ xưởng chỉ đích danh. "Ray sắt không ron" là BỐN mã theo khổ, không phải một. */
const RAY_PHU_THU = [
  ["RT_RAYHOP", "RAY HỘP TD U76"],
  ["RT_RAY_HOP_TD_U100", "RAY HỘP TD U100"],
  ["RT_TD87A1", "RAY ĐƠN TD U76"],
  ["RT_RAY_U100_KRON", "RAY SẮT U100 (KHÔNG RON)"],
  ["RT_RAY_U100_1.4LY_KRON", "RAY SẮT U100-1.4ly (KHÔNG RON)"],
  ["RT_RAY_U100_1.2LY_KRON", "RAY SẮT U100-1.2ly (KHÔNG RON)"],
  ["RT_RAY_U70_KRON", "RAY SẮT U70 (KHÔNG RON)"],
];

/**
 * Màu KHÔNG bị phụ thu 15.000: vàng kem và ghi sần (chủ xưởng loại trừ), cộng thêm VAN_GO vì đã
 * có luật 55.000 riêng, và THÔ vì thô là không sơn. Danh mục có cả "VÀNG KEM BÓNG" nên phải kể ra.
 */
const MAU_KHONG_PHU_THU = ["VÀNG KEM", "VÀNG KEM BÓNG", "GHI SẦN", "VAN_GO", "THÔ"];

const phamVi = [];
const pv = (scope_name, members, note) => {
  phamVi.push({ name: scope_name, payload: { scope_name, members, note, disabled: false }, title: scope_name, content: scope_name });
  return scope_name;
};

const PV_RAY = pv("Ray TD và ray sắt không ron",
  RAY_PHU_THU.map(([item_code, ten]) => ({ member_type: "Item", item_code, note: ten })),
  "Bảy mã ray chủ xưởng chỉ đích danh cho phụ thu sơn: ray hộp TD, ray hộp TD U100, ray đơn TD, và ray sắt không ron (bốn mã theo khổ).");

const PV_CUA_VAN_GO = pv("Cửa được sơn vân gỗ",
  ["Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Siêu Trường", "Cửa Đài Loan"].map((item_group) => ({ member_type: "Item Group", item_group })),
  "Bốn dòng cửa nhận sơn vân gỗ theo bản chốt 21/08/2026. Cửa Lưới và Đài Loan Inox KHÔNG nằm trong danh sách này.");

const PV_VAN_CHUYEN = pv("Cửa chịu phụ vận chuyển dưới 8m²",
  ["Cửa CN Đức", "Cửa Lưới"].map((item_group) => ({ member_type: "Item Group", item_group })),
  "Chỉ cửa Đức và cửa Lưới. Cửa Úc có luật riêng theo bậc 4–7m², không dùng luật này.");

const banGhi = [];
const luat = (title, p) => banGhi.push({
  name: title,
  payload: {
    title, price_list: BANG_GIA, currency: "VND",
    rule_level: p.rule_level ?? "LINE", apply_on: p.item_code ? "ITEM" : "ITEM_GROUP",
    effect_type: p.effect_type, adjustment_basis: p.adjustment_basis, adjustment_rate: p.adjustment_rate,
    ...(p.item_group ? { item_group: p.item_group } : {}),
    ...(p.item_code ? { item_code: p.item_code } : {}),
    ...(p.pricing_scope ? { pricing_scope: p.pricing_scope } : {}),
    ...(p.customer_group ? { customer_group: p.customer_group } : {}),
    ...(p.dieu_kien ? { conditions: JSON.stringify(p.dieu_kien) } : {}),
    ...(p.exclusive_group ? { exclusive_group: p.exclusive_group } : {}),
    priority: p.priority ?? 0, taxable: true, discountable: false,
    valid_from: "2026-08-21", note: p.note, disabled: Boolean(p.disabled),
  },
  title, content: title,
});

const VAN_GO = { field: "color", operator: "eq", value: "VAN_GO" };
const BUOM = { field: "has_butterfly_bracket", operator: "eq", value: true };

// ── SƠN VÂN GỖ ──────────────────────────────────────────────────────────────────────────
luat("Sơn vân gỗ — cửa", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 465000,
  pricing_scope: PV_CUA_VAN_GO, dieu_kien: [VAN_GO], exclusive_group: "BE_MAT_CUA", priority: 100,
  note: "Bản chốt 21/08/2026: phụ thu 465.000/m², áp cho cửa Đức + Úc + Siêu Trường + Đài Loan. Thay con số 360.000 đọc từ ảnh bảng giá cửa Đức hôm 20/08 — chủ xưởng chốt là 465.000, trùng sheet ĐM và trùng luật viết cứng trong code." });

luat("Sơn vân gỗ — ray", { effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M", adjustment_rate: 55000,
  pricing_scope: PV_RAY, dieu_kien: [VAN_GO], exclusive_group: "BE_MAT_RAY", priority: 100,
  note: "Bản chốt 21/08/2026: 55.000/mét cho bảy mã ray TD và ray sắt không ron. Ưu tiên 100 để luật này thắng luật màu khác (ưu tiên 50) khi màu là vân gỗ." });

// ── SƠN RAY MÀU KHÁC ────────────────────────────────────────────────────────────────────
luat("Sơn ray màu khác", { effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M", adjustment_rate: 15000,
  pricing_scope: PV_RAY, exclusive_group: "BE_MAT_RAY", priority: 50,
  dieu_kien: [{ field: "color", operator: "not_in", values: MAU_KHONG_PHU_THU }],
  note: `Bản chốt 21/08/2026: 15.000/mét, trừ vàng kem và ghi sần. Loại trừ thêm VAN_GO (đã có luật 55.000) và THÔ (thô là không sơn). Danh sách loại trừ đầy đủ: ${MAU_KHONG_PHU_THU.join(" · ")}.` });

// ── V4 / V5 SƠN TĨNH ĐIỆN ───────────────────────────────────────────────────────────────
luat("V4 sơn tĩnh điện", { effect_type: "ADJUSTMENT", adjustment_basis: "LENGTH_M", adjustment_rate: 15000,
  item_code: "PKC_V4_STD", exclusive_group: "PHU_KIEN_COATING", priority: 100,
  note: "Bản chốt 21/08/2026: V4 hoặc V5 sơn tĩnh điện +15.000/m. LƯU Ý CÁCH GHI: STĐ là một MÃ RIÊNG (PKC_V4_STD), nên để tổng ra đúng thì đơn giá của mã này phải đặt bằng giá V4 KẼM rồi luật cộng thêm 15.000 — chứ không đặt thẳng giá đã gồm sơn, kẻo cộng hai lần. V5 KHÔNG CÓ MÃ trong danh mục — cần mở mã V5 rồi thêm bản luật thứ hai." });

// ── VẬN CHUYỂN ──────────────────────────────────────────────────────────────────────────
luat("Phụ vận chuyển cửa dưới 8m² — Đức và Lưới", { effect_type: "ADJUSTMENT", adjustment_basis: "SET_COUNT",
  adjustment_rate: 300000, pricing_scope: PV_VAN_CHUYEN, exclusive_group: "VAN_CHUYEN", priority: 100,
  dieu_kien: [{ field: "area_per_set_sqm", operator: "lt", value: 8 }],
  note: "Bản chốt 21/08/2026: 300.000 cho cửa Đức và Lưới có kích thước dưới 8m². Đo theo diện tích MỖI BỘ, không phải diện tích cả dòng." });

// ── CỬA ÚC THEO BẬC KÍCH THƯỚC ──────────────────────────────────────────────────────────
luat("Phụ thu cửa Úc trên 4m² dưới 7m²", { effect_type: "ADJUSTMENT", adjustment_basis: "SET_COUNT",
  adjustment_rate: 300000, item_group: "Cửa tấm liền Úc", exclusive_group: "UC_KICH_THUOC", priority: 100,
  dieu_kien: [{ field: "area_per_set_sqm", operator: "gt", value: 4 }, { field: "area_per_set_sqm", operator: "lt", value: 7 }],
  note: "Bản chốt 21/08/2026: 300.000/bộ cho cửa Úc trên 4m² và dưới 7m². Đúng 4m² và đúng 7m² KHÔNG nằm trong luật — `resolveAustralianBillingMode` (adjustment-policy.ts:229) cũng cố ý để đúng 4m² là UNRESOLVED_BOUNDARY chứ không đoán. Cửa Úc DƯỚI 4m² không dùng luật này mà tính thẳng theo bộ." });

// ── BẮN BƯỚM ────────────────────────────────────────────────────────────────────────────
luat("Bắn bướm sắt — Đài Loan", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 30000,
  item_group: "Cửa Đài Loan", exclusive_group: "BAN_BUOM", dieu_kien: [BUOM],
  note: "Sheet ĐM mã TP-BUOMSAT-DL: 30.000 đ/m²." });
luat("Bắn bướm sắt — Siêu Trường", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 30000,
  item_group: "Cửa Siêu Trường", exclusive_group: "BAN_BUOM", dieu_kien: [BUOM],
  note: "Sheet ĐM mã TP-BUOMSAT-ST: 30.000 đ/m²." });
luat("Bắn bướm inox — Đài Loan Inox", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 60000,
  item_group: "Cửa Đài Loan Inox", exclusive_group: "BAN_BUOM", dieu_kien: [BUOM],
  note: "Sheet ĐM mã TP-BUOMINOX: 60.000 đ/m²." });

// ── KHỔ NGANG ───────────────────────────────────────────────────────────────────────────
for (const [ten, nhom] of [["Đài Loan", "Cửa Đài Loan"], ["Lưới", "Cửa Lưới"], ["Siêu Trường", "Cửa Siêu Trường"]]) {
  luat(`Phụ thu khổ ngang trên 6m đến dưới 7m5 — ${ten}`, {
    effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 40000, item_group: nhom,
    exclusive_group: "KHO_NGANG", priority: 10,
    dieu_kien: [{ field: "width_m", operator: "gt", value: 6 }, { field: "width_m", operator: "lte", value: 7.5 }],
    note: "Ảnh bảng giá Đài Loan và Lưới: ngang cửa > 6m đến < 7m5 phụ thu 40.000đ/m²." });
  luat(`Phụ thu khổ ngang trên 7m5 đến dưới 9m — ${ten}`, {
    effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: 60000, item_group: nhom,
    exclusive_group: "KHO_NGANG", priority: 20,
    dieu_kien: [{ field: "width_m", operator: "gt", value: 7.5 }, { field: "width_m", operator: "lt", value: 9 }],
    note: "Ảnh bảng giá Đài Loan và Lưới: ngang cửa > 7m5 đến < 9m phụ thu 60.000đ/m²." });
}

// ── HÀNG THÔ ────────────────────────────────────────────────────────────────────────────
luat("Giảm giá hàng thô không sơn — cửa Lưới", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM",
  adjustment_rate: -70000, item_group: "Cửa Lưới", exclusive_group: "BE_MAT_CUA",
  dieu_kien: [{ field: "color", operator: "eq", value: "THÔ" }],
  note: "Ảnh bảng giá cửa Lưới: hàng thô không sơn GIẢM 70.000đ/m². Số ÂM vì đây là khoản trừ." });

// ── CHUYỂN ĐỔI KÉO TAY — TẮT ────────────────────────────────────────────────────────────
luat("Chuyển đổi sang cửa kéo tay — Đài Loan", { effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM",
  adjustment_rate: 20000, item_group: "Cửa Đài Loan", disabled: true,
  note: "Ảnh bảng giá Đài Loan: cửa cuốn lò xo kéo tay +20.000đ/m². TẮT vì không có căn cứ nào để máy biết dòng này là kéo tay: `leaf_variant` có trên dòng bán nhưng KHÔNG nằm trong trustedCommercialFacts. Để luật chạy không điều kiện thì MỌI cửa Đài Loan bị cộng 20.000/m². Mở lên sau khi thêm leaf_variant vào facts." });

// ── CHIẾT KHẤU ĐẠI LÝ 15% TRÊN GIÁ CHỈ LÁ ───────────────────────────────────────────────
const DUC_CHI_LA = [
  ["CDUC_TD_AL595", "AL595", 1020000], ["CDUC_TD_AL71N", "AL71", 1095000],
  ["CDUC_TD_AL503N26", "AL503N", 1200000], ["CDUC_ALD_548N", "AL548N", 1287000],
  ["CDUC_TD_AL501N", "AL501N", 1371000], ["CDUC_TD_AL652N", "AL652", 1431000],
  ["CDUC_ALD_DL552", "AL552", 1540000], ["CDUC_TD_AL752N", "AL752", 1566000],
  ["CDUC_TD_AL50", "AL50", 1685000], ["CDUC_ALVIP50", "VIP50", 1778000],
  ["CDUC_ALVIPST500", "VIP-ST500", 2108000], ["CDUC_ALVIPST700", "VIP-ST700", 2223000],
  ["CDUC_TD_AL70", "AL70 (2 LỚP)", 843000], ["CDUC_AL70_1LOP", "AL70 (1 LỚP)", 1146000],
  ["CDUC_AL75", "AL75", 1303000],
];
for (const [ma, nhan, chiLa] of DUC_CHI_LA) {
  const ck = Math.round(chiLa * 0.15);
  luat(`Chiết khấu đại lý 15% — ${nhan}`, {
    effect_type: "ADJUSTMENT", adjustment_basis: "AREA_SQM", adjustment_rate: -ck,
    item_code: ma, customer_group: "Đại lý", exclusive_group: "CK_DAI_LY", priority: 100,
    note: `Ảnh bảng giá cửa Đức: chiết khấu 15% trực tiếp trên giá chỉ lá. Giá chỉ lá ${nhan} = ${chiLa.toLocaleString("vi")} đ/m², nên trừ ${ck.toLocaleString("vi")} đ/m². Số tiền CỐ ĐỊNH, trừ cho cả bản chỉ lá lẫn bản tặng ray — không dùng phần trăm vì phần trăm sẽ lấy nhầm gốc khi bán bản tặng ray.`,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/26-pham-vi-gia.json"), JSON.stringify({
  doctype: "Pricing Scope", so_ban_ghi: phamVi.length, nguon: NGUON, ban_ghi: phamVi,
}, null, 1), "utf8");
writeFileSync(resolve(THU_MUC, "du-lieu/26-chinh-sach-gia.json"), JSON.stringify({
  doctype: "Pricing Rule", so_ban_ghi: banGhi.length, nguon: NGUON, ban_ghi: banGhi,
}, null, 1), "utf8");

console.log(`${phamVi.length} phạm vi giá · ${banGhi.length} chính sách\n`);
for (const p of phamVi) console.log(`  ${p.name.padEnd(38)}${p.payload.members.length} thành viên`);
console.log("\n  chính sách".padEnd(50) + "mức".padStart(12) + "   áp cho");
for (const r of banGhi.filter((x) => !/Chiết khấu/.test(x.name))) {
  const p = r.payload;
  console.log(`  ${r.name.padEnd(48)}${p.adjustment_rate.toLocaleString("vi").padStart(12)}   ${p.pricing_scope ?? p.item_group ?? p.item_code}${p.disabled ? "   [TẮT]" : ""}`);
}
console.log(`\n  + ${DUC_CHI_LA.length} chính sách chiết khấu đại lý`);
