/**
 * E2E — dựng nền rồi chạy hết các luồng nghiệp vụ, báo cáo cái nào gọi được và cái nào tắc.
 *
 * Mục đích: làm BẢN ĐỒ HỢP ĐỒNG API cho người viết giao diện. Mỗi bước in ra doctype, kết quả,
 * và nếu hỏng thì in NGUYÊN VĂN lỗi — không bỏ qua, không tô hồng.
 *
 * Chạy lại được nhiều lần: bản ghi nền dùng tên cố định (tạo một lần rồi thôi), chứng từ thì
 * sinh mới mỗi lượt.
 *
 * RUNTIME CỤC BỘ THỈNH THOẢNG TỰ THOÁT khi gặp lỗi chưa bắt (log: `X [ERROR]` rồi `ELIFECYCLE`).
 * `goi()` bọc lại: đứt thì đăng nhập lại và thử lại, hết lượt thì ghi nhận "runtime không trả
 * lời" chứ không ném ra ngoài — bộ e2e phải chạy hết mọi luồng rồi mới báo cáo.
 *
 * CHẠY:  node nhap/e2e.mjs
 */
const G = "http://127.0.0.1:8799";
const CTY = "CÔNG TY TNHH INTERNATIONAL ALUMINUM APPLICATION";
const KHACH = "CỬA CUỐN MINH ĐỨC";
const NCC = "TIẾN ĐẠT";
const BANG_GIA = "Alumdoor 2026";
const KHO = "Kho xưởng";
const NGAY = "2026-08-21";
const LUC = NGAY + "T08:00:00Z";
const DAU = Date.now().toString(36).slice(-5);
let ck = "", cs = "";

