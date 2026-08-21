/**
 * DỰNG công thức cửa: Trường đo → Bộ quy cách hình học → Chính sách cắt.
 *
 * NGUỒN: `QUY CÁCH (3).xlsx` sheet "CT TT-SX" và "ĐƠN GIÁ TRỌN BỘ", cùng `25.7 QUY TRÌNH (2).docx`.
 * Cả ba doctype đang RỖNG 0 bản ghi — nghĩa là mọi công thức cửa hiện nằm trong đầu người và
 * trong file Excel, chứ không nằm trong hệ thống.
 *
 * LUẬT KIỂM CỦA `geometry-policy.ts` — phải tuân, không thì nó ném lỗi lúc chạy:
 *   · target_field phải là trường CALCULATED trong bộ quy cách
 *   · source_field phải là trường INPUT
 *   · operator chỉ được COPY | SUBTRACT | ADD
 *
 * CHẠY:  node nhap/dung-cong-thuc-cua.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-cong-thuc-cua-2026-08-20";

// ── 1. TRƯỜNG ĐO ────────────────────────────────────────────────────────────────────────
const TRUONG = [
  ["CAO-PB", "Cao phủ bì", "HEIGHT", "Mét", "Chiều cao phủ bì — số khách đặt."],
  ["RONG-PB-RAY", "Rộng phủ bì ray", "WIDTH", "Mét", "Rộng đo hết mép ray."],
  ["RONG-PB-NHUA", "Rộng phủ bì nhựa", "WIDTH", "Mét", "Rộng đo hết nẹp nhựa. Đại lý cửa Đức nhập theo số này."],
  ["CAO-LUOI", "Cao lưới", "HEIGHT", "Mét", "Riêng cửa lưới và Đài Loan: chiều cao phần lưới."],
  ["RONG-CAT-LA", "Rộng cắt lá", "WIDTH", "Mét", "TỰ TÍNH. Mọi chiều rộng khách đặt đều quy về số này trước khi cắt."],
  ["DAI-RAY", "Dài ray", "LENGTH", "Mét", "TỰ TÍNH khi bán trọn bộ hoặc tặng ray."],
  ["DAI-TRUC", "Dài trục", "LENGTH", "Mét", "TỰ TÍNH khi bán trọn bộ."],
  ["DAI-V4", "Dài V4", "LENGTH", "Mét", "TỰ TÍNH khi bán trọn bộ."],
  ["DIEN-TICH", "Diện tích tính tiền", "OTHER", "m2", "TỰ TÍNH. Cao nhân Rộng, rộng lấy theo cơ sở bán của từng nhóm khách."],
].map(([code, ten, truc, dvt, note]) => ({
  name: code,
  payload: { field_code: code, field_name: ten, axis: truc, uom: dvt, note, disabled: false, _migration_source: NGUON },
  title: ten,
  content: `${code} ${ten}`,
}));

/** Bộ trường của một bộ quy cách: khai vai trò INPUT / CALCULATED đúng như code đòi. */
const boTruong = (nhap, tuTinh) => [
  ...nhap.map((f, i) => ({ geometry_field: f, role: "INPUT", required: true, visible: true, editable: true, sequence: i + 1 })),
  ...tuTinh.map((f, i) => ({ geometry_field: f, role: "CALCULATED", required: false, visible: true, editable: false, sequence: nhap.length + i + 1 })),
];

