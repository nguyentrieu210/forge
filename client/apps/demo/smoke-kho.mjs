/**
 * Smoke test bản deploy /kho — KHÔNG cần đăng nhập.
 * Mục tiêu: bắt màn hình trắng / React crash / lỗi nạp chunk sau mỗi lần deploy.
 * Đây đúng là loại lỗi đã 2 lần lọt lên production trong dự án này.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.KHO_BASE || "http://222.255.238.178/kho";
const ROUTES = [
  "/", "/nhap-nhanh", "/in-tem", "/ton-kho", "/bao-cao/stock-balance", "/app/Item",
  // Ba màn báo cáo tự dựng — không đi qua ReportContainer nên lỗi ở đây không có gì bắt hộ.
  "/bao-cao/xuat-nhap-ton", "/bao-cao/so-chi-tiet", "/bao-cao/tong-hop-doi-tuong",
];

const browser = await chromium.launch();
let bad = 0;

/**
 * Smoke chạy KHÔNG đăng nhập, nên `get_boot` (whitelist thường, không allow_guest) chắc chắn trả
 * 403 và trình duyệt ghi một dòng lỗi "Failed to load resource". Đó là hành vi ĐÚNG: app bắt được
 * và chuyển sang màn đăng nhập.
 *
 * Trước đây mọi lỗi console đều bị tính là hỏng ⇒ smoke đỏ vĩnh viễn vì đúng một dòng vô hại này,
 * và một cái gate luôn đỏ thì không còn báo được gì. Nay chỉ tha DUY NHẤT phản hồi 403 của get_boot;
 * bất kỳ mã lỗi nào khác, hay 403 ở URL khác, vẫn tính là hỏng.
 */
const expected4xx = (status, url) => status === 403 && url.includes("metaforge.api.get_boot");

for (const r of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  const unexpected = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", (m) => {
    // Lỗi tải tài nguyên đã được soi kỹ hơn qua sự kiện `response` ngay dưới — bỏ ở đây để không
    // đếm hai lần cùng một sự việc.
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push(`console: ${m.text().slice(0, 140)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !expected4xx(res.status(), res.url())) unexpected.push(`${res.status()} ${res.url().slice(-70)}`);
  });
  page.on("requestfailed", (q) => errs.push(`netfail: ${q.url().slice(-60)}`));

  try {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(2000);
    const html = await page.content();
    const text = (await page.locator("body").innerText().catch(() => "")).trim();
    const rootEmpty = await page.evaluate(() => (document.getElementById("root")?.childElementCount ?? 0) === 0);

    const white = rootEmpty || text.length < 5;
    if (white) bad++;
    console.log(`${white ? "✗ TRẮNG" : "✓ vẽ được"}  ${r.padEnd(28)} chữ=${text.length.toString().padStart(5)}  html=${html.length}`);
    if (text) console.log(`      → ${text.replace(/\s+/g, " ").slice(0, 90)}`);
    // lỗi mạng cho tài nguyên ngoài (font/CDN) — phải KHÔNG có
    const external = errs.filter((e) => /netfail/.test(e) && !/222\.255|localhost/.test(e));
    if (external.length) console.log(`      ⚠ tài nguyên ngoài lỗi: ${external.slice(0, 2).join(" | ")}`);
    const real = errs.filter((e) => !/netfail/.test(e));
    if (real.length) { bad++; console.log(`      ✗ ${real.slice(0, 3).join("\n      ✗ ")}`); }
    if (unexpected.length) { bad++; console.log(`      ✗ phản hồi lỗi ngoài dự kiến: ${unexpected.slice(0, 3).join(" | ")}`); }
  } catch (e) {
    bad++;
    console.log(`✗ LỖI   ${r.padEnd(28)} ${e.message.slice(0, 90)}`);
  }
  await ctx.close();
}

// điện thoại
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(`${BASE}/nhap-nhanh`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
await mp.waitForTimeout(1500);
const w = await mp.evaluate(() => ({ body: document.body.scrollWidth, win: window.innerWidth }));
console.log(`\nĐiện thoại 390px: nội dung=${w.body}px khung=${w.win}px ${w.body <= w.win + 2 ? "✓ không tràn ngang" : "✗ TRÀN NGANG"}`);
await m.close();

await browser.close();
console.log(`\n${bad === 0 ? "✓ TẤT CẢ ĐỀU VẼ ĐƯỢC, KHÔNG LỖI" : `✗ ${bad} vấn đề`}`);
process.exit(bad ? 1 : 0);
