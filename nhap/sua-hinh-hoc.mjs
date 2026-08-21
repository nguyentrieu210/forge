/**
 * SỬA PHẦN HÌNH HỌC theo sheet GHI CHÚ của `MS LIÊN BS.xlsx` — bảng tra mà thợ dùng để cắt.
 *
 * BA CHỖ TÔI DỰNG SAI LÚC ĐẦU:
 *
 * ① THIẾU ĐẦU VÀO THẬT. Tôi bắt đầu từ CPB (cao phủ bì), nhưng số khách đưa là LỌT LÒNG:
 *      CPB = CLL + 500mm       ·       RPBR = RLL + 150mm (ray U75) / + 200mm (ray U100)
 *    Thiếu CLL và RLL thì người nhập phải tự cộng trong đầu trước khi gõ — đúng thứ hệ thống
 *    sinh ra để khỏi phải làm.
 *
 * ② CÔNG THỨC CHIA LÁ SAI. Tôi dùng `(CPB : 0,465) + 2` lấy từ file QUY TRÌNH và gán cho cửa
 *    Đức. Sheet GHI CHÚ nói rõ công thức thật là:
 *      Số lá = (CPB − 130mm) / bản lá  − 1 lá
 *    Ước số là BẢN LÁ CỦA TỪNG MÃ (50–68mm), không phải một hằng số 0,465 dùng chung.
 *
 * ③ KHÔNG PHÂN NHÁNH THEO LOẠI RAY. Ray U75 và U100 cho hai bộ số khác nhau:
 *      U75 :  RPBR = RLL + 150mm   ·   RPBN = RPBR − 60mm
 *      U100:  RPBR = RLL + 200mm   ·   RPBN = RPBR − 70mm
 *    Dùng chung một luật là sai 10mm mỗi cửa dùng ray U100.
 *
 * CHẠY:  node nhap/sua-hinh-hoc.mjs [--that]
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

// ── ① hai trường đo còn thiếu ────────────────────────────────────────────────────────────
const THEM_TRUONG = [
  ["CAO-LOT-LONG", "Cao lọt lòng", "HEIGHT", "Mét", "Chiều cao lọt lòng — số khách đo. Cao phủ bì = số này cộng 0,5 m."],
  ["RONG-LOT-LONG", "Rộng lọt lòng", "WIDTH", "Mét", "Chiều rộng lọt lòng — số khách đo. Rộng phủ bì ray = cộng 0,15 m (ray U75) hoặc 0,2 m (ray U100)."],
];
console.log("① THÊM TRƯỜNG ĐO — đầu vào thật là kích thước LỌT LÒNG");
for (const [ma, ten, truc, dvt, note] of THEM_TRUONG) {
  if ((await goi(`/api/resource/Geometry Field/${encodeURIComponent(ma)}`)).ok) { console.log(`   = ${ma.padEnd(18)}đã có`); continue; }
  if (!THAT) { console.log(`   → ${ma.padEnd(18)}${ten}`); continue; }
  const t = await goi("/api/resource/Geometry Field", {
    method: "POST",
    body: { doctype: "Geometry Field", field_code: ma, field_name: ten, axis: truc, uom: dvt, note, disabled: false },
  });
  console.log(`   ${t.ok ? "✓" : "✗"} ${ma.padEnd(18)}${ten}${t.ok ? "" : "  " + (t.json?.message ?? "")}`);
}

// ── ② đưa hai trường mới vào 5 bộ quy cách, làm INPUT; CPB và RPBR thành TỰ TÍNH ──────────
console.log("\n② ĐƯA VÀO BỘ QUY CÁCH — lọt lòng là NHẬP, phủ bì thành TỰ TÍNH");
const BO = ["GP-CUA-DUC", "GP-CUA-UC", "GP-CUA-DAI-LOAN", "GP-CUA-LUOI", "GP-CUA-SIEU-TRUONG"];
for (const b of BO) {
  const g = await goi(`/api/resource/Geometry Profile/${encodeURIComponent(b)}`);
  if (!g.ok) { console.log(`   ✗ ${b} không đọc được`); continue; }
  const d = g.json.data;
  const cu = d.fields ?? [];
  const co = new Set(cu.map((f) => f.geometry_field));
  const moi = [
    { geometry_field: "CAO-LOT-LONG", role: "INPUT", required: true, visible: true, editable: true, sequence: 1 },
    { geometry_field: "RONG-LOT-LONG", role: "INPUT", required: true, visible: true, editable: true, sequence: 2 },
    /**
     * CPB và RPBR chuyển từ NHẬP sang TỰ TÍNH — chúng suy ra được từ lọt lòng, bắt gõ lại là
     * mời người dùng gõ lệch với công thức.
     */
    ...cu.filter((f) => !["CAO-LOT-LONG", "RONG-LOT-LONG"].includes(f.geometry_field)).map((f, i) => ({
      ...f,
      role: ["CAO-PB", "RONG-PB-RAY"].includes(f.geometry_field) ? "CALCULATED" : f.role,
      editable: ["CAO-PB", "RONG-PB-RAY"].includes(f.geometry_field) ? false : f.editable,
      sequence: i + 3,
    })),
  ];
  const themVao = moi.filter((f) => !co.has(f.geometry_field)).map((f) => f.geometry_field);
  const doiVai = cu.filter((f) => ["CAO-PB", "RONG-PB-RAY"].includes(f.geometry_field) && f.role !== "CALCULATED").map((f) => f.geometry_field);
  if (!THAT) { console.log(`   → ${b.padEnd(22)}thêm ${themVao.join(", ") || "—"}${doiVai.length ? ` · đổi sang tự tính: ${doiVai.join(", ")}` : ""}`); continue; }
  const p = await goi(`/api/resource/Geometry Profile/${encodeURIComponent(b)}`, { method: "PUT", body: { doc: { ...d, fields: moi } } });
  console.log(`   ${p.ok ? "✓" : "✗"} ${b.padEnd(22)}${p.ok ? `${(p.json.data.fields ?? []).length} trường` : (p.json?.message ?? "").slice(0, 70)}`);
}
console.log("\n(công thức chia lá và quy tắc theo loại ray sửa ở bước sau, sau khi bộ quy cách nhận hai trường mới)");
