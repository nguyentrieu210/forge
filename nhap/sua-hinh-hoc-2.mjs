/**
 * BA VIỆC CÒN LẠI của phần hình học, theo sheet GHI CHÚ và 25.7 QUY TRÌNH.
 *
 * ① CỬA ĐỨC KÉO TAY về nhóm CỬA TẤM LIỀN ÚC — `25.7 QUY TRÌNH` đặt tiêu đề rõ:
 *    "◊ ĐƠN HÀNG CỬA ĐỨC KÉO TAY (NHÓM SP CỬA TẤM LIỀN ÚC)". Để ở nhóm Cửa CN Đức thì nó ăn
 *    công thức Đức có bước TRỪ 1 LÁ, trong khi công thức của nó là `(CPB − 0,13) / 0,068`
 *    KHÔNG trừ — sai đúng một lá mỗi cửa.
 *
 * ② SIÊU TRƯỜNG dùng công thức ĐÀI LOAN, khác mỗi bản lá.
 *    Công thức chia lá của siêu trường KHÔNG có trong tài liệu nào — đã tìm cả ba. Nhưng suy
 *    ra được chắc chắn: ảnh bảng giá ghi "SIÊU TRƯỜNG — BẢNG 100" còn Đài Loan là "BẢNG 75",
 *    cùng dòng lá Đài Loan; và `QUY CÁCH` cho siêu trường ĐÚNG cùng công thức rộng với Đài Loan.
 *    Đài Loan bản 75 dùng ước số 0,077 (chồng mí 2mm), nên bản 100 là 0,102.
 *    ĐÂY LÀ SUY RA, không phải chữ trong tài liệu — ghi rõ vào Ghi chú của chính sách.
 *
 * ③ PHÂN NHÁNH THEO LOẠI RAY. Sheet GHI CHÚ cho hai bộ số:
 *      Đức   U75 : RPBR = RLL + 0,15 · RPBN = RPBR − 0,06
 *            U100: RPBR = RLL + 0,20 · RPBN = RPBR − 0,07
 *      Úc    U75 : RPBR = RLL + 0,14      U100: RPBR = RLL + 0,20
 *      ĐL    U75 : RCL  = RLL + 0,11      U100: RCL  = RLL + 0,17
 *    Dùng chung một luật là sai 10–60mm mỗi cửa dùng ray U100.
 *
 * CHẠY:  node nhap/sua-hinh-hoc-2.mjs [--that]
 */
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}
const dn = await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"}\n`);

// ── ① Cửa Đức kéo tay về nhóm tấm liền Úc ────────────────────────────────────────────────
console.log("① CỬA ĐỨC KÉO TAY → nhóm Cửa tấm liền Úc");
for (const ma of ["CDUC_DUC_KT_AL70", "CDUC_DUC_KT_AL70_2_LOP"]) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`);
  if (!g.ok) { console.log(`   ✗ ${ma} không đọc được`); continue; }
  const d = g.json.data;
  if (!THAT) { console.log(`   → ${ma.padEnd(26)}${d.item_group} → Cửa tấm liền Úc`); continue; }
  const p = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`, { method: "PUT", body: { ...d, item_group: "Cửa tấm liền Úc" } });
  console.log(`   ${p.ok ? "✓" : "✗"} ${ma.padEnd(26)}${d.item_group} → ${p.ok ? p.json.data.item_group : (p.json?.message ?? "").slice(0, 60)}`);
}

