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

/**
 * ĐƯỜNG CẮT NHÔM — cắt, từ chối khi thiếu, hoàn cắt, trả hàng.
 *
 * Dựng lô của RIÊNG phép thử này chứ không cắt vào 1.256 lô đã nạp từ Excel: một bộ kiểm
 * chạy được nhiều lần mà mỗi lần lại trừ tồn thật của khách thì tự nó là một lỗi. Cũng vì
 * thế mọi khẳng định ở đây đọc lại SỐ LÁ trên lô, không đọc câu trả lời của method — method
 * báo "đã cắt" mà lô không đổi là đúng cái hỏng cần bắt.
 */
const NHOM = `ALT-${stamp}`, KHO3 = `Kho nhôm ${stamp}`, MAU = "GS";
await create("Item", { item_code: NHOM, item_name: "Nhôm thử cắt", item_group: "Nan/lá cửa", stock_uom: "Thanh" });
await create("Warehouse", { warehouse_name: KHO3 });
const lot = async (widthM, sheets) => (await create("Aluminium Lot", {
  profile: NHOM, colour: MAU, generation: "MỚI", width_m: String(widthM), sheet_count: String(sheets),
  warehouse: KHO3, stock_state: "TỒN",
})).name;
const LO_NGAN = await lot(3.8, 10);
const LO_DAI = await lot(8.8, 5);

const method = async (name, payload) => {
  const response = await raw("POST", `/api/method/${name}`, payload);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  return { ok: response.status < 300, status: response.status, msg: String(body?.message ?? ""), data: body?.message ?? body?.data ?? body };
};
const sheetsOf = async (name) => Number((await call("GET", `/api/resource/Aluminium%20Lot/${encodeURIComponent(name)}`)).sheet_count ?? 0);
const cutsOf = async (voucher) => call("GET", "/api/resource/Aluminium%20Cut?" + new URLSearchParams({
  fields: JSON.stringify(["name", "lot", "sheets_cut", "cut_state"]),
  filters: JSON.stringify([["voucher_no", "=", voucher]]),
}));

// ── 7. Đề xuất cắt: khổ ĐỦ DÀI và NHỎ NHẤT ──────────────────────────────────
const deXuat = await method("alumdoor.cut.propose", { profile: NHOM, colour: MAU, cut_width_m: 3.5, sheets: 6 });
const chon = deXuat.data?.picks?.[0];
ok("đề xuất cắt chọn đúng khổ NHỎ NHẤT còn đủ dài", chon?.lot === LO_NGAN,
  `chọn ${chon?.width_m} m (có 3,8 và 8,8; cắt lá 3,5)`);
// Phế = khổ − rộng cắt. Chọn cây 8,8 để cắt lá 3,5 sẽ phí 5,3 m mỗi lá thay vì 0,3.
ok("  · tính đúng phế mỗi lá", Math.abs(Number(chon?.scrap_per_sheet_m) - 0.3) < 1e-6, `${chon?.scrap_per_sheet_m} m/lá`);
ok("  · xem trước KHÔNG đụng vào tồn", await sheetsOf(LO_NGAN) === 10, `lô còn ${await sheetsOf(LO_NGAN)} lá`);

// ── 8. Cắt thật → tồn giảm đúng, phiếu cắt ghi lại ──────────────────────────
const CT1 = `TEST-CUT-${stamp}`;
const cat = await method("alumdoor.cut.apply", { profile: NHOM, colour: MAU, cut_width_m: 3.5, sheets: 6, voucher_no: CT1 });
ok("cắt thật chạy được", cat.ok, cat.ok ? `phế ${cat.data?.scrap_total_m} m` : cat.msg);
ok("  · TỒN GIẢM đúng 6 lá", await sheetsOf(LO_NGAN) === 4, `10 → ${await sheetsOf(LO_NGAN)}`);
const phieu1 = await cutsOf(CT1);
ok("  · phiếu cắt được ghi để HOÀN được", phieu1.length === 1 && phieu1[0].cut_state === "ĐÃ CẮT", JSON.stringify(phieu1[0] ?? {}));

