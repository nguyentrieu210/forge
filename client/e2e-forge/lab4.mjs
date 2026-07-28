import { chromium } from "@playwright/test";
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${O}/app/Customer`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(6000);
await page.goto(`${O}/app/Customer/new`);
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll("*")) {
    const own = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join("").trim();
    if (/^Tạo\b/.test(own)) hits.push({ tag: el.tagName, cls: (el.className||"").toString().slice(0,60), text: own });
  }
  return hits.slice(0,6);
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
