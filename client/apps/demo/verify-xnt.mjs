/**
 * Đối chiếu màn "Nhập xuất tồn" với CHÍNH report Stock Balance của ERPNext.
 *
 * Vì sao cần: màn này đọc lại số từ report rồi tự dựng bảng và dòng tổng. Chỉ cần lấy nhầm một
 * field (in_val ↔ out_val chẳng hạn) là ra một biểu trông vẫn hợp lý nhưng sai — loại lỗi không
 * ai phát hiện cho tới lúc đối chiếu với kế toán.
 */
import { chromium } from "@playwright/test";

const BASE = "http://222.255.238.178/kho";
const PASS = process.env.KHO_PASS;
if (!PASS) { console.error("Thiếu KHO_PASS"); process.exit(2); }

const FROM = "2020-01-01", TO = "2026-12-31";
let bad = 0;

// ── 1. Số liệu gốc từ API ──────────────────────────────────────────────────────
let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, body: await r.json().catch(() => null) };
}
await api("/api/method/login", { method: "POST", body: JSON.stringify({ usr: "Administrator", pwd: PASS }) });
const raw = await api("/api/method/frappe.desk.query_report.run", {
  method: "POST",
  body: JSON.stringify({ report_name: "Stock Balance", filters: { from_date: FROM, to_date: TO }, ignore_prepared_report: 1 }),
});
const src = raw.body?.message?.result ?? [];
const coPhatSinh = src.filter((r) => r.opening_qty || r.in_qty || r.out_qty || r.bal_qty);
const tongGoc = coPhatSinh.reduce((a, r) => ({
  dau: a.dau + (r.opening_val || 0), nhap: a.nhap + (r.in_val || 0),
  xuat: a.xuat + (r.out_val || 0), cuoi: a.cuoi + (r.bal_val || 0),
}), { dau: 0, nhap: 0, xuat: 0, cuoi: 0 });
console.log(`API gốc: ${src.length} dòng, ${coPhatSinh.length} dòng có phát sinh`);
console.log(`  tổng giá trị  đầu=${Math.round(tongGoc.dau)}  nhập=${Math.round(tongGoc.nhap)}  xuất=${Math.round(tongGoc.xuat)}  cuối=${Math.round(tongGoc.cuoi)}`);

// ── 2. Số liệu màn hình ────────────────────────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => localStorage.setItem("mf-setup-skip", "1"));
await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(2000);
if (await page.locator('input[type="password"]').count()) {
  await page.locator("input").first().fill("Administrator");
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await page.waitForTimeout(4000);
}

await page.goto(`${BASE}/bao-cao/xuat-nhap-ton`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);

// đặt kỳ rộng bằng đúng khoảng đã gọi API
await page.locator('input[type="date"]').first().fill(FROM);
await page.locator('input[type="date"]').nth(1).fill(TO);
await page.waitForTimeout(3500);

const ui = await page.evaluate(() => {
  const tbl = document.querySelector("table");
  if (!tbl) return { err: "không thấy bảng" };
  const body = [...tbl.querySelectorAll("tbody tr")];
  const oSo = (tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
  const chan = document.querySelectorAll(".mf-view-card > div:last-of-type, .mf-view-card > div")
  return {
    soDong: body.length,
    dongDau: body[0] ? oSo(body[0]) : null,
    tieuDe: [...tbl.querySelectorAll("thead th")].map((th) => th.innerText.trim()),
    // Lấy TOÀN BỘ chữ trên trang rồi mới dò nhãn+số. Lọc theo từng dòng như trước là hỏng: innerText
    // tách mỗi <span> thành một dòng nên nhãn và con số nằm rời nhau.
    chanTrang: [document.body.innerText],
  };
});
if (ui.err) { console.log("✗ " + ui.err); process.exit(1); }

const viNum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
console.log(`\nMàn hình: ${ui.soDong} dòng`);
console.log(`  tiêu đề: ${ui.tieuDe.join(" | ")}`);
console.log(`  dòng đầu: ${ui.dongDau?.join(" | ")}`);

// ── 3. So khớp ─────────────────────────────────────────────────────────────────
const check = (ten, a, b, saiSo = 1) => {
  const ok = Math.abs(a - b) <= saiSo;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${ten.padEnd(34)} màn=${a}  api=${b}`);
};
check("số dòng có phát sinh", ui.soDong, coPhatSinh.length, 0);

const chan = ui.chanTrang.join(" ");
const lay = (nhan) => {
  const m = new RegExp(`${nhan}\\s*([\\d.,]+)`).exec(chan);
  return m ? viNum(m[1]) : NaN;
};
check("tổng giá trị tồn đầu", lay("Giá trị tồn đầu"), Math.round(tongGoc.dau));
check("tổng giá trị nhập", lay("Nhập"), Math.round(tongGoc.nhap));
check("tổng giá trị xuất", lay("Xuất"), Math.round(tongGoc.xuat));
check("tổng giá trị tồn cuối", lay("Tồn cuối"), Math.round(tongGoc.cuoi));

// dòng đầu tiên: đối chiếu từng ô với bản ghi API tương ứng
if (ui.dongDau) {
  const ma = ui.dongDau[1];
  const kho = ui.dongDau[4];
  const g = coPhatSinh.find((r) => r.item_code === ma && r.warehouse === kho);
  if (!g) { bad++; console.log(`✗ không tìm thấy bản ghi API cho ${ma} @ ${kho}`); }
  else {
    const o = ui.dongDau;
    check(`  ${ma} tồn đầu SL`, viNum(o[5]), g.opening_qty ?? 0, 0.01);
    check(`  ${ma} nhập SL`, viNum(o[7]), g.in_qty ?? 0, 0.01);
    check(`  ${ma} nhập giá trị`, viNum(o[8]), Math.round(g.in_val ?? 0));
    check(`  ${ma} xuất SL`, viNum(o[9]), g.out_qty ?? 0, 0.01);
    check(`  ${ma} tồn cuối SL`, viNum(o[11]), g.bal_qty ?? 0, 0.01);
    check(`  ${ma} tồn cuối giá trị`, viNum(o[12]), Math.round(g.bal_val ?? 0));
  }
}

// ── 4. Xuất Excel có ra file không ─────────────────────────────────────────────
const dl = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
await page.getByRole("button", { name: /Xuất Excel/i }).click();
const file = await dl;
if (!file) { bad++; console.log("✗ bấm Xuất Excel KHÔNG ra file"); }
else console.log(`✓ xuất Excel ra file: ${file.suggestedFilename()}`);

if (errs.length) { bad++; console.log(`✗ lỗi JS: ${errs.slice(0, 3).join(" | ")}`); }
await browser.close();
console.log(bad === 0 ? "\n✓ SỐ LIỆU MÀN HÌNH KHỚP REPORT GỐC" : `\n✗ ${bad} sai lệch`);
process.exit(bad ? 1 : 0);
