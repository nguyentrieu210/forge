import { expect, test, type Page } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const manifest = {
  id: "alumdoor",
  name: "Alumdoor",
  version: "2.2.0",
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

test("Thủ kho sees Warehouse Cash and opens the canonical voucher list", async ({ page }) => {
  await mockRuntime(page, ["Thủ kho"]);
  await page.goto("/x/alumdoor-operations%3Aworkbench", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Trung tâm vận hành Alumdoor" })).toBeVisible();
  const cashTab = page.getByRole("tab", { name: "Quỹ kho" });
  await expect(cashTab).toBeVisible();
  await cashTab.click();

  await expect(page.getByText("Quỹ tiền mặt theo từng kho", { exact: true })).toBeVisible();
  await expect(page.getByText("Thanh toán trực tiếp công nợ Purchase/Sales Invoice vẫn đi qua Payment Entry.", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: /Phiếu thu \/ chi kho/ }).click();
  await expect(page).toHaveURL(/\/app\/Warehouse%20Cash%20Voucher(?:\?|$)/);
});

test("Kinh doanh does not see Warehouse Cash operations", async ({ page }) => {
  await mockRuntime(page, ["Kinh doanh"]);
  await page.goto("/x/alumdoor-operations%3Aworkbench", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Trung tâm vận hành Alumdoor" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Quỹ kho" })).toHaveCount(0);
  await expect(page.locator('[data-testid="warehouse-cash-panel"]')).toHaveCount(0);
});
