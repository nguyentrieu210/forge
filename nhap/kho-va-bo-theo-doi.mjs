/**
 * 1. Sửa bộ theo dõi `Ống/trục` cho khớp việc vừa làm: ĐVT tồn đề xuất Kg → CÂY.
 *    Ô này chỉ là "đề xuất" nên không ép gì, nhưng để Kg trong khi 33 mã dùng nó đều tồn Cây
 *    thì người sau đọc bản ghi sẽ hiểu sai — master phải nói đúng thứ thực tế đang chạy.
 *
 * 2. Khai kho. Tầng cắt cần một kho chính và một KHO ĐẦU THỪA treo dưới nó: cắt xong, đoạn
 *    thừa vào kho đầu thừa, lần cắt sau hệ thống moi ra dùng trước rồi mới đụng cây nguyên.
 *    Không có kho thì không nhập được hàng, nên phải có ít nhất một cặp.
 *    Tên đặt trung tính, chủ xưởng đổi lại theo tên kho thật lúc nào cũng được.
 *
 * CHẠY:  node nhap/kho-va-bo-theo-doi.mjs [--that]
 */

const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");
let cookie = "", csrf = "";
async function goi(d, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${d}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const c = res.headers.get("set-cookie"); if (c?.startsWith("sid=")) cookie = c.split(";")[0];
  const n = res.headers.get("x-frappe-csrf-token"); if (n) csrf = n;
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: res.ok, status: res.status, json: j };
}
await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

// ── 1. bộ theo dõi Ống/trục ───────────────────────────────────────────────────────────────
const bt = await goi(`/api/resource/Measurement Profile/${encodeURIComponent("Ống/trục")}`);
if (bt.ok) {
  const d = bt.json.data;
  console.log(`bộ Ống/trục: ĐVT tồn đề xuất ${d.stock_uom} → Cây`);
  if (THAT) {
    const p = await goi(`/api/resource/Measurement Profile/${encodeURIComponent("Ống/trục")}`, {
      method: "PUT",
      body: { ...d, stock_uom: "Cây", note: "Tồn theo CÂY, mua và định giá theo Kg (cân thực tế). Chiều dài và số cây là đại lượng theo dõi giao nhận; kg thực cân là quan sát độc lập, không suy ra từ số cây." },
    });
    console.log(p.ok ? `   ✓ đã sửa · ${p.json.data.note}` : `   ✗ ${p.json?.message ?? p.status}`);
  }
} else console.log(`bộ Ống/trục: không đọc được (${bt.status})`);

// ── 2. kho ────────────────────────────────────────────────────────────────────────────────
const KHO = [
  { warehouse_name: "Kho xưởng", stock_role: "Kho chính", is_group: false },
  { warehouse_name: "Kho đầu thừa", stock_role: "Kho đầu thừa", is_group: false, parent_warehouse: "Kho xưởng" },
];
const ds = await goi("/api/resource/Warehouse?limit_page_length=2000&fields=" + encodeURIComponent('["name"]'));
const daCo = new Set((ds.json?.data ?? []).map((r) => r.name));
console.log(`\nkho hiện có: ${daCo.size || 0}`);
for (const k of KHO) {
  if (daCo.has(k.warehouse_name)) { console.log(`   = ${k.warehouse_name} đã có`); continue; }
  if (!THAT) { console.log(`   → tạo ${k.warehouse_name.padEnd(16)} vai trò ${k.stock_role}${k.parent_warehouse ? ` · dưới ${k.parent_warehouse}` : ""}`); continue; }
  const t = await goi("/api/resource/Warehouse", { method: "POST", body: { doctype: "Warehouse", ...k, disabled: false } });
  console.log(t.ok ? `   ✓ ${k.warehouse_name.padEnd(16)} ${k.stock_role}${k.parent_warehouse ? ` · dưới ${k.parent_warehouse}` : ""}` : `   ✗ ${k.warehouse_name} — ${t.json?.message ?? JSON.stringify(t.json).slice(0, 220)}`);
}
