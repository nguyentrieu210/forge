/**
 * ĐIỀN GIÁ CÒN TRỐNG cho ray/trục và phụ kiện, và MỞ MÃ V5.
 *
 * Chỉ điền vào mã ĐANG KHÔNG CÓ dòng giá nào — không ghi đè gì. Ảnh bảng giá chính thức im
 * lặng về những mã này, nên nguồn là sheet ĐM của `MS LIÊN BS.xlsx`, và mỗi con số đều được
 * `danh mục sản phẩm.xlsx` xác nhận độc lập. Tôi đã tự mở ĐM đọc lại từng dòng, không lấy
 * theo lời agent.
 *
 * V5 LÀ MẶT HÀNG THẬT MÀ HỆ THỐNG ĐÁNH RƠI, và lý do đánh rơi nằm ngay trong nguồn:
 *    ĐM dòng 1243:  mã `TP-V5_KẼM`  ·  TÊN ghi "V4_KẼM"  ·  75.000/M
 *    ĐM dòng 1244:  mã `TP-V5_STĐ`  ·  TÊN ghi "V4_STĐ"  ·  90.000/M
 * Cột TÊN của cả hai dòng V5 đều ghi "V4". Ai khớp theo tên thì V5 tan vào V4 rồi biến mất —
 * đúng như đã xảy ra. Chỉ cột MÃ và ghi chú "TL 1.8KG/M" (sheet DANH MỤC dòng 60) mới lộ ra.
 * Sổ tồn đầu kỳ còn ghi `NVL-V5` tồn 144 kg, tức hàng có thật trong kho.
 *
 * V5 CÒN MỘT BẪY NỮA: cả hai biến thể kẽm và STĐ dùng CHUNG mã nguồn `NVL-V5_KEM_STD`, trong
 * khi V4 có hai mã riêng. Nên phải đặt mã mới cho V5, không tái dùng mã nguồn.
 *
 * TẮT LUẬT "V4 SƠN TĨNH ĐIỆN +15.000": ĐM cho thẳng giá V4_STĐ là 70.000 và V4_KẼM là 55.000 —
 * chênh đúng 15.000. Tức khoản phụ thu ĐÃ NẰM TRONG GIÁ. Giữ cả hai là thu 85.000, cộng hai
 * lần. Ghi giá trọn thì dễ đọc hơn và không phụ thuộc vào việc luật có chạy hay không.
 *
 * CHẠY:  node nhap/dien-gia-con-trong.mjs [--that]
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

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

/**
 * KHÔNG ĐIỀN `PKC_CHNHUA` (vòng nhựa hãm trục). ĐM dòng 678 ghi **75.000/KG** kèm ghi chú
 * "91 cái /kg", nhưng mặt hàng trong hệ thống bán theo **Cái**. Chép thẳng con số là ra
 * 75.000 một cái thay vì ~824 đồng — sai 91 lần. Phải quy đổi trước, mà quy đổi thì cần
 * chủ xưởng xác nhận con số 91.
 *
 * [mã, giá, dòng trong sheet ĐM] — ĐVT lấy theo ĐVT bán của chính mặt hàng, và mọi dòng dưới
 * đây đã đối chiếu ĐVT trong ĐM khớp với ĐVT của mặt hàng.
 */
const DIEN = [
  ["RT_RAY_U100_1.2LY_KRON", 90000, 1131], ["RT_RAY_U100_1.2LY_RON", 95000, 1133],
  ["RT_RNHUA_DR", 20000, 59], ["RT_RINOX_DR", 15000, 60], ["RT_RNHUA_CR", 6000, 61],
  ["RT_PHOTLONG12_5X5X120M", 7000, 62], ["RT_TRUC90", 120000, 681],
  ["PKC_RON_DD", 10000, 54], ["PKC_RONNHUA_INOX", 30000, 56], ["PKC_RONDAYUC", 10000, 686],
  ["PKC_V4_INOX_3LY", 250000, 1227], ["PKC_V4_KEM", 55000, 1241], ["PKC_V4_STD", 70000, 1242],
  ["PKC_3X6M", 25000, 537], ["PKC_OKHOA", 100000, 729],
  ["PKC_VDAY_TDU_KTD", 118000, 684], ["PKC_PULYUC34", 36000, 535], ["PKC_PULYUC114", 38000, 536],
  ["PKC_XOP_N45", 18000, 676], ["PKC_XOP_N90", 24000, 677],
  ["PKC_LACPHU33", 65000, 511], ["PKC_LACPHU33_3L", 65000, 512], ["PKC_LACPHU36", 70000, 513],
  ["PKC_LACPHU40", 120000, 510],
];

