import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
const CLEANUP_MANIFEST = process.env.FORGE_QA_CLEANUP_MANIFEST;
const TENANT_ID = process.env.FORGE_QA_TENANT_ID || "demo";
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");
if (!CLEANUP_MANIFEST) throw new Error("FORGE_QA_CLEANUP_MANIFEST is required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & { doctype: string; name: string; docstatus: number; modified?: string };
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type DocTypeMeta = { autoname?: string; fields?: Array<{ fieldname?: string }> };
type LineageEvent = {
  voucher_type?: string;
  voucher_no?: string;
  voucher_row?: string;
  item_code?: string;
  warehouse?: string;
  physical_identity_key?: string;
  batch_no?: string;
  serial_and_batch_bundle?: string;
};
type PhysicalStockRow = {
  item_code?: string;
  warehouse?: string;
  batch_no?: string;
  quantity_micros?: number;
  lineage?: LineageEvent[];
};
type PhysicalStockReport = { rows?: PhysicalStockRow[]; totals?: { quantity_micros?: number } };

function registerDocument(doc: FrappeDoc) {
  appendFileSync(CLEANUP_MANIFEST!, `${JSON.stringify({ tenant_id: TENANT_ID, kind: "document", doctype: doc.doctype, name: doc.name })}\n`);
  return doc;
}

function registerUser(user: string) {
  appendFileSync(CLEANUP_MANIFEST!, `${JSON.stringify({ tenant_id: TENANT_ID, kind: "user", user_id: user })}\n`);
}

async function browserRequest(page: Page, path: string, options: { method?: string; body?: unknown; csrf?: string } = {}): Promise<BrowserResponse> {
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
  return unwrap(response.body) as FrappeDoc;
}

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  const doc = await requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", csrf, body: { doctype, ...document },
  }));
  return registerDocument(doc);
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
    body: { user, password, full_name: "QA Lineage Stock User", email: user, roles: JSON.stringify(["Thủ kho"]) },
  });
  expect(response.ok, response.text).toBe(true);
  registerUser(user);
  return unwrap(response.body) as { user: string; roles: string[] };
}

async function getDocTypeMeta(page: Page, doctype: string): Promise<DocTypeMeta> {
  const response = await browserRequest(page, `/api/resource/DocType/${encodeURIComponent(doctype)}`);
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as DocTypeMeta;
}

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function postingAt(): string {
  return `${new Date().toISOString().slice(0, 10)} 12:00:00`;
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
    intake_kg: 39.42,
    received_warehouse: warehouse,
    is_offcut: 0,
    cut_generation: 0,
    intake_note: "Authenticated P0 lineage batch",
  };
  const payload: JsonRecord = { name: batchName };
  for (const [key, value] of Object.entries(candidates)) if (fields.has(key)) payload[key] = value;
  const namingField = typeof meta.autoname === "string" && meta.autoname.startsWith("field:") ? meta.autoname.slice("field:".length) : "";
  if (namingField) payload[namingField] = batchName;
  return createResource(page, csrf, "Batch", payload);
}

async function createSubmittedBundle(page: Page, csrf: string, itemCode: string, warehouse: string, batchName: string, rowId: string, qty: number) {
  const bundle = await createResource(page, csrf, "Serial and Batch Bundle", {
    item_code: itemCode,
    warehouse,
    type: "Inward",
    posting_at: postingAt(),
    entries: [{ doctype: "Serial and Batch Bundle Entry", row_id: rowId, qty, batch_no: batchName }],
  });
  return submit(page, csrf, bundle);
}

async function createTrackedReceipt(page: Page, csrf: string, itemCode: string, warehouse: string, bundleName: string, rowId: string, qty: number) {
  const draft = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose: "Material Receipt",
    note: `Authenticated P0 lineage ${rowId}`,
    items: [{
      doctype: "Stock Entry Detail",
      row_id: rowId,
      item_code: itemCode,
      qty,
      uom: "Cái",
      target_warehouse: warehouse,
      valuation_rate: 100000,
      serial_and_batch_bundle: bundleName,
    }],
  });
  return submit(page, csrf, draft);
}

async function physicalStock(page: Page, csrf: string, warehouse: string, itemCode: string, token = csrf): Promise<BrowserResponse> {
  return browserRequest(page, "/api/method/metaforge.inventory.physical_stock", {
    method: "POST",
    csrf: token,
    body: { args: JSON.stringify({ company: "ALUMDOOR", warehouse, item_code: itemCode, include_lineage: true, limit: 50 }) },
  });
}

function rowFor(report: PhysicalStockReport, batchNo: string): PhysicalStockRow {
  const row = (report.rows ?? []).find((candidate) => candidate.batch_no === batchNo);
  expect(row, `missing physical-stock row for ${batchNo}`).toBeTruthy();
  return row!;
}

function assertLineage(row: PhysicalStockRow, expected: { receipt: string; item: string; warehouse: string; batch: string; bundle: string }) {
  expect(row.item_code).toBe(expected.item);
  expect(row.warehouse).toBe(expected.warehouse);
  const events = row.lineage ?? [];
  expect(events.length).toBeGreaterThan(0);
  const event = events.find((candidate) => candidate.voucher_type === "Stock Entry" && candidate.voucher_no === expected.receipt);
  expect(event).toBeTruthy();
  expect(event?.voucher_row).toBeTruthy();
  expect(event?.item_code).toBe(expected.item);
  expect(event?.warehouse).toBe(expected.warehouse);
  expect(event?.batch_no).toBe(expected.batch);
  expect(event?.serial_and_batch_bundle).toBe(expected.bundle);
}

