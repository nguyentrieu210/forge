import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const BASE = "http://222.255.238.178/kho";
const OUT = "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin/078a4bb0-9ba7-48c9-aa06-0e98597c8160/scratchpad/";
let bad = 0;
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));

await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(2000);
await p.evaluate(() => localStorage.setItem("mf-setup-skip", "1"));
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
if (await p.locator('input[type="password"]').count()) {
  await p.locator("input").first().fill("Administrator");
  await p.locator('input[type="password"]').fill(process.env.KHO_PASS);
  await p.locator('button[type="submit"], button:has-text("Đăng nhập")').first().click();
  await p.waitForTimeout(4000);
}

const doCot = () => p.evaluate(() => {
  const t = document.querySelector("table"); const sc = t.closest(".overflow-auto");
  const th = [...t.querySelectorAll("thead th")];
  return {
    layout: getComputedStyle(t).tableLayout,
    khung: Math.round(sc.getBoundingClientRect().width),
    cot: th.map((x) => ({ t: x.dataset.col || "DEM", w: Math.round(x.getBoundingClientRect().width) })),
  };
});

console.log("── 1. Cot co gian day man hinh, o dinh van 68px ──");
for (const dt of ["UOM", "Warehouse"]) {
  const key = "mf-col-width:" + dt;
  await p.evaluate((k) => localStorage.removeItem(k), key);
  await p.goto(BASE + "/app/" + encodeURIComponent(dt), { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(2200);
  const a = await doCot();
  // KÉO THẬT bằng chuột trên tay nắm của cột CUỐI — đi đúng đường người dùng đi (seedWidths chạy,
  // bảng chuyển sang table-layout:fixed). Gán thẳng localStorage như trước là mô phỏng một trạng
  // thái mà app không còn tạo ra nữa, nên kiểm sai chỗ.
  // Cột GIỮA: cột đầu là cột tiêu đề (kéo nó là cố ý chốt cứng cột co giãn — kịch bản khác), còn
  // tay nắm cột cuối nằm sát mép vùng cuộn nên bị cắt mất nửa, chuột không bắt được.
  const grips = p.locator('thead th[data-col] span[role="separator"]');
  const grip = grips.nth(1);
  const box = await grip.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  const c = await doCot();
  const demA = a.cot.at(-1).w, demC = c.cot.at(-1).w;
  const leadA = a.cot[0].w, leadC = c.cot[0].w;
  const phuA = a.cot.reduce((s, x) => s + x.w, 0), phuC = c.cot.reduce((s, x) => s + x.w, 0);
  const luu = await p.evaluate((k) => localStorage.getItem(k), key);
  // Kéo mà không đổi sang `fixed` và không lưu được bề rộng nghĩa là thao tác kéo KHÔNG ăn —
  // khi đó phép kiểm phía dưới chỉ đang đo lại chế độ auto và không chứng minh được gì.
  const keoAn = c.layout === "fixed" && !!luu;
  const ok = keoAn && leadA === 68 && leadC === 68 && demA < 4 && demC < 4 && Math.abs(phuC - c.khung) < 4;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${dt.padEnd(10)} chua keo: ${a.layout} dinh=${leadA} dem=${demA} | sau keo: ${c.layout} dinh=${leadC} dem=${demC} tong=${phuC}/${c.khung}`);
  console.log(`     keo co an? ${keoAn ? "co" : "KHONG"} — da luu: ${String(luu).slice(0, 90)}`);
  console.log(`     sau khi keo: ${c.cot.map((x) => x.t + "=" + x.w).join("  ")}`);
  await p.evaluate((k) => localStorage.removeItem(k), key);
}

console.log("\n── 2. Tinh nang In ──");
await p.goto(BASE + "/print/Item/NVL-001", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(4000);
const inR = await p.evaluate(() => {
  const i = document.querySelector("iframe");
  return { co: !!i, len: (i?.getAttribute("srcdoc") || "").length, chu: document.body.innerText.replace(/\s+/g, " ").slice(0, 140) };
});
const inOk = inR.co && inR.len > 500 && !/lỗi phía máy chủ/i.test(inR.chu);
if (!inOk) bad++;
console.log(`${inOk ? "✓" : "✗"} iframe=${inR.co} srcdoc=${inR.len} ky tu | ${inR.chu.slice(0, 90)}`);

console.log("\n── 3. Xuat Excel tu man bao cao (phai ra .xlsx) ──");
await p.goto(BASE + "/bao-cao/stock-balance", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(3500);
const d1 = p.waitForEvent("download", { timeout: 30000 }).catch(() => null);
await p.locator("main button", { hasText: /Xuất/i }).first().click();
const f1 = await d1;
if (!f1) { bad++; console.log("✗ khong ra file"); }
else {
  const fp = OUT + f1.suggestedFilename();
  await f1.saveAs(fp);
  const buf = readFileSync(fp);
  const laXlsx = f1.suggestedFilename().endsWith(".xlsx") && buf[0] === 0x50 && buf[1] === 0x4b; // PK zip
  if (!laXlsx) bad++;
  console.log(`${laXlsx ? "✓" : "✗"} ${f1.suggestedFilename()} (${buf.length} byte) — dinh dang ${laXlsx ? "xlsx that (PK zip)" : "KHONG phai xlsx"}`);
}

console.log("\n── 4. Xuat Excel tu man Nhap xuat ton ──");
await p.goto(BASE + "/bao-cao/xuat-nhap-ton", { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(3500);
const d2 = p.waitForEvent("download", { timeout: 30000 }).catch(() => null);
await p.getByRole("button", { name: /Xuất Excel/i }).click();
const f2 = await d2;
if (!f2) { bad++; console.log("✗ khong ra file"); }
else { await f2.saveAs(OUT + "xnt.xlsx"); console.log(`✓ ${f2.suggestedFilename()}`); }

if (errs.length) { bad++; console.log("\n✗ loi JS: " + errs.slice(0, 3).join(" | ")); }
await b.close();
console.log(bad === 0 ? "\n✓ TAT CA DEU DAT" : `\n✗ ${bad} van de`);
process.exit(bad ? 1 : 0);
