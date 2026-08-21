/**
 * SỬA BẢNG GIÁ CHO KHỚP ẢNH CHÍNH THỨC.
 *
 * Chủ xưởng chốt 21/08/2026: "bảng giá theo hình ảnh". Ba ảnh đã tự mở ra đọc từng dòng:
 *    · BẢNG GIÁ CỬA CUỐN TẤM LIỀN CÔNG NGHỆ ÚC        áp dụng 31/07/2026
 *    · BẢNG GIÁ CỬA CUỐN KHE THOÁNG CÔNG NGHỆ ĐỨC     áp dụng 31/07/2026
 *    · BẢNG GIÁ MOTOR & BÌNH LƯU ĐIỆN                 áp dụng 31/07/2026
 *
 * BỐN VIỆC:
 *
 * ① XOÁ DÒNG GIÁ ĐÁ NHAU. 27 mã đang có HAI dòng giá cùng một bậc diện tích: một dòng
 *    `STANDARD` lấy từ sheet ĐM, một dòng biến thể (CHI_LA/TANG_RAY/KEO_TAY/MOTOR_NGOAI/
 *    TACH_MON) lấy từ ảnh. Ảnh là chuẩn nên dòng STANDARD phải đi. Nguy nhất là
 *    `CUC_UC_KT_6D`: bản kéo tay theo ảnh là 485.000 nhưng dòng STANDARD ghi 465.000 — đúng
 *    bằng giá motor ngoài. Ai tra trúng dòng đó là bán hụt 20.000 mỗi mét vuông.
 *
 * ② SỬA 8 GIÁ SAI SỐ so với ảnh.
 *
 * ③ THÊM 4 dòng giá phụ kiện có trong ảnh mà hệ thống bỏ trống.
 *
 * ④ THÊM GIÁ TRỌN BỘ CỬA ÚC DƯỚI 4m². Ảnh Úc ghi: "Cửa dưới 4m2 (1.800.000đ/bộ - loại 4 DEM)
 *    - (2.000.000đ/bộ - loại 4.6 DEM) - (2.200.000đ/bộ - loại 5.2 DEM)". Đây là chỗ duy nhất
 *    trong toàn bộ tài liệu bán theo BỘ chứ không theo m², và `resolveAustralianBillingMode`
 *    (clouderp-selling/src/adjustment-policy.ts:229) đã dựng sẵn để đổi cách tính ở mốc 4m².
 *    Trước nay hệ thống KHÔNG có ba con số này ở bất kỳ đâu.
 *    Ảnh cho MỘT giá cho mỗi độ dày lá, KHÔNG tách kéo tay với motor ngoài — nên ghi cho cả hai
 *    mã của cùng độ dày, và nói rõ trong ghi chú rằng ảnh không phân biệt.
 *
 * CHẠY:  node nhap/sua-gia-theo-anh.mjs [--that]
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
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).slice(0, 130);
const vn = (n) => Number(n).toLocaleString("vi");

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

// ── ① Dòng giá đá nhau ──────────────────────────────────────────────────────────────────
const tatCa = (await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["name", "item_code", "price_variant", "rate", "uom", "area_tier"]))}`)).json.data ?? [];
const theoMa = {};
for (const r of tatCa) (theoMa[r.item_code] ??= []).push(r);
const daNhau = Object.entries(theoMa)
  .filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.area_tier)).size === 1)
  .flatMap(([, v]) => v.filter((x) => x.price_variant === "STANDARD"));

console.log(`① ${daNhau.length} dòng STANDARD đá với dòng lấy từ ảnh:`);
for (const r of daNhau) {
  const khac = theoMa[r.item_code].filter((x) => x !== r).map((x) => `${x.price_variant}=${vn(x.rate)}`).join(" · ");
  const lech = theoMa[r.item_code].some((x) => x !== r && Number(x.rate) !== Number(r.rate));
  console.log(`   ${lech ? "≠" : "="} ${r.item_code.padEnd(24)}bỏ STANDARD=${vn(r.rate).padStart(11)}   giữ ${khac}`);
}
let xoa = 0;
if (THAT) for (const r of daNhau) if ((await goi("/api/resource/Item Price/" + encodeURIComponent(r.name), { method: "DELETE" })).ok) xoa++;
if (THAT) console.log(`   → xoá ${xoa}/${daNhau.length}\n`);

// ── ② Giá ghi sai so với ảnh ────────────────────────────────────────────────────────────
/** [mã, giá đúng, ĐVT đúng, ảnh nào, dòng nào trong ảnh] */
const SUA = [
  ["RT_TRUC140", 290000, "Mét", "Đức", "phụ kiện đồng bộ #14: Trục 140 (2.5mm) 290.000 vnđ/m"],
  ["RT_RAYHOP", 175000, "Mét", "Đức", "phụ kiện đồng bộ #2: Ray hộp U76 175.000 vnđ/m"],
  ["RT_RAY_HOP_TD_U100", 230000, "Mét", "Đức", "phụ kiện đồng bộ #4: Ray hộp U100 230.000 vnđ/m"],
  ["PKC_BKAN", 22000, "Cặp", "Úc", "phụ kiện đồng bộ #5: Bát khóa âm nền, ĐVT cặp, 22.000. Hệ thống đang ghi 88.000/Cái — đúng bằng 4 lần, tức đã nhân với 4 cặp/bộ rồi lại khai ĐVT là Cái"],
  ["PKC_GIAT", 128000, "Bộ", "Úc", "phụ kiện đồng bộ #4: Giá đỡ T (sơn tĩnh điện hoặc xi mạ chống oxy hóa), ĐVT bộ, 128.000"],
  ["MT_JG300KG", 3550000, "Bộ", "Motor", "dòng 6: MOTOR JG 300KG (CHÍNH HÃNG) 3.550.000"],
  ["MT_JG400KG", 4050000, "Bộ", "Motor", "dòng 7: MOTOR JG 400KG (CHÍNH HÃNG) 4.050.000"],
  ["MT_JG600KG", 4250000, "Bộ", "Motor", "dòng 8: MOTOR JG 600KG (CHÍNH HÃNG) 4.250.000"],
];
console.log("② sửa giá sai:");
console.log("   " + "mã".padEnd(24) + "đang là".padStart(12) + "→ ảnh".padStart(13) + "  ĐVT");
let sua = 0;
for (const [ma, gia, uom, anh, dong] of SUA) {
  const cu = (theoMa[ma] ?? []).find((x) => x.price_variant === "STANDARD") ?? (theoMa[ma] ?? [])[0];
  if (!cu) { console.log(`   ✗ ${ma}: chưa có dòng giá nào để sửa`); continue; }
  const doiUom = cu.uom !== uom;
  console.log(`   ${ma.padEnd(24)}${vn(cu.rate).padStart(12)}${vn(gia).padStart(13)}  ${doiUom ? `${cu.uom} → ${uom}` : uom}`);
  if (!THAT) continue;
  /**
   * Đổi ĐVT là đổi cả TÊN bản ghi (uom nằm trong khoá đặt tên), nên phải dựng mới rồi xoá cũ.
   * Sửa tại chỗ chỉ đổi được con số, tên sẽ nói dối về đơn vị.
   */
  const than = {
    price_list: BANG_GIA, item_code: ma, item_group: cu.item_group, uom,
    area_tier: cu.area_tier, price_variant: cu.price_variant, rate: String(gia), currency: "VND",
    note: `Sửa cho khớp ảnh bảng giá ${anh} (31/07/2026), ${dong}.`, disabled: false,
  };
  if (doiUom) {
    const ten = `${BANG_GIA}:${ma}:${uom}:${cu.price_variant}:${cu.area_tier}`;
    const r = await goi("/api/resource/Item Price", { method: "POST", body: { doc: than, title: ten, content: ten } });
    if (r.ok) { await goi("/api/resource/Item Price/" + encodeURIComponent(cu.name), { method: "DELETE" }); sua++; }
    else console.log(`      ✗ ${loi(r)}`);
  } else {
    const hien = (await goi("/api/resource/Item Price/" + encodeURIComponent(cu.name))).json.data;
    const r = await goi("/api/resource/Item Price/" + encodeURIComponent(cu.name), { method: "PUT", body: { doc: { ...hien, rate: String(gia), note: than.note } } });
    if (r.ok) sua++; else console.log(`      ✗ ${loi(r)}`);
  }
}
if (THAT) console.log(`   → sửa ${sua}/${SUA.length}\n`);

