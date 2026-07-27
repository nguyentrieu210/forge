#!/usr/bin/env node
/**
 * Xương sống Alumdoor trên tenant SỐNG, qua đúng đường cookie mà trình duyệt đi.
 *
 *   FORGE_ADMIN_PASSWORD=… node scripts/verify-alumdoor.mjs --origin https://alu.kairo.vn
 *
 * Câu hỏi duy nhất phép thử này trả lời: metadata do APP KHAI có thật sự đánh thức nhân
 * kho/kế toán của nền tảng không. Nếu tên DocType hay tên field sai một chữ, lệnh ghi vẫn
 * THÀNH CÔNG nhưng rơi về controller chung — không bút toán, kho không trừ, công nợ không
 * lên, và KHÔNG CÓ GÌ BÁO LỖI. Nên mọi khẳng định dưới đây đọc SỔ (Stock Ledger, Accounts
 * Receivable), không đọc chứng từ: chứng từ ghi thành công vẫn có thể chẳng động vào sổ nào.
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
const now = "2026-07-27T09:00:00.000Z";

async function create(dt, body) {
  const r = await raw("POST", `/api/resource/${encodeURIComponent(dt)}`, body);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { _text: t.slice(0, 200) }; }
  return { ok: r.status < 300, status: r.status, name: j?.data?.name, msg: j?.message ?? j?.exception ?? `http ${r.status}` };
}
/**
 * Duyệt bằng `frappe.client.submit` — KHÔNG phải PUT docstatus.
 *
 * PUT thay cả tài liệu bằng đúng những field mình gửi, nên gửi mỗi `{docstatus:1}` là
 * xoá sạch khách hàng/công ty/dòng hàng rồi mới duyệt — và nhân O2C từ chối vì thiếu
 * field, đúng như nó phải làm. Nhìn thoáng thì lỗi giống "app khai sai", thực ra là
 * người gọi sai.
 */