// ── 2. BỘ QUY CÁCH HÌNH HỌC ─────────────────────────────────────────────────────────────
const BO = [
  ["GP-CUA-DUC", "Cửa CN Đức", ["Cửa CN Đức"],
    ["CAO-PB", "RONG-PB-RAY", "RONG-PB-NHUA"], ["RONG-CAT-LA", "DAI-RAY", "DIEN-TICH"]],
  ["GP-CUA-UC", "Cửa tấm liền Úc", ["Cửa tấm liền Úc"],
    ["CAO-PB", "RONG-PB-RAY"], ["RONG-CAT-LA", "DAI-RAY", "DIEN-TICH"]],
  ["GP-CUA-DAI-LOAN", "Cửa Đài Loan", ["Cửa Đài Loan", "Cửa Đài Loan Inox", "Cửa kéo Đài Loan"],
    ["CAO-PB", "RONG-PB-RAY", "CAO-LUOI"], ["RONG-CAT-LA", "DAI-RAY", "DAI-TRUC", "DAI-V4", "DIEN-TICH"]],
  ["GP-CUA-LUOI", "Cửa Lưới", ["Cửa Lưới"],
    ["CAO-PB", "RONG-PB-RAY", "CAO-LUOI"], ["RONG-CAT-LA", "DAI-RAY", "DAI-TRUC", "DAI-V4", "DIEN-TICH"]],
  ["GP-CUA-SIEU-TRUONG", "Cửa Siêu Trường", ["Cửa Siêu Trường"],
    ["CAO-PB", "RONG-PB-RAY", "CAO-LUOI"], ["RONG-CAT-LA", "DAI-RAY", "DIEN-TICH"]],
].map(([code, ten, nhomHang, nhap, tuTinh]) => ({
  name: code,
  payload: {
    profile_code: code,
    profile_name: ten,
    item_groups: nhomHang.map((g) => ({ item_group: g })),
    fields: boTruong(nhap, tuTinh),
    note: `Dựng từ QUY CÁCH (3).xlsx sheet CT TT-SX.`,
    disabled: false,
    _migration_source: NGUON,
  },
  title: ten,
  content: `${code} ${ten}`,
}));

// ── 3. CHÍNH SÁCH CẮT ───────────────────────────────────────────────────────────────────
const r = (ma, dich, nguon, phep, so, them = {}) => ({
  rule_code: ma, target_field: dich, source_field: nguon, operator: phep, operand_m: so,
  priority: them.priority ?? 0, sequence: them.sequence ?? 0,
  ...(them.customer_group ? { customer_group: them.customer_group } : {}),
  ...(them.ray_type ? { ray_type: them.ray_type } : {}),
  ...(them.has_butterfly_bracket ? { has_butterfly_bracket: true } : {}),
  ...(them.note ? { note: them.note } : {}),
});

const LUOI_VA_DL = ["Cửa Đài Loan", "Cửa Lưới"].map((loai) => ({
  name: loai === "Cửa Lưới" ? "CS-CUA-LUOI" : "CS-CUA-DAI-LOAN",
  policy_name: loai,
  door_type: loai,
  geometry_profile: loai === "Cửa Lưới" ? "GP-CUA-LUOI" : "GP-CUA-DAI-LOAN",
  ray_type: "Ray sắt U70", dealer_cut_deduction_m: 0.03, retail_cut_deduction_m: 0.03, butterfly_cut_deduction_m: 0.035,
  dealer_width_basis: "Phủ bì ray", retail_width_basis: "Phủ bì ray",
  /** Tách món tính theo RỘNG CẮT LÁ, trọn bộ tính theo PHỦ BÌ RAY — khác nhau thật, không phải nhầm. */
  dealer_split_sales_basis: "Rộng cắt lá", dealer_full_sales_basis: "Phủ bì ray", retail_sales_basis: "Phủ bì ray",
  purchase_formula: "Barem kg/m2", purchase_height_basis: "Cao lưới", purchase_width_basis: "Rộng cắt lá",
  leaf_formula: "Kiểu Đài Loan Lưới", leaf_divisor_source: "Bản lá của bộ quy cách", leaf_rounding: "Nấc 0-0.3-0.7-1",
  geometry_rules: [
    r("LA-THUONG", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.03, { sequence: 1, priority: 0, note: "Rộng cắt lá = Rộng phủ bì ray trừ 0,03" }),
    r("LA-BUOM", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.035, { has_butterfly_bracket: true, sequence: 2, priority: 10, note: "Có lá Đài Loan bắn bướm thì trừ 0,035" }),
    r("RAY", "DAI-RAY", "CAO-PB", "SUBTRACT", 0.1, { ray_type: "Ray sắt U70", sequence: 3, note: "Trọn bộ: ray sắt U70 có ron = Cao pb trừ 0,1" }),
    r("V4", "DAI-V4", "RONG-PB-RAY", "SUBTRACT", 0.03, { sequence: 4, note: "Trọn bộ: V4 = Rộng pb ray trừ 0,03" }),
    r("TRUC", "DAI-TRUC", "RONG-PB-RAY", "SUBTRACT", 0.05, { sequence: 5, note: "Trọn bộ: trục 114-1ly8 = Rộng pb ray trừ 0,05" }),
    r("DT", "DIEN-TICH", "CAO-PB", "COPY", 0, { sequence: 9 }),
  ],
}));

