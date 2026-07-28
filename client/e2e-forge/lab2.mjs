import { chromium } from "@playwright/test";
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`${O}/app/Customer`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(7000);
for (const dt of ["Customer","Work Order","Aluminium Lot"]) {
  await page.goto(`${O}/app/${encodeURIComponent(dt)}/new`);
  await page.waitForTimeout(4500);
  const title = await page.getByRole("dialog").locator("h2, [class*=DialogTitle]").first().innerText().catch(async () => {
    const b = await page.locator("body").innerText(); const m = b.match(/Tạo [^\n]{0,40}/); return m ? m[0] : "(không thấy)"; });
  console.log(`${dt.padEnd(16)} tiêu đề form tạo: "${title}"`);
}
await page.screenshot({ path: "lab-create2.png" });
await browser.close();
