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

test("renders the installable Alumdoor warehouse experience without desktop shell", async ({ page, request }, testInfo) => {
  await page.goto("/mobile/warehouse/");

  await expect(page).toHaveTitle("Alumdoor Kho");
  await expect(page.locator('img[alt="Alumdoor"]:visible')).toBeVisible();
  await expect(page.getByText("Hôm nay cần làm gì ở kho?", { exact: true })).toBeVisible();

  for (const label of ["Trang chủ", "Nghiệp vụ", "Tra tồn", "Tôi"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const bottomNav = page.getByRole("navigation", { name: "Điều hướng app kho" });
  await expect(bottomNav).toBeVisible();
  await expect.poll(() => bottomNav.evaluate((element) => Math.round(element.closest("footer")!.getBoundingClientRect().bottom - window.innerHeight))).toBe(0);
  for (const label of ["Nhập kho", "Xuất kho", "Chuyển kho", "Kiểm kho"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${label}`) }).first()).toBeVisible();
  }

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", /manifest\.webmanifest$/);
  const manifestResponse = await request.get("/mobile/warehouse/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Alumdoor Kho");
  expect(manifest.start_url).toBe("/mobile/warehouse/");
  expect(manifest.scope).toBe("/mobile/warehouse/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#f45b24");
  expect(manifest.icons[0]?.src).toBe("alumdoor-app-192.png");
  expect(manifest.icons[1]?.purpose).toBe("maskable");

  const iconResponse = await request.get("/mobile/warehouse/alumdoor-app-192.png");
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/png");
  expect((await iconResponse.body()).byteLength).toBeGreaterThan(1_000);

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Xem tất cả", exact: true }).click();
  await expect(page.getByText("Chọn nghiệp vụ", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=actions/);
  await page.getByRole("button", { name: "Trang chủ", exact: true }).click();
  await expect(page.getByText("Hôm nay cần làm gì ở kho?", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Nhập kho/ }).first().click();
  await expect(page.getByText("Tạo phiếu nghiệp vụ", { exact: true })).toBeVisible();
  await expect(page.getByText("Vật tư", { exact: true })).toBeVisible();
  await expect(page.getByText("Kho nhận", { exact: true })).toBeVisible();
  await expect(page.getByText("Số lượng", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu nhập kho", exact: true })).toBeVisible();
  await expect(bottomNav).toBeVisible();
  await expect(page.getByRole("button", { name: "Nghiệp vụ", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/mobile\/warehouse\//);
  await expect(page.getByText("Hôm nay cần làm gì ở kho?", { exact: true })).toBeVisible();
  await expect(bottomNav).toBeVisible();
  await page.getByRole("button", { name: "Tài khoản", exact: true }).click();
  await expect(page.getByText("Nguyễn Kho", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("warehouse-mobile.png"), fullPage: true });
});

test("warehouse actions translate legacy mobile fields to canonical stock contracts", async ({ page }) => {
  const stockEntries: Array<Record<string, unknown>> = [];
  const reconciliations: Array<Record<string, unknown>> = [];

  await page.route(/\/api\/resource\/Warehouse\/.+$/, async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1) ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { doctype: "Warehouse", name, company: "ALUMDOOR" } }),
    });
  });
  await page.route(/\/api\/resource\/Stock(?:%20| )Entry$/, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    stockEntries.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...body, doctype: "Stock Entry", name: `QA-SE-${stockEntries.length}`, docstatus: 0 } }),
    });
  });
  await page.route(/\/api\/resource\/Stock(?:%20| )Reconciliation$/, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    reconciliations.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...body, doctype: "Stock Reconciliation", name: "QA-SR-1", docstatus: 0 } }),
    });
  });

  const fillCommon = async (action: "receipt" | "issue" | "transfer" | "count") => {
    await page.goto(`/mobile/warehouse/?tab=actions&action=${action}`);
    await page.getByPlaceholder("Quét hoặc nhập mã vật tư").fill("QA-PURCHASE-ITEM");
    const sourcePlaceholder = action === "receipt" ? "Tìm kho" : action === "transfer" || action === "issue" ? "Tìm kho" : "Tìm kho";
    await page.getByPlaceholder(sourcePlaceholder).first().fill("K36");
    if (action === "transfer") await page.getByPlaceholder("Tìm kho đích").fill("K37");
  };

  await fillCommon("receipt");
  await page.getByRole("button", { name: "Lưu nhập kho", exact: true }).click();
  await expect.poll(() => stockEntries.length).toBe(1);

  await fillCommon("issue");
  await page.getByRole("button", { name: "Lưu xuất kho", exact: true }).click();
  await expect.poll(() => stockEntries.length).toBe(2);

  await fillCommon("transfer");
  await page.getByRole("button", { name: "Lưu chuyển kho", exact: true }).click();
  await expect.poll(() => stockEntries.length).toBe(3);

  await fillCommon("count");
  await page.getByRole("button", { name: "Lưu kiểm kho", exact: true }).click();
  await expect.poll(() => reconciliations.length).toBe(1);

  const [receipt, issue, transfer] = stockEntries;
  expect(receipt).toMatchObject({ company: "ALUMDOOR", purpose: "Material Receipt" });
  expect(String(receipt?.posting_at)).toMatch(/^\d{4}-\d{2}-\d{2} 12:00:00$/);
  expect(receipt).not.toHaveProperty("posting_date");
  expect(receipt).not.toHaveProperty("stock_entry_type");
  expect((receipt?.items as Array<Record<string, unknown>>)[0]).toMatchObject({
    item_code: "QA-PURCHASE-ITEM",
    target_warehouse: "K36",
  });
  expect((receipt?.items as Array<Record<string, unknown>>)[0]).not.toHaveProperty("t_warehouse");

  expect(issue).toMatchObject({ company: "ALUMDOOR", purpose: "Material Issue" });
  expect((issue?.items as Array<Record<string, unknown>>)[0]).toMatchObject({ source_warehouse: "K36" });
  expect((issue?.items as Array<Record<string, unknown>>)[0]).not.toHaveProperty("s_warehouse");

  expect(transfer).toMatchObject({ company: "ALUMDOOR", purpose: "Material Transfer" });
  expect((transfer?.items as Array<Record<string, unknown>>)[0]).toMatchObject({
    source_warehouse: "K36",
    target_warehouse: "K37",
  });

  const reconciliation = reconciliations[0]!;
  expect(reconciliation).toMatchObject({
    warehouse: "K36",
    scope: "Một mặt hàng",
    item_code: "QA-PURCHASE-ITEM",
    counted_by: boot.user,
  });
  expect(String(reconciliation.snapshot_at)).toMatch(/^\d{4}-\d{2}-\d{2} 12:00:00$/);
  expect(reconciliation).not.toHaveProperty("posting_date");
  expect((reconciliation.items as Array<Record<string, unknown>>)[0]).toMatchObject({
    item_code: "QA-PURCHASE-ITEM",
    counted_qty: 1,
    variance_reason: "Khác",
  });
  expect((reconciliation.items as Array<Record<string, unknown>>)[0]).not.toHaveProperty("qty");
});
