import { appendFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
const CLEANUP_MANIFEST = process.env.FORGE_QA_CLEANUP_MANIFEST;
const TENANT_ID = process.env.FORGE_QA_TENANT_ID || "demo";
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");
if (!CLEANUP_MANIFEST) throw new Error("FORGE_QA_CLEANUP_MANIFEST is required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & { doctype: string; name: string; docstatus: number };
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type CostSheet = {
  work_order: string;
  produced_qty_micros: number;
  actual_material_cost_to_date_minor: number;
  actual_operation_cost_to_date_minor: number;
  actual_total_cost_to_date_minor: number;
  material_wip_stock_value_minor?: number;
  operation_wip_estimate_minor?: number;
  finished_stock_value_minor: number;
  manufacturing_cost_variance_minor?: number;
  inventory_costing_policy?: string;
  variance_posting_status?: string;
  ready_to_finalize: boolean;
  adjustments?: Array<{ adjustment_id: string; delta_amount_minor: number }>;
  adjustment_total_minor?: number;
  adjusted_actual_total_cost_minor?: number;
};

function registerDocument(doc: FrappeDoc) {
  appendFileSync(CLEANUP_MANIFEST!, `${JSON.stringify({ tenant_id: TENANT_ID, kind: "document", doctype: doc.doctype, name: doc.name })}\n`);
  return doc;
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

async function login(page: Page): Promise<string> {
  await page.context().clearCookies();
  await page.goto("/?alumdoor=1");
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  await page.locator("#mf-login-usr").fill(ADMIN_USER!);
  await page.locator("#mf-login-pwd").fill(ADMIN_PASSWORD!);
  await page.locator("form").getByRole("button", { name: /^Đăng nhập$/ }).click();
  await expect(page.locator("#mf-login-usr")).toBeHidden();
  const boot = await browserRequest(page, "/api/method/metaforge.api.get_boot");
  expect(boot.status, boot.text).toBe(200);
  const message = unwrap(boot.body) as { user?: string; csrf_token?: string };
  expect(message.user).toBe(ADMIN_USER);
  expect(message.csrf_token).toBeTruthy();
  return message.csrf_token ?? "";
}

async function requireDoc(response: BrowserResponse): Promise<FrappeDoc> {
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as FrappeDoc;
}

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord) {
  const doc = await requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    csrf,
    body: { doctype, ...document },
  }));
  return registerDocument(doc);
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  }));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function postingAt(): string {
  return `${today()}T12:00:00.000Z`;
}

function fixtureSuffix(testInfo: TestInfo): string {
  const project = testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 12);
  return `${project}-${Date.now().toString(36)}`.toUpperCase();
}

