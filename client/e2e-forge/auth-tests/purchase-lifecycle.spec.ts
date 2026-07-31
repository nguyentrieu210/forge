import { expect, test, type Page } from "@playwright/test";

const USER = process.env.FORGE_AUTH_USER;
const PASSWORD = process.env.FORGE_AUTH_PASSWORD;
if (!USER || !PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & {
  doctype: string;
  name: string;
  docstatus: number;
  modified?: string;
  items?: JsonRecord[];
};

type BrowserResponse = {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
};

async function login(page: Page): Promise<string> {
  await page.goto("/?alumdoor=1");
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  await page.locator("#mf-login-usr").fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.getByRole("button", { name: /^Đăng nhập$/ }).click();
  await expect(page.locator("#mf-login-usr")).toBeHidden();

  const boot = await browserRequest(page, "/api/method/metaforge.api.get_boot");
  expect(boot.status, boot.text).toBe(200);
  const message = unwrap(boot.body) as { user?: string; csrf_token?: string };
  expect(message.user).toBe(USER);
  expect(message.csrf_token).toBeTruthy();
  return message.csrf_token ?? "";
}

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

async function requireDoc(response: BrowserResponse): Promise<FrappeDoc> {
  expect(response.ok, response.text).toBe(true);
  const value = unwrap(response.body);
  expect(value).toBeTruthy();
  return value as FrappeDoc;
}

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  return requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    csrf,
    body: { doctype, ...document },
  }));
}

async function updateResource(page: Page, csrf: string, doc: FrappeDoc, patch: JsonRecord) {
  expect(doc.modified).toBeTruthy();
  return requireDoc(await browserRequest(
    page,
    `/api/resource/${encodeURIComponent(doc.doctype)}/${encodeURIComponent(doc.name)}`,
    { method: "PUT", csrf, body: { ...patch, modified: doc.modified } },
  ));
}

