/**
 * One-shot diagnostic: loads the Desk in a real browser and reports what it actually
 * rendered, plus every console error and failed request.
 *
 * Kept because "the element was not found" is not a diagnosis — the useful question is
 * whether the page loaded at all, whether a request failed, and what the app decided
 * to show instead.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.FORGE_BASE ?? "http://127.0.0.1:4191";
const PATHNAME = process.env.FORGE_PATH ?? "/app/Field%20Visit";

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const failures = [];
const apiCalls = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));
page.on("requestfailed", (request) => failures.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`));
page.on("response", async (response) => {
  const url = response.url();
  // Everything except static assets: a failing request outside /api is just as capable
  // of blanking a screen.
  if (/\.(js|css|map|woff2?|png|svg|ico)(\?|$)/.test(url)) return;
  let snippet = "";
  try {
    const text = await response.text();
    snippet = text.slice(0, 200).replace(/\s+/g, " ");
  } catch { snippet = "(unreadable)"; }
  apiCalls.push(`${response.status()} ${response.request().method()} ${url.replace(BASE, "")} :: ${snippet}`);
});

await page.goto(`${BASE}${PATHNAME}`, { waitUntil: "networkidle", timeout: 60_000 });

// Optionally sign in first, so the diagnostic can inspect an authenticated screen.
if (process.env.FORGE_LOGIN === "1") {
  const user = process.env.FORGE_USER ?? "dev@example.com";
  const password = process.env.FORGE_PASSWORD ?? "local-dev-password-1";
  // The demo's own login screen uses `#usr`/`#pwd`; an app scaffolded by
  // create-metaforge-app uses the shell's `LoginForm`, whose ids are `#mf-login-*`.
  // Both are accepted so one diagnostic works against either kind of app.
  await page.locator("#usr, #mf-login-usr").first().fill(user);
  await page.locator("#pwd, #mf-login-pwd").first().fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForTimeout(4000);
  await page.goto(`${BASE}${PATHNAME}`, { waitUntil: "networkidle", timeout: 60_000 });
}
// A moment past networkidle: the boot call resolves and the app re-renders after it.
await page.waitForTimeout(3000);

console.log("=== url ===");
console.log(page.url());
console.log("\n=== title ===");
console.log(await page.title());
console.log("\n=== visible text (first 1200 chars) ===");
console.log((await page.locator("body").innerText().catch(() => "(no body text)")).slice(0, 1200));
console.log("\n=== #root html (first 800 chars) ===");
console.log((await page.locator("#root").innerHTML().catch(() => "(no #root)")).slice(0, 3000));
console.log("\n=== api calls ===");
for (const call of apiCalls) console.log(`  ${call}`);
console.log("\n=== console errors ===");
for (const error of consoleErrors) console.log(`  ${error}`);
console.log("\n=== failed requests ===");
for (const failure of failures) console.log(`  ${failure}`);

await browser.close();
