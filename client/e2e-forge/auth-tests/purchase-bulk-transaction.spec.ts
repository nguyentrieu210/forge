import { expect, test, type Page } from "@playwright/test";

const USER = process.env.FORGE_AUTH_USER;
const PASSWORD = process.env.FORGE_AUTH_PASSWORD;
if (!USER || !PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");

type JsonRecord = Record<string, unknown>;
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type FrappeDoc = JsonRecord & { doctype: string; name: string; docstatus: number; items?: JsonRecord[] };

async function browserRequest(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown; csrf?: string } = {},
): Promise<BrowserResponse> {
  return page.evaluate(async ({ requestPath, requestOptions }) => {
    const headers: Record<string, string> = {};
    if (requestOptions.body !== undefined) headers["content-type"] = "application/json";
    if (requestOptions.csrf) headers["x-frappe-csrf-token"] = requestOptions.csrf;
    const response = await fetch(requestPath, {
      method: requestOptions.method ?? "GET",
      credentials: "same-origin",
      headers,
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
    });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, ok: response.ok, body, text };
  }, { requestPath: path, requestOptions: options });
}

function unwrap(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as JsonRecord;
  if ("data" in record) return record.data;
  if ("message" in record) return record.message;
  return body;
}

async function login(page: Page): Promise<string> {
  await page.goto("/?alumdoor=1");
  await page.locator("#mf-login-usr").fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: /^Đăng nhập$/ }).click();
  await expect(page.locator("#mf-login-usr")).toBeHidden();
  const boot = await browserRequest(page, "/api/method/metaforge.api.get_boot");
  expect(boot.status, boot.text).toBe(200);
  const message = unwrap(boot.body) as { csrf_token?: string };
  expect(message.csrf_token).toBeTruthy();
  return message.csrf_token ?? "";
}

async function requireDoc(response: BrowserResponse): Promise<FrappeDoc> {
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as FrappeDoc;
}

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  return requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    csrf,
    body: { doctype, ...document },
  }));
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  }));
}

function day(offset: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function aluminiumLine(lengthM: number, bars: number): JsonRecord {
  const kgPerM = 0.389;
  const baremKg = round(lengthM * kgPerM * bars);
  return {
    doctype: "Purchase Order Item",
    item_code: "AL71-QA",
    item_name: "Nhôm AL71 QA",
    inventory_mode: "Nhôm cây/lá",
    measurement_profile: "Nhôm cây/lá",
    material_specification: "AL71",
    stock_uom: "Kg",
    uom: "Kg",
    qty: baremKg,
    conversion_factor: 1,
    stock_qty: baremKg,
    rate: 100_000,
    amount: round(baremKg * 100_000),
    warehouse: "K36",
    theoretical_kg_per_m: kgPerM,
    theoretical_kg: baremKg,
    length_m: lengthM,
    qty_bar: bars,
    total_length_m: round(lengthM * bars),
    color: "THÔ",
    is_stamped: "Không",
  };
}

async function createSubmittedOrder(page: Page, csrf: string, lengthM: number, bars: number, date: string, suffix: string) {
  const created = await createResource(page, csrf, "Purchase Order", {
    supplier: "Tiến Đạt",
    priority: "Thường",
    transaction_date: date,
    schedule_date: day(2),
    company: "ALUMDOOR",
    currency: "VND",
    note: `Authenticated bulk transaction QA ${suffix}`,
    items: [aluminiumLine(lengthM, bars)],
  });
  return submit(page, csrf, created);
}

const actionId = (field: string) => `#action-nhap-nhom-hang-loat-${field}`;

async function chooseActionLink(page: Page, field: string, value: string) {
  await page.locator(actionId(field)).click();
  const input = page.locator("[cmdk-input]").last();
  await expect(input).toBeVisible();
  await input.fill(value);
  const option = page.locator("[cmdk-item]")
    .filter({ hasText: value })
    .filter({ hasNotText: /Tạo mới/i })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator(actionId(field))).toContainText(value);
}

