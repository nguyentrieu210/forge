import { chromium } from "@playwright/test";
const O = "https://alu.kairo.vn";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`${O}/app/Customer`);
await page.locator("#mf-login-usr").fill("admin");
await page.locator("#mf-login-pwd").fill("admin@2026");
await page.getByRole("button", { name: "Đăng nhập" }).click();
await page.waitForTimeout(7000);

const RAW = ["Customer","Sales Order","Sales Invoice","Aluminium Lot","Aluminium Cut","Work Order","Bill of Materials","Delivery Note","Stock Entry","Price List","Item Price","Pricing Rule","Payment Entry","Quotation","Warehouse","Item"];
const re = (r) => new RegExp(`(^|[\s>(\[«"'])${r}([\s<)\]»"':,.]|$)`,"m");
let dirty = 0;
const screens = [["/app/Customer","DS Khách hàng"],["/app/Customer/new","Tạo khách hàng"],["/app/Sales%20Order","DS Đơn hàng"],
  ["/app/Sales%20Order/new","Tạo đơn hàng"],["/app/Work%20Order/new","Tạo lệnh SX"],["/app/Bill%20of%20Materials/new","Tạo BOM"],
  ["/permissions","Phân quyền"],["/x/action%3Acat-nhom","Cắt nhôm"],["/report/"+encodeURIComponent("Xuất nhập tồn"),"BC xuất nhập tồn"]];
for (const [path,label] of screens) {
  await page.goto(O+path); await page.waitForTimeout(4000);
  const body = await page.locator("body").innerText();
  const found = RAW.filter(r => re(r).test(body));
  if (found.length) dirty += 1;
  console.log(`${label.padEnd(18)} ${found.length ? "CÒN: "+found.join(", ") : "sạch"}`);
}
console.log(dirty ? `\n${dirty} màn còn tên kỹ thuật` : "\nKHÔNG CÒN TÊN KỸ THUẬT TRÊN GIAO DIỆN");
await browser.close();
