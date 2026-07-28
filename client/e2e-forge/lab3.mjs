import { chromium } from "@playwright/test";
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${O}/app/Customer`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(6000);
const out = await page.evaluate(async () => {
  const r = await fetch("/api/method/frappe.desk.form.load.getdoctype?doctype=Customer&with_parent=1", { headers: { accept: "application/json" } });
  const j = await r.json();
  const docs = j.docs ?? j.message?.docs ?? [];
  return { status: r.status, keys: Object.keys(j).slice(0,5), n: docs.length, first: docs[0] ? { name: docs[0].name, label: docs[0].label } : null };
});
console.log(JSON.stringify(out));
await browser.close();
