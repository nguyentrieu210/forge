/**
 * E2E TẦNG API NGHIỆP VỤ — bản đồ hợp đồng cho người viết giao diện.
 *
 * PHÁT HIỆN QUAN TRỌNG khi thử tầng doctype thô (`nhap/e2e.mjs`): POST thẳng
 * `/api/resource/Sales Order` LƯU ĐƯỢC và tính ĐÚNG GIÁ, nhưng dòng lưu xuống KHÔNG có một ô
 * hình học nào — không `door_type`, không `cut_width_m`, không `leaf_count`. Worker Alumdoor
 * chỉ gắn vào `/hooks/validate`, tức nó KIỂM TRA chứ không BỒI ĐẮP.
 *
 * Nghĩa là: giao diện KHÔNG được POST thẳng doctype cho đơn hàng cửa. Phải gọi các đường
 * `alumdoor.*` dựng sẵn — chúng tính công thức, đề xuất motor, dựng lệnh sản xuất, và sinh
 * chứng từ tiếp theo từ chứng từ trước.
 *
 * Tệp này gọi thử từng đường và in HỢP ĐỒNG THẬT: thân yêu cầu tối thiểu và hình dạng kết quả.
 *
 * CHẠY:  node nhap/e2e-api.mjs
 */
const G = "http://127.0.0.1:8799";
const CTY = "CÔNG TY TNHH INTERNATIONAL ALUMINUM APPLICATION";
const KHACH = "CỬA CUỐN MINH ĐỨC";
const BANG_GIA = "Alumdoor 2026";
const KHO = "Kho xưởng";
const NGAY = "2026-08-21";
let ck = "", cs = "";

async function goi(duong, o = {}, conLai = 2) {
  try {
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
  } catch (e) {
    if (conLai <= 0) return { ok: false, status: 0, json: { message: `runtime không trả lời` } };
    await new Promise((x) => setTimeout(x, 2500));
    ck = ""; cs = "";
    await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } }, 0);
    return goi(duong, o, conLai - 1);
  }
}
const loi = (r) => String(r.json?.message ?? r.json?.exc ?? JSON.stringify(r.json)).replace(/\s+/g, " ").slice(0, 120);
const KQ = [];

/** Gọi một đường `alumdoor.*` và in gọn kết quả. `xem` chọn vài khoá đáng chú ý để in ra. */
async function api(ten, than, xem = []) {
  const r = await goi("/api/method/" + ten, { method: "POST", body: than });
  const kq = r.json?.message ?? r.json;
  KQ.push({ ten, ok: r.ok, chiTiet: r.ok ? "" : loi(r) });
  if (!r.ok) { console.log(`   ✗ ${ten.padEnd(38)}${loi(r)}`); return null; }
  const tomTat = xem.length
    ? xem.map((k) => `${k}=${JSON.stringify(kq?.[k])}`).join("  ")
    : Object.keys(kq ?? {}).slice(0, 6).join(" · ");
  console.log(`   ✓ ${ten.padEnd(38)}${String(tomTat).slice(0, 96)}`);
  return kq;
}

await goi("/api/method/login", { method: "POST", body: { usr: "dev@example.com", pwd: "local-dev-password-1" } });
console.log(`E2E tầng API — ${new Date().toISOString().slice(0, 19)}\n`);

const CUA = { item_code: "CDUC_TD_AL595", height_m: 3, width_m: 3, set_count: 1, color: "GHI SẦN", ray_type: "Ray hộp/đơn U76" };

// ══ ① Tính công thức cửa ════════════════════════════════════════════════════════════════
console.log("① TÍNH CÔNG THỨC CỬA — giao diện gọi khi người bán nhập cao/rộng");
const hh = await api("alumdoor.door.calculate", { ...CUA, customer_group: "Đại lý" },
  ["door_type", "cut_width_m", "leaf_count", "billable_area_sqm"]);
if (hh) {
  console.log("      toàn bộ ô trả về:");
  for (const [k, v] of Object.entries(hh)) console.log(`        ${k.padEnd(26)}${JSON.stringify(v).slice(0, 60)}`);
}

