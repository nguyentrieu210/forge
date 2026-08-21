/**
 * KHỐI MOTOR · ĐIỀU KHIỂN · LINH KIỆN — điền nốt phần còn thiếu.
 *
 * Nguồn: ảnh "BẢNG GIÁ MOTOR & BÌNH LƯU ĐIỆN" và ảnh Úc (31/07/2026) là CHUẨN; `danh mục sản
 * phẩm.xlsx` 21/08 dùng khi ảnh im lặng; sheet ĐM chỉ THAM KHẢO (chủ xưởng chốt 21/08/2026).
 *
 * ① BỐN GIÁ CÒN TRỐNG mà danh mục 21/08 có.
 *
 * ② SỬA ĐƠN VỊ TÍNH. Ba "bộ điều khiển" đang khai ĐVT là **Cái**, trong khi ảnh Úc ghi thẳng
 *    "Hộp điều khiển Taiwan (Bao gồm: 2 tay điều khiển) — bộ" và tương tự cho BOSTEC. Một cụm ba
 *    món mà đếm là "cái" thì xuất kho ra một hộp không kèm tay.
 *
 * ③ XẾP LẠI NHÓM. Tám mã `LKMT_CHTAIWAN_*` và `LKMT_BOSTEC_*` đang nằm ở "Linh kiện motor",
 *    nhưng ảnh Úc gọi chúng là "Motor đơn/đôi Taiwan CH" và "Motor đơn/đôi Bostech", bán theo
 *    BỘ, có diện tích sử dụng (<12m² / <22m²) — tức là MOTOR thành phẩm. Ngược lại
 *    `MT_TANKER_NHONG` (cái nhông rời 70.000) đang nằm ở nhóm "Motor".
 *
 * ④ CHÍN DÒNG TRỪ + MỘT DÒNG PHỤ THU LẮC. Giá motor niêm yết là trọn gói "Motor + Lắc + Bộ điều
 *    khiển" (ảnh ghi rõ ở cột CHI TIẾT). Khách đã có sẵn lắc hoặc bộ điều khiển thì được trừ lại.
 *
 *    NHẬP VÀO NHƯNG ĐỂ TẮT. Không có "fact" nào trên dòng bán nói được rằng dòng này KHÔNG lấy
 *    lắc — `trustedCommercialFacts` chỉ có item_code, item_group, door_type, customer_group,
 *    color, width_m, height_m, area_per_set_sqm, billable_area_sqm, length_m, set_count,
 *    has_butterfly_bracket. Luật không điều kiện mà bật lên thì MỌI dòng motor bị trừ 250.000.
 *    Bật được sau khi thêm một ô kiểu `has_butterfly_bracket` cho "không lắc"/"không bộ ĐK".
 *
 *    BA LỖI TRONG CHÍNH NGUỒN, đã né:
 *      · Mã `TRU-TP_KHONGBDK_TANKER-ALUMAX` bị dùng cho BA dòng khác nhau (−100.000 Cái,
 *        −500.000 Bộ, và cả dòng YHLD −150.000). Nên đặt tên luật theo nội dung, KHÔNG tái dùng
 *        mã nguồn.
 *      · Giá tổ hợp KHÔNG cộng dồn: Tanker −250 + −100 = −350 nhưng gộp lại ghi −500; YHLD
 *        −300 + −150 = −450 nhưng gộp ghi −600. Chỉ JG là cộng đúng. Nên luật tổ hợp phải THAY
 *        THẾ hai luật con — dùng chung `exclusive_group` và ưu tiên cao hơn.
 *      · Tanker không lắc: danh mục 21/08 ghi −250.000, ĐM ghi −350.000. ĐM chỉ tham khảo nên
 *        lấy −250.000.
 *
 * CHẠY:  node nhap/xu-motor.mjs [--that]
 */
const BANG_GIA = "Alumdoor 2026";
const G = "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");
let ck = "", cs = "";

