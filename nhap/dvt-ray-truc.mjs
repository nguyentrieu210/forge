/**
 * ĐVT họ RAY & TRỤC — chủ xưởng chốt: MUA Kg · TỒN Kg · BÁN Mét, không trừ mã nào.
 *
 * Trước đó 33 mã chia hai phe: 15 mã tồn Kg bán Mét, 18 mã ngược lại tồn Mét bán Kg. Cùng một
 * cây thép mà hai mã đo hai kiểu thì mọi phép cộng tồn kho sau này đều sai mà không ai thấy.
 *
 * DÒNG QUY ĐỔI: đúng một dòng `Mét`, hệ số ĐỂ TRỐNG (0) theo luật đang áp — không đoán số.
 * Dòng `Kg` cũ bị bỏ: Kg giờ LÀ đơn vị tồn, khai quy đổi Kg→Kg là vô nghĩa.
 *
 * Con số lấp vào hệ số đó chính là `Kg/m lý thuyết` bên Quy cách kỹ thuật — khai một lần ở đó,
 * cả nhóm mã dùng chung quy cách đều có.
 *
 * CHẠY:  node nhap/dvt-ray-truc.mjs [--that]
 */

const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const THAT = process.argv.includes("--that");

let cookie = "", csrf = "";
async function goi(duong, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${duong}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dat = res.headers.get("set-cookie");
  if (dat?.startsWith("sid=")) cookie = dat.split(";")[0];
  const nonce = res.headers.get("x-frappe-csrf-token");
  if (nonce) csrf = nonce;
  const chu = await res.text();
  let json; try { json = JSON.parse(chu); } catch { json = { raw: chu }; }
  return { ok: res.ok, status: res.status, json };
}

const dn = await goi("/api/method/login", { method: "POST", body: { usr: process.env.FORGE_ADMIN_USER || "dev@example.com", pwd: process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1" } });
if (!dn.ok) throw new Error(`Đăng nhập hỏng: ${JSON.stringify(dn.json)}`);

/**
 * Danh sách mã đọc từ API list — nhưng phải nới `limit`, mặc định server cắt ở 20 và cắt IM LẶNG.
 * Đã dính đúng bẫy này một lần: quét tưởng chạy hết kho, thật ra chỉ chạm 100 mã đầu.
 */
const ds = await goi(`/api/resource/Item?filters=${encodeURIComponent(JSON.stringify([["item_group", "=", "Ray và trục"]]))}&limit_page_length=2000&fields=${encodeURIComponent('["name"]')}`);
if (!ds.ok) throw new Error(`Không lấy được danh sách: ${JSON.stringify(ds.json).slice(0, 300)}`);
const ma = (ds.json?.data ?? []).map((r) => r.name);
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · nhóm Ray và trục: ${ma.length} mã\n`);

let doi = 0, yen = 0, hong = 0;
for (const m of ma) {
  const g = await goi(`/api/resource/Item/${encodeURIComponent(m)}`);
  if (!g.ok) { console.log(`  ✗ ${m.padEnd(26)} không đọc được (${g.status})`); hong += 1; continue; }
  const d = g.json?.data ?? {};

  const cuTruoc = `tồn ${d.stock_uom} · mua ${d.default_purchase_uom} · bán ${d.default_sales_uom}`;
  const quyDoiCu = (d.uom_conversions ?? []);
  /** Giữ mọi dòng quy đổi khác chủ xưởng đã tự thêm; chỉ bỏ dòng Kg vì Kg thành ĐVT tồn. */
  const giuLai = quyDoiCu.filter((c) => c.uom !== "Kg" && c.uom !== "Mét");
  const quyDoiMoi = [
    ...giuLai,
    { ...(quyDoiCu.find((c) => c.uom === "Mét") ?? {}), uom: "Mét", conversion_factor: quyDoiCu.find((c) => c.uom === "Mét")?.conversion_factor ?? 0 },
  ];

  const canDoi = d.stock_uom !== "Kg" || d.default_purchase_uom !== "Kg" || d.default_sales_uom !== "Mét"
    || quyDoiCu.length !== quyDoiMoi.length || quyDoiCu.some((c) => c.uom === "Kg");
  if (!canDoi) { yen += 1; continue; }

  const moi = `tồn Kg · mua Kg · bán Mét · quy đổi ${quyDoiMoi.map((c) => `${c.uom}×${c.conversion_factor}`).join(", ")}`;
  if (!THAT) { console.log(`  → ${m.padEnd(26)} ${cuTruoc.padEnd(42)} ⇒ ${moi}`); doi += 1; continue; }

  const p = await goi(`/api/resource/Item/${encodeURIComponent(m)}`, {
    method: "PUT",
    body: { ...d, stock_uom: "Kg", default_purchase_uom: "Kg", default_sales_uom: "Mét", uom_conversions: quyDoiMoi },
  });
  if (!p.ok) { console.log(`  ✗ ${m.padEnd(26)} ${p.status} ${p.json?.message ?? JSON.stringify(p.json).slice(0, 220)}`); hong += 1; continue; }
  console.log(`  ✓ ${m.padEnd(26)} ${moi}`);
  doi += 1;
}
console.log(`\nđổi ${doi} · đã đúng sẵn ${yen} · hỏng ${hong}`);