async function createCostingSource(page: Page, csrf: string, testInfo: TestInfo) {
  const suffix = fixtureSuffix(testInfo);
  const groupName = `QA COST ${suffix}`;
  const rawWarehouseName = `QA-RAW-${suffix}`;
  const finishedWarehouseName = `QA-FG-${suffix}`;
  const rawItemCode = `QA-RAW-${suffix}`;
  const finishedItemCode = `QA-FG-${suffix}`;

  const group = await createResource(page, csrf, "Item Group", {
    item_group_name: groupName,
    is_group: 0,
  });
  const rawWarehouse = await createResource(page, csrf, "Warehouse", {
    warehouse_name: rawWarehouseName,
    is_group: 0,
    disabled: 0,
  });
  const finishedWarehouse = await createResource(page, csrf, "Warehouse", {
    warehouse_name: finishedWarehouseName,
    is_group: 0,
    disabled: 0,
  });
  const rawItem = await createResource(page, csrf, "Item", {
    item_code: rawItemCode,
    item_name: rawItemCode,
    item_group: group.name,
    item_nature: "Hàng tồn kho",
    material_stage: "Nguyên vật liệu",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    is_sales_item: 0,
    include_item_in_manufacturing: 1,
    measurement_profile: "Hàng thường",
    stock_uom: "Cái",
    default_purchase_uom: "Cái",
    default_sales_uom: "Cái",
    default_warehouse: rawWarehouse.name,
    inventory_account: "Hàng tồn kho",
    expense_account: "Hàng tồn kho",
    valuation_method: "FIFO",
    standard_rate: 100000,
    has_catch_weight: 0,
    allow_negative_stock: 0,
    disabled: 0,
  });
  const finishedItem = await createResource(page, csrf, "Item", {
    item_code: finishedItemCode,
    item_name: finishedItemCode,
    item_group: group.name,
    item_nature: "Hàng tồn kho",
    material_stage: "Thành phẩm",
    supply_type: "Tự sản xuất",
    is_stock_item: 1,
    is_purchase_item: 0,
    is_sales_item: 1,
    include_item_in_manufacturing: 1,
    measurement_profile: "Hàng thường",
    stock_uom: "Cái",
    default_sales_uom: "Cái",
    default_warehouse: finishedWarehouse.name,
    inventory_account: "Hàng tồn kho",
    expense_account: "Hàng tồn kho",
    valuation_method: "FIFO",
    standard_rate: 0,
    has_catch_weight: 0,
    allow_negative_stock: 0,
    disabled: 0,
  });

  const receipt = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose: "Material Receipt",
    items: [{
      row_id: "RAW-OPENING",
      item_code: rawItem.name,
      qty: "5",
      target_warehouse: rawWarehouse.name,
      valuation_rate: "100000",
    }],
  });
  await submit(page, csrf, receipt);

  const bom = await createResource(page, csrf, "Bill of Materials", {
    company: "ALUMDOOR",
    item: finishedItem.name,
    quantity: "1",
    operating_cost: "0",
    revision: 1,
    bom_status: "Active",
    effective_from: today(),
    output_uom: "Cái",
    items: [{
      row_id: "MAT-1",
      item_code: rawItem.name,
      qty: "2",
      uom: "Cái",
      qty_basis: "Cố định",
      source_warehouse: rawWarehouse.name,
    }],
  });
  await submit(page, csrf, bom);

  const workOrder = await createResource(page, csrf, "Work Order", {
    company: "ALUMDOOR",
    production_item: finishedItem.name,
    bom_no: bom.name,
    qty: "1",
    source_warehouse: rawWarehouse.name,
    target_warehouse: finishedWarehouse.name,
    planned_start_date: `${today()}T08:00:00.000Z`,
  });
  await submit(page, csrf, workOrder);

  const manufacture = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose: "Manufacture",
    work_order: workOrder.name,
    source_warehouse: rawWarehouse.name,
    target_warehouse: finishedWarehouse.name,
    finished_good_item: finishedItem.name,
    finished_good_qty: "1",
    items: [{
      row_id: "MAT-1",
      item_code: rawItem.name,
      qty: "2",
      source_warehouse: rawWarehouse.name,
    }],
  });
  await submit(page, csrf, manufacture);

  return { workOrder: workOrder.name };
}