// ── 9. Đòi quá tồn → TỪ CHỐI, kèm CON SỐ còn thiếu ──────────────────────────
// "Không đủ" mà không nói thiếu bao nhiêu thì kế toán vẫn phải mở file ra đếm tay.
const thieu = await method("alumdoor.cut.apply", { profile: NHOM, colour: MAU, cut_width_m: 3.5, sheets: 20, voucher_no: `${CT1}-X` });
ok("đòi nhiều hơn tồn → TỪ CHỐI kèm số lá còn thiếu", !thieu.ok && /thiếu 11 lá/.test(thieu.msg), thieu.msg.slice(0, 90));
ok("  · và tồn không đổi", await sheetsOf(LO_NGAN) === 4 && await sheetsOf(LO_DAI) === 5, "");
// Khổ dài hơn MỌI lô: không phải "hết hàng" mà là "không có cây nào đủ dài".
const khongDuDai = await method("alumdoor.cut.apply", { profile: NHOM, colour: MAU, cut_width_m: 9.5, sheets: 1, voucher_no: `${CT1}-Y` });
ok("đòi khổ dài hơn mọi lô → TỪ CHỐI", !khongDuDai.ok && /Không đủ nhôm/.test(khongDuDai.msg), khongDuDai.msg.slice(0, 80));

// ── 10. HOÀN CẮT: ghi nhầm, lá về đúng lô cũ nguyên khổ ─────────────────────
const hoan = await method("alumdoor.cut.reverse", { voucher_no: CT1, note: "kiểm tra" });
ok("hoàn cắt chạy được", hoan.ok, hoan.ok ? `${hoan.data?.sheets_restored} lá` : hoan.msg);
ok("  · lá về ĐÚNG lô cũ, nguyên khổ", await sheetsOf(LO_NGAN) === 10, `4 → ${await sheetsOf(LO_NGAN)}`);
/**
 * Hoàn lần thứ hai phải TỪ CHỐI.
 *
 * Đây là chốt quan trọng nhất của cả khối này: nếu phiếu cắt không được đóng dấu sau khi
 * cộng tồn, mỗi lần bấm lại là cộng thêm một lần nữa — tồn phình lên và không có gì báo.
 */
const hoanLai = await method("alumdoor.cut.reverse", { voucher_no: CT1 });
ok("hoàn lần thứ hai bị TỪ CHỐI — không cộng tồn hai lần", !hoanLai.ok, hoanLai.msg.slice(0, 80));
ok("  · tồn vẫn là 10, không thành 16", await sheetsOf(LO_NGAN) === 10, `${await sheetsOf(LO_NGAN)} lá`);

/**
 * CẮT LẤY TỪ NHIỀU LÔ — trường hợp thật, và là trường hợp duy nhất mà việc chạy song song
 * có thể sai.
 *
 * Một đơn 20 lá hiếm khi nằm gọn trong một lô. Trước đây các lô bị cắt nối đuôi nhau, mỗi
 * lô ~1,2 giây, nên cắt từ ba lô là vượt hạn 5 giây của nền tảng — và vượt hạn ở đây nghĩa
 * là tồn ĐÃ trừ trong khi người bấm thấy báo lỗi, rồi bấm lại và trừ lần nữa. Giờ các lô
 * chạy song song, nên phải chứng minh cả hai lô đều trừ ĐÚNG và sinh đủ phiếu cắt.
 */
