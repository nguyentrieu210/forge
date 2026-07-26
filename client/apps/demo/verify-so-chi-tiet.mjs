/**
 * Đối chiếu màn Sổ chi tiết / Thẻ kho với report Stock Ledger gốc.
 * Điểm dễ sai nhất: dòng số dư đầu kỳ (ERPNext chèn, KHÔNG có ngày) và cột tồn luỹ kế.
 */
import { chromium } from "@playwright/test";
const BASE = "http://222.255.238.178/kho";
const PASS = process.env.KHO_PASS;
let cookie = "", bad = 0;

async function api(p, o = {}) {
  const r = await fetch(BASE + p, { ...o, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(o.headers || {}) } });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  return r.json().catch(() => null);
}
await api("/api/method/login", { method: "POST", body: JSON.stringify({ usr: "Administrator", pwd: PASS }) });

// chọn một mặt hàng CÓ phát sinh để phép đối chiếu có ý nghĩa
// Cho phép ép kỳ/mặt hàng qua biến môi trường: kỳ rộng thì số dư đầu kỳ luôn = 0 nên KHÔNG kiểm
// được đường quan trọng nhất (đọc đúng dòng số dư đầu kỳ mà ERPNext chèn).
const FROM = process.env.SCT_FROM || "2020-01-01";
const TO = process.env.SCT_TO || "2026-12-31";
const sl0 = await api("/api/method/frappe.desk.query_report.run", {
  method: "POST", body: JSON.stringify({ report_name: "Stock Ledger", filters: { from_date: FROM, to_date: TO }, ignore_prepared_report: 1 }),
});
const mau = (sl0?.message?.result ?? []).find((r) => r.item_code && r.warehouse);
const MA = process.env.SCT_ITEM || mau.item_code;
const KHO = process.env.SCT_WH || mau.warehouse;

const goc = await api("/api/method/frappe.desk.query_report.run", {
  method: "POST",
  body: JSON.stringify({ report_name: "Stock Ledger", filters: { from_date: FROM, to_date: TO, item_code: [MA], warehouse: KHO }, ignore_prepared_report: 1 }),
});
const rows = goc?.message?.result ?? [];
const mo = rows.find((r) => !r.date && !r.voucher_no);
const ps = rows.filter((r) => r.date && r.voucher_no);
const cuoi = ps.at(-1);
console.log(`API goc — ${MA} @ ${KHO}: ${ps.length} phat sinh`);
console.log(`  so du dau ky: SL=${mo?.qty_after_transaction ?? 0} GT=${mo?.stock_value ?? 0}`);
console.log(`  ton cuoi: SL=${cuoi?.qty_after_transaction} GT=${cuoi?.stock_value}`);

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(() => localStorage.setItem("mf-setup-skip", "1"));
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
if (await p.locator('input[type="password"]').count()) {
  await p.locator("input").first().fill("Administrator");
  await p.locator('input[type="password"]').fill(PASS);
  await p.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await p.waitForTimeout(4000);
}
await p.goto(BASE + "/bao-cao/so-chi-tiet", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);

const truoc = (await p.locator("body").innerText()).includes("Chọn mặt hàng và kho để lập sổ");
console.log(`\nchua chon du dieu kien → hien huong dan: ${truoc ? "✓" : "✗"}`);
if (!truoc) bad++;

// chọn kỳ rộng + mặt hàng + kho
await p.locator('input[type="date"]').first().fill(FROM);
await p.locator('input[type="date"]').nth(1).fill(TO);
const chon = async (viTri, nhan) => {
  await p.locator("main button[role=combobox]").nth(viTri).click();
  await p.waitForTimeout(500);
  await p.locator('[role="option"]', { hasText: nhan }).first().click();
  await p.waitForTimeout(1200);
};
await chon(0, MA);
await chon(1, KHO);
await p.waitForTimeout(3000);

const ui = await p.evaluate(() => {
  const tr = [...document.querySelectorAll("tbody tr")];
  const oSo = (r) => [...r.querySelectorAll("td")].map((td) => td.innerText.trim());
  return { soDong: tr.length, dong: tr.map(oSo), chu: document.body.innerText };
});
const viNum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
const check = (ten, a, c, ss = 1) => {
  const ok = Math.abs(a - c) <= ss;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${ten.padEnd(30)} man=${a}  api=${c}`);
};
console.log(`\nman hinh: ${ui.soDong} dong (gom dau ky + phat sinh + cong + cuoi ky)`);
// Đếm theo Ô NGÀY chứ không lấy tổng số dòng trừ đi 3: khi không có phát sinh, bảng còn một dòng
// thông báo "Không có phát sinh…" và phép trừ đó đếm nhầm nó thành một giao dịch.
const dongNgay = ui.dong.filter((d) => /^\d{2}\/\d{2}\/\d{4}$/.test(d[0] ?? ""));
check("so dong phat sinh", dongNgay.length, ps.length, 0);

const dauKy = ui.dong.find((d) => d[0]?.includes("Số dư đầu kỳ"));
const cuoiKy = ui.dong.find((d) => d[0]?.includes("Số dư cuối kỳ"));
if (!dauKy || !cuoiKy) { bad++; console.log("✗ thieu dong so du dau/cuoi ky"); }
else {
  const dauSl = mo?.qty_after_transaction ?? 0;
  const dauTt = mo?.stock_value ?? 0;
  check("so du dau ky (SL)", viNum(dauKy.at(-2)), dauSl, 0.01);
  // KHÔNG có phát sinh trong kỳ ⇒ tồn cuối = tồn đầu. Lấy mặc định 0 là kỳ vọng sai, và đó là lỗi
  // của phép kiểm chứ không phải của sổ.
  check("so du cuoi ky (SL)", viNum(cuoiKy.at(-2)), cuoi ? cuoi.qty_after_transaction : dauSl, 0.01);
  check("so du cuoi ky (gia tri)", viNum(cuoiKy.at(-1)), Math.round(cuoi ? cuoi.stock_value : dauTt));
}
// dòng phát sinh đầu tiên: cột tồn phải bằng qty_after_transaction của API
if (dongNgay[0] && ps[0]) check("ton sau phat sinh dau", viNum(dongNgay[0].at(-2)), ps[0].qty_after_transaction, 0.01);

// Thẻ kho: phải KHÔNG còn cột tiền
await p.getByRole("button", { name: "Thẻ kho", exact: true }).click();
await p.waitForTimeout(1500);
const tk = await p.evaluate(() => {
  const th = [...document.querySelectorAll("thead th")].map((x) => x.innerText.trim());
  const td = document.querySelectorAll("tbody tr")[0]?.querySelectorAll("td").length ?? 0;
  return { th, soCot: td };
});
const khongTien = !tk.th.some((x) => /Thành tiền|Đơn giá/i.test(x));
if (!khongTien) bad++;
console.log(`${khongTien ? "✓" : "✗"} The kho khong co cot tien — tieu de: ${tk.th.join(" | ").slice(0, 110)}`);

if (errs.length) { bad++; console.log(`✗ loi JS: ${errs.slice(0, 2).join(" | ")}`); }
await b.close();
console.log(bad === 0 ? "\n✓ SO CHI TIET KHOP REPORT GOC" : `\n✗ ${bad} sai lech`);
process.exit(bad ? 1 : 0);
