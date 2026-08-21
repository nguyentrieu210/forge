/**
 * XỬ NỐT theo ảnh bảng giá chính thức — Siêu Trường bản 100, và gộp mã trục trùng.
 *
 * Chủ xưởng chốt 21/08/2026: **"ĐM chỉ tham khảo"**. Nên ở đâu ảnh có tiếng nói thì ảnh thắng,
 * ĐM chỉ dùng khi ảnh im lặng. Ảnh "BẢNG GIÁ CỬA CUỐN SIÊU TRƯỜNG - BẢNG 100" (31/07/2026) vừa
 * đọc xong giải quyết ba việc đang treo một lúc.
 *
 * ① SÁU DÒNG LÁ BẢN 100 CÒN THIẾU. Ảnh có bảy dòng: mạ màu 1.0LY 440.000 (đã có), rồi sơn tĩnh
 *    điện 1.1LY 490.000 · 1.2LY 520.000 · 1.3LY 540.000 · 1.4LY 580.000 · 1.5LY 610.000 ·
 *    1.6LY 640.000. Hệ thống mới có một dòng.
 *
 *    ĐÍNH CHÍNH MỘT KẾT LUẬN TRƯỚC ĐÓ: agent báo `LA_DLK_1_1LY` và `LA_DLK_1_2LY_K175` bị "nhận
 *    nhầm danh tính", tên phải là LÁ SIÊU TRƯỜNG chứ không phải LÁ ĐÀI LOAN. Ảnh nói ngược lại —
 *    nó gọi đúng chữ "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN - BẢN 100" nằm dưới tiêu đề bảng giá siêu
 *    trường. Tức lá là lá Đài Loan, bản 100, dùng cho cửa siêu trường. Tên đang có KHÔNG sai;
 *    cái sai là chúng không có giá.
 *
 * ② TRỤC 168 (4.0mm) = 520.000. Đây là con số đang treo giữa ĐM (500.000) và danh mục mới
 *    (520.000). Ảnh chốt 520.000, và chốt luôn cả độ dày là 4.0mm.
 *
 * ③ GỘP BỐN CẶP MÃ TRỤC TRÙNG. Mỗi cặp là MỘT vật thật mang hai mã: một mã lấy từ sổ tồn (tên
 *    có ghi độ dày, đúng như ảnh gọi, nhưng không có giá) và một mã lấy từ ĐM (có giá, tên chung
 *    chung). Hậu quả đang chạy: tồn nằm mã này, giá nằm mã kia — bán thì không trừ kho, nhập thì
 *    không ra giá vốn.
 *
 *    GIỮ MÃ NÀO: giữ mã mà ẢNH gọi đúng tên, vì ảnh là thứ khách hàng cầm và là chuẩn đã chốt.
 *    Mã kia NGỪNG DÙNG chứ không xoá — nó có thể đang bị chứng từ cũ trỏ tới, mà xoá thì tham
 *    chiếu chết lặng lẽ.
 *
 * ④ KHÔNG ĐỤNG hai cặp còn lại. `RT_ONGKEM34`/`RT_TRUC34` bị hoán đổi tên ngay trong sổ tồn và
 *    cùng mang 405,5 kg — gộp sai là mất dấu tồn. `RT_TRUC168_5LY`/`RT_TRUC114_2.4LY` mang hai
 *    hệ số quy đổi đáng ngờ (15,6 và 12,8, lệch −22% và +94% so với công thức ống thép). Cả bốn
 *    mã đều không có trong ảnh nào. Để nguyên và báo.
 *
 * ⑤ HỆ SỐ QUY ĐỔI vẫn để 0 cho trục 140 và 168. ĐM cho 12,8 và 15,6 nhưng ĐM chỉ tham khảo, và
 *    hai số đó không khớp độ dày ghi trên ảnh (Φ140×2,5 phải ~8,5; Φ168×4,0 phải ~16,2). Số 0
 *    nhìn thấy được và chặn được ở khâu lập chứng từ; số sai thì im lặng nhân lệch.
 *
 * CHẠY:  node nhap/xu-not-theo-anh.mjs [--that]
 */
