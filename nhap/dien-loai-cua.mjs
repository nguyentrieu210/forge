/**
 * ĐIỀN `door_type` CHO 51 MÃ CỬA — đây là chỗ làm cả hệ thống không lập nổi đơn bán.
 *
 * `selectDoorPolicy` (alumdoor-worker/src/door-formulas.ts:271) tra Chính sách công thức bằng
 * `policy.door_type === doorType`. Cả 51 mã cửa đang để TRỐNG ô này, nên không mã nào tra được
 * chính sách, nên không dòng cửa nào tính được số lá, nên không đơn nào lập được.
 *
 * Thử thật ngày 21/08/2026: đặt một dòng CỬA ÚC KT 4D → "Chưa có Chính sách công thức cho
 * Cửa tấm liền Úc / Cửa tấm liền Úc". Chữ "Cửa tấm liền Úc" ấy là TÊN NHÓM HÀNG bị dùng thay
 * cho loại cửa, còn chính sách thì khai `door_type = "Cửa Úc"`. Hai chuỗi không bằng nhau.
 *
 * HAI HỌ CỬA TRONG MỘT NHÓM — và ô này giải được. Nhóm "Cửa tấm liền Úc" chứa 8 mã cửa Úc tôn
 * (chia 0,465, không phân nhánh ray) lẫn 2 mã AL70 kéo tay (chia 0,068, CÓ phân nhánh ray).
 * Một chính sách không phục vụ nổi cả hai. May là danh sách chọn của `door_type` có SẴN hai giá
 * trị riêng: "Cửa Úc" và "Cửa tấm liền Úc". Nên:
 *      8 mã cửa Úc tôn  →  door_type = "Cửa Úc"        (chính sách đang có)
 *      2 mã AL70 kéo tay →  door_type = "Cửa tấm liền Úc"  (chính sách CHƯA CÓ — xem dưới)
 * Hai mã AL70 vì thế sẽ báo "chưa có chính sách" thay vì âm thầm bị chia bằng 0,465 và lệch
 * khoảng 36 lá mỗi bộ. Báo lỗi to hơn cắt hỏng nhôm.
 *
 * CỬA ĐÀI LOAN INOX dùng chung công thức với Cửa Đài Loan (cùng lá bản 75, cùng cách chia
 * CPB × 13); danh sách chọn không có mục riêng cho inox. Đây là SUY RA, không phải tài liệu nói.
 *
 * CỬA KÉO ĐÀI LOAN để trống: danh mục ghi "Mua ngoài", không tự chia lá nên không cần công thức.
 *
 * CHẠY:  node nhap/dien-loai-cua.mjs [--that]
 */
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
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).slice(0, 140);
const boCoSo = (d) => { const { name, owner, creation, modified_by, docstatus, idx, status, doctype, _metadata_revision, ...t } = d; return t; };

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

/** Hai mã AL70 kéo tay tách riêng khỏi phần còn lại của nhóm, vì chúng chia lá kiểu khác. */
const AL70_KEO_TAY = new Set(["CDUC_DUC_KT_AL70", "CDUC_DUC_KT_AL70_2_LOP"]);
const THEO_NHOM = {
  "Cửa CN Đức": "Cửa Đức",
  "Cửa tấm liền Úc": "Cửa Úc",
  "Cửa Đài Loan": "Cửa Đài Loan",
  "Cửa Đài Loan Inox": "Cửa Đài Loan",
  "Cửa Lưới": "Cửa Lưới",
  "Cửa Siêu Trường": "Cửa Siêu Trường",
};

const it = (await goi(`/api/resource/Item?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["name", "item_name", "item_group", "door_type"]))}`)).json.data ?? [];
const cua = it.filter((x) => /^Cửa/.test(x.item_group));

const dem = {};
for (const x of cua) {
  const loai = AL70_KEO_TAY.has(x.name) ? "Cửa tấm liền Úc" : THEO_NHOM[x.item_group];
  x._loai = loai ?? null;
  const k = `${x.item_group} → ${loai ?? "(để trống)"}`;
  dem[k] = (dem[k] ?? 0) + 1;
}
console.log(`${cua.length} mã cửa:`);
for (const [k, v] of Object.entries(dem).sort()) console.log(`   ${String(v).padStart(3)}  ${k}`);

if (!THAT) { console.log("\nchưa ghi gì. Thêm --that để điền."); process.exit(0); }

let xong = 0, hong = 0, bo = 0;
for (const x of cua) {
  if (!x._loai) { bo++; continue; }
  if (x.door_type === x._loai) { bo++; continue; }
  const d = (await goi("/api/resource/Item/" + encodeURIComponent(x.name))).json.data;
  const r = await goi("/api/resource/Item/" + encodeURIComponent(x.name), { method: "PUT", body: { doc: { ...boCoSo(d), door_type: x._loai } } });
  if (r.ok) xong++; else { hong++; if (hong <= 3) console.log(`   ✗ ${x.name}: ${loi(r)}`); }
}
console.log(`\nđiền ${xong} · bỏ qua ${bo} · hỏng ${hong}`);
