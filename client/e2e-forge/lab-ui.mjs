import { chromium } from "@playwright/test";
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`${O}/app/Customer`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(7000);

const RAW = ["Customer","Sales Order","Sales Invoice","Aluminium Lot","Aluminium Cut","Work Order","Bill of Materials","Delivery Note","Stock Entry","Price List","Item Price","Pricing Rule","Payment Entry","Quotation","Warehouse"];
for (const [path,label] of [["/app/Customer","Khách hàng"],["/app/Sales%20Order","Đơn hàng"],["/app/Work%20Order","Lệnh sản xuất"],["/permissions","Phân quyền"]]) {
  await page.goto(O+path); await page.waitForTimeout(4500);
  const body = await page.locator("body").innerText();
  const found = RAW.filter(r => new RegExp(`(^|[\s>(\[])${r}([\s<)\]]|$)`,"m").test(body));
  console.log(`${path.padEnd(22)} còn tên kỹ thuật: ${found.length ? found.join(", ") : "— sạch —"}`);
}
// Mở form tạo mới để xem tiêu đề
await page.goto(O+"/app/Customer"); await page.waitForTimeout(4000);
const btn = page.getByRole("button", { name: /Tạo mới|Thêm/ }).first();
if (await btn.count()) { await btn.click(); await page.waitForTimeout(3000);
  const t = await page.locator("body").innerText();
  const m = t.match(/Tạo [^\n]*/); console.log("tiêu đề tạo mới:", m ? m[0] : "(không thấy)"); }
await page.screenshot({ path: "lab-create.png", fullPage: false });
await browser.close();