// ── ③ Dòng giá có trong ảnh mà hệ thống bỏ trống ────────────────────────────────────────
const THEM = [
  ["RT_TRUC_114_1.8LY", 170000, "Mét", "Ray và trục", "Đức", "phụ kiện đồng bộ #12: Trục 114 (1.8mm) 170.000 vnđ/m"],
  ["RT_TRUC_114_2.1LY", 190000, "Mét", "Ray và trục", "Đức", "phụ kiện đồng bộ #13: Trục 114 (2.1mm) 190.000 vnđ/m"],
  ["RT_RAY_U70_KRON", 70000, "Mét", "Ray và trục", "Úc", "phụ kiện đồng bộ #1: Ray thép mạ HK AZ50/G40 - U70 x 1.2mm, 70.000 đ/m"],
  ["RT_RAY_U100_1.4LY_RON", 110000, "Mét", "Ray và trục", "Úc", "phụ kiện đồng bộ #2: Ray thép mạ HK AZ50/G40 - U100 x 1.4mm, 110.000 đ/m"],
];
console.log("③ thêm dòng giá còn trống:");
let them = 0;
for (const [ma, gia, uom, nhom, anh, dong] of THEM) {
  const ten = `${BANG_GIA}:${ma}:${uom}:STANDARD:MOI-DIEN-TICH`;
  console.log(`   ${ma.padEnd(24)}${vn(gia).padStart(12)}  ${uom}`);
  if (!THAT) continue;
  const r = await goi("/api/resource/Item Price", { method: "POST", body: { doc: {
    price_list: BANG_GIA, item_code: ma, item_group: nhom, uom, area_tier: "MOI-DIEN-TICH",
    price_variant: "STANDARD", rate: String(gia), currency: "VND",
    note: `Ảnh bảng giá ${anh} (31/07/2026), ${dong}.`, disabled: false }, title: ten, content: ten } });
  if (r.ok) them++; else console.log(`      ✗ ${loi(r)}`);
}
if (THAT) console.log(`   → thêm ${them}/${THEM.length}\n`);