async function getResource(page: Page, doctype: string, name: string) {
  return requireDoc(await browserRequest(
    page,
    `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
  ));
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  }));
}

async function cancel(page: Page, csrf: string, doctype: string, name: string) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.cancel", {
    method: "POST",
    csrf,
    body: { doctype, name },
  }));
}

function number(value: unknown): number {
  const parsed = Number(value);
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("authenticated Purchase Order to Purchase Receipt lifecycle works with FIFO disabled", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const csrf = await login(page);
  const today = new Date().toISOString().slice(0, 10);
  const qaSuffix = `${test.info().project.name}-${Date.now()}`;

  const itemSearch = await browserRequest(page,
    `/api/method/frappe.desk.search.search_link?doctype=Item&txt=QA-PURCHASE&reference_doctype=${encodeURIComponent("Purchase Order")}&filters=${encodeURIComponent(JSON.stringify({ is_purchase_item: 1, disabled: 0 }))}&page_length=10`,
  );
  expect(itemSearch.status, itemSearch.text).toBe(200);
  expect(JSON.stringify(unwrap(itemSearch.body))).toContain("QA-PURCHASE-ITEM");

  const uomSearch = await browserRequest(page,
    `/api/method/frappe.desk.search.search_link?doctype=UOM&txt=${encodeURIComponent("Cái")}&reference_doctype=${encodeURIComponent("Purchase Order")}&page_length=10`,
  );
  expect(uomSearch.status, uomSearch.text).toBe(200);
  expect(JSON.stringify(unwrap(uomSearch.body))).toContain("Cái");

  const createdOrder = await createResource(page, csrf, "Purchase Order", {
    supplier: "QA-SUPPLIER",
    priority: "Thường",
    transaction_date: today,
    schedule_date: tomorrow(),
    company: "ALUMDOOR",
    currency: "VND",
    note: `Authenticated Purchase QA ${qaSuffix}`,
    items: [{
      doctype: "Purchase Order Item",
      item_code: "QA-PURCHASE-ITEM",
      item_name: "QA Purchase Item",
      inventory_mode: "Hàng thường",
      measurement_profile: "Hàng thường",
      stock_uom: "Cái",
      uom: "Cái",
      qty: 2,
      conversion_factor: 1,
      stock_qty: 2,
      rate: 100000,
      amount: 200000,
      warehouse: "K36",
      is_stamped: "Không",
    }],
  });
  expect(createdOrder.docstatus).toBe(0);
  expect(createdOrder.name).toMatch(/^DMH-/);
  expect(number(createdOrder.grand_total)).toBe(200000);
  expect(number(createdOrder.items?.[0]?.amount)).toBe(200000);

  const savedOrder = await updateResource(page, csrf, createdOrder, {
    priority: "Cần gấp",
    note: `Authenticated Purchase QA saved ${qaSuffix}`,
  });
  expect(savedOrder.docstatus).toBe(0);
  expect(savedOrder.priority).toBe("Cần gấp");
  expect(savedOrder.items?.[0]?.item_code).toBe("QA-PURCHASE-ITEM");

  const submittedOrder = await submit(page, csrf, savedOrder);
  expect(submittedOrder.docstatus).toBe(1);
  expect(number(submittedOrder.grand_total)).toBe(200000);

  await page.goto(`/app/${encodeURIComponent("Purchase Order")}/${encodeURIComponent(submittedOrder.name)}`);
  await expect(page.locator("body")).toContainText(submittedOrder.name);
  await expect(page.locator("body")).toContainText("QA-SUPPLIER");

  const createdReceipt = await createResource(page, csrf, "Purchase Receipt", {
    supplier: "QA-SUPPLIER",
    against_purchase_order: submittedOrder.name,
    posting_at: `${today} 10:00:00`,
    supplier_invoice_no: `QA-${qaSuffix}`,
    driver: "QA Driver",
    goods_photo: "/files/qa-purchase-receipt.jpg",
    note: "Authenticated Purchase receipt draft",
    company: "ALUMDOOR",
    currency: "VND",
    stock_account: "Hàng tồn kho",
    stock_received_but_not_billed: "Hàng nhận chưa có hoá đơn",
    items: [{
      doctype: "Purchase Receipt Item",
      item_code: "QA-PURCHASE-ITEM",
      item_name: "QA Purchase Item",
      inventory_mode: "Hàng thường",
      measurement_profile: "Hàng thường",
      stock_uom: "Cái",
      uom: "Cái",
      qty: 2,
      conversion_factor: 1,
      stock_qty: 2,
      rate: 100000,
      rate_uom: "Cái",
      amount: 200000,
      valuation_rate: 100000,
      warehouse: "K36",
      purchase_order: submittedOrder.name,
      is_stamped: "Không",
    }],
  });
  expect(createdReceipt.docstatus).toBe(0);
  expect(createdReceipt.name).toMatch(/^PNM-/);
  expect(number(createdReceipt.grand_total)).toBe(200000);
  expect(number(createdReceipt.total_qty)).toBe(2);

  const savedReceipt = await updateResource(page, csrf, createdReceipt, {
    note: `Authenticated Purchase receipt saved ${qaSuffix}`,
  });
  const beforePreview = await getResource(page, "Purchase Receipt", savedReceipt.name);
  const preview = await browserRequest(
    page,
    `/api/method/metaforge.api.get_submit_preview?doctype=${encodeURIComponent("Purchase Receipt")}&name=${encodeURIComponent(savedReceipt.name)}`,
  );
  expect(preview.status, preview.text).toBe(200);
  expect(preview.body && typeof preview.body === "object" && "message" in (preview.body as JsonRecord)).toBe(true);
  const afterPreview = await getResource(page, "Purchase Receipt", savedReceipt.name);
  expect(afterPreview.docstatus).toBe(0);
  expect(afterPreview.modified).toBe(beforePreview.modified);

  await page.goto(`/app/${encodeURIComponent("Purchase Receipt")}/${encodeURIComponent(savedReceipt.name)}`);
  await expect(page.locator("body")).toContainText(savedReceipt.name);
  await expect(page.locator("body")).toContainText("QA-SUPPLIER");

  const submittedReceipt = await submit(page, csrf, afterPreview);
  expect(submittedReceipt.docstatus).toBe(1);
  expect(number(submittedReceipt.grand_total)).toBe(200000);

  const allocationTimeline = await browserRequest(
    page,
    `/api/method/metaforge.api.get_purchase_allocation_timeline?doctype=${encodeURIComponent("Purchase Receipt")}&name=${encodeURIComponent(submittedReceipt.name)}`,
  );
  expect(allocationTimeline.status, allocationTimeline.text).toBe(200);
  expect(unwrap(allocationTimeline.body)).toBeNull();

  const cancelledReceipt = await cancel(page, csrf, "Purchase Receipt", submittedReceipt.name);
  expect(cancelledReceipt.docstatus).toBe(2);
  expect((await getResource(page, "Purchase Receipt", cancelledReceipt.name)).docstatus).toBe(2);
  expect((await getResource(page, "Purchase Order", submittedOrder.name)).docstatus).toBe(1);

  expect(pageErrors).toEqual([]);
});
