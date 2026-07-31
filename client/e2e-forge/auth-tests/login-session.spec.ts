import { expect, test, type Page } from "@playwright/test";

const USER = process.env.FORGE_AUTH_USER;
const PASSWORD = process.env.FORGE_AUTH_PASSWORD;
if (!USER || !PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");

async function boot(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/method/metaforge.api.get_boot", { credentials: "same-origin" });
    const body = await response.json().catch(() => null) as { message?: { user?: string; csrf_token?: string } } | null;
    return { status: response.status, value: body?.message ?? body };
  });
}

async function login(page: Page, password: string) {
  await page.locator("#mf-login-usr").fill(USER);
  await page.locator("#mf-login-pwd").fill(password);
  await page.getByRole("button", { name: /^Đăng nhập$/ }).click();
}

test("Alumdoor LoginForm preserves a real cookie session across logout and re-login", async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await page.goto("/?alumdoor=1");
  await expect(page.locator("[data-alumdoor-landing]")).toBeVisible();
  await expect(page.locator("#mf-login-usr")).toBeVisible();

  await login(page, `${PASSWORD}-wrong`);
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === "sid" && cookie.value !== "Guest")).toBe(false);

  await login(page, PASSWORD);
  await expect(page.locator("#mf-login-usr")).toBeHidden();

  const firstCookies = await context.cookies();
  expect(firstCookies.some((cookie) => cookie.name === "sid" && cookie.value && cookie.value !== "Guest")).toBe(true);

  const firstBoot = await boot(page);
  expect(firstBoot.status).toBe(200);
  expect(firstBoot.value?.user).toBe(USER);
  expect(firstBoot.value?.csrf_token).toBeTruthy();

  const logout = await page.evaluate(async (csrf) => {
    const response = await fetch("/api/method/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-frappe-csrf-token": csrf },
    });
    return { status: response.status, text: await response.text() };
  }, firstBoot.value?.csrf_token ?? "");
  expect(logout.status, logout.text).toBe(200);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  expect((await boot(page)).status).toBe(403);

  await login(page, PASSWORD);
  await expect(page.locator("#mf-login-usr")).toBeHidden();
  const secondBoot = await boot(page);
  expect(secondBoot.status).toBe(200);
  expect(secondBoot.value?.user).toBe(USER);

  expect(pageErrors).toEqual([]);
});