// ══ ② Bối cảnh mặt hàng — giao diện dùng để bật/tắt ô nhập ══════════════════════════════
console.log("\n② BỐI CẢNH MẶT HÀNG — giao diện dùng để biết hiện ô nào");
await api("alumdoor.sales.item_context", { item_code: "CDUC_TD_AL595" });
await api("alumdoor.catalog.allowed_colors", { item_code: "CDUC_TD_AL595" });
await api("alumdoor.catalog.finish_color_context", { item_code: "CDUC_TD_AL595" });
await api("alumdoor.catalog.readiness", {});
await api("alumdoor.motor.suggest", { billable_area_sqm: 9 });

// ══ ③ Xem trước dòng và chứng từ — dùng ngay trong form ═════════════════════════════════
console.log("\n③ XEM TRƯỚC (gõ tới đâu thấy tới đó, chưa lưu)");
await api("alumdoor.ui.preview_child_row", {
  doctype: "Sales Order", parentfield: "items",
  doc: { customer: KHACH, company: CTY, currency: "VND", transaction_date: NGAY, selling_price_list: BANG_GIA },
  row: { ...CUA, uom: "m2", qty: 9, price_variant: "CHI_LA" },
});
await api("alumdoor.ui.preview_document", {
  doctype: "Sales Order",
  doc: { customer: KHACH, company: CTY, currency: "VND", transaction_date: NGAY, selling_price_list: BANG_GIA, items: [{ ...CUA, uom: "m2", qty: 9, price_variant: "CHI_LA" }] },
});
await api("alumdoor.quote.preview", {
  customer: KHACH, company: CTY, currency: "VND", transaction_date: NGAY, selling_price_list: BANG_GIA,
  items: [{ ...CUA, uom: "m2", qty: 9, price_variant: "CHI_LA" }],
});

// ══ ④ Từ đơn hàng sinh ra chứng từ tiếp theo ════════════════════════════════════════════
console.log("\n④ SINH CHỨNG TỪ TIẾP THEO TỪ ĐƠN HÀNG");
const dsDH = (await goi(`/api/resource/Sales Order?limit_page_length=5&fields=${encodeURIComponent(JSON.stringify(["name"]))}`)).json.data ?? [];
const donGanNhat = dsDH.at(-1)?.name;
console.log(`   (dùng đơn ${donGanNhat ?? "— chưa có đơn nào"})`);
if (donGanNhat) {
  await api("alumdoor.sales.preview_production", { sales_order: donGanNhat });
  await api("alumdoor.sales.preview_bom_requirements", { sales_order: donGanNhat });
  await api("alumdoor.sales.preview_delivery", { sales_order: donGanNhat });
  await api("alumdoor.sales.preview_invoice", { sales_order: donGanNhat });
  await api("alumdoor.sales.create_production", { sales_order: donGanNhat, source_warehouse: KHO, target_warehouse: KHO });
  await api("alumdoor.sales.delivery_from_order", { sales_order: donGanNhat, warehouse: KHO });
  await api("alumdoor.sales.invoice_from_order", { sales_order: donGanNhat });
}

// ══ ⑤ Cắt nhôm ══════════════════════════════════════════════════════════════════════════
console.log("\n⑤ CẮT NHÔM");
await api("alumdoor.cut.propose", { item_code: "RT_RAYHOP", warehouse: KHO, pieces: [{ length_m: 2.98, qty: 2 }] });

// ══ ⑥ Vận hành ══════════════════════════════════════════════════════════════════════════
console.log("\n⑥ VẬN HÀNH");
await api("alumdoor.operations.overview", {});
await api("alumdoor.capacity.preview", { from_date: NGAY, to_date: "2026-08-31" });

// ══ TỔNG KẾT ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(92));
const hong = KQ.filter((k) => !k.ok);
console.log(` gọi được ${KQ.length - hong.length}/${KQ.length} đường API`);
if (hong.length) {
  console.log("\n TẮC:");
  for (const k of hong) console.log(`   ${k.ten.padEnd(40)}${k.chiTiet}`);
}
