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

test("renders the full Alumdoor landing catalog with official media and no horizontal overflow", async ({ page }, testInfo) => {
  await mockGuestSession(page);
  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });

  const landing = page.locator("[data-alumdoor-landing]");
  await expect(landing).toBeVisible();
  await expect(page.getByRole("heading", { name: /Nâng tầm cửa Việt/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đăng nhập Alumdoor" })).toBeVisible();

  const warehousePwa = page.getByRole("link", { name: "App kho điện thoại", exact: true });
  await expect(warehousePwa).toBeVisible();
  await expect(warehousePwa).toHaveAttribute("href", "/mobile/warehouse/");

  await expect(page.getByText("Miễn phí tư vấn", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Đo đạc kích thước", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Lắp đặt tận nơi", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chế độ bảo hành", { exact: true }).first()).toBeVisible();

  await expect(page.getByRole("heading", { name: "Cửa cuốn tấm liền công nghệ Úc" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cửa cuốn nan nhôm công nghệ Đức" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cửa cuốn lưới mắt võng và song ngang" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Motor, UPS và phụ kiện an toàn" })).toBeVisible();

  const vip = page.getByRole("link", { name: /VIP-ST500/i });
  await expect(vip).toHaveAttribute("href", "https://alumdoor.vn/san-pham/cua-cuon-duc-vipst500/");

  const officialLogo = await page.locator(".mf-brand-mark").first().evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(officialLogo).toContain("alumdoor.vn/wp-content/uploads/2022/04/logo-am-ban-doi-alumdoor");

  const heroBackground = await landing.locator("main > section").first().evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(heroBackground).toContain("ALUMDOOR-PRODUCT_Artboard-24.png.webp");

  const productBackground = await page.locator("#cua-duc a.group > div").first().evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(productBackground).toContain("alumdoor.vn/wp-content/uploads/");

  await expect(page.getByText(/0317172142/)).toBeVisible();
  await expect(page.getByText(/cskh\.alumdoor@gmail\.com/)).toBeVisible();

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("alumdoor-landing.png"), fullPage: true });
});