// ── ② Siêu Trường: công thức Đài Loan, bản lá 100 ────────────────────────────────────────
console.log("\n② CỬA SIÊU TRƯỜNG → công thức Đài Loan, ước số 0,102 (bản 100)");
{
  const g = await goi(`/api/resource/Cutting Policy/${encodeURIComponent("Cửa Siêu Trường")}`);
  if (g.ok) {
    const d = g.json.data;
    const sua = {
      leaf_formula: "Kiểu Đài Loan Lưới", leaf_divisor_source: "Hằng số của chính sách",
      leaf_divisor_const: 0.102, leaf_height_deduction_m: 0,
      leaf_rounding: "Ngưỡng trừ-một-lá", leaf_round_threshold: 0.8, leaf_variants: [],
      note: "SUY RA, không có trong tài liệu: công thức chia lá của siêu trường không được viết ở đâu (đã tìm 25.7 QUY TRÌNH, GHI CHÚ, QUY CÁCH). Căn cứ suy: bảng giá ghi 'SIÊU TRƯỜNG — BẢNG 100' còn Đài Loan 'BẢNG 75', cùng dòng lá Đài Loan; và QUY CÁCH cho siêu trường đúng cùng công thức rộng với Đài Loan. Đài Loan bản 75 dùng 0,077 (chồng mí 2mm) nên bản 100 là 0,102. CẦN CHỦ XƯỞNG XÁC NHẬN.",
    };
    if (!THAT) console.log(`   → ${d.leaf_formula} ước số ${d.leaf_divisor_const} ⇒ Kiểu Đài Loan Lưới ước số 0.102`);
    else {
      const p = await goi(`/api/resource/Cutting Policy/${encodeURIComponent("Cửa Siêu Trường")}`, { method: "PUT", body: { doc: { ...d, ...sua } } });
      console.log(`   ${p.ok ? "✓" : "✗"} ${p.ok ? `${p.json.data.leaf_formula} · ước số ${p.json.data.leaf_divisor_const} · ngưỡng ${p.json.data.leaf_round_threshold}` : (p.json?.message ?? "").slice(0, 70)}`);
    }
  } else console.log("   ✗ không đọc được chính sách Cửa Siêu Trường");
}

// ── ③ quy tắc hình học phân nhánh theo loại ray ──────────────────────────────────────────
const r = (ma, dich, nguon, so, them = {}) => ({
  rule_code: ma, target_field: dich, source_field: nguon, operator: "SUBTRACT", operand_m: so,
  priority: them.priority ?? 0, sequence: them.sequence ?? 0,
  ...(them.ray_type ? { ray_type: them.ray_type } : {}),
  ...(them.customer_group ? { customer_group: them.customer_group } : {}),
  ...(them.has_butterfly_bracket ? { has_butterfly_bracket: true } : {}),
  ...(them.note ? { note: them.note } : {}),
});
/** ADD viết bằng operator riêng — cộng thêm từ kích thước lọt lòng. */
const a = (ma, dich, nguon, so, them = {}) => ({ ...r(ma, dich, nguon, so, them), operator: "ADD" });

