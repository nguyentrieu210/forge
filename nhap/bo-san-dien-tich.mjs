/**
 * BỎ SÀN DIỆN TÍCH TỐI THIỂU khỏi 47 mã cửa.
 *
 * `min_area_sqm = 3` đang nằm trên CẢ 47 cửa và nó SAI. Bằng chứng không phải suy luận mà là
 * sổ bán hàng thật — sheet `chi tiết nhập hàng ngày` của `MS LIÊN BS.xlsx`:
 *
 *    dòng 428  LÁ ĐỨC AL70 (2 lớp)   0,1931 m² × 909.000 = 175.546 đ
 *    dòng 397  LÁ ĐL7.5 INOX 6D      0,4327 m² × 1.040.000 = 450.050 đ
 *    dòng 265  ĐỨC AL548N            0,7541 m² × 1.390.000 = 1.048.130 đ
 *
 * Mười một dòng có diện tích mỗi bộ dưới 3 m², và cả mười một đều thu ĐÚNG diện tích thực nhân
 * đơn giá, khớp đến từng đồng. Không dòng nào bị nâng lên 3 m². Xưởng KHÔNG có luật sàn.
 *
 * Nếu để nguyên, `door-formulas.ts:365` (`billable = Math.max(rawArea, minimum) * sets`) sẽ tính
 * dòng 428 thành 3 × 909.000 = 2.727.000 đ thay vì 175.546 đ — thu dư 15,5 lần.
 *
 * SỐ 3 TỪ ĐÂU RA: nó là cận dưới của BẬC GIÁ `DT-3-4M2` trong `07-bac-dien-tich.json`, mà thang
 * bậc ấy chỉ dùng cho cửa Đài Loan trọn bộ. Đó là ranh giới BẢNG GIÁ, không phải sàn TÍNH TIỀN,
 * và đã bị nhân bản ra cả 47 mã. Chính ghi chú của tệp bậc cũng viết "Nguồn KHÔNG có bậc dưới
 * 3 m² — chờ chủ xưởng chốt", tức người dựng đã biết mình đang đoán.
 *
 * CƠ CHẾ ĐƠN NHỎ THẬT nằm ở chỗ khác và đã khai bằng chính sách giá, không phải sàn diện tích:
 * cửa Đức/Lưới dưới 8m² phụ thu 300.000, cửa Úc trên 4 dưới 7m² phụ thu 300.000/bộ, cửa Úc dưới
 * 4m² bán trọn bộ theo Bộ.
 *
 * CHẠY:  node nhap/bo-san-dien-tich.mjs [--that]
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
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).slice(0, 130);

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

const NHOM_CUA = ["Cửa CN Đức", "Cửa tấm liền Úc", "Cửa Đài Loan", "Cửa Đài Loan Inox", "Cửa Lưới", "Cửa Siêu Trường", "Cửa kéo Đài Loan"];
const item = (await goi(`/api/resource/Item?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["name", "item_name", "item_group", "min_area_sqm"]))}`)).json.data ?? [];
// Kernel lưu Float thành CHUỖI, nên `=== 3` trượt. So bằng Number, đừng so bằng dấu ba bằng.
const dinh = item.filter((i) => NHOM_CUA.includes(i.item_group) && Number(i.min_area_sqm ?? 0) > 0);

console.log(`${item.filter((i) => NHOM_CUA.includes(i.item_group)).length} mã cửa · ${dinh.length} mã đang có sàn diện tích\n`);
const theoNhom = {};
for (const i of dinh) (theoNhom[i.item_group] ??= []).push(Number(i.min_area_sqm));
for (const [n, v] of Object.entries(theoNhom)) console.log(`   ${String(v.length).padStart(3)}  ${n.padEnd(22)}sàn = ${[...new Set(v)].join(" · ")} m²`);

if (!THAT) { console.log("\nchưa ghi gì. Thêm --that để bỏ sàn."); process.exit(0); }

let xong = 0, hong = 0;
for (const i of dinh) {
  const d = (await goi("/api/resource/Item/" + encodeURIComponent(i.name))).json.data;
  // `modified` PHẢI gửi lại: kernel dùng khoá lạc quan (`assertModifiedMatches`) và từ chối mọi
  // lệnh ghi không nói được nó đang sửa trên bản nào — bỏ đi là ăn "The document changed after
  // it was loaded" cho cả 47 mã.
  const { name, owner, creation, modified_by, docstatus, idx, status, doctype, _metadata_revision, ...than } = d;
  const r = await goi("/api/resource/Item/" + encodeURIComponent(i.name), { method: "PUT", body: { doc: { ...than, min_area_sqm: 0 } } });
  if (r.ok) xong++; else { hong++; if (hong <= 3) console.log(`   ✗ ${i.name}: ${loi(r)}`); }
}
console.log(`\nbỏ sàn: ${xong} mã · hỏng ${hong}`);

const lai = (await goi(`/api/resource/Item?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(["name", "item_group", "min_area_sqm"]))}`)).json.data ?? [];
const con = lai.filter((i) => NHOM_CUA.includes(i.item_group) && Number(i.min_area_sqm ?? 0) > 0);
console.log(con.length === 0 ? "kiểm lại: không mã cửa nào còn sàn diện tích" : `kiểm lại: CÒN ${con.length} mã: ${con.map((x) => x.name).join(", ")}`);