async function submit(dt, name) {
  const doc = await call("GET", `/api/resource/${encodeURIComponent(dt)}/${encodeURIComponent(name)}`);
  const r = await raw("POST", "/api/method/frappe.client.submit", { doc: { ...doc, doctype: dt, name, modified: doc.modified } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = {}; }
  return { ok: r.status < 300, status: r.status, msg: j?.message ?? j?.exception ?? `http ${r.status}` };
}

// ── Danh mục ────────────────────────────────────────────────────────────────
const KHO = `Kho xưởng ${stamp}`;
const CUA = `CC-${stamp}`;
const KHACH = `Khách thử ${stamp}`;
await create("Warehouse", { warehouse_name: KHO });
await create("Item", { item_code: CUA, item_name: "Cửa cuốn khe thoáng", item_group: "Cửa cuốn", stock_uom: "m2" });
await create("Customer", { customer_name: KHACH, phone: "0900000000" });
ok("danh mục tạo được (kho, hàng, khách)", true, `${KHO} / ${CUA} / ${KHACH}`);

// ── 1. Nhập kho 20 m2 ───────────────────────────────────────────────────────
const pk = await create("Stock Entry", {
  purpose: "Material Receipt", company: "Xưởng", posting_at: now,
  items: [{ row_id: "R1", item_code: CUA, qty: "20", target_warehouse: KHO, valuation_rate: "900000" }],
});
ok("phiếu nhập kho tạo được", pk.ok, pk.name ?? pk.msg);
const pkSub = await submit("Stock Entry", pk.name);
ok("  · duyệt phiếu nhập", pkSub.ok, pkSub.msg);

const balance = async () => {
  const r = await call("POST", "/api/method/frappe.desk.query_report.run", {
    report_name: "Stock Ledger", ignore_prepared_report: 1,
    filters: { item_code: CUA, warehouse: KHO },
  });
  return (r.result ?? []).reduce((s, row) => s + Number(row.actual_qty ?? 0), 0);
};
ok("  · SỔ KHO ghi nhận +20 m2", Math.abs(await balance() - 20) < 0.001, `tồn = ${await balance()}`);

// ── 2. Đơn hàng 8 m2 ────────────────────────────────────────────────────────
const dh = await create("Sales Order", {
  customer: KHACH, company: "Xưởng", currency: "VND", transaction_date: "2026-07-27",
  items: [{ row_id: "R1", item_code: CUA, qty: "8", rate: "1500000", width_mm: 4000, height_mm: 2000, set_count: 1 }],
});
ok("đơn hàng tạo được", dh.ok, dh.name ?? dh.msg);
const dhSub = await submit("Sales Order", dh.name);
ok("  · duyệt đơn", dhSub.ok, dhSub.msg);

// ── 3. Phiếu xuất kho 8 m2 → tồn phải còn 12 ────────────────────────────────
const px = await create("Delivery Note", {
  customer: KHACH, company: "Xưởng", currency: "VND", against_sales_order: dh.name, posting_at: now,
  install_address: "12 Nguyễn Trãi, Hà Đông",
  items: [{ row_id: "R1", item_code: CUA, qty: "8", warehouse: KHO, rate: "1500000", valuation_rate: "900000" }],
});
ok("phiếu xuất kho tạo được", px.ok, px.name ?? px.msg);
const pxSub = await submit("Delivery Note", px.name);
ok("  · duyệt phiếu xuất", pxSub.ok, pxSub.msg);
const conLai = await balance();
ok("  · SỔ KHO TRỪ đúng 8 m2, còn 12", Math.abs(conLai - 12) < 0.001, `tồn = ${conLai}`);

// ── 4. Xuất quá tồn → PHẢI bị chặn ──────────────────────────────────────────
const qua = await create("Delivery Note", {
  customer: KHACH, company: "Xưởng", currency: "VND", against_sales_order: dh.name, posting_at: now,
  install_address: "x",
  items: [{ row_id: "R1", item_code: CUA, qty: "999", warehouse: KHO, rate: "1500000", valuation_rate: "900000" }],
});
const quaSub = qua.ok ? await submit("Delivery Note", qua.name) : { ok: false, msg: qua.msg };
ok("xuất vượt SỐ LƯỢNG ĐƠN bị từ chối", !quaSub.ok && /exceeds Sales Order quantity/.test(String(quaSub.msg)), String(quaSub.msg).slice(0, 90));
ok("  · và tồn không đổi", Math.abs(await balance() - 12) < 0.001, `tồn = ${await balance()}`);

// ── 5. Hoá đơn → công nợ ────────────────────────────────────────────────────
const hd = await create("Sales Invoice", {
  customer: KHACH, company: "Xưởng", currency: "VND", against_sales_order: dh.name, posting_at: now,
  debit_to: "Phải thu khách hàng", default_income_account: "Doanh thu bán hàng",
  items: [{ row_id: "R1", item_code: CUA, qty: "8", rate: "1500000" }],
});
ok("hoá đơn tạo được", hd.ok, hd.name ?? hd.msg);
const hdSub = await submit("Sales Invoice", hd.name);
ok("  · duyệt hoá đơn", hdSub.ok, hdSub.msg);

const congNo = async () => {
  const r = await call("POST", "/api/method/frappe.desk.query_report.run", {
    report_name: "Accounts Receivable", ignore_prepared_report: 1, filters: { party: KHACH },
  });
  return (r.result ?? []).reduce((s, row) => s + Number(row.outstanding_amount ?? 0), 0);
};
const no1 = await congNo();
ok("  · SỔ CÔNG NỢ lên 12.000.000 ₫", Math.abs(no1 - 12000000) < 1, `còn nợ = ${no1.toLocaleString("vi")}`);

// ── 6. Phiếu thu 5.000.000 → công nợ còn 7.000.000 ──────────────────────────
const pt = await create("Payment Entry", {
  payment_type: "Receive", party_type: "Customer", party: KHACH, company: "Xưởng", currency: "VND",
  posting_at: now, paid_from: "Phải thu khách hàng", paid_to: "Tiền gửi ngân hàng",
  paid_amount: "5000000", received_amount: "5000000",
  references: [{ row_id: "R1", reference_doctype: "Sales Invoice", reference_name: hd.name, allocated_amount: "5000000" }],
});
ok("phiếu thu tạo được", pt.ok, pt.name ?? pt.msg);
const ptSub = pt.ok ? await submit("Payment Entry", pt.name) : { ok: false, msg: pt.msg };
ok("  · duyệt phiếu thu", ptSub.ok, ptSub.msg);
const no2 = await congNo();
ok("  · CÔNG NỢ giảm còn 7.000.000 ₫", Math.abs(no2 - 7000000) < 1, `còn nợ = ${no2.toLocaleString("vi")}`);

/**
 * Chốt TỒN KHO, tách hẳn khỏi chốt hạn mức đơn hàng.
 *
 * Ca ở trên xuất 999 m2 trên đơn 8 m2 nên bị chặn vì VƯỢT ĐƠN — đúng, nhưng KHÔNG chứng
 * minh được điều khách cần: kho không bao giờ âm. Ở đây đơn cố ý ĐỦ LỚN (30 m2) trong khi
 * kho chỉ có 10, nên thứ duy nhất có thể chặn là tồn. Không tách ra thì một ngày nào đó
 * chốt tồn hỏng mà bộ kiểm vẫn xanh, vì chốt đơn hàng che mất.
 */
const KHO2 = `Kho tồn ${stamp}`, HANG2 = `NAN-${stamp}`, KH2 = `KH tồn ${stamp}`;
await create("Warehouse", { warehouse_name: KHO2 });
await create("Item", { item_code: HANG2, item_name: "Nan nhôm 5 sóng", item_group: "Nan/lá cửa", stock_uom: "m2" });
await create("Customer", { customer_name: KH2 });
const ton2 = async () => {
  const report = await call("POST", "/api/method/frappe.desk.query_report.run", {
    report_name: "Stock Ledger", ignore_prepared_report: 1, filters: { item_code: HANG2, warehouse: KHO2 } });
  return (report.result ?? []).reduce((sum, row) => sum + Number(row.actual_qty ?? 0), 0);
};
const pk2 = await create("Stock Entry", { purpose: "Material Receipt", company: "Xưởng", posting_at: now,
  items: [{ row_id: "R1", item_code: HANG2, qty: "10", target_warehouse: KHO2, valuation_rate: "500000" }] });
await submit("Stock Entry", pk2.name);
ok("nhập 10 m2 nan nhôm", Math.abs(await ton2() - 10) < 0.001, `tồn = ${await ton2()}`);
const dh2 = await create("Sales Order", { customer: KH2, company: "Xưởng", currency: "VND", transaction_date: "2026-07-27",
  items: [{ row_id: "R1", item_code: HANG2, qty: "30", rate: "1200000" }] });
await submit("Sales Order", dh2.name);
const px3 = await create("Delivery Note", { customer: KH2, company: "Xưởng", currency: "VND",
  against_sales_order: dh2.name, posting_at: now, install_address: "kiểm tra tồn",
  items: [{ row_id: "R1", item_code: HANG2, qty: "30", warehouse: KHO2, rate: "1200000", valuation_rate: "500000" }] });
const r3 = px3.ok ? await submit("Delivery Note", px3.name) : { ok: false, msg: px3.msg };
ok("xuất 30 m2 khi kho chỉ có 10 → TỪ CHỐI vì THIẾU TỒN", !r3.ok && /[Ii]nsufficient stock/.test(String(r3.msg)), String(r3.msg).slice(0, 100));
ok("  · tồn giữ nguyên 10, không âm", Math.abs(await ton2() - 10) < 0.001, `tồn = ${await ton2()}`);

console.log(bad ? `\n${bad} FAILED` : "\nXƯƠNG SỐNG CHẠY ĐÚNG");
process.exit(bad ? 1 : 0);