const LO_A = await lot(4.2, 3);
const LO_B = await lot(4.2, 4);
const CT3 = `TEST-MULTI-${stamp}`;
const nhieuLo = await method("alumdoor.cut.apply", { profile: NHOM, colour: MAU, cut_width_m: 4.0, sheets: 7, voucher_no: CT3 });
ok("cắt lấy từ HAI lô cùng lúc", nhieuLo.ok, nhieuLo.ok ? `${nhieuLo.data?.lots_used} lô, phế ${nhieuLo.data?.scrap_total_m} m` : nhieuLo.msg);
ok("  · cả hai lô đều trừ hết", await sheetsOf(LO_A) === 0 && await sheetsOf(LO_B) === 0, `${await sheetsOf(LO_A)} / ${await sheetsOf(LO_B)} lá`);
// Hết lá thì lô chuyển sang HẾT, giữ dòng lại làm lịch sử — đúng như file Excel vẫn làm.
const trangThai = await call("GET", `/api/resource/Aluminium%20Lot/${encodeURIComponent(LO_A)}`);
ok("  · lô hết lá được đánh dấu HẾT, không xoá", trangThai.stock_state === "HẾT", String(trangThai.stock_state));
ok("  · sinh ĐỦ hai phiếu cắt", (await cutsOf(CT3)).length === 2, `${(await cutsOf(CT3)).length} phiếu`);

// Hoàn cả chứng từ hai phiếu một lượt — cũng là đường chạy song song.
const hoanCa = await method("alumdoor.cut.reverse", { voucher_no: CT3, note: "kiểm tra nhiều lô" });
ok("hoàn cả chứng từ nhiều lô một lượt", hoanCa.ok, hoanCa.ok ? `${hoanCa.data?.sheets_restored} lá` : hoanCa.msg);
ok("  · cả hai lô về đúng số cũ", await sheetsOf(LO_A) === 3 && await sheetsOf(LO_B) === 4, `${await sheetsOf(LO_A)} / ${await sheetsOf(LO_B)} lá`);

// ── 11. TRẢ HÀNG: lá ĐÃ CẮT về kho ở khổ MỚI, không về lô cũ ────────────────
const CT2 = `TEST-RET-${stamp}`;
await method("alumdoor.cut.apply", { profile: NHOM, colour: MAU, cut_width_m: 3.5, sheets: 6, voucher_no: CT2 });
const tra = await method("alumdoor.cut.return", { voucher_no: CT2, note: "khách trả" });
ok("trả hàng chạy được", tra.ok, tra.ok ? `lô nhận: ${tra.data?.lots}` : tra.msg);
/**
 * Lô cũ KHÔNG được cộng lại — đây là chỗ trộn hai khái niệm sẽ làm sai tồn mà không ai thấy.
 * Nhôm đã cắt thành lá 3,5 m thì không còn là cây 3,8 m nữa, và nhôm thì không nối lại được.
 */
ok("  · lô GỐC không được cộng lại (nhôm đã cắt không nối lại được)", await sheetsOf(LO_NGAN) === 4, `${await sheetsOf(LO_NGAN)} lá`);
const loTra = await call("GET", "/api/resource/Aluminium%20Lot?" + new URLSearchParams({
  fields: JSON.stringify(["name", "width_m", "sheet_count", "returned_on"]),
  filters: JSON.stringify([["profile", "=", NHOM], ["width_m", "=", "3.5"]]),
}));
ok("  · lá vào lô khổ 3,5 m, có đánh dấu ngày nhập lại", loTra.length === 1 && Number(loTra[0].sheet_count) === 6 && Boolean(loTra[0].returned_on), JSON.stringify(loTra[0] ?? {}));

/**
 * BÁO GIÁ → ĐƠN HÀNG, và BẢNG GIÁ do SERVER quyết.
 *
 * Hai thứ khác nhau, kiểm riêng:
 *
 *  · Báo giá là doctype thuần của app — không bút toán, không trừ kho. Thứ phải chốt là nó
 *    chỉ chuyển được khi khách ĐÃ ĐỒNG Ý, và chỉ chuyển được MỘT lần.
 *  · Bảng giá thì ngược lại, nó đánh thức nhân định giá của nền tảng: điền `selling_price_list`
 *    là giá gõ tay bị GHI ĐÈ bằng `Item Price`. Nếu tên doctype hay tên field sai một chữ thì
 *    lệnh ghi vẫn thành công và giá gõ tay vẫn nguyên — im lặng, và không ai biết bảng giá
 *    chưa từng chạy. Nên phép thử dưới đây cố ý gõ SAI giá rồi đọc lại xem server có sửa không.
 */
