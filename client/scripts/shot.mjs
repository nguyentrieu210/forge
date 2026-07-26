import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "screenshots";
mkdirSync(OUT, { recursive: true });
const base = process.env.SHOT_BASE ?? "http://localhost:8091";
const browser = await chromium.launch();

async function shot(name, path, theme, size = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport: size });
  await ctx.addInitScript((t) => localStorage.setItem("metaforge-theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

await shot("shell-form-1280-light", "/view/form", "light");
await shot("shell-form-1280-dark", "/view/form", "dark");
await shot("shell-list-1280-light", "/view/list", "light");
await shot("shell-list-390-light", "/view/list", "light", { width: 390, height: 780 });
await browser.close();
console.log("done");