const BANG_GIA = "Alumdoor 2026";
const G = "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");
const ANH_ST = "Ảnh BẢNG GIÁ CỬA CUỐN SIÊU TRƯỜNG - BẢNG 100, áp dụng 31/07/2026";
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
const taoGia = (than, ten) => goi("/api/resource/Item Price", { method: "POST", body: { doc: than, title: ten, content: ten } });

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

const daCoGia = new Set(((await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["item_code"]))}`)).json.data ?? []).map((x) => x.item_code));

// ── ① Lá bản 100 ────────────────────────────────────────────────────────────────────────
/** [mã, tên, độ dày, giá, có sẵn mã chưa] */
const LA100 = [
  ["LA_DLK_1_1LY", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.1LY", "1.1 LY", 490000],
  ["LA_DLK_1_2LY_K175", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.2LY", "1.2 LY", 520000],
  ["LA_DLK_1_3LY_K175", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.3LY", "1.3 LY", 540000],
  ["LA_DLK_1_4LY_K175", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.4LY", "1.4 LY", 580000],
  ["LA_DLK_1_5LY_K175", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.5LY", "1.5 LY", 610000],
  ["LA_DLK_1_6LY_K175", "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN BẢN 100 — 1.6LY", "1.6 LY", 640000],
];
console.log("① lá Đài Loan sơn tĩnh điện bản 100 (ảnh Siêu Trường):");
const mauLa = (await goi("/api/resource/Item/LA_DLM_1LY_K175")).json.data;
for (const [ma, ten, day, gia] of LA100) {
  const co = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  const trangThai = !co ? "TẠO MÃ MỚI" : daCoGia.has(ma) ? "đã đủ" : "có mã, thêm giá";
  console.log(`   ${ma.padEnd(22)}${day.padEnd(8)}${vn(gia).padStart(10)}/m²   ${trangThai}`);
  if (!THAT || trangThai === "đã đủ") continue;
  if (!co) {
    const { item_code, item_name, description, ...khuon } = boCoSo(mauLa);
    const r = await goi("/api/resource/Item", { method: "POST", body: { doc: { ...khuon, item_code: ma, item_name: ten,
      description: `${ANH_ST}, dòng ${day}. Bản 100 dùng cho cửa siêu trường; ảnh gọi đúng chữ "LÁ ĐÀI LOAN SƠN TĨNH ĐIỆN - BẢN 100" nên tên giữ chữ Đài Loan, không đổi thành Siêu Trường.` },
      title: ten, content: `${ma} ${ten}` } });
    if (!r.ok) { console.log(`      ✗ tạo mã: ${loi(r)}`); continue; }
  }
  const tenGia = `${BANG_GIA}:${ma}:m2:TACH_MON:MOI-DIEN-TICH`;
  const g = await taoGia({ price_list: BANG_GIA, item_code: ma, item_group: "Nan/lá cửa", uom: "m2",
    area_tier: "MOI-DIEN-TICH", price_variant: "TACH_MON", rate: String(gia), currency: "VND",
    note: `${ANH_ST}: ${day} = ${vn(gia)} vnđ/m² (dung sai ±8%).`, disabled: false }, tenGia);
  if (!g.ok) console.log(`      ✗ giá: ${loi(g)}`);
}

// ── ② + ③ Gộp bốn cặp mã trục, giá theo ảnh ─────────────────────────────────────────────
/** [mã GIỮ, mã NGỪNG DÙNG, giá theo ảnh, ảnh nào, dòng nào] */
const GOP = [
  ["RT_TR114_1.8", "RT_TRUC_114_1.8LY", 170000, "Đức và Siêu Trường", "TRỤC 114 (1.8mm) 170.000 vnđ/m"],
  ["RT_TR114_2.1", "RT_TRUC_114_2.1LY", 190000, "Đức và Siêu Trường", "TRỤC 114 (2.1mm) 190.000 vnđ/m"],
  ["RT_TR140", "RT_TRUC140", 290000, "Đức và Siêu Trường", "TRỤC 140 (2.5mm) 290.000 vnđ/m"],
  ["RT_TR168", "RT_TRUC168", 520000, "Siêu Trường", "TRỤC 168 (4.0mm) 520.000 vnđ/m"],
];
console.log("\n②③ gộp mã trục trùng — giữ mã ẢNH gọi đúng tên, mã kia ngừng dùng:");
for (const [giu, bo, gia, anh, dong] of GOP) {
  const dGiu = (await goi("/api/resource/Item/" + encodeURIComponent(giu))).json.data;
  const dBo = (await goi("/api/resource/Item/" + encodeURIComponent(bo))).json.data;
  if (!dGiu || !dBo) { console.log(`   ✗ thiếu mã trong cặp ${giu} / ${bo}`); continue; }
  console.log(`   giữ ${giu.padEnd(22)}"${dGiu.item_name}"   → ${vn(gia)}/Mét`);
  console.log(`   bỏ  ${bo.padEnd(22)}"${dBo.item_name}"   ngừng dùng`);
  if (!THAT) continue;
  // Gỡ dòng giá của mã bị bỏ trước, kẻo hai dòng cùng phủ mọi diện tích là trùng bậc.
  for (const p of ((await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["name", "item_code"]))}`)).json.data ?? []).filter((x) => x.item_code === bo)) {
    await goi("/api/resource/Item Price/" + encodeURIComponent(p.name), { method: "DELETE" });
  }
  const tenGia = `${BANG_GIA}:${giu}:Mét:STANDARD:MOI-DIEN-TICH`;
  const g = await taoGia({ price_list: BANG_GIA, item_code: giu, item_group: "Ray và trục", uom: "Mét",
    area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `Ảnh bảng giá ${anh} (31/07/2026): ${dong}. Gộp từ mã ${bo} — cùng một vật, hai mã (một từ sổ tồn, một từ ĐM).`,
    disabled: false }, tenGia);
  if (!g.ok) { console.log(`      ✗ giá: ${loi(g)}`); continue; }
  const r = await goi("/api/resource/Item/" + encodeURIComponent(bo), { method: "PUT", body: { doc: { ...boCoSo(dBo), disabled: true,
    description: `NGỪNG DÙNG 21/08/2026 — trùng với ${giu} "${dGiu.item_name}". Cùng một vật mang hai mã: mã này lấy từ sheet ĐM, mã kia lấy từ sổ tồn. Ảnh bảng giá gọi tên theo ${giu} nên giữ mã đó. KHÔNG xoá vì chứng từ cũ có thể còn trỏ tới.` } } });
  if (!r.ok) console.log(`      ✗ ngừng dùng: ${loi(r)}`);
}

