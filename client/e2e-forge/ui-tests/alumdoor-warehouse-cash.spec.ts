import { expect, test, type Page } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const manifest = {
  id: "alumdoor",
  name: "Alumdoor",
  version: "2.2.3",
  brand: "warm",
  home: { route: "/x/alumdoor-operations%3Aworkbench" },
  domain: "alumdoor",
  nav: [
    {
      key: "alumdoor-operations:workbench",
      label: "Trung tâm vận hành",
      kind: "experience",
      icon: "panels-top-left",
      group: "Bán hàng",
    },
  ],
};

async function mockRuntime(page: Page, roles: string[]) {
  await page.route("**/api/method/metaforge.api.get_boot**", (route) => route.fulfill({
    status: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      message: {
        user: "qa@example.test",
        full_name: "QA Alumdoor",
        roles,
        user_permissions: {},
        lang: "vi",
        site_name: "alumdoor-ui.test",
        frappe_version: "16.0.0",
        csrf_token: "qa-csrf",
        sysdefaults: { date_format: "dd/mm/yyyy", number_format: "#.###,##", currency: "VND" },
        allowed_workspaces: [],
      },
    }),
  }));
  await page.route("**/api/method/metaforge.api.get_app_manifest**", (route) => route.fulfill({
    status: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: manifest }),
  }));
  await page.route("**/api/method/metaforge.api.get_application_catalog**", (route) => route.fulfill({
    status: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: { apps: [] } }),
  }));
  await page.route("**/api/method/metaforge.api.get_business_context**", (route) => route.fulfill({
    status: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: { dimensions: [], selection: {}, policies: {} } }),
  }));
}

test("Thủ kho sees the simplified purchase proposal and internal cash surface", async ({ page }) => {
  await mockRuntime(page, ["Thủ kho"]);
  await page.goto("/x/alumdoor-operations%3Aworkbench", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Trung tâm vận hành Alumdoor" })).toBeVisible();
  const cashTab = page.getByRole("tab", { name: "Đề xuất & quỹ" });
  await expect(cashTab).toBeVisible();
  await cashTab.click();

  await expect(page.getByText("Đề xuất mua & thu chi nội bộ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Đề xuất mua hàng/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Thu \/ chi nội bộ/ })).toBeVisible();
  await expect(page.getByText("Chuyển quỹ", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Kiểm quỹ / bàn giao", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /Đề xuất mua hàng/ }).click();
  await expect(page).toHaveURL(/\/app\/Material%20Request(?:\?|$)/);
});

test("Kinh doanh still does not get the finance desktop surface", async ({ page }) => {
  await mockRuntime(page, ["Kinh doanh"]);
  await page.goto("/x/alumdoor-operations%3Aworkbench", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Trung tâm vận hành Alumdoor" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đề xuất & quỹ" })).toHaveCount(0);
  await expect(page.locator('[data-testid="warehouse-cash-panel"]')).toHaveCount(0);
});