test("authenticated manufacturing costing closes material-only Work Order and keeps adjustment replay idempotent", async ({ page }, testInfo) => {
  const csrf = await login(page);
  const { workOrder } = await createCostingSource(page, csrf, testInfo);

  const injected = await browserRequest(page, "/api/v1/manufacturing-costing/preview", {
    method: "POST",
    csrf,
    body: { work_order: workOrder, tenant_id: "other-tenant" },
  });
  expect(injected.status, injected.text).toBe(422);
  expect((injected.body as { error?: { code?: string } }).error?.code).toBe("VALIDATION_ERROR");

  const preview = await browserRequest(page, "/api/v1/manufacturing-costing/preview", {
    method: "POST",
    csrf,
    body: { work_order: workOrder },
  });
  expect(preview.status, preview.text).toBe(200);
  const sheet = preview.body as CostSheet;
  expect(sheet.work_order).toBe(workOrder);
  expect(sheet.produced_qty_micros).toBe(1_000_000);
  expect(sheet.actual_material_cost_to_date_minor).toBe(200_000);
  expect(sheet.actual_operation_cost_to_date_minor).toBe(0);
  expect(sheet.actual_total_cost_to_date_minor).toBe(200_000);
  expect(sheet.material_wip_stock_value_minor).toBe(0);
  expect(sheet.operation_wip_estimate_minor).toBe(0);
  expect(sheet.finished_stock_value_minor).toBe(200_000);
  expect(sheet.manufacturing_cost_variance_minor).toBe(0);
  expect(sheet.inventory_costing_policy).toBe("ACTUAL_MATERIAL_STANDARD_OPERATION");
  expect(sheet.variance_posting_status).toBe("NOT_REQUIRED");
  expect(sheet.ready_to_finalize).toBe(true);

  await page.goto(`/x/${encodeURIComponent("alumdoor-operations:manufacturing-costing")}`);
  await expect(page.getByRole("heading", { name: "Giá thành sản xuất" })).toBeVisible();
  await page.getByPlaceholder("Ví dụ: LSX-2026-0001").fill(workOrder);
  await page.getByRole("button", { name: "Tính thử" }).click();
  await expect(page.getByText("Đủ điều kiện khóa")).toBeVisible();
  await expect(page.getByText(/Chính sách vốn hóa kho:/)).toBeVisible();
  await expect(page.getByText("Vật tư WIP theo sổ")).toBeVisible();
  await expect(page.getByText("Công đoạn WIP ước tính")).toBeVisible();

  await page.getByRole("button", { name: "Tạo Cost Sheet" }).click();
  const snapshotText = page.getByText(/^Snapshot: MCS-/);
  await expect(snapshotText).toBeVisible();
  const text = await snapshotText.textContent();
  const snapshotId = text?.replace(/^Snapshot:\s*/, "").trim() ?? "";
  expect(snapshotId).toMatch(/^MCS-/);

  await page.getByPlaceholder("Lý do khóa").fill("Authenticated Costing QA close");
  await page.getByRole("button", { name: "Khóa Cost Sheet" }).click();
  await expect(page.getByText("Đã khóa", { exact: true })).toBeVisible();

  const adjustmentId = `QA-ADJ-${fixtureSuffix(testInfo)}`;
  const adjustmentBody = {
    adjustment_id: adjustmentId,
    snapshot_id: snapshotId,
    category: "Other",
    delta_amount_minor: 1000,
    reason: "Authenticated idempotent retry QA",
    details: { source: "playwright" },
  };
  const firstAdjustment = await browserRequest(page, "/api/v1/manufacturing-costing/adjust", {
    method: "POST", csrf, body: adjustmentBody,
  });
  expect(firstAdjustment.status, firstAdjustment.text).toBe(200);
  expect((firstAdjustment.body as { adjustment_id?: string; existing?: boolean }).adjustment_id).toBe(adjustmentId);
  expect((firstAdjustment.body as { existing?: boolean }).existing).toBe(false);

  const replay = await browserRequest(page, "/api/v1/manufacturing-costing/adjust", {
    method: "POST", csrf, body: adjustmentBody,
  });
  expect(replay.status, replay.text).toBe(200);
  expect((replay.body as { existing?: boolean }).existing).toBe(true);

  const report = await browserRequest(page, "/api/v1/reports/manufacturing-cost-sheet", {
    method: "POST", csrf, body: { snapshot_id: snapshotId },
  });
  expect(report.status, report.text).toBe(200);
  const frozenSheet = report.body as CostSheet;
  expect(frozenSheet.adjustment_total_minor).toBe(1000);
  expect(frozenSheet.adjusted_actual_total_cost_minor).toBe(201_000);
  expect(frozenSheet.adjustments).toHaveLength(1);
  expect(frozenSheet.adjustments?.[0]?.adjustment_id).toBe(adjustmentId);

  // Reload the frozen snapshot through the real UI after the API retry. This verifies the
  // operational screen and immutable read model agree on the same final state.
  await page.getByRole("button", { name: "Tạo Cost Sheet" }).click();
  await expect(page.getByText("Đã khóa", { exact: true })).toBeVisible();
  await expect(page.getByText("Manufacturing variance")).toBeVisible();
});