const BANG_GIA = `Giá đại lý ${stamp}`;
await create("Price List", { price_list_name: BANG_GIA, currency: "VND" });
await create("Item Price", { price_list: BANG_GIA, item_code: CUA, rate: "1200000", currency: "VND" });

const dh3 = await create("Sales Order", {
  customer: KHACH, company: "Xưởng", currency: "VND", transaction_date: "2026-07-27",
  selling_price_list: BANG_GIA,
  // Giá gõ tay CỐ Ý sai. Server phải thay bằng 1.200.000 của bảng giá.
  items: [{ row_id: "R1", item_code: CUA, qty: "2", rate: "999" }],
});
ok("đơn có bảng giá tạo được", dh3.ok, dh3.name ?? dh3.msg);
const dh3Sub = dh3.ok ? await submit("Sales Order", dh3.name) : { ok: false, msg: dh3.msg };
ok("  · duyệt đơn", dh3Sub.ok, String(dh3Sub.msg).slice(0, 90));
const dh3Doc = dh3.ok ? await call("GET", `/api/resource/Sales%20Order/${encodeURIComponent(dh3.name)}`) : {};
ok("  · SERVER GHI ĐÈ đơn giá bằng bảng giá (999 → 1.200.000)", Number(dh3Doc?.items?.[0]?.rate) === 1200000, `đơn giá = ${dh3Doc?.items?.[0]?.rate}`);
ok("  · và tổng đơn tính theo giá bảng, không theo giá gõ tay", Number(dh3Doc?.grand_total) === 2400000, `tổng = ${Number(dh3Doc?.grand_total ?? 0).toLocaleString("vi")}`);

/**
 * Mặt hàng không có trong bảng giá phải bị TỪ CHỐI.
 *
 * Đây là chốt quan trọng hơn cả chốt trên: nếu thiếu giá mà đơn vẫn qua, nó sẽ qua với giá 0
 * hoặc với giá gõ tay — và hoá đơn đi ra ngoài với con số sai mà không có gì báo.
 */
const thieuGia = await create("Sales Order", {
  customer: KHACH, company: "Xưởng", currency: "VND", transaction_date: "2026-07-27",
  selling_price_list: BANG_GIA,
  items: [{ row_id: "R1", item_code: HANG2, qty: "1", rate: "500000" }],
});
const thieuGiaSub = thieuGia.ok ? await submit("Sales Order", thieuGia.name) : { ok: false, msg: thieuGia.msg };
ok("mặt hàng chưa có trong bảng giá → TỪ CHỐI", !thieuGiaSub.ok && /Item Price/.test(String(thieuGiaSub.msg)), String(thieuGiaSub.msg).slice(0, 100));

// ── Báo giá ─────────────────────────────────────────────────────────────────
const bg = await create("Quotation", {
  customer: KHACH, company: "Xưởng", currency: "VND", transaction_date: "2026-07-27",
  valid_till: "2026-08-27", contact_person: "A Hồng", install_address: "12B đường số 2, Bình Tân",
  items: [{ row_id: "R1", item_code: CUA, qty: "6", rate: "1500000", width_mm: 4200, height_mm: 2800, set_count: 1, color: "GS" }],
});
ok("báo giá tạo được", bg.ok, bg.name ?? bg.msg);

const chuyen = async (payload) => {
  const r = await raw("POST", "/api/method/alumdoor.quote.convert", payload);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = {}; }
  return { ok: r.status < 300, msg: String(j?.message ?? ""), data: j?.message ?? j?.data ?? j };
};

