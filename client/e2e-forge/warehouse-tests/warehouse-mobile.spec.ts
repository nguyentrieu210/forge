import { expect, test } from "@playwright/test";

const boot = {
  user: "warehouse.qa@example.test",
  full_name: "Nguyễn Kho",
  roles: ["Stock User", "Stock Manager"],
  user_permissions: {},
  lang: "vi",
  site_name: "forge-qa.localhost",
  frappe_version: "16.29.0",
  csrf_token: "qa-csrf",
  sysdefaults: {
    date_format: "dd/mm/yyyy",
    number_format: "#,###.##",
    time_zone: "Asia/Ho_Chi_Minh",
    currency: "VND",
  },
  allowed_workspaces: ["Kho"],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/method/metaforge.api.get_boot**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: boot }),
    });
  });
});

test("renders the installable warehouse experience without desktop shell", async ({ page, request }, testInfo) => {
  await page.goto("/mobile/warehouse/");

  await expect(page).toHaveTitle("Forge Kho");
  await expect(page.getByRole("img", { name: "Forge" }).first()).toBeVisible();
  await expect(page.getByText("Hôm nay cần làm gì ở kho?", { exact: true })).toBeVisible();

  for (const label of ["Trang chủ", "Nghiệp vụ", "Tra tồn", "Tôi"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  for (const label of ["Nhập kho", "Xuất kho", "Chuyển kho", "Kiểm kho"]) {
    await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
  }

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", /manifest\.webmanifest$/);
  const manifestResponse = await request.get("/mobile/warehouse/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Forge Kho");
  expect(manifest.start_url).toBe("/mobile/warehouse/");
  expect(manifest.display).toBe("standalone");

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Nhập kho", exact: true }).first().click();
  await expect(page.getByText("Tạo phiếu nghiệp vụ", { exact: true })).toBeVisible();
  await expect(page.getByText("Vật tư", { exact: true })).toBeVisible();
  await expect(page.getByText("Kho nhận", { exact: true })).toBeVisible();
  await expect(page.getByText("Số lượng", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu nhập kho", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Quay lại", exact: true }).click();
  await page.getByRole("button", { name: "Tài khoản", exact: true }).click();
  await expect(page.getByText("Nguyễn Kho", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("warehouse-mobile.png"), fullPage: true });
});
