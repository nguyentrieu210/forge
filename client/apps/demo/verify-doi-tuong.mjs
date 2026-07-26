/**
 * Đối chiếu màn "Nhập/xuất theo đối tác" bằng một phép cộng ĐỘC LẬP từ API.
 * Gom nhóm sai (lẫn đối tượng, cộng trùng dòng hàng) vẫn cho ra bảng trông hợp lý — chỉ có đối
 * chiếu tổng và số nhóm mới phát hiện được.
 */
import { chromium } from "@playwright/test";
const BASE = "http://222.255.238.178/kho";
const PASS = process.env.KHO_PASS;
const FROM = process.env.DT_FROM || "2020-01-01";
const TO = process.env.DT_TO || "2026-12-31";
let cookie = "", bad = 0;

async function api(p, o = {}) {
  const r = await fetch(BASE + p, { ...o, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(o.headers || {}) } });
  const sc = r.headers.getSetCookie?.() ?? [];
  if (sc.length) cookie = sc.map((c) => c.split(";")[0]).join("; ");
  return r.json().catch(() => null);
}
const qs = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`).join("&");

await api("/api/method/login", { method: "POST", body: JSON.stringify({ usr: "Administrator", pwd: PASS }) });

async function goc(DT, field, CHILD) {
  const cts = (await api(`/api/method/frappe.client.get_list?${qs({
    doctype: DT, fields: ["name", field], filters: [["docstatus", "=", 1], ["posting_date", "between", [FROM, TO]]], limit_page_length: 500,
  })}`))?.message ?? [];
  const rows = cts.length ? (await api(`/api/method/frappe.client.get_list?${qs({
    doctype: CHILD, parent: DT, fields: ["parent", "item_code", "qty", "amount"],
    filters: [["parent", "in", cts.map((c) => c.name)]], limit_page_length: 3000,
  })}`))?.message ?? [] : [];
  const theoCt = new Map(cts.map((c) => [c.name, c[field]]));
  const doiTuong = new Set(), capHang = new Set();
  let tong = 0;
  for (const r of rows) {
    doiTuong.add(theoCt.get(r.parent));
    capHang.add(`${theoCt.get(r.parent)}::${r.item_code}`);
    tong += Number(r.amount) || 0;
  }
  return { soCt: cts.length, soDoiTuong: doiTuong.size, soCapHang: capHang.size, tong: Math.round(tong) };
}

const gNhap = await goc("Purchase Receipt", "supplier", "Purchase Receipt Item");
const gXuat = await goc("Delivery Note", "customer", "Delivery Note Item");
console.log(`API goc NHAP: ${gNhap.soCt} phieu, ${gNhap.soDoiTuong} NCC, ${gNhap.soCapHang} dong hang, tong=${gNhap.tong}`);
console.log(`API goc XUAT: ${gXuat.soCt} phieu, ${gXuat.soDoiTuong} KH,  ${gXuat.soCapHang} dong hang, tong=${gXuat.tong}`);

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(() => localStorage.setItem("mf-setup-skip", "1"));
await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(2000);
if (await p.locator('input[type="password"]').count()) {
  await p.locator("input").first().fill("Administrator");
  await p.locator('input[type="password"]').fill(PASS);
  await p.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await p.waitForTimeout(4000);
}
await p.goto(BASE + "/bao-cao/tong-hop-doi-tuong", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
await p.locator('input[type="date"]').first().fill(FROM);
await p.locator('input[type="date"]').nth(1).fill(TO);
await p.waitForTimeout(3500);

const viNum = (s) => Number(String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
const check = (ten, a, c, ss = 1) => {
  const ok = Math.abs(a - c) <= ss;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${ten.padEnd(28)} man=${a}  api=${c}`);
};

async function doMan(nhan, g) {
  const ui = await p.evaluate(() => {
    const tr = [...document.querySelectorAll("tbody tr")];
    const nhom = tr.filter((r) => r.className.includes("bg-muted/40"));
    return {
      soNhom: nhom.length,
      soDongHang: tr.length - nhom.length,
      chan: document.body.innerText.split("\n").filter((l) => /Tổng (giá trị nhập|doanh thu)/.test(l)).join(" "),
      chanFull: document.body.innerText,
    };
  });
  console.log(`\n── ${nhan} ──`);
  check("so nhom doi tuong", ui.soNhom, g.soDoiTuong, 0);
  check("so dong hang", ui.soDongHang, g.soCapHang, 0);
  const m = /Tổng (?:giá trị nhập|doanh thu)\s*([\d.,]+)/.exec(ui.chanFull);
  check("tong tien", m ? viNum(m[1]) : NaN, g.tong);
}
await doMan("NHAP theo nha cung cap", gNhap);

await p.getByRole("button", { name: "Xuất theo khách hàng" }).click();
await p.waitForTimeout(3500);
await doMan("XUAT theo khach hang", gXuat);

if (errs.length) { bad++; console.log(`\n✗ loi JS: ${errs.slice(0, 2).join(" | ")}`); }
await b.close();
console.log(bad === 0 ? "\n✓ KHOP PHEP CONG DOC LAP" : `\n✗ ${bad} sai lech`);
process.exit(bad ? 1 : 0);