// Chưa được khách duyệt thì KHÔNG chuyển được — giá chưa chốt mà vào sổ là đi thẳng ra hoá đơn.
const som = await chuyen({ quotation: bg.name });
ok("báo giá CHƯA được khách duyệt → TỪ CHỐI chuyển", !som.ok && /KHÁCH ĐÃ ĐỒNG Ý/.test(som.msg), som.msg.slice(0, 90));

/**
 * Gửi `doctype`/`name` thẳng, KHÔNG bọc trong `doc`.
 *
 * Bọc trong `doc` là bật kiểm tranh chấp: server đòi `modified` khớp, và thiếu nó thì mọi
 * bước workflow trả về "tài liệu đã đổi" — trông y như hai người sửa cùng lúc.
 */
const buoc = async (action) => {
  const r = await raw("POST", "/api/method/frappe.model.workflow.apply_workflow", { doctype: "Quotation", name: bg.name, action });
  if (r.status >= 300) { console.log(`      (${action}: ${(await r.text()).slice(0, 120)})`); return false; }
  return true;
};
ok("  · gửi khách", await buoc("Gửi khách"));
ok("  · khách đồng ý", await buoc("Khách đồng ý"));

const daChuyen = await chuyen({ quotation: bg.name, delivery_date: "2026-08-15", note: "kiểm tra" });
ok("báo giá đã chốt → tạo được đơn hàng", daChuyen.ok, daChuyen.ok ? daChuyen.data?.sales_order : daChuyen.msg);
const donMoi = daChuyen.data?.sales_order;
const donDoc = donMoi ? await call("GET", `/api/resource/Sales%20Order/${encodeURIComponent(donMoi)}`) : {};
/**
 * Số đo phải sang NGUYÊN VẸN.
 *
 * Chép tay là chỗ 4.200×2.800 thành 4.200×2.080, và xưởng cắt xong mới biết. Nhôm đã cắt
 * thì không nối lại được, nên đây không phải chuyện tiện tay.
 */
ok("  · số đo và màu chép nguyên sang đơn", Number(donDoc?.items?.[0]?.width_mm) === 4200 && Number(donDoc?.items?.[0]?.height_mm) === 2800 && donDoc?.items?.[0]?.color === "GS",
  `${donDoc?.items?.[0]?.width_mm}×${donDoc?.items?.[0]?.height_mm} ${donDoc?.items?.[0]?.color}`);
ok("  · đơn trỏ ngược về báo giá", donDoc?.against_quotation === bg.name, String(donDoc?.against_quotation));

/**
 * Bấm lần thứ hai phải ra ĐÚNG đơn cũ, không phải một đơn mới và cũng không phải một lỗi.
 *
 * Khẳng định này từng viết là "lần hai bị TỪ CHỐI", và như thế là sai hướng: người dùng bấm
 * lại chính vì lần đầu KHÔNG trả lời được (hết giờ), nên trả về lỗi chỉ khiến họ bấm tiếp.
 * Điều duy nhất phải giữ là số đơn — hai đơn cho một báo giá là sản xuất hai lần, giao hai
 * lần, công nợ gấp đôi, và không ai đọc lại danh sách đơn để phát hiện.
 */
const lanHai = await chuyen({ quotation: bg.name });
ok("bấm lần thứ hai trả về ĐÚNG đơn cũ, không tạo đơn mới", lanHai.ok && lanHai.data?.sales_order === donMoi, `${lanHai.data?.sales_order ?? lanHai.msg}`);
const dsDon = await call("GET", "/api/resource/Sales%20Order?" + new URLSearchParams({
  fields: JSON.stringify(["name"]), filters: JSON.stringify([["against_quotation", "=", bg.name]]) }));
ok("  · và vẫn chỉ có ĐÚNG MỘT đơn cho báo giá này", dsDon.length === 1, `${dsDon.length} đơn`);

console.log(bad ? `\n${bad} FAILED` : "\nXƯƠNG SỐNG, ĐƯỜNG CẮT NHÔM VÀ PHÂN HỆ BÁN HÀNG CHẠY ĐÚNG");
process.exit(bad ? 1 : 0);
