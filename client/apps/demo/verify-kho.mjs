/**
 * Kiểm chứng bản deploy /kho bằng trình duyệt thật.
 * Chạy: node verify-kho.mjs   (trong apps/demo, nơi có playwright)
 */
import { chromium } from "playwright";

const BASE = "http://222.255.238.178/kho";
const USER = process.env.KHO_USER || "Administrator";
const PASS = process.env.KHO_PASS;

if (!PASS) { console.error("Thiếu KHO_PASS"); process.exit(2); }

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });

function log(...a) { console.log(...a); }

try {
  // ── đăng nhập ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const needLogin = await page.locator('input[type="password"]').count();
  if (needLogin) {
    await page.locator('input').first().fill(USER);
    await page.locator('input[type="password"]').fill(PASS);
    await page.getByRole("button", { name: /đăng nhập|login|sign in/i }).first().click();
    await page.waitForTimeout(5000);
  }
  log("đăng nhập:", (await page.locator('input[type="password"]').count()) ? "THẤT BẠI" : "OK");

  // ── 1. màn Nhập hàng nhanh ────────────────────────────────────────────────
  await page.goto(`${BASE}/nhap-nhanh`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const scan = page.getByPlaceholder(/quét mã vạch/i);
  log("\n── Nhập hàng nhanh ──");
  log("  ô quét hiện:", (await scan.count()) > 0);
  log("  hướng dẫn hiện:", (await page.getByText(/quét trùng một mã/i).count()) > 0);

  if (await scan.count()) {
    await scan.fill("Thép");
    await page.waitForTimeout(2200);
    const opts = await page.locator('[class*="absolute"][class*="popover"], [class*="bg-popover"]').count();
    log("  gợi ý hiện:", opts > 0);
    // chọn gợi ý đầu
    const first = page.locator('[class*="bg-popover"] button').first();
    if (await first.count()) {
      const label = (await first.textContent())?.trim().slice(0, 40);
      await first.click();
      await page.waitForTimeout(1200);
      log("  đã thêm dòng:", label);
      const qty = await page.locator('input[type="number"]').count();
      log("  ô số lượng/đơn giá:", qty);
    }
  }
  await page.screenshot({ path: "screenshots/kho-nhap-nhanh.png", fullPage: false });

  // ── 2. điện thoại ─────────────────────────────────────────────────────────
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${BASE}/nhap-nhanh`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await mob.waitForTimeout(3000);
  const bodyW = await mob.evaluate(() => document.body.scrollWidth);
  log("\n── Điện thoại 390px ──");
  log("  bề rộng nội dung:", bodyW, bodyW <= 400 ? "(không tràn ngang ✓)" : "(TRÀN NGANG ✗)");
  await mob.screenshot({ path: "screenshots/kho-nhap-nhanh-mobile.png", fullPage: false });
  await mob.close();

  // ── 3. báo cáo Tồn kho chi tiết (Prepared Report) ─────────────────────────
  await page.goto(`${BASE}/bao-cao/stock-balance`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  const rows = await page.locator('[role="row"], tbody tr').count();
  const txt = (await page.locator("body").innerText()).slice(0, 400);
  log("\n── Báo cáo Tồn kho chi tiết ──");
  log("  số dòng render:", rows);
  log("  trích nội dung:", txt.replace(/\s+/g, " ").slice(0, 200));
  await page.screenshot({ path: "screenshots/kho-stock-balance.png", fullPage: false });

  // ── 4. sổ kho (đối chứng, vốn đã chạy) ────────────────────────────────────
  await page.goto(`${BASE}/bao-cao/stock-ledger`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);
  log("  (đối chứng) Sổ kho số dòng:", await page.locator('[role="row"], tbody tr').count());

} catch (e) {
  console.error("\nLỖI:", e.message);
} finally {
  console.log("\n── Lỗi console/page ──");
  console.log(errors.length ? errors.slice(0, 12).join("\n") : "  (sạch)");
  await browser.close();
}