const QUY_TAC = {
  "Cửa CN Đức": [
    a("CPB", "CAO-PB", "CAO-LOT-LONG", 0.5, { sequence: 1, note: "CPB = CLL + 500mm" }),
    a("RPBR-U75", "RONG-PB-RAY", "RONG-LOT-LONG", 0.15, { ray_type: "U75", sequence: 2, note: "RPBR U75 = RLL + 150mm" }),
    a("RPBR-U100", "RONG-PB-RAY", "RONG-LOT-LONG", 0.20, { ray_type: "U100", sequence: 3, priority: 10, note: "RPBR U100 = RLL + 200mm" }),
    a("RPBN-U75", "RONG-PB-NHUA", "RONG-LOT-LONG", 0.09, { ray_type: "U75", sequence: 4, note: "RPBN = RLL + 90mm, tương đương RPBR U75 trừ 60mm" }),
    a("RPBN-U100", "RONG-PB-NHUA", "RONG-LOT-LONG", 0.13, { ray_type: "U100", sequence: 5, priority: 10, note: "RPBN = RLL + 130mm, tương đương RPBR U100 trừ 70mm" }),
    r("RCL", "RONG-CAT-LA", "RONG-PB-NHUA", 0.02, { sequence: 6, note: "RPBN = RCL + 20mm, nên RCL = RPBN trừ 20mm" }),
    r("DT", "DIEN-TICH", "CAO-PB", 0, { sequence: 9, note: "Tính tiền = CPB x RPBN" }),
  ],
  "Cửa tấm liền Úc": [
    a("CPB", "CAO-PB", "CAO-LOT-LONG", 0.5, { sequence: 1, note: "CPB = CLL + 500mm" }),
    a("RPBR-U75", "RONG-PB-RAY", "RONG-LOT-LONG", 0.14, { ray_type: "U75", sequence: 2, note: "RPBR = RLL + 140mm" }),
    a("RPBR-U100", "RONG-PB-RAY", "RONG-LOT-LONG", 0.20, { ray_type: "U100", sequence: 3, priority: 10, note: "RPBR U100 = RLL + 200mm" }),
    r("RCL", "RONG-CAT-LA", "RONG-PB-RAY", 0.03, { sequence: 4, note: "RPBR = RCL + 30mm" }),
    r("DT", "DIEN-TICH", "CAO-PB", 0, { sequence: 9, note: "Tính tiền = CPB x RPBR" }),
  ],
};
for (const ten of ["Cửa Đài Loan", "Cửa Lưới", "Cửa Siêu Trường"]) {
  QUY_TAC[ten] = [
    a("CPB", "CAO-PB", "CAO-LOT-LONG", 0.5, { sequence: 1, note: "CPB = CLL + 500mm" }),
    a("RCL-U75", "RONG-CAT-LA", "RONG-LOT-LONG", 0.11, { ray_type: "U75", sequence: 2, note: "RCL = RLL + 110mm" }),
    a("RCL-U100", "RONG-CAT-LA", "RONG-LOT-LONG", 0.17, { ray_type: "U100", sequence: 3, priority: 10, note: "RCL = RLL + 170mm" }),
    a("RCL-BUOM", "RONG-CAT-LA", "RONG-LOT-LONG", 0.105, { has_butterfly_bracket: true, sequence: 4, priority: 20, note: "Có bắn bướm: RCL = RPBR trừ 35mm thay vì 30mm" }),
    a("RPBR", "RONG-PB-RAY", "RONG-CAT-LA", 0.03, { sequence: 5, note: "RPBR = RCL + 30mm" }),
    r("DT", "DIEN-TICH", "CAO-PB", 0, { sequence: 9, note: "Tính tiền = CPB x RCL; mua cả bộ tính theo RPBR" }),
  ];
}

console.log("\n③ QUY TẮC HÌNH HỌC — phân nhánh theo loại ray");
for (const [ten, qt] of Object.entries(QUY_TAC)) {
  const g = await goi(`/api/resource/Cutting Policy/${encodeURIComponent(ten)}`);
  if (!g.ok) { console.log(`   ✗ ${ten} không đọc được`); continue; }
  if (!THAT) { console.log(`   → ${ten.padEnd(20)}${(g.json.data.geometry_rules ?? []).length} quy tắc ⇒ ${qt.length}`); continue; }
  const p = await goi(`/api/resource/Cutting Policy/${encodeURIComponent(ten)}`, { method: "PUT", body: { doc: { ...g.json.data, geometry_rules: qt } } });
  if (!p.ok) { console.log(`   ✗ ${ten.padEnd(20)}${(p.json?.message ?? "").slice(0, 90)}`); continue; }
  console.log(`   ✓ ${ten.padEnd(20)}${(p.json.data.geometry_rules ?? []).length} quy tắc`);
  for (const q of p.json.data.geometry_rules ?? []) {
    console.log(`        ${q.rule_code.padEnd(11)}${q.target_field.padEnd(15)}= ${q.source_field} ${q.operator === "ADD" ? "+" : "−"} ${q.operand_m}${q.ray_type ? `   [${q.ray_type}]` : ""}${q.has_butterfly_bracket ? "   [bắn bướm]" : ""}`);
  }
}
