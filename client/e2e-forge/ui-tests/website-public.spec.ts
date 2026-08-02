import { expect, test } from "@playwright/test";

const publicPage = {
  site: {
    title: "Forge Website QA",
    description: "Website public tenant QA",
    home_page: "home",
    template_preset: "sales",
    template_version: 1,
    theme_preset: "business-blue",
    theme_version: 1,
    contact_phone: "0900000000",
    contact_email: "qa@forge.test",
    address: "Hà Nội",
    footer_text: "Website được render từ metadata tenant.",
  },
  theme: {
    primary: "#123456",
    secondary: "#0f766e",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    muted: "#64748b",
    heading_font: "system",
    body_font: "system",
    radius: "soft",
    density: "comfortable",
  },
  navigation: [
    { slug: "home", label: "Trang chủ" },
    { slug: "products", label: "Sản phẩm" },
  ],
  page: {
    slug: "home",
    title: "Trang chủ",
    meta_title: "Forge Website QA Home",
    meta_description: "Metadata website browser acceptance",
    blocks: [
      {
        id: "hero",
        type: "hero",
        eyebrow: "WEBSITE/CMS V1",
        heading: "Website public QA",
        body: "Shared runtime phải render metadata tenant mà không vào ERP AuthBoundary.",
        button_label: "Xem sản phẩm",
        button_url: "/products",
        tone: "primary",
        align: "left",
        columns: 1,
        source: "none",
        limit: 1,
      },
      {
        id: "products",
        type: "product-grid",
        heading: "Sản phẩm QA",
        tone: "neutral",
        align: "left",
        columns: 2,
        source: "storefront-catalog",
        limit: 2,
      },
    ],
  },
};

test("published tenant website renders metadata, theme and canonical storefront", async ({ page }, testInfo) => {
  let websiteRequests = 0;
  let storefrontRequests = 0;

  await page.route("**/api/method/forge.website.page*", async (route) => {
    websiteRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: publicPage }),
    });
  });

  await page.route("**/api/method/forge.storefront.catalog*", async (route) => {
    storefrontRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: {
          items: [
            {
              name: "ITEM-QA",
              item_code: "ITEM-QA",
              item_name: "Cửa nhôm QA",
              retail_price: 123456,
              short_description: "Sản phẩm public lấy từ Storefront canonical.",
              slug: "cua-nhom-qa",
            },
          ],
        },
      }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Website public QA" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng website" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("heading", { name: "Cửa nhôm QA" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cửa nhôm QA/ })).toHaveAttribute("href", "/shop/cua-nhom-qa");
  await expect(page).toHaveTitle("Forge Website QA Home");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Metadata website browser acceptance");

  const primary = await page.locator("#root > div").evaluate((node) => getComputedStyle(node).getPropertyValue("--site-primary").trim());
  expect(primary).toBe("#123456");
  expect(websiteRequests).toBe(1);
  expect(storefrontRequests).toBe(1);

  await page.screenshot({
    path: testInfo.outputPath("website-public-home.png"),
    fullPage: true,
    animations: "disabled",
  });
});