async function goi(duong, o = {}, conLai = 2) {
  try { return await goiThat(duong, o); }
  catch (e) {
    if (conLai <= 0) return { ok: false, status: 0, json: { message: `runtime không trả lời: ${String(e).slice(0, 50)}` } };
    await new Promise((x) => setTimeout(x, 2500));
    ck = ""; cs = "";
    try { await goiThat("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } }); } catch { /* lượt sau lo */ }
    return goi(duong, o, conLai - 1);
  }
}
async function goiThat(duong, o = {}) {
  const r = await fetch(G + duong, {
    method: o.method || "GET",
    headers: { "content-type": "application/json", ...(ck ? { cookie: ck } : {}), ...(cs ? { "x-frappe-csrf-token": cs } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const c = r.headers.get("set-cookie"); if (c && c.startsWith("sid=")) ck = c.split(";")[0];
  const n = r.headers.get("x-frappe-csrf-token"); if (n) cs = n;
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, status: r.status, json: j };
}
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).replace(/\s+/g, " ").slice(0, 130);
const vn = (n) => Number(n ?? 0).toLocaleString("vi");

const KQ = [];
async function tao(doctype, than) {
  return goi("/api/resource/" + encodeURIComponent(doctype), { method: "POST", body: { doc: than, title: `e2e-${DAU}`, content: `e2e-${DAU}` } });
}
async function buoc(nhom, ten, doctype, than) {
  const r = await tao(doctype, than);
  KQ.push({ nhom, ten, doctype, ok: r.ok, chiTiet: r.ok ? r.json.data.name : loi(r) });
  console.log(`   ${r.ok ? "✓" : "✗"} ${ten.padEnd(36)}${r.ok ? r.json.data.name : loi(r)}`);
  return r.ok ? r.json.data : null;
}
/** `submit` phải gửi kèm `modified`, nếu không kernel từ chối bằng khoá lạc quan. */
async function nop(doctype, name) {
  const d = (await goi(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`)).json.data;
  const r = await goi("/api/method/frappe.client.submit", { method: "POST", body: { doc: { ...d, doctype, name } } });
  console.log(`      ${r.ok ? "✓" : "✗"} nộp   ${r.ok ? "OK" : loi(r)}`);
  return r.ok;
}
/** Dựng nền: có rồi thì thôi, chưa có thì tạo. Trả về tên bản ghi hoặc null. */
async function nen(doctype, ten, than) {
  const co = await goi(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(ten)}`);
  if (co.ok) return ten;
  const r = await tao(doctype, than);
  if (!r.ok) { console.log(`   ✗ nền ${doctype} "${ten}": ${loi(r)}`); return null; }
  return r.json.data.name;
}

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(`E2E Alumdoor — ${new Date().toISOString().slice(0, 19)}   lượt ${DAU}\n`);

// ══ ① Dữ liệu nền giao diện đọc ═════════════════════════════════════════════════════════
console.log("① DANH MỤC (giao diện đọc để dựng ô chọn)");
for (const [dt, ghi] of [["Company", "công ty"], ["Customer", "khách hàng"], ["Supplier", "nhà cung cấp"],
  ["Item", "mặt hàng"], ["Item Price", "đơn giá"], ["Price List", "bảng giá"], ["Warehouse", "kho"],
  ["UOM", "đơn vị tính"], ["Item Group", "nhóm hàng"], ["Bậc diện tích", "bậc diện tích"],
  ["Item Color", "màu"], ["Pricing Rule", "chính sách giá"], ["Cutting Policy", "công thức cửa"]]) {
  const r = await goi(`/api/resource/${encodeURIComponent(dt)}?limit_page_length=2000&fields=${encodeURIComponent(JSON.stringify(["name"]))}`);
  const n = r.ok ? (r.json.data ?? []).length : -1;
  console.log(`   ${n >= 0 ? "✓" : "✗"} GET /api/resource/${dt}`.padEnd(50) + `${n >= 0 ? String(n).padStart(4) + " bản ghi" : loi(r)}   ${ghi}`);
}

// ══ ② Dựng nền kế toán và định mức ══════════════════════════════════════════════════════
console.log("\n② DỰNG NỀN (chỉ tạo nếu chưa có)");
const nd = await nen("Fiscal Year", "2026", { year: "2026", year_start_date: "2026-01-01", year_end_date: "2026-12-31" });
console.log(`   ${nd ? "✓" : "✗"} niên độ 2026`);

/** Hệ thống tài khoản tối thiểu để chạy được thu/chi và hoá đơn. */
const TK = [
  ["Tiền mặt", "Cash"], ["Phải thu khách hàng", "Receivable"], ["Phải trả người bán", "Payable"],
  ["Chi phí nguyên vật liệu", "Expense Account"], ["Doanh thu bán hàng", "Income Account"],
];
const tk = {};
for (const [ten, loaiTk] of TK) {
  tk[loaiTk] = await nen("Account", ten, { account_name: ten, company: CTY, account_type: loaiTk, account_currency: "VND", is_group: false, disabled: false });
}
console.log(`   ${Object.values(tk).filter(Boolean).length}/${TK.length} tài khoản: ${Object.entries(tk).map(([k, v]) => `${k}${v ? "" : "✗"}`).join(" · ")}`);

/** Định mức cho một mã cửa, để lệnh sản xuất có cái mà bám. */
const dm = await nen("Bill of Materials", `DM-E2E-${DAU}`, {
  item: "CDUC_TD_AL595", company: CTY, quantity: 1, is_active: true,
  note: `Định mức tối thiểu dựng bởi e2e ${DAU} để thử luồng sản xuất.`,
  /**
   * KHÔNG truyền `uom` trên dòng định mức. `BOM Item.uom` khai là `Data`, nhưng có chỗ trong
   * đường ghi đối xử với nó như một Link rồi gọi `.trim()` trên metadata rỗng — kết quả là
   * `Cannot read properties of undefined (reading 'trim')`, một TypeError trần trụi không nói
   * ô nào. Bỏ `uom` ra thì tạo được ngay; đã thử tách từng ô để khoanh đúng nó.
   */
  items: [{ row_id: "ROW-1", item_code: "RT_RAYHOP", qty: 6, qty_basis: "Cố định" }],
});
console.log(`   ${dm ? "✓" : "✗"} định mức ${dm ?? ""}`);
/**
 * Định mức phải NỘP mới có hiệu lực. Tạo xong mà để nháp thì Lệnh sản xuất báo
 * "No Active BOM is effective for …" — nghe như thiếu định mức, thực ra là có mà chưa ghi sổ.
 */
if (dm) {
  /**
   * `is_active` phải BẬT ngay tại lệnh nộp. Gửi lúc tạo là chưa đủ — đọc lại bản ghi rồi nộp
   * thì cờ về false và kernel từ chối bằng "Submitted BOM revision must be Active", một câu
   * nghe như định mức sai phiên bản chứ không phải thiếu một dấu tick.
   */
  const bd = (await goi(`/api/resource/Bill of Materials/${encodeURIComponent(dm)}`)).json.data;
  const rs = await goi("/api/method/frappe.client.submit", { method: "POST", body: { doc: { ...bd, doctype: "Bill of Materials", name: dm, is_active: true } } });
  console.log(`      ${rs.ok ? "✓" : "✗"} nộp định mức   ${rs.ok ? "OK" : loi(rs)}`);
}

// ══ ③ Luồng BÁN ═════════════════════════════════════════════════════════════════════════
console.log("\n③ LUỒNG BÁN");
const dongCua = {
  item_code: "CDUC_TD_AL595", uom: "m2", qty: 9, rate: 0,
  height_m: 3, width_m: 3, set_count: 1, billable_area_sqm: 9,
  ray_type: "Ray hộp/đơn U76", color: "GHI SẦN", price_variant: "CHI_LA",
};
const nenBan = { customer: KHACH, company: CTY, currency: "VND", transaction_date: NGAY, selling_price_list: BANG_GIA };
await buoc("BÁN", "Báo giá", "Quotation", { ...nenBan, valid_till: "2026-09-30", items: [dongCua] });
const dh = await buoc("BÁN", "Đơn hàng", "Sales Order", { ...nenBan, items: [dongCua] });
if (dh) { console.log(`      giá ${vn(dh.items[0].rate)}/m²   tổng ${vn(dh.grand_total ?? dh.total_amount)}`); await nop("Sales Order", dh.name); }
await buoc("BÁN", "Phiếu giao hàng", "Delivery Note", {
  customer: KHACH, company: CTY, currency: "VND", posting_at: LUC,
  ...(dh ? { against_sales_order: dh.name } : {}), items: [{ ...dongCua, warehouse: KHO }],
});
await buoc("BÁN", "Hoá đơn bán", "Sales Invoice", {
  customer: KHACH, company: CTY, currency: "VND", posting_at: LUC, selling_price_list: BANG_GIA,
  ...(tk["Receivable"] ? { debit_to: tk["Receivable"] } : {}),
  items: [{ ...dongCua, ...(tk["Income Account"] ? { income_account: tk["Income Account"] } : {}) }],
});
await buoc("BÁN", "Phiếu thu", "Payment Entry", {
  company: CTY, party_type: "Customer", party: KHACH, payment_type: "Receive",
  paid_amount: 9180000, received_amount: 9180000, currency: "VND", posting_at: LUC,
  paid_from: tk["Receivable"], paid_to: tk["Cash"],
  // Tiền chưa gán vào hoá đơn nào thì phải nói rõ là tạm ứng, nếu không kernel từ chối
  // ("Unallocated payment requires explicit advance confirmation"). Cố ý bắt khai — thu tiền
  // mà không biết trừ vào đâu là mầm của công nợ sai.
  allow_unallocated: true,
});

// ══ ④ Luồng MUA ═════════════════════════════════════════════════════════════════════════
console.log("\n④ LUỒNG MUA");
const dongMua = { item_code: "RT_RAYHOP", uom: "Kg", qty: 100, rate: 18000, warehouse: KHO };
const dhm = await buoc("MUA", "Đơn mua", "Purchase Order", { supplier: NCC, company: CTY, currency: "VND", transaction_date: NGAY, items: [dongMua] });
if (dhm) await nop("Purchase Order", dhm.name);
const pnm = await buoc("MUA", "Phiếu nhập", "Purchase Receipt", {
  supplier: NCC, company: CTY, currency: "VND", posting_at: LUC,
  ...(dhm ? { against_purchase_order: dhm.name } : {}), items: [dongMua],
});
if (pnm) await nop("Purchase Receipt", pnm.name);
await buoc("MUA", "Hoá đơn mua", "Purchase Invoice", {
  supplier: NCC, company: CTY, currency: "VND", posting_at: LUC, credit_to: tk["Payable"],
  items: [{ ...dongMua, expense_account: tk["Expense Account"] }],
});
await buoc("MUA", "Phiếu chi", "Payment Entry", {
  company: CTY, party_type: "Supplier", party: NCC, payment_type: "Pay",
  paid_amount: 1800000, received_amount: 1800000, currency: "VND", posting_at: LUC,
  paid_from: tk["Cash"], paid_to: tk["Payable"], allow_unallocated: true,
});

// ══ ⑤ KHO ═══════════════════════════════════════════════════════════════════════════════
console.log("\n⑤ KHO");
await buoc("KHO", "Yêu cầu vật tư", "Material Request", { company: CTY, transaction_date: NGAY, items: [{ item_code: "RT_RAYHOP", uom: "Kg", qty: 50, warehouse: KHO }] });
await buoc("KHO", "Phiếu nhập kho", "Stock Entry", {
  company: CTY, posting_at: LUC, purpose: "Material Receipt",
  items: [{ item_code: "RT_RAYHOP", qty: 50, target_warehouse: KHO, valuation_rate: 18000 }],
});
await buoc("KHO", "Phiếu xuất kho", "Stock Entry", {
  company: CTY, posting_at: LUC, purpose: "Material Issue",
  items: [{ item_code: "RT_RAYHOP", qty: 5, source_warehouse: KHO }],
});
await buoc("KHO", "Kiểm kê", "Stock Reconciliation", {
  // Thời điểm chốt sổ KHÔNG được ở tương lai — `LUC` là 08:00Z, còn máy chủ đang ở rạng sáng
  // cùng ngày. Lấy thẳng giờ hiện tại lùi một phút cho chắc.
  warehouse: KHO, scope: "Theo mã hàng", item_code: "RT_RAYHOP",
  snapshot_at: new Date(Date.now() - 60000).toISOString(), counted_by: "dev@example.com",
  recon_state: "Nháp", items: [{ item_code: "RT_RAYHOP", counted_qty: 50 }],
});

// ══ ⑥ SẢN XUẤT ══════════════════════════════════════════════════════════════════════════
console.log("\n⑥ SẢN XUẤT");
await buoc("SX", "Lệnh sản xuất", "Work Order", {
  company: CTY, production_item: "CDUC_TD_AL595", bom_no: dm, qty: 1,
  width_m: 3, height_m: 3, color: "GHI SẦN", ray_type: "Ray hộp/đơn U76",
  source_warehouse: KHO, target_warehouse: KHO,
});
/**
 * Yêu cầu sản xuất đòi ~21 ô trên MỖI dòng, và phần lớn là kết quả của tầng công thức
 * (`cut_width_m`, `leaf_count`, `formula_policy`, `formula_version`…). Giao diện KHÔNG nên tự
 * điền tay — phải lấy từ dòng của Đơn hàng đã được máy tính xong. Ở đây lấy thẳng từ `dh`.
 */
if (dh) {
  const d0 = dh.items[0];
  const sl = await goi("/api/method/alumdoor.slats.compute", { method: "POST", body: { profile: "AL595", height_m: d0.height_m } });
  const soLa = sl.ok ? (sl.json?.message?.slats ?? 0) : 0;
  console.log(`      số lá tính riêng qua alumdoor.slats.compute: ${soLa}${sl.ok ? "" : "  ✗ " + loi(sl)}`);
  await buoc("SX", "Yêu cầu sản xuất", "Production Request", {
    sales_order: dh.name, customer: KHACH, requested_on: NGAY,
    source_warehouse: KHO, target_warehouse: KHO, request_state: "Nháp",
    items: [{
      request_line_key: `${dh.name}-1`, sales_order_row_id: String(d0.name ?? 1),
      item_code: d0.item_code, door_type: d0.door_type, department: "Sản xuất",
      set_no: 1, set_count: d0.set_count ?? 1, width_m: d0.width_m, height_m: d0.height_m,
      sales_mode: d0.sales_mode, formula_policy: d0.formula_policy, formula_version: d0.formula_version,
      width_basis: d0.width_basis, cut_width_m: d0.cut_width_m, billable_area_sqm: d0.billable_area_sqm,
      /**
       * `leaf_count` KHÔNG có trên dòng đơn hàng — worker Alumdoor chỉ gắn vào `/hooks/validate`
       * nên nó kiểm tra chứ không bồi đắp. Phải gọi `alumdoor.slats.compute` riêng, và đường ấy
       * nhận `profile` (mã hệ nhôm, ví dụ "AL595") chứ KHÔNG nhận `item_code`.
       */
      leaf_count: soLa, source_warehouse: KHO, target_warehouse: KHO,
      bom_no: dm, output_qty: 1, stock_uom: d0.stock_uom,
    }],
  });
} else console.log("   – Yêu cầu sản xuất: bỏ qua vì chưa có Đơn hàng");

// ══ ⑦ KẾ TOÁN ═══════════════════════════════════════════════════════════════════════════
console.log("\n⑦ KẾ TOÁN");
await buoc("KT", "Bút toán", "Journal Entry", {
  company: CTY, posting_at: LUC,
  accounts: [{ account: tk["Cash"], debit: 1000000, credit: 0 }, { account: tk["Income Account"], debit: 0, credit: 1000000 }],
});

// ══ TỔNG KẾT ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(94));
const theoNhom = {};
for (const k of KQ) { (theoNhom[k.nhom] ??= { ok: 0, tong: 0 }); theoNhom[k.nhom].tong++; if (k.ok) theoNhom[k.nhom].ok++; }
console.log(" TỔNG KẾT");
console.log("═".repeat(94));
for (const [n, v] of Object.entries(theoNhom)) {
  const vach = "█".repeat(Math.round((v.ok / v.tong) * 20)).padEnd(20, "░");
  console.log(`   ${n.padEnd(5)}${vach}  ${v.ok}/${v.tong}`);
}
const hong = KQ.filter((k) => !k.ok);
if (hong.length) {
  console.log(`\n   ${hong.length} bước TẮC:`);
  for (const k of hong) console.log(`      ${k.doctype.padEnd(22)}${k.chiTiet}`);
}
console.log(`\n   chạy được ${KQ.length - hong.length}/${KQ.length} bước.`);
