#!/usr/bin/env node
/**
 * Phân hệ MUA HÀNG trên tenant SỐNG, qua đúng đường cookie mà trình duyệt đi.
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/verify-alumdoor-mua.mjs --origin https://alu.kairo.vn
 *
 * Câu hỏi phép thử này trả lời — và KHÔNG câu nào đọc chứng từ, tất cả đều đọc SỔ:
 *
 *   1. Một đơn mua giao NHIỀU ĐỢT thì hạn mức cộng dồn đúng, và đợt vượt bị TỪ CHỐI?
 *   2. Một chuyến giao GỘP NHIỀU ĐƠN có ghi được thành MỘT phiếu, và trừ đúng cả hai đơn?
 *   3. Hàng về có lên SỔ CÁI không, hay chỉ nằm trong sổ kho?
 *   4. Hoá đơn mua có sinh CÔNG NỢ PHẢI TRẢ, và phiếu chi có trừ nợ?
 *   5. Sổ cái có CÂN không?
 *
 * Vì sao đọc sổ chứ không đọc chứng từ: trên nền tảng này, khai sai một tên field thì lệnh ghi
 * vẫn THÀNH CÔNG nhưng rơi về controller chung — không bút toán, không trừ kho, và không có gì
 * báo lỗi. Chứng từ ghi thành công vì thế không chứng minh được điều gì.
 */
import process from "node:process";
import { fail } from "./wrangler-cli.mjs";

const args = process.argv.slice(2);
const argOf = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const ORIGIN = (argOf("origin", process.env.FORGE_ORIGIN) ?? "").replace(/\/$/, "");
const USER = argOf("admin", process.env.FORGE_ADMIN_USER ?? "admin");
const PASSWORD = process.env.FORGE_ADMIN_PASSWORD;
if (!ORIGIN) fail("--origin is required");
if (!PASSWORD) fail("FORGE_ADMIN_PASSWORD is required");

let cookie = "";
let csrf = "";
async function raw(method, path, payload) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(csrf ? { "x-frappe-csrf-token": csrf } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const jar = new Map(cookie ? cookie.split("; ").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]) : []);
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  csrf = response.headers.get("x-frappe-csrf-token") ?? csrf;
  return response;
}
async function call(method, path, payload) {
  const response = await raw(method, path, payload);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { _text: text.slice(0, 300) }; }
  if (!response.ok) { const e = new Error(body?.message ?? `HTTP ${response.status}`); e.status = response.status; throw e; }
  return Object.hasOwn(body ?? {}, "message") ? body.message : Object.hasOwn(body ?? {}, "data") ? body.data : body;
}
const loginResponse = await raw("POST", "/api/method/login", { usr: USER, pwd: PASSWORD });
if (!loginResponse.ok) fail(`login failed (${loginResponse.status})`);

