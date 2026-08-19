/**
 * Chụp mốc thị giác của Desk đang chạy — để design được KIỂM CHỨNG chứ không phải đoán.
 *
 * Chương trình UI V3 trước đây được làm rồi phải revert nguyên khối. Công cụ này tồn tại để
 * lần sau nhìn thấy trước–sau trên bản build thật, đăng nhập thật, qua cookie proxy same-origin.
 *
 * Dựng stack local (tenant-worker đứng một mình BẮT BUỘC `AUTH_MODE=development`, xem
 * `apps/tenant-worker/wrangler.alumdoor-local.jsonc`; config `production` đòi identity do
 * gateway ký):
 *
 *   cd server
 *   node scripts/ensure-dev-vars.mjs && node scripts/ensure-alumdoor-local-vars.mjs
 *   npx wrangler d1 migrations apply cloudforge-demo --local --config apps/tenant-worker/wrangler.jsonc
 *   node scripts/seed-local.mjs --user dev@example.com --password local-dev-password-1
 *   npx wrangler dev --config apps/tenant-worker/wrangler.alumdoor-local.jsonc --port 8823 --local
 *   # app cài theo thứ tự phụ thuộc:
 *   FORGE_ADMIN_PASSWORD=... node scripts/forge-app.mjs apps-src/hrm          --origin http://127.0.0.1:8823 --admin dev@example.com
 *   FORGE_ADMIN_PASSWORD=... node scripts/forge-app.mjs apps-src/vn-accounting --origin http://127.0.0.1:8823 --admin dev@example.com
 *   FORGE_ADMIN_PASSWORD=... node scripts/forge-app.mjs briefs/alumdoor-v2.json --origin http://127.0.0.1:8823 --admin dev@example.com
 *
 *   cd client/e2e-forge
 *   APP_DIST=../apps/runtime/dist BACKEND=http://127.0.0.1:8823 PORT=4323 node serve-cookie-proxy.mjs
 *   BASE=http://127.0.0.1:4323 OUT=shots-before pnpm capture:ui
 *
 * Đăng nhập bằng CHÍNH form của app: đường `/api/method/login` trần thiếu CSRF token.
 *
 * Local-only. Không trỏ vào tenant thật, không `--remote`.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:4300";
const USER = process.env.USER_EMAIL ?? "dev@example.com";
const PASS = process.env.USER_PASSWORD ?? "local-dev-password-1";
const OUT = process.env.OUT ?? "shots";

mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

async function shoot(page, name, settle = 900) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log(`  shot ${name}`);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("metaforge-theme", t); } catch { /* ignore */ }
  }, theme);
  await page.waitForTimeout(400);
}

/** Hộp thoại "Chọn giao diện của bạn" chặn mọi ảnh chụp sau đăng nhập. */
async function dismissWelcome(page) {
  for (const label of [/Bắt đầu/i, /Xong/i, /Đóng/i, /Tiếp tục/i, /Lưu/i]) {
    const b = page.getByRole("button", { name: label });
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(500); return true; }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  return false;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

const errors = [];
const failed = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, "")}`); });

log("dang nhap...");
await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#mf-login-usr", { timeout: 45000 });
await shoot(page, "01-login-light", 600);
await setTheme(page, "dark");
await shoot(page, "02-login-dark", 500);
await setTheme(page, "light");

// Đăng nhập bằng CHÍNH form của app: đường API trần thiếu CSRF token, còn app tự lấy
// token đó khi boot. Điền rồi kiểm lại giá trị vì form có thể re-mount và xoá mất.
for (let attempt = 1; attempt <= 3; attempt += 1) {
  await page.fill("#mf-login-usr", USER);
  await page.fill("#mf-login-pwd", PASS);
  const ok = (await page.inputValue("#mf-login-usr")) === USER && (await page.inputValue("#mf-login-pwd")) === PASS;
  if (!ok) { log(`  (lan ${attempt}: form bi xoa, dien lai)`); await page.waitForTimeout(800); continue; }
  await page.click('form button[type="submit"]');
  break;
}

// Chờ shell thật xuất hiện thay vì đoán thời gian.
await page.waitForSelector(".mf-shell", { timeout: 60000 }).catch(() => log("  (khong thay .mf-shell)"));
await page.waitForTimeout(3000);
await dismissWelcome(page);
await shoot(page, "03-desk-home-light", 1500);
await setTheme(page, "dark");
await shoot(page, "04-desk-home-dark", 900);
await setTheme(page, "light");

const nav = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".mf-shell-nav-item"))
    .map((n) => (n.textContent || "").trim()).filter(Boolean));
log("sidebar (" + nav.length + "):", JSON.stringify(nav.slice(0, 30)));

const routes = [
  ["/app/Sales%20Order", "05-list-sales-order"],
  ["/app/Item", "06-list-item"],
  ["/app/Sales%20Order/new", "07-form-sales-order-new"],
  ["/__master-data", "08-master-data"],
];
for (const [route, name] of routes) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shoot(page, name, 600);
}

await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
await page.setViewportSize({ width: 1280, height: 860 });
await shoot(page, "09-desk-1280", 800);
await page.setViewportSize({ width: 768, height: 1000 });
await shoot(page, "10-desk-768", 800);

log("\n--- request hong (" + failed.length + ") ---");
for (const f of [...new Set(failed)].slice(0, 15)) log("  " + f);
log("--- loi console (" + errors.length + ") ---");
for (const e of [...new Set(errors)].slice(0, 10)) log("  " + e.slice(0, 150));

await browser.close();
