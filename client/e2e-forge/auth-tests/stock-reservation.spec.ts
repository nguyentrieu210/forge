import { expect, test, type Page } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & {
  doctype: string;
  name: string;
  docstatus: number;
  modified?: string;
};
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type DocTypeMeta = {
  autoname?: string;
  fields?: Array<{ fieldname?: string }>;
};
type PhysicalStockReport = {
  rows?: Array<{ item_code?: string; warehouse?: string; batch_no?: string; quantity_micros?: number }>;
  totals?: { quantity_micros?: number };
};

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

async function loginAs(page: Page, user: string, password: string): Promise<string> {
  await page.context().clearCookies();
  await page.goto("/?alumdoor=1");
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  await page.locator("#mf-login-usr").fill(user);
  await page.locator("#mf-login-pwd").fill(password);
  await page.locator("form").getByRole("button", { name: /^Đăng nhập$/ }).click();
  await expect(page.locator("#mf-login-usr")).toBeHidden();
  const boot = await browserRequest(page, "/api/method/metaforge.api.get_boot");
  expect(boot.status, boot.text).toBe(200);
  const message = unwrap(boot.body) as { user?: string; csrf_token?: string };
  expect(message.user).toBe(user);
  expect(message.csrf_token).toBeTruthy();
  return message.csrf_token ?? "";
}

async function requireDoc(response: BrowserResponse): Promise<FrappeDoc> {
  expect(response.ok, response.text).toBe(true);
  const value = unwrap(response.body);
  expect(value).toBeTruthy();
  return value as FrappeDoc;
}

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  return requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", csrf, body: { doctype, ...document },
  }));
}

async function createResourceRaw(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  return browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", csrf, body: { doctype, ...document },
  });
}

