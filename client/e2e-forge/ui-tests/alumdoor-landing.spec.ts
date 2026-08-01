import { expect, test, type Page } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

async function mockGuestSession(page: Page) {
  const guest = JSON.stringify({
    exc_type: "PermissionError",
    exception: "frappe.exceptions.PermissionError: Guest",
  });
  await page.route("**/api/method/metaforge.api.get_app_manifest**", (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: null }) }),
  );
  await page.route("**/api/method/metaforge.api.get_boot**", (route) =>
    route.fulfill({ status: 403, headers: JSON_HEADERS, body: guest }),
  );
}

test("renders only the Alumdoor login with the official full logo", async ({ page }, testInfo) => {
  await mockGuestSession(page);
  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-alumdoor-login]")).toBeVisible();
  await expect(page.locator("[data-alumdoor-landing]")).toHaveCount(0);
  await expect(page.locator('form img[alt="Alumdoor"]')).toHaveAttribute("src", "/alumdoor/logo.png");
  await expect(page.getByRole("heading", { name: "Đăng nhập Alumdoor" })).toBeVisible();
  await expect(page.locator("#mf-login-usr")).toBeFocused();
  await expect(page.locator("#mf-login-pwd")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("alumdoor-login-only.png"), fullPage: true });
});
