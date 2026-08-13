import { expect, test, type Page } from "@playwright/test";

const ORIGIN = process.env.FORGE_ALUMDOOR_E2E_ORIGIN ?? "http://127.0.0.1:5173";
const USER = process.env.FORGE_ALUMDOOR_E2E_USER ?? "dev@example.com";
const PASSWORD = process.env.FORGE_ALUMDOOR_E2E_PASSWORD ?? "local-dev-password-1";

function assertLocalOnly(): void {
  const url = new URL(ORIGIN);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`REFUSING_REMOTE_WRITE: AlumDoor Sales create E2E only runs on localhost, got ${url.hostname}`);
  }
}

type Json = Record<string, unknown>;

async function apiJson(page: Page, path: string): Promise<Json> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, { credentials: "include" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${requestPath} -> HTTP ${response.status}: ${JSON.stringify(body)}`);
    return body as Record<string, unknown>;
  }, path);
}

async function listNames(page: Page, doctype: string, limit = 200): Promise<string[]> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    limit_page_length: String(limit),
  });
  const body = await apiJson(page, `/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`);
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map((row) => String((row as Json).name ?? "").trim()).filter(Boolean);
}

async function getDoc(page: Page, doctype: string, name: string): Promise<Json> {
  const body = await apiJson(page, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return (body.data && typeof body.data === "object" ? body.data : {}) as Json;
}

async function findCommercialFixture(page: Page): Promise<{ customer: string; priceList: string; item: string }> {
  const priceListNames = await listNames(page, "Price List");
  const priceLists: Json[] = [];
  for (const name of priceListNames) {
    const doc = await getDoc(page, "Price List", name);
    if (Number(doc.disabled ?? 0) === 0) priceLists.push(doc);
  }

  const customerNames = await listNames(page, "Customer");
  let customer = "";
  let priceList = "";
  for (const name of customerNames) {
    const doc = await getDoc(page, "Customer", name);
    const group = String(doc.price_group ?? "").trim();
    if (!group) continue;
    const preferred = String(doc.default_price_list ?? "").trim();
    const resolved = preferred && priceLists.some((row) => String(row.name ?? "") === preferred)
      ? preferred
      : String(priceLists.find((row) => String(row.price_group ?? "").trim() === group)?.name ?? "").trim();
    if (!resolved) continue;
    customer = name;
    priceList = resolved;
    break;
  }
  if (!customer || !priceList) throw new Error("LOCAL_FIXTURE_MISSING: no Customer with an active selling Price List");

  const itemPriceNames = await listNames(page, "Item Price", 500);
  let fallback = "";
  for (const priceName of itemPriceNames) {
    const price = await getDoc(page, "Item Price", priceName);
    if (Number(price.disabled ?? 0) !== 0) continue;
    if (String(price.price_list ?? "").trim() !== priceList) continue;
    if (!(Number(price.rate) > 0)) continue;
    const itemCode = String(price.item_code ?? "").trim();
    if (!itemCode) continue;
    const item = await getDoc(page, "Item", itemCode);
    if (Number(item.disabled ?? 0) !== 0) continue;
    if (item.is_sales_item != null && Number(item.is_sales_item) !== 1) continue;
    fallback ||= itemCode;
    if (String(item.inventory_mode ?? "").trim() !== "Thành phẩm theo m2") {
      return { customer, priceList, item: itemCode };
    }
  }
  if (fallback) return { customer, priceList, item: fallback };
  throw new Error(`LOCAL_FIXTURE_MISSING: no sellable Item Price in ${priceList}`);
}

async function chooseLink(page: Page, trigger: string, value: string): Promise<void> {
  await page.locator(trigger).click();
  const input = page.locator("[cmdk-input]").last();
  await expect(input).toBeVisible();
  await input.fill(value);
  await page.waitForTimeout(350);
  await input.press("Enter");
}

async function fillIfVisible(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector);
  if (await field.count() && await field.isVisible()) {
    await field.fill(value);
    await field.press("Tab");
  }
}

async function chooseFirstOptionIfVisible(page: Page, selector: string): Promise<void> {
  const trigger = page.locator(selector);
  if (!(await trigger.count()) || !(await trigger.isVisible())) return;
  await trigger.click();
  const option = page.getByRole("option").filter({ hasNotText: /^\s*$/ }).first();
  if (await option.count()) await option.click();
}

test("operator can create and read back one Sales Order on the isolated local tenant", async ({ page }) => {
  assertLocalOnly();
  await page.goto(`${ORIGIN}/app/Customer`);
  await page.locator("#mf-login-usr").fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.locator("#mf-login-usr")).toHaveCount(0, { timeout: 20_000 });

  const fixture = await findCommercialFixture(page);
  await page.goto(`${ORIGIN}/app/Sales%20Order/new`);
  await expect(page.locator('[data-surface="alumdoor-sales-order-create"]')).toBeVisible({ timeout: 20_000 });

  await chooseLink(page, "#sales-customer", fixture.customer);
  await expect(page.locator('[data-section="sales-commercial-readiness"]')).toContainText("Sẵn sàng tính giá", { timeout: 15_000 });
  await expect(page.locator('[data-section="sales-commercial-readiness"]')).toContainText(fixture.priceList);

  const host = page.locator('[data-surface="alumdoor-sales-grid-canvas-host"]');
  await expect(host).toBeVisible();
  const canvas = host.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await canvas.click({ position: { x: 110, y: 54 } });

  const itemPopup = page.locator('[data-surface="alumdoor-item-link-popup"]');
  await expect(itemPopup).toBeVisible();
  const itemTrigger = itemPopup.locator('button[id^="sales-grid-item-"]');
  await chooseLink(page, `#${await itemTrigger.getAttribute("id")}`, fixture.item);

  const grid = page.locator('[data-surface="alumdoor-sales-lines-glide-grid"]');
  await expect(grid).toHaveAttribute("data-selected-item", fixture.item, { timeout: 15_000 });

  // Complex door fixtures expose these controls only when the server says they are applicable.
  await fillIfVisible(page, '#sales-line-0-width', "1.2");
  await fillIfVisible(page, '#sales-line-0-height', "2.2");
  await fillIfVisible(page, '#sales-line-0-sets', "1");
  await fillIfVisible(page, '#sales-line-0-mesh-height', "2");
  await fillIfVisible(page, '#sales-line-0-length', "3");
  await fillIfVisible(page, '#sales-line-0-bars', "1");
  await chooseFirstOptionIfVisible(page, '#sales-line-0-color');
  await chooseFirstOptionIfVisible(page, '#sales-line-0-leaf-variant');

  await expect(grid).toHaveAttribute("data-selected-loading", "false", { timeout: 20_000 });
  const rowError = await grid.getAttribute("data-selected-error");
  expect(rowError ?? "", `selected row error: ${rowError}`).toBe("");
  await expect(grid).not.toHaveAttribute("data-selected-price", "", { timeout: 20_000 });

  await page.getByRole("button", { name: "Lưu đơn hàng" }).click();
  await page.waitForURL((url) => {
    const path = decodeURIComponent(url.pathname);
    return path.includes("/app/Sales Order/") && !path.endsWith("/new");
  }, { timeout: 30_000 });

  const decoded = decodeURIComponent(new URL(page.url()).pathname);
  const orderName = decoded.split("/").filter(Boolean).at(-1) ?? "";
  expect(orderName).not.toBe("");
  expect(orderName).not.toBe("new");

  const saved = await getDoc(page, "Sales Order", orderName);
  expect(String(saved.name ?? "")).toBe(orderName);
  expect(String(saved.customer ?? "")).toBe(fixture.customer);
  const items = Array.isArray(saved.items) ? saved.items as Json[] : [];
  expect(items.length).toBeGreaterThan(0);
  expect(items.some((row) => String(row.item_code ?? "") === fixture.item)).toBe(true);

  console.log(`ALUMDOOR_SALES_CREATE_E2E_PASS order=${orderName} customer=${fixture.customer} item=${fixture.item}`);
});