// ── ④ Phụ kiện khác trên ảnh Siêu Trường ────────────────────────────────────────────────
const PK = [
  ["RT_RAY_U100_1.4LY_KRON", 105000, "Mét", "Ray và trục", "RAY SẮT U100, 1.4 LY, 105.000 vnđ/m"],
  ["PKC_LACPHU42", 120000, "Cái", "Phụ kiện chung", "LẮC PHỤ 42, 120.000 vnđ/cái"],
];
console.log("\n④ phụ kiện khác trên ảnh Siêu Trường:");
const mauLac = (await goi("/api/resource/Item/PKC_LACPHU40")).json.data;
for (const [ma, gia, uom, nhom, dong] of PK) {
  const co = (await goi("/api/resource/Item/" + encodeURIComponent(ma))).json.data;
  console.log(`   ${ma.padEnd(26)}${vn(gia).padStart(10)}/${uom}   ${!co ? "TẠO MÃ MỚI" : daCoGia.has(ma) ? "đã có giá — bỏ qua" : "thêm giá"}`);
  if (!THAT || daCoGia.has(ma)) continue;
  if (!co) {
    const { item_code, item_name, description, ...khuon } = boCoSo(mauLac);
    const r = await goi("/api/resource/Item", { method: "POST", body: { doc: { ...khuon, item_code: ma, item_name: "LẮC PHỤ 42", description: `${ANH_ST}, ${dong}.` }, title: "LẮC PHỤ 42", content: ma } });
    if (!r.ok) { console.log(`      ✗ tạo mã: ${loi(r)}`); continue; }
  }
  const tenGia = `${BANG_GIA}:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`;
  const g = await taoGia({ price_list: BANG_GIA, item_code: ma, item_group: nhom, uom,
    area_tier: "MOI-DIEN-TICH", price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `${ANH_ST}: ${dong}.`, disabled: false }, tenGia);
  if (!g.ok) console.log(`      ✗ giá: ${loi(g)}`);
}
console.log(THAT ? "\nxong" : "\nchưa ghi gì. Thêm --that để thực hiện.");