async function goi(d, o = {}) {
  const r = await fetch(G + d, { method: o.method || "GET", headers: { "content-type": "application/json", ...(ck ? { cookie: ck } : {}), ...(cs ? { "x-frappe-csrf-token": cs } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  const c = r.headers.get("set-cookie"); if (c && c.startsWith("sid=")) ck = c.split(";")[0];
  const n = r.headers.get("x-frappe-csrf-token"); if (n) cs = n;
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, status: r.status, json: j };
}
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).slice(0, 120);
const vn = (n) => Number(n).toLocaleString("vi");
const boCoSo = (d) => { const { name, owner, creation, modified_by, docstatus, idx, status, doctype, _metadata_revision, ...t } = d; return t; };

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");
const daCoGia = new Set(((await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["item_code"]))}`)).json.data ?? []).map((x) => x.item_code));

// ── ① Giá còn trống ─────────────────────────────────────────────────────────────────────
const GIA = [
  ["DK_YHLD", 470000, "Bộ", "BỘ ĐIỀU KHIỂN YHLD 470.000 đ/Bộ"],
  ["PKD_HOP_YHLD", 250000, "Cái", "HỘP ĐIỀU KHIỂN YHLD 250.000 đ/Cái"],
  ["LKMT_DAYDIEN_PATCD", 15000, "Mét", "DÂY ĐIỆN PHÍM ÂM TƯỜNG 15.000 đ/M"],
  ["PKC_NAPCHUP_BACDAN", 100000, "Bộ", "BẠC ĐẠN + NẮP CHỤP 100.000 đ/Bộ"],
];
console.log("① điền giá còn trống:");
let g1 = 0;
for (const [ma, gia, uom, dong] of GIA) {
  const it = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  if (!it) { console.log(`   ✗ ${ma}: không có mã`); continue; }
  if (daCoGia.has(ma)) { console.log(`   – ${ma.padEnd(24)}đã có giá, bỏ qua`); continue; }
  console.log(`   ${ma.padEnd(24)}${vn(gia).padStart(11)}/${uom}`);
  if (!THAT) continue;
  const ten = `${BANG_GIA}:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`;
  const r = await goi("/api/resource/Item Price", { method: "POST", body: { doc: {
    price_list: BANG_GIA, item_code: ma, item_group: it.item_group, uom, area_tier: "MOI-DIEN-TICH",
    price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `Danh mục sản phẩm 21/08/2026: ${dong}. Ảnh bảng giá chính thức không có mặt hàng này.`,
    disabled: false }, title: ten, content: ten } });
  if (r.ok) g1++; else console.log(`      ✗ ${loi(r)}`);
}
if (THAT) console.log(`   → thêm ${g1}`);

// ── ② Đơn vị tính ───────────────────────────────────────────────────────────────────────
const DVT = [
  ["DK_CHTAIWAN", "Bộ", 'Ảnh Úc phụ kiện #10: "Hộp điều khiển Taiwan (Bao gồm: 2 tay điều khiển)" — ĐVT bộ. Một cụm 3 món không đếm bằng "cái".'],
  ["DK_BOSTEC", "Bộ", 'Ảnh Úc phụ kiện #12: "Hộp điều khiển BOSTEC (Bao gồm: 2 tay điều khiển)" — ĐVT bộ.'],
  ["DK_JG", "Bộ", "Cùng cấu trúc hai bộ trên: 1 hộp + 2 tay. Danh mục 21/08 khai Bộ."],
  ["LKMT_COT", "Cây", "Đang khai tồn theo Kg trong khi dòng giá 80.000 lưu theo Cây — hai đơn vị đá nhau thì xuất kho ra sai tiền ngay. Nguồn khai Cây."],
];
console.log("\n② sửa đơn vị tính:");
for (const [ma, uom, ly] of DVT) {
  const d = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  if (!d) { console.log(`   ✗ ${ma}: không có mã`); continue; }
  if (d.stock_uom === uom) { console.log(`   – ${ma.padEnd(18)}đã là ${uom}`); continue; }
  console.log(`   ${ma.padEnd(18)}${String(d.stock_uom).padEnd(6)} → ${uom}`);
  if (!THAT) continue;
  const r = await goi("/api/resource/Item/" + encodeURIComponent(ma), { method: "PUT", body: { doc: {
    ...boCoSo(d), stock_uom: uom, default_sales_uom: uom,
    description: `${d.description ?? ""} ĐVT sửa 21/08/2026 sang ${uom}: ${ly}`.trim() } } });
  if (!r.ok) console.log(`      ✗ ${loi(r)}`);
}

// ── ③ Xếp lại nhóm ──────────────────────────────────────────────────────────────────────
const NHOM = [
  ...["LKMT_CHTAIWAN_DON_T", "LKMT_CHTAIWAN_DON_P", "LKMT_CHTAIWAN_DOI_T", "LKMT_CHTAIWAN_DOI_P",
    "LKMT_BOSTEC_DON_T", "LKMT_BOSTEC_DON_P", "LKMT_BOSTEC_DOI_T", "LKMT_BOSTEC_DOI_P"]
    .map((m) => [m, "Motor", 'Ảnh Úc gọi thẳng là "Motor đơn/đôi Taiwan CH" và "Motor đơn/đôi Bostech", bán theo bộ, có diện tích sử dụng (<12m² đơn, <22m² đôi). Đây là motor thành phẩm, không phải linh kiện.']),
  ["MT_TANKER_NHONG", "Linh kiện motor", "Cái nhông rời 70.000 đ/cái — là linh kiện, không phải motor."],
];
console.log("\n③ xếp lại nhóm hàng:");
for (const [ma, nhom, ly] of NHOM) {
  const d = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  if (!d) { console.log(`   ✗ ${ma}: không có mã`); continue; }
  if (d.item_group === nhom) { console.log(`   – ${ma.padEnd(24)}đã ở ${nhom}`); continue; }
  console.log(`   ${ma.padEnd(24)}${String(d.item_group).padEnd(18)} → ${nhom}`);
  if (!THAT) continue;
  const r = await goi("/api/resource/Item/" + encodeURIComponent(ma), { method: "PUT", body: { doc: {
    ...boCoSo(d), item_group: nhom, description: `${d.description ?? ""} Chuyển nhóm 21/08/2026: ${ly}`.trim() } } });
  if (!r.ok) console.log(`      ✗ ${loi(r)}`);
}

// ── ④ Dòng trừ và phụ thu lắc ───────────────────────────────────────────────────────────
/** [tên luật, mã hàng áp, mức (âm = trừ), nhóm loại trừ, ưu tiên, giải thích] */
const HANG = {
  TANKER: ["MT_TANKER400KG", "MT_TANKER600KG", "MT_TANKE800KG", "MT_TANKER1000KG", "MT_ALUMAX400KG", "MT_ALUMAX600KG"],
  YHLD: ["MT_YHLD300KG", "MT_YHLD500KG", "MT_YHLD800KG", "MT_YHLD1000KG"],
  JG: ["MT_JG300KG", "MT_JG400KG", "MT_JG500KG", "MT_JG600KG", "MT_JG800KG", "MT_JG1000KG", "MT_JG1500KG"],
};
const TRU = [
  ["Tanker/Alumax — không lắc", "TANKER", -250000, 50, "Danh mục 21/08: TANKER_ALUMAX KHÔNG LẮC 33 = −250.000. Sheet ĐM ghi −350.000 nhưng ĐM chỉ tham khảo."],
  ["Tanker/Alumax — không bộ điều khiển", "TANKER", -100000, 50, "Danh mục 21/08: −100.000."],
  ["Tanker/Alumax — không bộ điều khiển và không lắc", "TANKER", -500000, 100, "Danh mục 21/08: −500.000. KHÔNG bằng tổng hai luật con (−250 + −100 = −350) nên luật này phải THAY THẾ chúng, không cộng thêm — cùng nhóm loại trừ, ưu tiên cao hơn."],
  ["YHLD — không lắc", "YHLD", -300000, 50, "Danh mục 21/08: −300.000."],
  ["YHLD — không bộ điều khiển", "YHLD", -150000, 50, "Danh mục 21/08: −150.000. LƯU Ý nguồn gán nhầm mã Tanker cho dòng này."],
  ["YHLD — không bộ điều khiển và không lắc", "YHLD", -600000, 100, "Danh mục 21/08: −600.000, cũng KHÔNG bằng tổng (−300 − 150 = −450). Thay thế hai luật con."],
  ["JG — không lắc", "JG", -350000, 50, "Danh mục 21/08: −350.000."],
  ["JG — không bộ điều khiển", "JG", -150000, 50, "Danh mục 21/08: −150.000."],
  ["JG — không bộ điều khiển và không lắc", "JG", -500000, 100, "Danh mục 21/08: −500.000. Riêng JG thì cộng đúng (−350 − 150 = −500), nhưng vẫn để thay thế cho nhất quán."],
  ["Phụ thu đổi lắc 33 lên lắc 36 — Tanker/Alumax", "TANKER", 50000, 40, "Sheet ĐM: PHỤ THU-TANKER_ALUMAX_LẮC 36 = +50.000. Khách đổi lên lắc lớn hơn. Không có trong danh mục 21/08 — ĐM chỉ tham khảo, cần chủ xưởng xác nhận."],
];
const VI_SAO_TAT = "TẮT khi nhập. Không có căn cứ nào trên dòng bán để máy biết khách KHÔNG lấy lắc hay KHÔNG lấy bộ điều khiển — `trustedCommercialFacts` không có ô nào như vậy. Luật không điều kiện mà bật lên thì MỌI dòng motor bị trừ. Mở sau khi thêm ô đánh dấu tương tự `has_butterfly_bracket`.";

console.log("\n④ dòng trừ và phụ thu lắc (nhập vào nhưng TẮT):");
let g4 = 0;
for (const [ten, ho, muc, uuTien, ly] of TRU) {
  for (const ma of HANG[ho]) {
    const tenLuat = `${ten} · ${ma}`;
    if (!THAT) continue;
    const r = await goi("/api/resource/Pricing Rule", { method: "POST", body: { doc: {
      title: tenLuat, price_list: BANG_GIA, currency: "VND", rule_level: "LINE", apply_on: "ITEM",
      item_code: ma, effect_type: "ADJUSTMENT", adjustment_basis: "SET_COUNT", adjustment_rate: muc,
      exclusive_group: `MOTOR_${ho}_TRU`, priority: uuTien, taxable: true, discountable: false,
      valid_from: "2026-08-21", disabled: true, note: `${ly} ${VI_SAO_TAT}` },
      title: tenLuat, content: tenLuat } });
    if (r.ok) g4++; else if (g4 < 3) console.log(`      ✗ ${tenLuat}: ${loi(r)}`);
  }
  console.log(`   ${ten.padEnd(50)}${vn(muc).padStart(11)}   × ${HANG[ho].length} mã ${ho}`);
}
if (THAT) console.log(`   → tạo ${g4} luật (tất cả đang TẮT)`);

// ── ⑤ Bắn bướm: Mét → m² ────────────────────────────────────────────────────────────────
console.log("\n⑤ bắn bướm — ĐVT phải là m², đang là Mét:");
for (const ma of ["PKC_BANBUOM_FE", "PKC_BANBUOM_INOX"]) {
  const d = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  if (!d) { console.log(`   ✗ ${ma}: không có mã`); continue; }
  console.log(`   ${ma.padEnd(20)}${String(d.stock_uom).padEnd(6)} → m2   (bắn bướm tính theo diện tích lá, không theo mét dài)`);
  if (!THAT || d.stock_uom === "m2") continue;
  const r = await goi("/api/resource/Item/" + encodeURIComponent(ma), { method: "PUT", body: { doc: {
    ...boCoSo(d), stock_uom: "m2", default_sales_uom: "m2",
    description: `${d.description ?? ""} ĐVT sửa 21/08/2026 sang m²: cả sheet ĐM lẫn danh mục 21/08 đều ghi M², bắn bướm tính theo diện tích lá. LƯU Ý mã này trùng khái niệm với ba luật giá "Bắn bướm" — cần chốt giữ mã hàng hay giữ luật.`.trim() } } });
  if (!r.ok) console.log(`      ✗ ${loi(r)}`);
}
console.log(THAT ? "\nxong" : "\nchưa ghi gì. Thêm --that để thực hiện.");
