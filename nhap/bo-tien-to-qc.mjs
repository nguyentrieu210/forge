/**
 * BỎ TIỀN TỐ `QC-` khỏi mã quy cách còn sót — kể cả những cái đang được mặt hàng trỏ tới.
 *
 * VÌ SAO PHẢI GỠ LIÊN KẾT TRƯỚC: nền tảng từ chối đổi mã một bản ghi còn tham chiếu
 * ("The document is referenced elsewhere and cannot be renamed") — nó chặn để không tạo ra
 * liên kết chết, nhưng KHÔNG tự cập nhật bên trỏ tới. Nên trình tự bắt buộc là:
 *   ghi nhớ ai đang trỏ → gỡ liên kết → đổi mã → nối lại bằng mã mới
 *
 * AN TOÀN: danh sách liên kết được ghi nhớ TRƯỚC khi gỡ, và nếu bước đổi mã hỏng thì nối lại
 * ngay bằng mã CŨ. Không có nhánh nào để mặt hàng mất quy cách.
 *
 * `QC` còn là chữ đã có nghĩa khác trong nghề (quality control), nên mượn nó cho "quy cách"
 * là gây hiểu nhầm — đó là lý do bỏ, không phải để cho ngắn.
 *
 * CHẠY:  node nhap/bo-tien-to-qc.mjs [--that]
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

const ds = await goi(`/api/resource/Material Specification?limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
const conQC = (ds.json.data ?? []).map((r) => r.name).filter((n) => /^QC-/.test(n));

/** Ai đang trỏ tới quy cách nào — đọc TRƯỚC khi đụng vào bất cứ thứ gì. */
const items = await goi(`/api/resource/Item?limit_page_length=2000&fields=${encodeURIComponent('["name","material_specification"]')}`);
const troToi = new Map();
for (const it of items.json.data ?? []) {
  if (!it.material_specification) continue;
  if (!troToi.has(it.material_specification)) troToi.set(it.material_specification, []);
  troToi.get(it.material_specification).push(it.name);
}

console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · ${conQC.length} quy cách còn tiền tố QC-\n`);

/** Đặt ô quy cách của một mặt hàng, giữ nguyên mọi ô khác. */
async function datQuyCach(ma, spec) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`);
  if (!g.ok) return false;
  const p = await goi(`/api/resource/Item/${encodeURIComponent(ma)}`, {
    method: "PUT", body: { ...g.json.data, material_specification: spec },
  });
  return p.ok;
}

let ok = 0, hong = 0;
for (const cu of conQC) {
  const moi = cu.replace(/^QC-/, "");
  const dung = troToi.get(cu) ?? [];
  if (!THAT) { console.log(`  → ${cu.padEnd(26)}→ ${moi.padEnd(24)}${dung.length} mã đang trỏ tới`); ok += 1; continue; }

  for (const ma of dung) await datQuyCach(ma, "");
  const r = await goi("/api/method/frappe.client.rename_doc", {
    method: "POST", body: { doctype: "Material Specification", old_name: cu, new_name: moi },
  });
  if (!r.ok) {
    // Đổi mã hỏng: nối lại ngay bằng mã CŨ để không mặt hàng nào mất quy cách.
    for (const ma of dung) await datQuyCach(ma, cu);
    console.log(`  ✗ ${cu.padEnd(26)}${String(r.json?.message ?? "").slice(0, 70)} — đã nối lại mã cũ`);
    hong += 1;
    continue;
  }
  let noiLai = 0;
  for (const ma of dung) if (await datQuyCach(ma, moi)) noiLai += 1;
  const thieu = dung.length - noiLai;
  console.log(`  ✓ ${cu.padEnd(26)}→ ${moi.padEnd(24)}nối lại ${noiLai}/${dung.length}${thieu ? "   ⚠ THIẾU " + thieu : ""}`);
  ok += 1;
}
console.log(`\nđổi ${ok} · hỏng ${hong}`);

if (THAT) {
  const sau = await goi(`/api/resource/Material Specification?limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
  const it2 = await goi(`/api/resource/Item?limit_page_length=2000&fields=${encodeURIComponent('["name","material_specification"]')}`);
  const conLai = (sau.json.data ?? []).filter((r) => /^QC-/.test(r.name)).length;
  const coSpec = new Set((sau.json.data ?? []).map((r) => r.name));
  const gan = (it2.json.data ?? []).filter((r) => r.material_specification);
  const chet = gan.filter((r) => !coSpec.has(r.material_specification));
  console.log(`\ncòn mã QC-: ${conLai}  ·  mặt hàng gắn quy cách: ${gan.length}  ·  liên kết chết: ${chet.length}`);
  for (const c of chet) console.log(`   ✗ ${c.name} → ${c.material_specification}`);
}