const CS = [
  {
    name: "CS-CUA-DUC", policy_name: "Cửa CN Đức", door_type: "Cửa Đức", geometry_profile: "GP-CUA-DUC",
    ray_type: "Ray hộp/đơn U76", dealer_cut_deduction_m: 0.02, retail_cut_deduction_m: 0.08,
    /** Đại lý nhập rộng theo NHỰA (trừ 0,02), khách lẻ theo RAY (trừ 0,08). Hai công thức, một loại cửa. */
    dealer_width_basis: "Phủ bì nhựa", retail_width_basis: "Phủ bì ray",
    dealer_split_sales_basis: "Phủ bì nhựa", dealer_full_sales_basis: "Phủ bì nhựa", retail_sales_basis: "Phủ bì ray",
    purchase_formula: "Kg thực tế", purchase_height_basis: "Cao phủ bì", purchase_width_basis: "Rộng cắt lá",
    leaf_formula: "Kiểu Đức", leaf_divisor_source: "Hằng số của chính sách", leaf_divisor_const: 0.465,
    leaf_rounding: "Nấc 0-0.3-0.7-1",
    leaf_variants: [
      { variant_label: "Motor trong / kéo tay", addend: 2, note: "(Cao pb chia 0,465) cộng 2" },
      { variant_label: "Motor ngoài, không tự dừng", addend: 1.5, note: "(Cao pb chia 0,465) cộng 1,5" },
      { variant_label: "Motor ngoài, có tự dừng", addend: 1.3, note: "(Cao pb chia 0,465) cộng 1,3" },
    ],
    geometry_rules: [
      r("DUC-LA-DL", "RONG-CAT-LA", "RONG-PB-NHUA", "SUBTRACT", 0.02, { customer_group: "Đại lý", sequence: 1, note: "Công thức 2: Rộng cắt lá = Rộng phủ bì nhựa trừ 0,02" }),
      r("DUC-LA-LE", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.08, { customer_group: "Lẻ", sequence: 2, note: "Công thức 1: Rộng cắt lá = Rộng phủ bì ray trừ 0,08" }),
      r("DUC-RAY", "DAI-RAY", "CAO-PB", "SUBTRACT", 0.2, { sequence: 3, note: "Đơn giá tặng ray: ray hộp TĐ = Cao pb trừ 0,2. Chỉ áp cho cửa trên 10 m2." }),
      r("DUC-DT", "DIEN-TICH", "CAO-PB", "COPY", 0, { sequence: 9, note: "Diện tích = Cao pb nhân Rộng theo cơ sở bán của nhóm khách" }),
    ],
  },
  {
    name: "CS-CUA-UC", policy_name: "Cửa tấm liền Úc", door_type: "Cửa Úc", geometry_profile: "GP-CUA-UC",
    ray_type: "Ray sắt U70", dealer_cut_deduction_m: 0.03, retail_cut_deduction_m: 0.03,
    dealer_width_basis: "Phủ bì ray", retail_width_basis: "Phủ bì ray",
    dealer_split_sales_basis: "Phủ bì ray", dealer_full_sales_basis: "Phủ bì ray", retail_sales_basis: "Phủ bì ray",
    purchase_formula: "Barem kg/m2", purchase_height_basis: "Cao phủ bì", purchase_width_basis: "Rộng cắt lá",
    /** Số lá = (Cao pb trừ 0,13) chia 0,068 — bản lá AL70 1 lớp, lấy từ 25.7 QUY TRÌNH. */
    leaf_formula: "Kiểu tấm liền Úc", leaf_divisor_source: "Hằng số của chính sách", leaf_divisor_const: 0.068,
    leaf_height_deduction_m: 0.13, leaf_rounding: "Làm tròn xuống",
    geometry_rules: [
      r("UC-LA", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.03, { sequence: 1, note: "Rộng cắt lá = Rộng phủ bì ray trừ 0,03" }),
      r("UC-RAY", "DAI-RAY", "CAO-PB", "SUBTRACT", 0.1, { ray_type: "Ray sắt U70", sequence: 2, note: "Trọn bộ: ray sắt U70 không ron = Cao pb trừ 0,1" }),
      r("UC-DT", "DIEN-TICH", "CAO-PB", "COPY", 0, { sequence: 9 }),
    ],
  },
  ...LUOI_VA_DL,
  {
    name: "CS-CUA-SIEU-TRUONG", policy_name: "Cửa Siêu Trường", door_type: "Cửa Siêu Trường", geometry_profile: "GP-CUA-SIEU-TRUONG",
    ray_type: "Ray sắt U70", dealer_cut_deduction_m: 0.03, retail_cut_deduction_m: 0.03, butterfly_cut_deduction_m: 0.035,
    dealer_width_basis: "Phủ bì ray", retail_width_basis: "Phủ bì ray",
    dealer_split_sales_basis: "Rộng cắt lá", dealer_full_sales_basis: "Rộng cắt lá", retail_sales_basis: "Phủ bì ray",
    purchase_formula: "Barem kg/m2", purchase_height_basis: "Cao lưới", purchase_width_basis: "Rộng cắt lá",
    leaf_formula: "Kiểu Đài Loan Lưới", leaf_divisor_source: "Bản lá của bộ quy cách", leaf_rounding: "Nấc 0-0.3-0.7-1",
    geometry_rules: [
      r("ST-LA", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.03, { sequence: 1, note: "Rộng cắt lá = Rộng phủ bì ray trừ 0,03" }),
      r("ST-BUOM", "RONG-CAT-LA", "RONG-PB-RAY", "SUBTRACT", 0.035, { has_butterfly_bracket: true, sequence: 2, priority: 10 }),
      r("ST-RAY", "DAI-RAY", "CAO-PB", "SUBTRACT", 0.1, { ray_type: "Ray sắt U70", sequence: 3 }),
      r("ST-DT", "DIEN-TICH", "CAO-PB", "COPY", 0, { sequence: 9 }),
    ],
  },
].map((c) => {
  const { name, ...con } = c;
  return {
    name,
    payload: {
      ...con, priority: 0, disabled: false,
      note: `Dựng từ QUY CÁCH (3).xlsx (CT TT-SX, ĐƠN GIÁ TRỌN BỘ) và 25.7 QUY TRÌNH (2).docx.`,
      _migration_source: NGUON,
    },
    title: c.policy_name,
    content: `${name} ${c.policy_name}`,
  };
});