test("P0 authenticated lineage and reconciliation QR keep exact physical identity", async ({ page }, testInfo) => {
  const adminCsrf = await loginAs(page, ADMIN_USER!, ADMIN_PASSWORD!);
  const suffix = `lineage-${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const stockUser = `${suffix}@example.test`;
  const stockPassword = `Lineage-${Date.now()}-Qa!`;
  const itemCode = `QA-LINEAGE-${suffix}`.slice(0, 120);
  const batchAName = `QA-BATCH-A-${suffix}`.slice(0, 120);
  const batchBName = `QA-BATCH-B-${suffix}`.slice(0, 120);

  const createdUser = await createUser(page, adminCsrf, stockUser, stockPassword);
  expect(createdUser.roles).toContain("Thủ kho");

  const warehouse = await createResource(page, adminCsrf, "Warehouse", {
    warehouse_name: `QA Lineage ${suffix}`,
    stock_role: "Kho chính",
    is_group: 0,
    disabled: 0,
  });
  const item = await createResource(page, adminCsrf, "Item", {
    item_code: itemCode,
    item_name: `QA Lineage ${suffix}`,
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
    description: "Local P0 lineage acceptance item",
  });
  expect(item.name).toBe(itemCode);

  await createBatch(page, adminCsrf, itemCode, warehouse.name, batchAName);
  await createBatch(page, adminCsrf, itemCode, warehouse.name, batchBName);
  const bundleA = await createSubmittedBundle(page, adminCsrf, itemCode, warehouse.name, batchAName, "BUNDLE-A", 6);
  const bundleB = await createSubmittedBundle(page, adminCsrf, itemCode, warehouse.name, batchBName, "BUNDLE-B", 4);

  const stockCsrf = await loginAs(page, stockUser, stockPassword);
  const receiptA = await createTrackedReceipt(page, stockCsrf, itemCode, warehouse.name, bundleA.name, "RECEIPT-A", 6);
  const receiptB = await createTrackedReceipt(page, stockCsrf, itemCode, warehouse.name, bundleB.name, "RECEIPT-B", 4);
  expect(receiptA.docstatus).toBe(1);
  expect(receiptB.docstatus).toBe(1);

  const physical = await physicalStock(page, stockCsrf, warehouse.name, itemCode);
  expect(physical.status, physical.text).toBe(200);
  const report = unwrap(physical.body) as PhysicalStockReport;
  expect(report.totals?.quantity_micros).toBe(10_000_000);
  const batchA = rowFor(report, batchAName);
  const batchB = rowFor(report, batchBName);
  assertLineage(batchA, { receipt: receiptA.name, item: itemCode, warehouse: warehouse.name, batch: batchAName, bundle: bundleA.name });
  assertLineage(batchB, { receipt: receiptB.name, item: itemCode, warehouse: warehouse.name, batch: batchBName, bundle: bundleB.name });
  expect((batchA.lineage ?? []).some((event) => event.batch_no === batchBName || event.serial_and_batch_bundle === bundleB.name)).toBe(false);
  expect((batchB.lineage ?? []).some((event) => event.batch_no === batchAName || event.serial_and_batch_bundle === bundleA.name)).toBe(false);

  const badCsrf = await physicalStock(page, stockCsrf, warehouse.name, itemCode, "invalid-csrf-token");
  expect(badCsrf.status, badCsrf.text).toBe(403);
  await page.context().clearCookies();
  const staleSession = await physicalStock(page, stockCsrf, warehouse.name, itemCode);
  expect(staleSession.status, staleSession.text).toBe(403);

  const reloggedCsrf = await loginAs(page, stockUser, stockPassword);
  const reconciliation = await createResource(page, reloggedCsrf, "Stock Reconciliation", {
    warehouse: warehouse.name,
    scope: "Một kho",
    snapshot_at: postingAt(),
    counted_by: stockUser,
    note: `P0 QR lineage ${suffix}`,
    items: [{
      doctype: "Stock Reconciliation Item",
      row_id: "COUNT-A",
      item_code: itemCode,
      batch_no: batchAName,
      serial_and_batch_bundle: bundleA.name,
      book_qty: 6,
      counted_qty: 6,
      variance_qty: 0,
      variance_qty_micros: 0,
      variance_weight_kg: 0,
      variance_weight_micros: 0,
      valuation_rate: 100000,
      variance_reason: "Khác",
      variance_note: "P0 exact identity",
    }],
  });
  expect(reconciliation.docstatus).toBe(0);

  const printPath = `/print/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(reconciliation.name)}`;
  await page.goto(printPath);
  const frame = page.locator("iframe.mf-print-frame");
  await expect(frame).toBeVisible();
  await expect.poll(async () => (await frame.getAttribute("srcdoc")) ?? "").toContain(reconciliation.name);
  const srcdoc = (await frame.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain(`QR ${reconciliation.name}`);
  expect(srcdoc).toMatch(/src="data:image\/gif;base64,[^"]+"/);
  expect(srcdoc).toContain(itemCode);
  expect(srcdoc).toContain(batchAName);
  expect(srcdoc).not.toContain(batchBName);

  const wrongIdentity = await browserRequest(page, `/api/resource/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(`${reconciliation.name}-WRONG`)}`);
  expect(wrongIdentity.ok, wrongIdentity.text).toBe(false);
  expect([403, 404, 417]).toContain(wrongIdentity.status);
});