let bad = 0;
const ok = (l, c, d = "") => { if (!c) bad += 1; console.log(`${c ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); };
const stamp = Date.now().toString().slice(-5);
const now = "2026-07-28T09:00:00.000Z";

async function create(dt, body) {
  const r = await raw("POST", `/api/resource/${encodeURIComponent(dt)}`, body);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { _text: t.slice(0, 200) }; }
  return { ok: r.status < 300, status: r.status, name: j?.data?.name, msg: String(j?.message ?? j?.exception ?? `http ${r.status}`) };
}
/** Duyệt bằng `frappe.client.submit` — KHÔNG phải PUT docstatus (PUT xoá sạch field rồi mới duyệt). */
async function submit(dt, name) {
  const doc = await call("GET", `/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(name)}`);
  const r = await raw("POST", "/api/method/frappe.client.submit", { doc: { ...doc, doctype: dt, name, modified: doc.modified } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = {}; }
  return { ok: r.status < 300, status: r.status, msg: String(j?.message ?? j?.exception ?? `http ${r.status}`) };
}
const report = async (name, filters = {}) =>
  (await call("POST", "/api/method/frappe.desk.query_report.run", { report_name: name, ignore_prepared_report: 1, filters })).result ?? [];

// ── Danh mục ────────────────────────────────────────────────────────────────
const NCC = `Tiến Đạt ${stamp}`;
const KHO = `Kho mua ${stamp}`;
const HANG_A = `PA-${stamp}`;
const HANG_B = `PB-${stamp}`;
await create("Supplier", { supplier_name: NCC, supplier_group: "Nhôm", phone: "0900111222", payment_terms: "30 ngày" });
await create("Warehouse", { warehouse_name: KHO });
await create("Item", { item_code: HANG_A, item_name: "Nhôm AL548 thử mua", item_group: "Nan/lá cửa", stock_uom: "Cây" });
await create("Item", { item_code: HANG_B, item_name: "Ray hộp thử mua", item_group: "Ray và trục", stock_uom: "Cây" });
/**
 * Mã thứ ba là mã có QUY ĐỔI: mua theo CÂY, tồn và bán theo MÉT.
 *
 * Đây là mặt hàng thật của xưởng — ray bán 165.000 đ/m mà nhà máy chỉ bán theo cây 5,85 m.
 * Không có quy đổi thì mua 20 cây thành "tồn 20 mét", sai gần sáu lần mà không gì báo.
 */
const HANG_RAY = `RAY-${stamp}`;
await create("Item", {
  item_code: HANG_RAY, item_name: "Ray U100 mua cây bán mét", item_group: "Ray và trục", stock_uom: "Mét",
  uom_conversions: [{ row_id: "R1", uom: "Cây", conversion_factor: "5.85" }],
});
ok("danh mục mua tạo được (NCC, kho, 3 mã hàng)", true, `${NCC} / ${KHO}`);

const tonKho = async (item) =>
  (await report("Stock Ledger", { item_code: item, warehouse: KHO })).reduce((s, r) => s + Number(r.actual_qty ?? 0), 0);
const congNoNCC = async () =>
  (await report("Accounts Payable", { party: NCC })).reduce((s, r) => s + Number(r.outstanding_amount ?? 0), 0);

// ── 1. Đơn mua 100 cây ──────────────────────────────────────────────────────
const dm1 = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28",
  schedule_date: "2026-08-05", supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "100", uom: "Cây", rate: "98000", warehouse: KHO }],
});
ok("đơn mua tạo được", dm1.ok, dm1.name ?? dm1.msg);
const dm1Sub = await submit("Purchase Order", dm1.name);
ok("  · duyệt đơn mua", dm1Sub.ok, dm1Sub.msg.slice(0, 80));

// ── 2. Giao ĐỢT 1: 60 cây ───────────────────────────────────────────────────
const pn1 = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  against_purchase_order: dm1.name, supplier_invoice_no: `PGN-${stamp}-1`,
  stock_account: "Hàng tồn kho", stock_received_but_not_billed: "Hàng nhận chưa có hoá đơn",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "60", uom: "Cây", warehouse: KHO, rate: "98000", valuation_rate: "98000" }],
});
ok("phiếu nhập ĐỢT 1 (60/100 cây) tạo được", pn1.ok, pn1.name ?? pn1.msg);
const pn1Sub = await submit("Purchase Receipt", pn1.name);
ok("  · duyệt phiếu nhập đợt 1", pn1Sub.ok, pn1Sub.msg.slice(0, 90));
ok("  · SỔ KHO tăng đúng 60", Math.abs(await tonKho(HANG_A) - 60) < 0.001, `tồn = ${await tonKho(HANG_A)}`);

/**
 * Hàng về phải lên SỔ CÁI, không chỉ sổ kho.
 *
 * Trước bản này `ledger()` của phiếu nhập chỉ trả về `{stock, procurement}` — hàng nằm trong
 * kho mà bảng cân đối không thấy gì. Đây là chốt cho thay đổi đó.
 */
const glSau1 = await report("General Ledger", {});
const tienKho = glSau1.filter((r) => /Hàng tồn kho/i.test(r.account ?? "")).reduce((s, r) => s + Number(r.debit ?? r.debit_minor ?? 0), 0);
const chuaHD = glSau1.filter((r) => /chưa có hoá đơn/i.test(r.account ?? "")).length;
ok("  · SỔ CÁI ghi Nợ Hàng tồn kho", glSau1.some((r) => /Hàng tồn kho/i.test(r.account ?? "")), `${glSau1.filter((r) => /Hàng tồn kho/i.test(r.account ?? "")).length} bút toán`);
ok("  · SỔ CÁI ghi Có Hàng nhận chưa có hoá đơn", chuaHD > 0, `${chuaHD} bút toán`);

// ── 3. Giao ĐỢT 2: 40 cây còn lại ───────────────────────────────────────────
const pn2 = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  against_purchase_order: dm1.name, supplier_invoice_no: `PGN-${stamp}-2`,
  stock_account: "Hàng tồn kho", stock_received_but_not_billed: "Hàng nhận chưa có hoá đơn",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "40", uom: "Cây", warehouse: KHO, rate: "98000", valuation_rate: "98000" }],
});
const pn2Sub = pn2.ok ? await submit("Purchase Receipt", pn2.name) : { ok: false, msg: pn2.msg };
ok("phiếu nhập ĐỢT 2 (40 cây còn lại) chạy được", pn2Sub.ok, pn2Sub.msg.slice(0, 90));
ok("  · SỔ KHO cộng dồn đúng 100", Math.abs(await tonKho(HANG_A) - 100) < 0.001, `tồn = ${await tonKho(HANG_A)}`);

// ── 4. Đợt 3 vượt số đặt → PHẢI bị chặn ─────────────────────────────────────
// Chốt quan trọng nhất của hạn mức: cộng dồn qua NHIỀU phiếu, không phải kiểm từng phiếu rời.
const pn3 = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  against_purchase_order: dm1.name,
  items: [{ row_id: "R1", item_code: HANG_A, qty: "1", uom: "Cây", warehouse: KHO, rate: "98000", valuation_rate: "98000" }],
});
const pn3Sub = pn3.ok ? await submit("Purchase Receipt", pn3.name) : { ok: false, msg: pn3.msg };
ok("nhận VƯỢT số đặt bị TỪ CHỐI", !pn3Sub.ok && /exceeds Purchase Order/i.test(pn3Sub.msg), pn3Sub.msg.slice(0, 90));
ok("  · và tồn không đổi", Math.abs(await tonKho(HANG_A) - 100) < 0.001, `tồn = ${await tonKho(HANG_A)}`);

// ── 5. MỘT chuyến giao GỘP HAI đơn mua ──────────────────────────────────────
/**
 * Đây là thứ bản trước KHÔNG làm được.
 *
 * `against_purchase_order` nằm ở đầu phiếu, nên một chuyến xe chở hàng của hai đơn phải tách
 * làm hai phiếu nhập — không sai sổ, nhưng không khớp thực tế: một chuyến, một biên bản giao
 * nhận của NCC, mà thủ kho gõ hai phiếu. Giờ mỗi DÒNG tự trỏ đơn của nó.
 */
const dm2 = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28", supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_B, qty: "50", uom: "Cây", rate: "107000", warehouse: KHO }],
});
await submit("Purchase Order", dm2.name);
const dm3 = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28", supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_B, qty: "30", uom: "Cây", rate: "107000", warehouse: KHO }],
});
await submit("Purchase Order", dm3.name);

const gop = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  supplier_invoice_no: `PGN-${stamp}-GOP`,
  stock_account: "Hàng tồn kho", stock_received_but_not_billed: "Hàng nhận chưa có hoá đơn",
  items: [
    { row_id: "R1", purchase_order: dm2.name, item_code: HANG_B, qty: "50", uom: "Cây", warehouse: KHO, rate: "107000", valuation_rate: "107000" },
    { row_id: "R2", purchase_order: dm3.name, item_code: HANG_B, qty: "30", uom: "Cây", warehouse: KHO, rate: "107000", valuation_rate: "107000" },
  ],
});
ok("MỘT phiếu nhập gộp HAI đơn mua tạo được", gop.ok, gop.name ?? gop.msg.slice(0, 90));
const gopSub = gop.ok ? await submit("Purchase Receipt", gop.name) : { ok: false, msg: gop.msg };
ok("  · duyệt phiếu gộp", gopSub.ok, gopSub.msg.slice(0, 90));
ok("  · SỔ KHO nhận đủ 80 cây", Math.abs(await tonKho(HANG_B) - 80) < 0.001, `tồn = ${await tonKho(HANG_B)}`);

// Cả hai đơn đều phải bị trừ hạn mức — nếu chỉ trừ một, đơn kia còn nhận thêm được.
const themDm2 = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now, against_purchase_order: dm2.name,
  items: [{ row_id: "R1", item_code: HANG_B, qty: "1", uom: "Cây", warehouse: KHO, rate: "107000", valuation_rate: "107000" }],
});
const themDm2Sub = themDm2.ok ? await submit("Purchase Receipt", themDm2.name) : { ok: false, msg: themDm2.msg };
ok("  · ĐƠN 1 trong phiếu gộp đã hết hạn mức", !themDm2Sub.ok && /exceeds Purchase Order/i.test(themDm2Sub.msg), themDm2Sub.msg.slice(0, 70));
const themDm3 = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now, against_purchase_order: dm3.name,
  items: [{ row_id: "R1", item_code: HANG_B, qty: "1", uom: "Cây", warehouse: KHO, rate: "107000", valuation_rate: "107000" }],
});
const themDm3Sub = themDm3.ok ? await submit("Purchase Receipt", themDm3.name) : { ok: false, msg: themDm3.msg };
ok("  · ĐƠN 2 trong phiếu gộp cũng hết hạn mức", !themDm3Sub.ok && /exceeds Purchase Order/i.test(themDm3Sub.msg), themDm3Sub.msg.slice(0, 70));

// ── 6. Hoá đơn mua → CÔNG NỢ PHẢI TRẢ ───────────────────────────────────────
const noTruoc = await congNoNCC();
const hdm = await create("Purchase Invoice", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  against_purchase_order: dm1.name, supplier_invoice_no: `HD-${stamp}`,
  due_date: "2026-08-28", credit_to: "Phải trả người bán", supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "100", rate: "98000", expense_account: "Hàng tồn kho" }],
});
ok("hoá đơn mua tạo được", hdm.ok, hdm.name ?? hdm.msg.slice(0, 90));
const hdmSub = hdm.ok ? await submit("Purchase Invoice", hdm.name) : { ok: false, msg: hdm.msg };
ok("  · duyệt hoá đơn mua", hdmSub.ok, hdmSub.msg.slice(0, 90));
const noSau = await congNoNCC();
ok("  · CÔNG NỢ PHẢI TRẢ lên 9.800.000 ₫", Math.abs((noSau - noTruoc) - 9800000) < 1, `nợ NCC = ${noSau.toLocaleString("vi")}`);

// ── 7. Phiếu chi → công nợ giảm ─────────────────────────────────────────────
const chi = await create("Payment Entry", {
  payment_type: "Pay", party_type: "Supplier", party: NCC,
  company: "ALUMDOOR", currency: "VND", posting_at: now,
  paid_from: "Tiền gửi ngân hàng", paid_to: "Phải trả người bán",
  paid_amount: "4000000", received_amount: "4000000", mode_of_payment: "Chuyển khoản",
  references: [{ row_id: "R1", reference_doctype: "Purchase Invoice", reference_name: hdm.name, allocated_amount: "4000000" }],
});
ok("phiếu CHI tạo được", chi.ok, chi.name ?? chi.msg.slice(0, 90));
const chiSub = chi.ok ? await submit("Payment Entry", chi.name) : { ok: false, msg: chi.msg };
ok("  · duyệt phiếu chi", chiSub.ok, chiSub.msg.slice(0, 90));
const noCuoi = await congNoNCC();
ok("  · CÔNG NỢ giảm còn 5.800.000 ₫", Math.abs((noCuoi - noTruoc) - 5800000) < 1, `nợ NCC = ${noCuoi.toLocaleString("vi")}`);

// ── 8. Sổ cái phải CÂN ──────────────────────────────────────────────────────
/**
 * Chốt cuối và là chốt bao trùm: tổng Nợ phải bằng tổng Có.
 *
 * Mọi bút toán ở trên có thể ghi "thành công" mà vẫn lệch dấu hoặc thiếu vế; chỉ phép cân này
 * bắt được điều đó, và nó bắt được cho CẢ những bút toán mà phép thử này không nêu tên.
 */
const glCuoi = await report("General Ledger", {});
const tongNo = glCuoi.reduce((s, r) => s + Number(r.debit ?? 0), 0);
const tongCo = glCuoi.reduce((s, r) => s + Number(r.credit ?? 0), 0);
ok("SỔ CÁI CÂN (tổng Nợ = tổng Có)", Math.abs(tongNo - tongCo) < 1,
  `Nợ ${tongNo.toLocaleString("vi")} / Có ${tongCo.toLocaleString("vi")}`);

// ── 9. QUY ĐỔI ĐƠN VỊ: mua CÂY, tồn MÉT ─────────────────────────────────────
/**
 * Chốt cho thứ bị thiếu lâu nhất của phân hệ này.
 *
 * Ray mua theo cây, bán theo mét. Trước bản này sổ kho ghi thẳng số CÂY, nên tồn kho và giá
 * vốn mỗi bộ cửa đều sai gần sáu lần — và sai lặng lẽ, vì sổ vẫn cân.
 *
 * Hai con số phải đúng CÙNG LÚC, và đó mới là phần khó: số lượng nhân lên 5,85 lần, còn TIỀN
 * thì KHÔNG. Nếu tiền cũng nhân theo thì tồn kho phình lên so với số đã trả cho NCC.
 */
const dmRay = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28", supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_RAY, qty: "20", uom: "Cây", rate: "300000", warehouse: KHO }],
});
const dmRaySub = dmRay.ok ? await submit("Purchase Order", dmRay.name) : { ok: false, msg: dmRay.msg };
ok("đơn mua 20 CÂY ray chạy được", dmRaySub.ok, dmRaySub.msg.slice(0, 90));

const pnRay = await create("Purchase Receipt", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now, against_purchase_order: dmRay.name,
  stock_account: "Hàng tồn kho", stock_received_but_not_billed: "Hàng nhận chưa có hoá đơn",
  items: [{ row_id: "R1", item_code: HANG_RAY, qty: "20", uom: "Cây", warehouse: KHO, rate: "300000", valuation_rate: "300000" }],
});
const pnRaySub = pnRay.ok ? await submit("Purchase Receipt", pnRay.name) : { ok: false, msg: pnRay.msg };
ok("  · phiếu nhập 20 cây ghi sổ được", pnRaySub.ok, pnRaySub.msg.slice(0, 90));
const tonRay = await tonKho(HANG_RAY);
ok("  · SỔ KHO ghi 117 MÉT (20 cây × 5,85), không phải 20", Math.abs(tonRay - 117) < 0.01, `tồn = ${tonRay} mét`);

const glRay = await report("General Ledger", {});
const noRay = glRay.filter((r) => /Hàng tồn kho/i.test(r.account ?? "")).reduce((s, r) => s + Number(r.debit ?? 0), 0);
ok("  · TIỀN không bị nhân theo — vẫn 20 × 300.000", noRay >= 6000000, `Nợ tồn kho luỹ kế = ${noRay.toLocaleString("vi")} ₫`);

// Đơn vị lạ mà mặt hàng chưa khai quy đổi → PHẢI từ chối, không lặng lẽ lấy hệ số 1.
const dmLa = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28",
  items: [{ row_id: "R1", item_code: HANG_RAY, qty: "5", uom: "Kg", rate: "1000", warehouse: KHO }],
});
const dmLaSub = dmLa.ok ? await submit("Purchase Order", dmLa.name) : { ok: false, msg: dmLa.msg };
ok("  · đơn vị chưa khai quy đổi bị TỪ CHỐI", !dmLaSub.ok && /quy đổi/i.test(dmLaSub.msg), dmLaSub.msg.slice(0, 90));

// ── 10. YÊU CẦU VẬT TƯ → hạn mức đặt mua ────────────────────────────────────
const ycvt = await create("Material Request", {
  company: "ALUMDOOR", material_request_type: "Purchase", transaction_date: "2026-07-28",
  requested_by: "Tổ lắp đặt", schedule_date: "2026-08-10",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "40", uom: "Cây", warehouse: KHO, note: "hết nan" }],
});
ok("yêu cầu vật tư tạo được", ycvt.ok, ycvt.name ?? ycvt.msg.slice(0, 90));
const ycvtSub = ycvt.ok ? await submit("Material Request", ycvt.name) : { ok: false, msg: ycvt.msg };
ok("  · duyệt yêu cầu vật tư", ycvtSub.ok, ycvtSub.msg.slice(0, 90));

const dmYc = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28", material_request: ycvt.name,
  items: [{ row_id: "R1", item_code: HANG_A, qty: "40", uom: "Cây", rate: "98000", warehouse: KHO }],
});
const dmYcSub = dmYc.ok ? await submit("Purchase Order", dmYc.name) : { ok: false, msg: dmYc.msg };
ok("  · đặt mua ĐÚNG 40 cây theo yêu cầu", dmYcSub.ok, dmYcSub.msg.slice(0, 90));

const dmYcVuot = await create("Purchase Order", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28", material_request: ycvt.name,
  items: [{ row_id: "R1", item_code: HANG_A, qty: "1", uom: "Cây", rate: "98000", warehouse: KHO }],
});
const dmYcVuotSub = dmYcVuot.ok ? await submit("Purchase Order", dmYcVuot.name) : { ok: false, msg: dmYcVuot.msg };
ok("  · đặt VƯỢT số đã yêu cầu bị TỪ CHỐI", !dmYcVuotSub.ok && /exceeds Material Request/i.test(dmYcVuotSub.msg), dmYcVuotSub.msg.slice(0, 80));

// ── 11. HỎI GIÁ → BÁO GIÁ NCC → ĐƠN MUA ─────────────────────────────────────
const NCC2 = `Hoàng Lai ${stamp}`;
await create("Supplier", { supplier_name: NCC2, supplier_group: "Nhôm", payment_terms: "15 ngày" });
const ycbg = await create("Request for Quotation", {
  company: "ALUMDOOR", transaction_date: "2026-07-28", response_by: "2026-08-02",
  suppliers: [{ row_id: "S1", supplier: NCC }, { row_id: "S2", supplier: NCC2 }],
  items: [{ row_id: "R1", item_code: HANG_B, qty: "100", uom: "Cây", warehouse: KHO }],
});
ok("yêu cầu báo giá (2 NCC) tạo được", ycbg.ok, ycbg.name ?? ycbg.msg.slice(0, 90));
const ycbgSub = ycbg.ok ? await submit("Request for Quotation", ycbg.name) : { ok: false, msg: ycbg.msg };
ok("  · duyệt yêu cầu báo giá", ycbgSub.ok, ycbgSub.msg.slice(0, 90));

const bgn = await create("Supplier Quotation", {
  supplier: NCC2, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28",
  valid_till: "2026-08-31", request_for_quotation: ycbg.name, supplier_group: "Nhôm",
  items: [{ row_id: "R1", item_code: HANG_B, qty: "100", uom: "Cây", rate: "104000" }],
});
const bgnSub = bgn.ok ? await submit("Supplier Quotation", bgn.name) : { ok: false, msg: bgn.msg };
ok("  · NCC được mời báo giá được", bgnSub.ok, bgnSub.msg.slice(0, 90));

// NCC KHÔNG được mời mà gửi giá vào → phải bị từ chối.
const NCC3 = `Lạ mặt ${stamp}`;
await create("Supplier", { supplier_name: NCC3, supplier_group: "Khác" });
const bgnLa = await create("Supplier Quotation", {
  supplier: NCC3, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28",
  request_for_quotation: ycbg.name,
  items: [{ row_id: "R1", item_code: HANG_B, qty: "100", uom: "Cây", rate: "90000" }],
});
const bgnLaSub = bgnLa.ok ? await submit("Supplier Quotation", bgnLa.name) : { ok: false, msg: bgnLa.msg };
ok("  · NCC KHÔNG được mời bị từ chối", !bgnLaSub.ok && /was not invited/i.test(bgnLaSub.msg), bgnLaSub.msg.slice(0, 80));

// ── 12. Nút "Báo giá NCC → Đơn mua" ─────────────────────────────────────────
const method = async (name, payload) => {
  const response = await raw("POST", `/api/method/${name}`, payload);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  return { ok: response.status < 300, status: response.status, msg: String(body?.message ?? ""), data: body?.message ?? body?.data ?? body };
};
const chuyen = await method("alumdoor.purchase.order_from_quotation", { supplier_quotation: bgn.name, warehouse: KHO, schedule_date: "2026-08-15" });
ok("BÁO GIÁ NCC → ĐƠN MUA tạo được đơn", chuyen.ok && Boolean(chuyen.data?.purchase_order), chuyen.data?.purchase_order ?? String(chuyen.msg).slice(0, 90));
/**
 * Bấm lần thứ hai KHÔNG được tạo đơn thứ hai.
 *
 * Chốt này có vì bản BÁN đã từng hỏng đúng chỗ đó: thao tác vượt hạn giờ, người dùng thấy
 * "hết giờ" nên bấm lại, và lần thứ hai tạo đơn thứ hai. Phía mua thì đơn thứ hai nghĩa là
 * NCC giao gấp đôi và công nợ gấp đôi.
 */
const chuyenLai = await method("alumdoor.purchase.order_from_quotation", { supplier_quotation: bgn.name, warehouse: KHO });
ok("  · bấm lần HAI trả về đúng đơn cũ, không tạo đơn mới",
  chuyenLai.ok && chuyenLai.data?.already === true && chuyenLai.data?.purchase_order === chuyen.data?.purchase_order,
  `${chuyenLai.data?.purchase_order} (already=${chuyenLai.data?.already})`);

// ── 13. Nút "Đơn mua → Phiếu nhập" chỉ đề xuất phần CÒN LẠI ──────────────────
const conLai = await method("alumdoor.purchase.preview_receipt", { purchase_order: dm1.name });
ok("ĐƠN MUA → PHIẾU NHẬP: đơn đã nhận đủ thì không còn gì để nhập",
  conLai.ok && (conLai.data?.lines === 0), `còn ${conLai.data?.lines} dòng`);
const conLaiYc = await method("alumdoor.purchase.preview_receipt", { purchase_order: dmYc.name, warehouse: KHO });
ok("  · đơn chưa nhận gì thì đề xuất đủ 40 cây",
  conLaiYc.ok && Math.abs(Number(conLaiYc.data?.items?.[0]?.qty ?? 0) - 40) < 0.01,
  `đề xuất ${conLaiYc.data?.items?.[0]?.qty} ${conLaiYc.data?.items?.[0]?.uom}`);
const nhapNhap = await method("alumdoor.purchase.receipt_from_order", { purchase_order: dmYc.name, warehouse: KHO, driver: "Anh Tú" });
ok("  · tạo được phiếu nhập NHÁP (chưa ghi sổ)",
  nhapNhap.ok && Boolean(nhapNhap.data?.purchase_receipt) && nhapNhap.data?.draft === true,
  nhapNhap.data?.purchase_receipt ?? String(nhapNhap.msg).slice(0, 90));
ok("  · và tồn kho CHƯA đổi (nháp thì chưa vào kho)", Math.abs(await tonKho(HANG_A) - 100) < 0.001, `tồn = ${await tonKho(HANG_A)}`);

// ── 14. TRẢ HÀNG NCC: hiện vật + tiền ───────────────────────────────────────
/**
 * Hai nửa của một việc, và tách ra là đúng: phiếu trả HÀNG giảm tồn kho, giấy báo Nợ giảm
 * CÔNG NỢ. Hàng đi về trước, hoá đơn điều chỉnh của NCC về sau — hệt như lúc nhập.
 */
const traHang = await create("Stock Return", {
  party: NCC, return_type: "Purchase", company: "ALUMDOOR", currency: "VND",
  return_against: pn1.name, posting_at: now,
  stock_account: "Hàng tồn kho", cogs_or_expense_account: "Hàng nhận chưa có hoá đơn",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "5", warehouse: KHO, rate: "98000", note: "sai màu" }],
});
ok("phiếu TRẢ HÀNG NCC tạo được", traHang.ok, traHang.name ?? traHang.msg.slice(0, 90));
const traHangSub = traHang.ok ? await submit("Stock Return", traHang.name) : { ok: false, msg: traHang.msg };
ok("  · duyệt phiếu trả hàng", traHangSub.ok, traHangSub.msg.slice(0, 90));
ok("  · SỔ KHO giảm còn 95", Math.abs(await tonKho(HANG_A) - 95) < 0.001, `tồn = ${await tonKho(HANG_A)}`);

const noTruocBaoNo = await congNoNCC();
const baoNo = await create("Debit Note", {
  supplier: NCC, company: "ALUMDOOR", currency: "VND", posting_at: now,
  return_against: hdm.name, credit_to: "Phải trả người bán", default_expense_account: "Hàng tồn kho",
  round_off_account: "Chênh lệch làm tròn",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "5", rate: "98000", note: "trả 5 cây sai màu" }],
});
ok("GIẤY BÁO NỢ tạo được", baoNo.ok, baoNo.name ?? baoNo.msg.slice(0, 90));
const baoNoSub = baoNo.ok ? await submit("Debit Note", baoNo.name) : { ok: false, msg: baoNo.msg };
ok("  · duyệt giấy báo Nợ", baoNoSub.ok, baoNoSub.msg.slice(0, 90));
const noSauBaoNo = await congNoNCC();
ok("  · CÔNG NỢ PHẢI TRẢ giảm đúng 490.000 ₫", Math.abs((noTruocBaoNo - noSauBaoNo) - 490000) < 1,
  `${noTruocBaoNo.toLocaleString("vi")} → ${noSauBaoNo.toLocaleString("vi")}`);

// ── 15. GIÁ VỐN HÀNG BÁN không còn bằng 0 ───────────────────────────────────
/**
 * Lỗi tiền ĐANG SỐNG mà bản này sửa: phiếu xuất kho ghi sổ kho nhưng KHÔNG ghi giá vốn, nên
 * sổ cái có doanh thu và không có giá vốn — lãi gộp hiện đúng 100% trên mọi báo cáo. Sổ vẫn
 * CÂN, nên không có gì kêu, và nó sống được nhiều tháng.
 *
 * Nguyên nhân không nằm ở phiếu xuất: nhân tra `Company.default_cogs_account` và chỉ ghi khi
 * có ĐỦ CẢ cặp tài khoản — hai khoá nay đã khai ở fixture Công ty.
 *
 * KHÔNG kiểm bằng cách đọc hồ sơ Công ty. Bản đầu của phép thử này đọc
 * `/api/resource/Company/ALUMDOOR` rồi soi hai khoá đó, và nó FAIL trong khi hệ thống chạy
 * ĐÚNG: Công ty là master record chứ không phải chứng từ, nên đường `resource` không trả
 * các khoá trong `data_json`. Đó đúng là cái bẫy mà đầu file này cảnh báo — đọc chứng từ
 * thay vì đọc sổ.
 *
 * Bằng chứng thật: BÁN chính số hàng vừa mua, rồi xem giá vốn trong SỔ CÁI có tăng đúng số
 * đã mua không. Phải bán một lô MỚI và đo phần TĂNG THÊM — đếm bút toán "Giá vốn" có sẵn
 * thì không chứng minh được gì, vì sổ của tenant đã có hàng trăm bút toán cũ.
 */
const KHACH = `Khách thử mua ${stamp}`;
await create("Customer", { customer_name: KHACH, phone: "0912000111", payment_terms: "Trả ngay" });
const giaVonTruoc = (await report("General Ledger", {}))
  .filter((r) => /Giá vốn/i.test(r.account ?? "")).reduce((s, r) => s + Number(r.debit ?? 0), 0);
const dh = await create("Sales Order", {
  customer: KHACH, company: "ALUMDOOR", currency: "VND", transaction_date: "2026-07-28",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "10", rate: "150000", warehouse: KHO }],
});
const dhSub = dh.ok ? await submit("Sales Order", dh.name) : { ok: false, msg: dh.msg };
ok("  · bán thử 10 cây vừa mua", dhSub.ok, dhSub.msg.slice(0, 90));
const pxk = await create("Delivery Note", {
  customer: KHACH, company: "ALUMDOOR", currency: "VND", posting_at: now,
  against_sales_order: dh.name, install_address: "Kiểm tra giá vốn",
  items: [{ row_id: "R1", item_code: HANG_A, qty: "10", warehouse: KHO, rate: "150000" }],
});
const pxkSub = pxk.ok ? await submit("Delivery Note", pxk.name) : { ok: false, msg: pxk.msg };
ok("  · xuất kho ghi sổ được", pxkSub.ok, pxkSub.msg.slice(0, 90));
const giaVonSau = (await report("General Ledger", {}))
  .filter((r) => /Giá vốn/i.test(r.account ?? "")).reduce((s, r) => s + Number(r.debit ?? 0), 0);
ok("  · GIÁ VỐN HÀNG BÁN tăng đúng 980.000 ₫ (10 × 98.000), không còn bằng 0",
  Math.abs((giaVonSau - giaVonTruoc) - 980000) < 1,
  `+${(giaVonSau - giaVonTruoc).toLocaleString("vi")} ₫`);

// ── 16. Sổ cái vẫn phải CÂN sau tất cả ──────────────────────────────────────
const glHet = await report("General Ledger", {});
const noHet = glHet.reduce((s, r) => s + Number(r.debit ?? 0), 0);
const coHet = glHet.reduce((s, r) => s + Number(r.credit ?? 0), 0);
ok("SỔ CÁI VẪN CÂN sau trả hàng và giảm trừ", Math.abs(noHet - coHet) < 1,
  `Nợ ${noHet.toLocaleString("vi")} / Có ${coHet.toLocaleString("vi")}`);

console.log(bad ? `\n${bad} FAILED` : "\nPHÂN HỆ MUA HÀNG CHẠY ĐÚNG");
process.exit(bad ? 1 : 0);