// ── ④ Giá trọn bộ cửa Úc dưới 4m² ───────────────────────────────────────────────────────
const BAC_NHO = "DT-DUOI-4M2";
const UC_DUOI_4 = [
  [["CUC_UC_KT_4D", "CUC_UC_MTN_4D"], 1800000, "loại 4 DEM"],
  [["CUC_UC_KT_4_6D", "CUC_UC_MTN_4_6D"], 2000000, "loại 4.6 DEM"],
  [["CUC_UC_KT_5_5D", "CUC_UC_MTN_5_5D"], 2200000, "loại 5.2 DEM"],
];
console.log("④ giá TRỌN BỘ cửa Úc dưới 4m² (bán theo Bộ, không theo m²):");
if (THAT) {
  const co = await goi("/api/resource/Bậc diện tích/" + encodeURIComponent(BAC_NHO));
  if (!co.ok) {
    const r = await goi("/api/resource/Bậc diện tích", { method: "POST", body: { doc: {
      tier_name: BAC_NHO, max_area_sqm: 4,
      note: "Cửa Úc dưới 4m² bán trọn bộ theo ĐVT Bộ, không nhân theo m². Ảnh bảng giá Úc 31/07/2026." },
      title: BAC_NHO, content: BAC_NHO } });
    console.log(r.ok ? `   tạo bậc ${BAC_NHO}` : `   ✗ bậc: ${loi(r)}`);
  } else console.log(`   bậc ${BAC_NHO}: đã có`);
}
let uc = 0;
for (const [ma2, gia, nhan] of UC_DUOI_4) {
  for (const ma of ma2) {
    const bt = ma.includes("_KT_") ? "KEO_TAY" : "MOTOR_NGOAI";
    const ten = `${BANG_GIA}:${ma}:Bộ:${bt}:${BAC_NHO}`;
    console.log(`   ${ma.padEnd(24)}${vn(gia).padStart(12)}  Bộ   ${nhan}`);
    if (!THAT) continue;
    const r = await goi("/api/resource/Item Price", { method: "POST", body: { doc: {
      price_list: BANG_GIA, item_code: ma, item_group: "Cửa tấm liền Úc", uom: "Bộ",
      area_tier: BAC_NHO, price_variant: bt, rate: String(gia), currency: "VND",
      note: `Ảnh bảng giá Úc (31/07/2026): "Cửa dưới 4m2 (${vn(gia)}đ/bộ - ${nhan})". Ảnh cho MỘT giá cho mỗi độ dày lá và KHÔNG tách kéo tay với motor ngoài — nên hai mã cùng độ dày mang cùng số này. Nếu thực tế có chênh thì phải chốt lại.`,
      disabled: false }, title: ten, content: ten } });
    if (r.ok) uc++; else console.log(`      ✗ ${loi(r)}`);
  }
}
if (THAT) console.log(`   → thêm ${uc}/6\n`);

console.log(THAT ? "xong" : "\nchưa ghi gì. Thêm --that để thực hiện.");
