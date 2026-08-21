/**
 * ĐỔI TÊN BẢNG GIÁ và cho TÊN đơn giá bằng chính MÃ đơn giá.
 *
 * Chủ xưởng chốt 21/08/2026: bảng giá đặt là "Alumdoor 2026", và "tên đơn giá phải giống như mã
 * đơn giá, gồm cả bậc diện tích".
 *
 * KHÔNG dùng được `frappe.client.rename_doc` cho việc này. Đổi tên có cascade sẽ sửa ô
 * `price_list` trên 268 dòng, nhưng TÊN của chúng thì không — vì tên sinh theo
 * `format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}`, mà format chỉ chạy lúc
 * TẠO. Kết quả sẽ là 268 dòng mang ô "Alumdoor 2026" nhưng tên vẫn mở đầu "Alumdoor 2026:",
 * tức đúng cái sai mà chủ xưởng vừa bảo sửa. Nên phải dựng lại từng dòng.
 *
 * TÊN = MÃ làm bằng cách BỎ `title_field` khỏi doctype: `deriveColumns` (client) khi không có
 * title_field thì lấy thẳng `name`. Trước đây title_field trỏ `item_code` nên màn danh sách chỉ
 * hiện mã hàng, giấu mất biến thể và bậc diện tích — hai dòng khác giá của cùng một mã trông y hệt nhau.
 *
 * CHẠY:  node nhap/doi-ten-bang-gia.mjs
 */
const CU = "Alumdoor 2026";
const MOI = "Alumdoor 2026";
const G = "http://127.0.0.1:8799";
let ck = "", cs = "";

async function goi(d, o = {}) {
  const r = await fetch(G + d, { method: o.method || "GET", headers: { "content-type": "application/json", ...(ck ? { cookie: ck } : {}), ...(cs ? { "x-frappe-csrf-token": cs } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  const c = r.headers.get("set-cookie"); if (c && c.startsWith("sid=")) ck = c.split(";")[0];
  const n = r.headers.get("x-frappe-csrf-token"); if (n) cs = n;
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, status: r.status, json: j };
}
const loi = (r) => String(r.json?.exc ?? r.json?.message ?? r.json?._error_message ?? JSON.stringify(r.json)).slice(0, 150);

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });

// Bước bỏ title_field làm riêng ở nhap/ten-don-gia-bang-ma.mjs — nó phải ghi thẳng D1 lúc
// runtime TẮT, không đi chung đường API với phần dựng lại dòng giá bên dưới.

// ── 2. Bảng giá mới ─────────────────────────────────────────────────────────────────────
const cu = (await goi("/api/resource/Price List/" + encodeURIComponent(CU))).json.data;
if (!(await goi("/api/resource/Price List/" + encodeURIComponent(MOI))).ok) {
  const r = await goi("/api/resource/Price List", { method: "POST", body: {
    doc: { price_list_name: MOI, currency: cu?.currency ?? "VND", effective_date: cu?.effective_date ?? "2026-07-31",
      ...(cu?.customer_group ? { customer_group: cu.customer_group } : {}),
      note: `Bảng giá bán Alumdoor niên độ 2026. Đổi tên từ "${CU}" ngày 21/08/2026.` } } });
  console.log(r.ok ? `tạo bảng giá "${MOI}"` : "✗ bảng giá: " + loi(r));
} else console.log(`bảng giá "${MOI}": đã có`);

// ── 3. Dựng lại 268 dòng đơn giá dưới tên bảng giá mới ──────────────────────────────────
const O = ["name", "price_list", "item_code", "item_group", "uom", "area_tier", "price_variant", "rate", "currency", "note", "disabled"];
const cũ = ((await goi(`/api/resource/Item Price?limit_page_length=3000&fields=${encodeURIComponent(JSON.stringify(O))}`)).json.data ?? [])
  .filter((x) => x.price_list === CU);
console.log(`\n${cũ.length} dòng đơn giá cần dựng lại`);

let tao = 0, daCo = 0, hong = 0;
for (const d of cũ) {
  const { name, price_list, ...o } = d;
  const tenMoi = `${MOI}:${o.item_code}:${o.uom}:${o.price_variant}:${o.area_tier}`;
  const r = await goi("/api/resource/Item Price", { method: "POST", body: {
    doc: { ...o, price_list: MOI, rate: String(o.rate), disabled: Boolean(Number(o.disabled)) },
    // `title` là ô đánh chỉ mục tìm kiếm, tách khỏi payload — cho bằng mã để gõ mã ra đúng dòng.
    title: tenMoi, content: tenMoi } });
  if (r.ok) tao++;
  else if (/exists|tồn tại/i.test(loi(r))) daCo++;
  else { hong++; if (hong <= 5) console.log("  ✗ " + tenMoi + "\n     " + loi(r)); }
}
console.log(`tạo ${tao} · đã có ${daCo} · hỏng ${hong}`);

// Chỉ dọn bản cũ khi bản mới đã đủ — dở dang thì thà giữ cả hai còn hơn mất giá.
if (hong === 0) {
  let xoa = 0;
  for (const d of cũ) if ((await goi("/api/resource/Item Price/" + encodeURIComponent(d.name), { method: "DELETE" })).ok) xoa++;
  console.log(`xoá ${xoa} dòng mang tên cũ`);
  const r = await goi("/api/resource/Price List/" + encodeURIComponent(CU), { method: "DELETE" });
  console.log(r.ok ? `xoá bảng giá "${CU}"` : `giữ "${CU}": ` + loi(r));
} else console.log(`GIỮ NGUYÊN bản cũ vì còn ${hong} dòng hỏng — sửa xong chạy lại.`);