const daCo = new Set(((await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["item_code"]))}`)).json.data ?? []).map((x) => x.item_code));

console.log("① điền giá vào mã đang TRỐNG:");
console.log("   " + "mã".padEnd(26) + "giá".padStart(11) + "  ĐVT");
let them = 0, boQua = 0;
for (const [ma, gia, dong] of DIEN) {
  if (daCo.has(ma)) { boQua++; continue; }
  const it = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  if (!it) { console.log(`   ✗ ${ma}: không có mã này`); continue; }
  const uom = it.default_sales_uom || it.stock_uom;
  console.log(`   ${ma.padEnd(26)}${vn(gia).padStart(11)}  ${uom}`);
  if (!THAT) continue;
  const ten = `${BANG_GIA}:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`;
  const r = await goi("/api/resource/Item Price", { method: "POST", body: { doc: {
    price_list: BANG_GIA, item_code: ma, item_group: it.item_group, uom,
    area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `Sheet ĐM của MS LIÊN BS.xlsx, dòng ${dong}. Ảnh bảng giá chính thức không có mặt hàng này; danh mục sản phẩm 21/08/2026 xác nhận cùng con số.`,
    disabled: false }, title: ten, content: ten } });
  if (r.ok) them++; else console.log(`      ✗ ${loi(r)}`);
}
console.log(`   ${THAT ? `thêm ${them} · ` : ""}bỏ qua ${boQua} mã đã có giá`);

// ── ② Mở hai mã V5 ──────────────────────────────────────────────────────────────────────
const V5 = [
  ["PKC_V5_KEM", "V5 KẼM", 75000, 1243], ["PKC_V5_STD", "V5 STĐ (SƠN TĨNH ĐIỆN)", 90000, 1244],
];
console.log("\n② mở mã V5 (hệ thống chưa có mã nào chứa V5):");
const mau = (await goi("/api/resource/Item/PKC_V4_KEM")).json.data;
for (const [ma, ten, gia, dong] of V5) {
  const co = await goi("/api/resource/Item/" + encodeURIComponent(ma));
  console.log(`   ${ma.padEnd(16)}${ten.padEnd(26)}${vn(gia).padStart(10)}/Mét   kg/m 1,8   ${co.ok ? "(đã có)" : ""}`);
  if (!THAT || co.ok) continue;
  const { name, owner, creation, modified, modified_by, docstatus, idx, status, doctype, _metadata_revision, item_code, item_name, uom_conversions, ...khuon } = mau;
  const r = await goi("/api/resource/Item", { method: "POST", body: { doc: {
    ...khuon, item_code: ma, item_name: ten,
    // Cùng mô hình V4: mua theo Kg, bán theo Mét, quy đổi 1,8 kg mỗi mét.
    uom_conversions: [{ uom: "Mét", conversion_factor: 1.8 }],
    description: `Sheet ĐM dòng ${dong} (mã TP-V5_${ma.endsWith("KEM") ? "KẼM" : "STĐ"}). LƯU Ý cột TÊN trong ĐM ghi nhầm là "V4_${ma.endsWith("KEM") ? "KẼM" : "STĐ"}" — đây là lý do V5 từng bị khớp nhầm vào V4 rồi biến mất. Trọng lượng 1,8 kg/m theo sheet DANH MỤC dòng 60. Sổ tồn đầu kỳ ghi NVL-V5 tồn 144 kg.`,
  }, title: ten, content: `${ma} ${ten}` } });
  if (!r.ok) { console.log(`      ✗ tạo mã: ${loi(r)}`); continue; }
  const tenGia = `${BANG_GIA}:${ma}:Mét:STANDARD:MOI-DIEN-TICH`;
  const g = await goi("/api/resource/Item Price", { method: "POST", body: { doc: {
    price_list: BANG_GIA, item_code: ma, item_group: "Phụ kiện chung", uom: "Mét",
    area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `Sheet ĐM dòng ${dong}: ${vn(gia)} đ/M.`, disabled: false }, title: tenGia, content: tenGia } });
  if (!g.ok) console.log(`      ✗ giá: ${loi(g)}`);
}

// ── ③ Tắt luật V4 sơn tĩnh điện ─────────────────────────────────────────────────────────
console.log("\n③ luật \"V4 sơn tĩnh điện +15.000\":");
const luat = (await goi("/api/resource/Pricing Rule/" + encodeURIComponent("V4 sơn tĩnh điện"))).json.data;
if (!luat) console.log("   không thấy luật này");
else if (luat.disabled) console.log("   đã tắt từ trước");
else {
  console.log("   TẮT — ĐM cho V4_KẼM 55.000 và V4_STĐ 70.000, chênh đúng 15.000, tức phụ thu đã nằm trong giá.");
  if (THAT) {
    const { name, owner, creation, modified_by, docstatus, idx, status, doctype, _metadata_revision, ...than } = luat;
    const r = await goi("/api/resource/Pricing Rule/" + encodeURIComponent("V4 sơn tĩnh điện"), { method: "PUT", body: { doc: { ...than, disabled: true,
      note: `${than.note} TẮT 21/08/2026: sheet ĐM dòng 1241/1242 cho V4_KẼM 55.000 và V4_STĐ 70.000 — chênh đúng 15.000, nghĩa là khoản phụ thu ĐÃ nằm trong giá của mã STĐ. Giữ luật này nữa là cộng hai lần thành 85.000.` } } });
    console.log(r.ok ? "   → đã tắt" : `   ✗ ${loi(r)}`);
  }
}
console.log(THAT ? "\nxong" : "\nchưa ghi gì. Thêm --that để thực hiện.");
