/**
 * PHẦN CÒN LẠI của bản sửa giá theo ảnh — ba chỗ mà lượt đầu bị nền tảng chặn, và nó chặn ĐÚNG.
 *
 * ① ĐỔI ĐVT PHẢI XOÁ TRƯỚC TẠO SAU. `PKC_BKAN` (Cái → Cặp) và `PKC_GIAT` (Cặp → Bộ) đổi cả tên
 *    bản ghi vì ĐVT nằm trong khoá đặt tên. Lượt đầu tôi tạo dòng mới trước rồi mới xoá dòng cũ,
 *    nên ở khoảnh khắc giữa có hai dòng cùng phủ mọi diện tích và
 *    `assertItemPriceTierIsUnambiguous` từ chối. Đảo thứ tự.
 *
 * ② BẬC DIỆN TÍCH ĐẶT TÊN THEO `tier_code`, không phải `tier_name` — và cả hai đều bắt buộc.
 *
 * ③ CỬA ÚC: DÒNG m² PHẢI CHẶN CẬN DƯỚI Ở 4. Đây mới là điểm đáng nói. Sáu dòng giá m² của cửa
 *    Úc đang gắn bậc `MOI-DIEN-TICH`, mà bậc đó bỏ trống cả hai cận nên `tierBounds`
 *    (clouderp-pricing/src/index.ts:270) FAIL-CLOSED — coi như phủ MỌI khoảng. Thêm dòng bán
 *    theo Bộ cho khoảng dưới 4m² là chồng lấn, và nền tảng chặn.
 *
 *    Nền tảng nói đúng: nếu dưới 4m² bán trọn bộ thì dòng m² KHÔNG được phép phủ khoảng đó nữa.
 *    Để nguyên `MOI-DIEN-TICH` là hệ thống có hai cách tính tiền cho cùng một cái cửa 3m² mà
 *    không có luật nào chọn hộ. Nên: chuyển sáu dòng m² sang bậc `DT-TREN-4M2` (min 4), rồi mới
 *    thêm sáu dòng Bộ ở `DT-DUOI-4M2` (max 4). Cận trên ĐÓNG cận dưới MỞ nên hai bậc chạm mép
 *    tại 4 mà không chồng.
 *
 *    Cửa 6 DEM KHÔNG có giá trọn bộ trong ảnh, nên giữ nguyên `MOI-DIEN-TICH` — ảnh chỉ cho ba
 *    con số cho 4 DEM, 4.6 DEM và 5.2 DEM.
 *
 * CHẠY:  node nhap/sua-gia-theo-anh-2.mjs [--that]
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
const tao = (than, ten) => goi("/api/resource/Item Price", { method: "POST", body: { doc: than, title: ten, content: ten } });

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

const doc = async (ma) => (await goi("/api/resource/Item Price/" + encodeURIComponent(ma))).json.data;
const boCoSo = (d) => { const { name, owner, creation, modified, modified_by, docstatus, idx, status, doctype, _metadata_revision, ...t } = d; return t; };

// ── ① Hai mã đổi ĐVT ────────────────────────────────────────────────────────────────────
const DOI_DVT = [
  ["Alumdoor 2026:PKC_BKAN:Cái:STANDARD:MOI-DIEN-TICH", "Cặp", 22000,
    'Ảnh bảng giá Úc (31/07/2026) phụ kiện đồng bộ #5: Bát khóa âm nền, ĐVT "cặp", 22.000. Hệ thống đang ghi 88.000/Cái — đúng bằng 4 lần, tức đã nhân với 4 cặp/bộ rồi lại khai ĐVT là Cái.'],
  ["Alumdoor 2026:PKC_GIAT:Cặp:STANDARD:MOI-DIEN-TICH", "Bộ", 128000,
    'Ảnh bảng giá Úc (31/07/2026) phụ kiện đồng bộ #4: Giá đỡ T (sơn tĩnh điện hoặc xi mạ chống oxy hóa), ĐVT "bộ", 128.000.'],
];
console.log("① đổi ĐVT (xoá trước, tạo sau):");
for (const [tenCu, uom, rate, note] of DOI_DVT) {
  const d = await doc(tenCu);
  if (!d) { console.log(`   ✗ không thấy ${tenCu}`); continue; }
  const tenMoi = `${BANG_GIA}:${d.item_code}:${uom}:${d.price_variant}:${d.area_tier}`;
  console.log(`   ${d.item_code.padEnd(14)}${vn(d.rate).padStart(10)}/${String(d.uom).padEnd(5)} → ${vn(rate).padStart(10)}/${uom}`);
  if (!THAT) continue;
  const x = await goi("/api/resource/Item Price/" + encodeURIComponent(tenCu), { method: "DELETE" });
  if (!x.ok) { console.log(`      ✗ xoá: ${loi(x)}`); continue; }
  const r = await tao({ ...boCoSo(d), uom, rate: String(rate), note }, tenMoi);
  if (!r.ok) {
    console.log(`      ✗ tạo: ${loi(r)}  → DỰNG LẠI DÒNG CŨ`);
    await tao(boCoSo(d), tenCu);
  }
}

// ── ② Hai bậc diện tích quanh mốc 4m² ───────────────────────────────────────────────────
const BAC = [
  ["DT-DUOI-4M2", "Dưới 4 m²", undefined, 4, 5,
    "Cửa Úc dưới 4m² bán TRỌN BỘ theo ĐVT Bộ, không nhân theo m². Ảnh bảng giá Úc 31/07/2026: \"Cửa dưới 4m2 (1.800.000đ/bộ - loại 4 DEM) - (2.000.000đ/bộ - loại 4.6 DEM) - (2.200.000đ/bộ - loại 5.2 DEM)\". `resolveAustralianBillingMode` đổi cách tính đúng ở mốc này."],
  ["DT-TREN-4M2", "Trên 4 m²", 4, undefined, 6,
    "Từ trên 4m² cửa Úc quay về tính theo m². Bậc này tồn tại để dòng giá m² KHÔNG còn phủ khoảng dưới 4m² — nếu để `MOI-DIEN-TICH` thì cùng một cái cửa 3m² có hai cách tính tiền mà không luật nào chọn hộ."],
];
console.log("\n② bậc diện tích:");
for (const [tier_code, tier_name, min, max, sort_order, note] of BAC) {
  const co = await goi("/api/resource/Bậc diện tích/" + encodeURIComponent(tier_code));
  console.log(`   ${tier_code.padEnd(16)}${co.ok ? "đã có" : "tạo mới"}   ${min ?? "—"} … ${max ?? "—"}`);
  if (!THAT || co.ok) continue;
  const r = await goi("/api/resource/Bậc diện tích", { method: "POST", body: { doc: {
    tier_code, tier_name, ...(min === undefined ? {} : { min_area_sqm: min }),
    ...(max === undefined ? {} : { max_area_sqm: max }), sort_order, note, disabled: false },
    title: tier_name, content: tier_code } });
  if (!r.ok) console.log(`      ✗ ${loi(r)}`);
}

// ── ③ Cửa Úc: chặn dòng m² ở trên 4m², rồi thêm dòng Bộ dưới 4m² ────────────────────────
const UC = [
  [["CUC_UC_KT_4D", "CUC_UC_MTN_4D"], 1800000, "loại 4 DEM"],
  [["CUC_UC_KT_4_6D", "CUC_UC_MTN_4_6D"], 2000000, "loại 4.6 DEM"],
  [["CUC_UC_KT_5_5D", "CUC_UC_MTN_5_5D"], 2200000, "loại 5.2 DEM"],
];
console.log("\n③ cửa Úc quanh mốc 4m²:");
for (const [ma2, gia, nhan] of UC) {
  for (const ma of ma2) {
    const bt = ma.includes("_KT_") ? "KEO_TAY" : "MOTOR_NGOAI";
    const tenM2Cu = `${BANG_GIA}:${ma}:m2:${bt}:MOI-DIEN-TICH`;
    const d = await doc(tenM2Cu);
    if (!d) { console.log(`   ✗ không thấy dòng m² của ${ma}`); continue; }
    console.log(`   ${ma.padEnd(18)}m² ${vn(d.rate).padStart(9)} → bậc TRÊN 4m²   ·   thêm Bộ ${vn(gia)} ở bậc DƯỚI 4m²  (${nhan})`);
    if (!THAT) continue;
    // Chuyển bậc = đổi tên, nên vẫn phải xoá trước tạo sau.
    const x = await goi("/api/resource/Item Price/" + encodeURIComponent(tenM2Cu), { method: "DELETE" });
    if (!x.ok) { console.log(`      ✗ xoá dòng m²: ${loi(x)}`); continue; }
    const tenM2 = `${BANG_GIA}:${ma}:m2:${bt}:DT-TREN-4M2`;
    const r1 = await tao({ ...boCoSo(d), area_tier: "DT-TREN-4M2",
      note: `${d.note ?? ""} Chuyển từ "mọi diện tích" sang "trên 4m²" vì dưới 4m² cửa Úc bán trọn bộ theo Bộ.`.trim() }, tenM2);
    if (!r1.ok) { console.log(`      ✗ tạo lại dòng m²: ${loi(r1)}  → DỰNG LẠI BẢN CŨ`); await tao(boCoSo(d), tenM2Cu); continue; }
    const tenBo = `${BANG_GIA}:${ma}:Bộ:${bt}:DT-DUOI-4M2`;
    const r2 = await tao({ price_list: BANG_GIA, item_code: ma, item_group: "Cửa tấm liền Úc",
      uom: "Bộ", area_tier: "DT-DUOI-4M2", price_variant: bt, rate: String(gia), currency: "VND",
      note: `Ảnh bảng giá Úc (31/07/2026): "Cửa dưới 4m2 (${vn(gia)}đ/bộ - ${nhan})". Ảnh cho MỘT giá cho mỗi độ dày lá và KHÔNG tách kéo tay với motor ngoài — nên hai mã cùng độ dày mang cùng số này. Nếu thực tế có chênh thì phải chốt lại.`,
      disabled: false }, tenBo);
    if (!r2.ok) console.log(`      ✗ tạo dòng Bộ: ${loi(r2)}`);
  }
}
console.log(THAT ? "\nxong" : "\nchưa ghi gì. Thêm --that để thực hiện.");