async function getResource(page: Page, doctype: string, name: string) {
  return requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`));
}

async function updateResourceRaw(page: Page, csrf: string, doc: FrappeDoc, patch: JsonRecord) {
  return browserRequest(page, `/api/resource/${encodeURIComponent(doc.doctype)}/${encodeURIComponent(doc.name)}`, {
    method: "PUT", csrf, body: { ...patch, modified: doc.modified },
  });
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST", csrf, body: { doc: JSON.stringify(doc) },
  }));
}

async function createUser(page: Page, csrf: string, user: string, password: string) {
  const response = await browserRequest(page, "/api/method/metaforge.api.create_user", {
    method: "POST",
    csrf,
    body: {
      user,
      password,
      full_name: "QA Reservation Stock User",
      email: user,
      roles: JSON.stringify(["Thủ kho"]),
    },
  });
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as { user: string; roles: string[] };
}

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function postingAt(): string {
  return `${new Date().toISOString().slice(0, 10)} 11:00:00`;
}

async function physicalStock(page: Page, csrf: string, warehouse: string, itemCode: string): Promise<PhysicalStockReport> {
  const response = await browserRequest(page, "/api/method/metaforge.inventory.physical_stock", {
    method: "POST",
    csrf,
    body: { args: JSON.stringify({ company: "ALUMDOOR", warehouse, item_code: itemCode, include_lineage: true, limit: 50 }) },
  });
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as PhysicalStockReport;
}

function physicalQty(report: PhysicalStockReport): number {
  if (typeof report.totals?.quantity_micros === "number") return report.totals.quantity_micros;
  return (report.rows ?? []).reduce((sum, row) => sum + Number(row.quantity_micros ?? 0), 0);
}

async function getDocTypeMeta(page: Page, doctype: string): Promise<DocTypeMeta> {
  const response = await browserRequest(page, `/api/resource/DocType/${encodeURIComponent(doctype)}`);
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as DocTypeMeta;
}

async function createBatch(page: Page, csrf: string, itemCode: string, warehouse: string, batchName: string) {
  const meta = await getDocTypeMeta(page, "Batch");
  const fields = new Set((meta.fields ?? []).map((field) => field.fieldname).filter((value): value is string => Boolean(value)));
  const candidates: JsonRecord = {
    batch_id: batchName,
    item: itemCode,
    item_code: itemCode,
    manufacturing_date: day(0),
    expiry_date: day(365),
    disabled: 0,
    color: "THÔ",
    condition: "Thô",
    length_m: 6,
    intake_kg: 65.7,
    received_warehouse: warehouse,
    is_offcut: 0,
    cut_generation: 0,
    intake_note: "Authenticated reservation QA batch",
  };
  const payload: JsonRecord = { name: batchName };
  for (const [key, value] of Object.entries(candidates)) if (fields.has(key)) payload[key] = value;
  const namingField = typeof meta.autoname === "string" && meta.autoname.startsWith("field:")
    ? meta.autoname.slice("field:".length)
    : "";
  if (namingField) payload[namingField] = batchName;
  expect(fields.has("length_m")).toBe(true);
  const created = await createResource(page, csrf, "Batch", payload);
  expect(created.name).toBe(batchName);
  return created;
}

async function createSubmittedBundle(page: Page, csrf: string, itemCode: string, warehouse: string, batchName: string) {
  const bundle = await createResource(page, csrf, "Serial and Batch Bundle", {
    item_code: itemCode,
    warehouse,
    type: "Inward",
    posting_at: postingAt(),
    entries: [{ doctype: "Serial and Batch Bundle Entry", row_id: "ROW-1", qty: 10, batch_no: batchName }],
  });
  expect(bundle.docstatus).toBe(0);
  return submit(page, csrf, bundle);
}

async function createTrackedReceipt(page: Page, csrf: string, itemCode: string, warehouse: string, bundleName: string) {
  const draft = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose: "Material Receipt",
    note: "Authenticated reservation QA tracked receipt",
    items: [{
      doctype: "Stock Entry Detail",
      item_code: itemCode,
      qty: 10,
      uom: "Cái",
      target_warehouse: warehouse,
      valuation_rate: 100000,
      serial_and_batch_bundle: bundleName,
    }],
  });
  return submit(page, csrf, draft);
}

async function releaseReservation(page: Page, csrf: string, reservation: string) {
  return browserRequest(page, "/api/method/alumdoor.reserve.release", {
    method: "POST", csrf, body: { reservation, released_reason: "Khác" },
  });
}

function reservationDocument(itemCode: string, warehouse: string, sourceName: string, qtyReserved: number): JsonRecord {
  return {
    item_code: itemCode,
    warehouse,
    min_length_m: 5,
    qty_reserved: qtyReserved,
    source_doctype: "Sales Order",
    source_name: sourceName,
    reserved_at: new Date().toISOString(),
    expires_at: `${day(1)} 23:59:59`,
    state: "Đang giữ",
  };
}

test("authenticated reservation reduces available stock without changing physical stock and release is one-way", async ({ page }, testInfo) => {
  const adminCsrf = await loginAs(page, ADMIN_USER, ADMIN_PASSWORD);
  const suffix = `${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const stockUser = `reserve-stock-${suffix}@example.test`;
  const password = `ReserveStock-${Date.now()}-Qa!`;
  const itemCode = `QA-RESERVE-${suffix}`.slice(0, 120);
  const batchName = `QA-BATCH-${suffix}`.slice(0, 120);

  const createdUser = await createUser(page, adminCsrf, stockUser, password);
  expect(createdUser.roles).toContain("Thủ kho");

  const warehouse = await createResource(page, adminCsrf, "Warehouse", {
    warehouse_name: `QA Reserve ${suffix}`,
    stock_role: "Kho chính",
    is_group: 0,
    disabled: 0,
  });
  const item = await createResource(page, adminCsrf, "Item", {
    item_code: itemCode,
    item_name: `QA Reservation ${suffix}`,
    item_group: "QA Purchase Items",
    item_nature: "Hàng tồn kho",
    material_stage: "Hàng hoá",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    is_sales_item: 1,
    include_item_in_manufacturing: 0,
    measurement_profile: "Hàng thường",
    stock_uom: "Cái",
    default_purchase_uom: "Cái",
    default_sales_uom: "Cái",
    default_warehouse: warehouse.name,
    inventory_account: "Hàng tồn kho",
    expense_account: "Hàng tồn kho",
    valuation_method: "FIFO",
    has_batch_no: 1,
    has_catch_weight: 0,
    allow_negative_stock: 0,
    disabled: 0,
    description: "Local authenticated reservation acceptance item",
  });
  expect(item.name).toBe(itemCode);

  await createBatch(page, adminCsrf, itemCode, warehouse.name, batchName);
  const bundle = await createSubmittedBundle(page, adminCsrf, itemCode, warehouse.name, batchName);

  // Stock Reservation requires a real source document. A draft Sales Order is enough,
  // but the selling controller still requires at least one line and computes its totals.
  const source = await createResource(page, adminCsrf, "Sales Order", {
    customer: `QA Reservation Source ${suffix}`,
    company: "ALUMDOOR",
    currency: "VND",
    transaction_date: day(0),
    items: [{
      doctype: "Sales Order Item",
      row_id: "ROW-1",
      item_code: itemCode,
      qty: 1,
      uom: "Cái",
      rate: 100000,
      warehouse: warehouse.name,
    }],
  });
  expect(source.docstatus).toBe(0);

  const stockCsrf = await loginAs(page, stockUser, password);
  const receipt = await createTrackedReceipt(page, stockCsrf, itemCode, warehouse.name, bundle.name);
  expect(receipt.docstatus).toBe(1);
  const beforeReservation = await physicalStock(page, stockCsrf, warehouse.name, itemCode);
  expect(physicalQty(beforeReservation)).toBe(10_000_000);
  expect((beforeReservation.rows ?? []).some((row) => row.batch_no === batchName)).toBe(true);

  const reservation1 = await createResource(page, stockCsrf, "Stock Reservation", reservationDocument(itemCode, warehouse.name, source.name, 6));
  expect(reservation1.state).toBe("Đang giữ");
  expect(physicalQty(await physicalStock(page, stockCsrf, warehouse.name, itemCode))).toBe(10_000_000);

  const overReserved = await createResourceRaw(page, stockCsrf, "Stock Reservation", reservationDocument(itemCode, warehouse.name, source.name, 5));
  expect(overReserved.ok, overReserved.text).toBe(false);
  expect([409, 417, 422]).toContain(overReserved.status);
  expect(overReserved.text).toContain("available_qty_micros");
  expect(overReserved.text).toContain("4000000");

  const released = await releaseReservation(page, stockCsrf, reservation1.name);
  expect(released.status, released.text).toBe(200);
  expect(released.text).toContain("Đã nhả");
  const releasedDoc = await getResource(page, "Stock Reservation", reservation1.name);
  expect(releasedDoc.state).toBe("Đã nhả");
  expect(physicalQty(await physicalStock(page, stockCsrf, warehouse.name, itemCode))).toBe(10_000_000);

  const restored = await createResource(page, stockCsrf, "Stock Reservation", reservationDocument(itemCode, warehouse.name, source.name, 10));
  expect(restored.state).toBe("Đang giữ");
  expect(physicalQty(await physicalStock(page, stockCsrf, warehouse.name, itemCode))).toBe(10_000_000);

  const noAvailability = await createResourceRaw(page, stockCsrf, "Stock Reservation", reservationDocument(itemCode, warehouse.name, source.name, 1));
  expect(noAvailability.ok, noAvailability.text).toBe(false);
  expect(noAvailability.text).toContain("available_qty_micros");
  expect(noAvailability.text).toContain("0");

  const doubleRelease = await releaseReservation(page, stockCsrf, reservation1.name);
  expect(doubleRelease.status, doubleRelease.text).toBe(422);
  expect(doubleRelease.text).toContain("không còn ở trạng thái Đang giữ");

  const terminalEdit = await updateResourceRaw(page, stockCsrf, releasedDoc, { state: "Đang giữ" });
  expect(terminalEdit.ok, terminalEdit.text).toBe(false);
  expect([409, 417, 422]).toContain(terminalEdit.status);

  const finalRelease = await releaseReservation(page, stockCsrf, restored.name);
  expect(finalRelease.status, finalRelease.text).toBe(200);
  expect(physicalQty(await physicalStock(page, stockCsrf, warehouse.name, itemCode))).toBe(10_000_000);
});
