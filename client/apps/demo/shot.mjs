import { chromium } from "@playwright/test";
const BASE="http://222.255.238.178/kho";
const b=await chromium.launch();
const page=await (await b.newContext({viewport:{width:1280,height:860}})).newPage();
await page.goto(BASE+"/",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(2000);
if (await page.locator('input[type="password"]').count()) {
  await page.locator("input").nth(0).fill("wms.demo@aphvh.local");
  await page.locator('input[type="password"]').fill("Wms@Demo2026");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);
}
await page.goto(BASE+"/app/Purchase%20Receipt/new",{waitUntil:"domcontentloaded"}); await page.waitForTimeout(5000);
await page.screenshot({path:"screenshots/form-now.png"});
const m=await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');
 const g=d.querySelector('.mf-form-section .grid');
 const cells=[...g.children].map(e=>Math.round(e.getBoundingClientRect().left));
 return JSON.stringify({title:d.querySelector('h2,[id*=radix]')?.textContent?.trim(),
  cols:getComputedStyle(g).gridTemplateColumns, fields:d.querySelectorAll('.mf-field').length,
  cotTrai:cells.filter(x=>x<600).length, cotPhai:cells.filter(x=>x>=600).length});});
console.log(m);
await b.close();