const sach = (x) => ({ ...x, payload: Object.fromEntries(Object.entries(x.payload).filter(([, v]) => v !== undefined)) });
for (const [tep, dt, ds] of [
  ["16-truong-do", "Geometry Field", TRUONG],
  ["17-bo-hinh-hoc", "Geometry Profile", BO],
  ["18-chinh-sach-cat", "Cutting Policy", CS],
]) {
  writeFileSync(resolve(THU_MUC, `du-lieu/${tep}.json`), JSON.stringify({
    doctype: dt, so_ban_ghi: ds.length, nguon: NGUON, ban_ghi: ds.map(sach),
  }, null, 1), "utf8");
  console.log(`${tep}.json → ${dt}: ${ds.length} bản ghi`);
}

console.log("\n=== CHÍNH SÁCH CẮT ===");
for (const c of CS) {
  const p = c.payload;
  console.log(`\n▌ ${c.name} — ${p.policy_name}   [${p.geometry_profile}]`);
  console.log(`   mua theo ${p.purchase_formula} · đại lý bán: tách món ${p.dealer_split_sales_basis}, trọn bộ ${p.dealer_full_sales_basis} · khách lẻ ${p.retail_sales_basis}`);
  console.log(`   chia lá ${p.leaf_formula}${p.leaf_divisor_const ? ` ước số ${p.leaf_divisor_const}` : ""} · làm tròn ${p.leaf_rounding}`);
  for (const g of p.geometry_rules) {
    const dau = g.operator === "SUBTRACT" ? "trừ" : g.operator === "ADD" ? "cộng" : "=";
    console.log(`     ${g.rule_code.padEnd(11)}${g.target_field.padEnd(13)}= ${g.source_field} ${dau} ${g.operand_m}${g.customer_group ? `   [${g.customer_group}]` : ""}${g.has_butterfly_bracket ? "   [bắn bướm]" : ""}`);
  }
}