async function pasteMatrix(page: Page, matrix: string) {
  const firstDataCell = page.locator('[data-action-input-row="1"] td').nth(1);
  await expect(firstDataCell).toBeVisible();
  await firstDataCell.evaluate((element, value) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", value);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, matrix);
}

async function draftReceiptsForInvoice(page: Page, invoice: string): Promise<JsonRecord[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name", "docstatus", "supplier_invoice_no"]),
    filters: JSON.stringify([
      ["supplier", "=", "Tiến Đạt"],
      ["supplier_invoice_no", "=", invoice],
      ["docstatus", "=", 0],
    ]),
    limit_page_length: "20",
  });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Purchase Receipt")}?${query}`);
  expect(response.status, response.text).toBe(200);
  return (unwrap(response.body) as JsonRecord[]) ?? [];
}

test("authenticated bulk transaction grid pastes rows, previews and creates one idempotent draft", async ({ page }) => {
  const csrf = await login(page);
  const project = test.info().project.name;
  const suffix = `${project}-${Date.now()}`;
  const lengthM = project.includes("mobile") ? 7.32 : 7.31;
  const firstOrder = await createSubmittedOrder(page, csrf, lengthM, 10, day(-2), `${suffix}-first`);
  const secondOrder = await createSubmittedOrder(page, csrf, lengthM, 10, day(-1), `${suffix}-second`);
  expect(firstOrder.docstatus).toBe(1);
  expect(secondOrder.docstatus).toBe(1);

  await page.goto("/x/action%3Anhap-nhom-hang-loat");
  const screen = page.locator('[data-action-screen="nhap-nhom-hang-loat"]');
  await expect(screen).toBeVisible();
  await chooseActionLink(page, "supplier", "Tiến Đạt");
  await chooseActionLink(page, "warehouse", "K36");
  const invoice = `TD-BULK-${suffix}`;
  await page.locator(actionId("supplier_invoice_no")).fill(invoice);
  await page.locator(actionId("driver")).fill("QA Bulk Driver");

  const actualKg = round(lengthM * 0.389 * 10);
  const matrix = [
    ["AL71-QA", String(lengthM), "10", String(actualKg), "100000", "THÔ", "Không"],
    ["AL71-QA", String(lengthM), "10", String(actualKg), "100000", "THÔ", "Không"],
  ].map((row) => row.join("\t")).join("\n");
  await pasteMatrix(page, matrix);

  const grid = page.locator('[data-action-input-table="lines"]');
  await expect(grid).toBeVisible();
  await expect(page.locator('[data-action-input-row="1"]')).toBeVisible();
  await expect(page.locator('[data-action-input-row="2"]')).toBeVisible();
  await expect(page.locator("#action-nhap-nhom-hang-loat-lines-0-item_code")).toContainText("AL71-QA");
  await expect(page.locator("#action-nhap-nhom-hang-loat-lines-1-item_code")).toContainText("AL71-QA");
  await expect(grid).toContainText("2/100 dòng");

  await page.getByRole("button", { name: "Xem phân bổ hàng loạt", exact: true }).click();
  await expect(page.locator("[data-action-result]")).toBeVisible();
  const summaries = page.locator('[data-action-result-section="line_summaries"]');
  const allocations = page.locator('[data-action-result-section="allocations"]');
  await expect(summaries).toContainText("2 dòng");
  await expect(summaries).toContainText("AL71-QA");
  await expect(allocations).toContainText(firstOrder.name);
  await expect(allocations).toContainText(secondOrder.name);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Tạo phiếu nhập hàng loạt", exact: true }).click();
  await expect(page.locator("[data-action-result]")).toContainText("Đã chạy");
  let drafts = await draftReceiptsForInvoice(page, invoice);
  expect(drafts).toHaveLength(1);
  expect(Number(drafts[0]?.docstatus)).toBe(0);
  const receiptName = String(drafts[0]?.name ?? "");
  expect(receiptName).toMatch(/^PNM-/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Tạo phiếu nhập hàng loạt", exact: true }).click();
  await expect(page.locator("[data-action-result]")).toContainText(/không tạo phiếu trùng|đã tạo/i);
  drafts = await draftReceiptsForInvoice(page, invoice);
  expect(drafts).toHaveLength(1);
  expect(String(drafts[0]?.name)).toBe(receiptName);
});
