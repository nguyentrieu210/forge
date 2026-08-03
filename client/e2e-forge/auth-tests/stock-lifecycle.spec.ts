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
  items?: JsonRecord[];
};

type BrowserResponse = {
  status: number;
  ok: boolean;
  body: unknown;
  text: string;
};

type PhysicalStockReport = {
  rows?: Array<{
    item_code?: string;
    warehouse?: string;
    quantity_micros?: number;
    weight_micros?: number | null;
    lineage?: Array<{ voucher_type?: string; voucher_no?: string; quantity_micros?: number; weight_micros?: number | null }>;
  }>;
  totals?: { quantity_micros?: number; weight_micros?: number | null };
  lineage_redacted?: boolean;
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
  const message = unwrap(boot.body) as { user?: string; csrf_token?: string; roles?: string[] };
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
    method: "POST",
    csrf,
    body: { doctype, ...document },
  }));
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

async function submitRaw(page: Page, csrf: string, doc: FrappeDoc) {
  return browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  });
}

async function cancelRaw(page: Page, csrf: string, doctype: string, name: string) {
  return browserRequest(page, "/api/method/frappe.client.cancel", {
    method: "POST",
    csrf,
    body: { doctype, name },
  });
}

async function createUser(
  page: Page,
  csrf: string,
  user: string,
  password: string,
  roles: string[],
) {
  const response = await browserRequest(page, "/api/method/metaforge.api.create_user", {
    method: "POST",
    csrf,
    body: {
      user,
      password,
      full_name: user.startsWith("stock-manager")
        ? "QA Stock Manager"
        : user.startsWith("production-user")
          ? "QA Production User"
          : "QA Stock User",
      email: user,
      roles: JSON.stringify(roles),
    },
  });
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as { user: string; roles: string[] };
}

async function physicalStock(page: Page, csrf: string, warehouse: string, itemCode: string): Promise<PhysicalStockReport> {
  const response = await browserRequest(page, "/api/method/metaforge.inventory.physical_stock", {
    method: "POST",
    csrf,
    body: {
      args: JSON.stringify({
        company: "ALUMDOOR",
        warehouse,
        item_code: itemCode,
        include_lineage: true,
        limit: 50,
      }),
    },
  });
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as PhysicalStockReport;
}

function reportQtyMicros(report: PhysicalStockReport): number {
  if (typeof report.totals?.quantity_micros === "number") return report.totals.quantity_micros;
  return (report.rows ?? []).reduce((sum, row) => sum + Number(row.quantity_micros ?? 0), 0);
}

function reportWeightMicros(report: PhysicalStockReport): number | null {
  if (typeof report.totals?.weight_micros === "number") return report.totals.weight_micros;
  if (report.totals?.weight_micros === null) return null;
  const rows = report.rows ?? [];
  if (rows.some((row) => row.weight_micros === null || row.weight_micros === undefined)) return null;
  return rows.reduce((sum, row) => sum + Number(row.weight_micros ?? 0), 0);
}

function lineageVouchers(report: PhysicalStockReport): string[] {
  return (report.rows ?? [])
    .flatMap((row) => row.lineage ?? [])
    .map((entry) => String(entry.voucher_no ?? ""))
    .filter(Boolean);
}

function postingAt(): string {
  return `${new Date().toISOString().slice(0, 10)} 10:00:00`;
}

async function createStockEntryDraft(
  page: Page,
  csrf: string,
  itemCode: string,
  purpose: "Material Receipt" | "Material Issue" | "Material Transfer",
  qty: number,
  weightKg: number,
  sourceWarehouse?: string,
  targetWarehouse?: string,
) {
  const created = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose,
    note: `Authenticated catch-weight QA ${purpose}`,
    items: [{
      doctype: "Stock Entry Detail",
      item_code: itemCode,
      qty,
      weight_kg: weightKg,
      uom: "Cái",
      ...(sourceWarehouse ? { source_warehouse: sourceWarehouse } : {}),
      ...(targetWarehouse ? { target_warehouse: targetWarehouse } : {}),
      ...(purpose === "Material Receipt" ? { valuation_rate: 100000 } : {}),
    }],
  });
  expect(created.docstatus).toBe(0);
  return created;
}

async function createAndSubmitStockEntry(
  page: Page,
  csrf: string,
  itemCode: string,
  purpose: "Material Receipt" | "Material Issue" | "Material Transfer",
  qty: number,
  weightKg: number,
  sourceWarehouse?: string,
  targetWarehouse?: string,
) {
  const created = await createStockEntryDraft(page, csrf, itemCode, purpose, qty, weightKg, sourceWarehouse, targetWarehouse);
  const submitted = await submit(page, csrf, created);
  expect(submitted.docstatus).toBe(1);
  return submitted;
}

function expectDocumentRoute(page: Page, doctype: string, name: string) {
  expect(page.url()).toContain(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

test("authenticated operational roles preserve quantity, catch weight, lineage and submit separation", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const adminCsrf = await loginAs(page, ADMIN_USER, ADMIN_PASSWORD);
  const suffix = `${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const stockUser = `stock-user-${suffix}@example.test`;
  const stockManager = `stock-manager-${suffix}@example.test`;
  const productionUser = `production-user-${suffix}@example.test`;
  const itemCode = `QA-CATCH-${suffix}`.slice(0, 120);
  const stockUserPassword = `StockUser-${Date.now()}-Qa!`;
  const stockManagerPassword = `StockManager-${Date.now()}-Qa!`;
  const productionUserPassword = `ProductionUser-${Date.now()}-Qa!`;

  const createdUser = await createUser(page, adminCsrf, stockUser, stockUserPassword, ["Thủ kho"]);
  expect(createdUser.user).toBe(stockUser);
  expect(createdUser.roles).toContain("Thủ kho");
  const createdManager = await createUser(page, adminCsrf, stockManager, stockManagerPassword, ["Chủ xưởng"]);
  expect(createdManager.user).toBe(stockManager);
  expect(createdManager.roles).toContain("Chủ xưởng");
  const createdProductionUser = await createUser(page, adminCsrf, productionUser, productionUserPassword, ["Sản xuất"]);
  expect(createdProductionUser.user).toBe(productionUser);
  expect(createdProductionUser.roles).toContain("Sản xuất");

  const sourceWarehouse = await createResource(page, adminCsrf, "Warehouse", {
    warehouse_name: `QA Source ${suffix}`,
    stock_role: "Kho chính",
    is_group: 0,
    disabled: 0,
  });
  const targetWarehouse = await createResource(page, adminCsrf, "Warehouse", {
    warehouse_name: `QA Target ${suffix}`,
    stock_role: "Kho chính",
    is_group: 0,
    disabled: 0,
  });
  const catchWeightItem = await createResource(page, adminCsrf, "Item", {
    item_code: itemCode,
    item_name: `QA Catch Weight ${suffix}`,
    item_group: "QA Purchase Items",
    item_nature: "Hàng tồn kho",
    material_stage: "Hàng hoá",
    supply_type: "Mua ngoài",
    is_stock_item: 1,
    is_purchase_item: 1,
    is_sales_item: 0,
    include_item_in_manufacturing: 0,
    measurement_profile: "Hàng thường",
    stock_uom: "Cái",
    default_purchase_uom: "Cái",
    default_sales_uom: "Cái",
    default_warehouse: sourceWarehouse.name,
    inventory_account: "Hàng tồn kho",
    expense_account: "Hàng tồn kho",
    valuation_method: "FIFO",
    has_catch_weight: 1,
    weight_uom: "Kg",
    allow_negative_stock: 0,
    disabled: 0,
    description: "Local authenticated catch-weight stock lifecycle QA",
  });
  expect(catchWeightItem.name).toBe(itemCode);

  const stockUserCsrf = await loginAs(page, stockUser, stockUserPassword);
  const receipt = await createAndSubmitStockEntry(
    page, stockUserCsrf, itemCode, "Material Receipt", 10, 65.7, undefined, sourceWarehouse.name,
  );
  const afterReceipt = await physicalStock(page, stockUserCsrf, sourceWarehouse.name, itemCode);
  expect(afterReceipt.lineage_redacted).toBe(false);
  expect(reportQtyMicros(afterReceipt)).toBe(10_000_000);
  expect(reportWeightMicros(afterReceipt)).toBe(65_700_000);
  expect(lineageVouchers(afterReceipt)).toContain(receipt.name);

  await page.goto(`/app/${encodeURIComponent("Stock Entry")}/${encodeURIComponent(receipt.name)}`);
  expectDocumentRoute(page, "Stock Entry", receipt.name);
  await expect(page.locator("body")).toContainText("Authenticated catch-weight QA Material Receipt");

  const issue = await createAndSubmitStockEntry(
    page, stockUserCsrf, itemCode, "Material Issue", 2, 13.14, sourceWarehouse.name,
  );
  const afterIssue = await physicalStock(page, stockUserCsrf, sourceWarehouse.name, itemCode);
  expect(reportQtyMicros(afterIssue)).toBe(8_000_000);
  expect(reportWeightMicros(afterIssue)).toBe(52_560_000);
  expect(lineageVouchers(afterIssue)).toEqual(expect.arrayContaining([receipt.name, issue.name]));

  const managerCsrf = await loginAs(page, stockManager, stockManagerPassword);
  const transfer = await createAndSubmitStockEntry(
    page, managerCsrf, itemCode, "Material Transfer", 3, 19.71, sourceWarehouse.name, targetWarehouse.name,
  );
  const sourceAfterTransfer = await physicalStock(page, managerCsrf, sourceWarehouse.name, itemCode);
  const targetAfterTransfer = await physicalStock(page, managerCsrf, targetWarehouse.name, itemCode);
  expect(reportQtyMicros(sourceAfterTransfer)).toBe(5_000_000);
  expect(reportWeightMicros(sourceAfterTransfer)).toBe(32_850_000);
  expect(reportQtyMicros(targetAfterTransfer)).toBe(3_000_000);
  expect(reportWeightMicros(targetAfterTransfer)).toBe(19_710_000);
  expect(lineageVouchers(targetAfterTransfer)).toContain(transfer.name);

  const productionCsrf = await loginAs(page, productionUser, productionUserPassword);
  const productionDraft = await createStockEntryDraft(
    page, productionCsrf, itemCode, "Material Issue", 1, 6.57, sourceWarehouse.name,
  );
  const productionSubmit = await submitRaw(page, productionCsrf, productionDraft);
  expect(productionSubmit.ok, productionSubmit.text).toBe(false);
  expect(productionSubmit.status).toBe(403);
  expect((await getResource(page, "Stock Entry", productionDraft.name)).docstatus).toBe(0);

  const stockUserCsrfForCount = await loginAs(page, stockUser, stockUserPassword);
  const reconciliation = await createResource(page, stockUserCsrfForCount, "Stock Reconciliation", {
    warehouse: targetWarehouse.name,
    scope: "Một mặt hàng",
    item_code: itemCode,
    snapshot_at: postingAt(),
    counted_by: stockUser,
    note: `Authenticated catch-weight count ${suffix}`,
    items: [{
      doctype: "Stock Reconciliation Item",
      item_code: itemCode,
      counted_qty: 2,
      counted_weight_kg: 13.14,
      variance_reason: "Khác",
      variance_note: "Authenticated catch-weight QA count variance",
    }],
  });
  expect(reconciliation.docstatus).toBe(0);

  const selfApprove = await submitRaw(page, stockUserCsrfForCount, reconciliation);
  expect(selfApprove.ok, selfApprove.text).toBe(false);
  expect([403, 417, 422]).toContain(selfApprove.status);

  const managerCsrfForApproval = await loginAs(page, stockManager, stockManagerPassword);
  const managerView = await getResource(page, "Stock Reconciliation", reconciliation.name);
  const submittedReconciliation = await submit(page, managerCsrfForApproval, managerView);
  expect(submittedReconciliation.docstatus).toBe(1);
  const afterReconciliation = await physicalStock(page, managerCsrfForApproval, targetWarehouse.name, itemCode);
  expect(reportQtyMicros(afterReconciliation)).toBe(2_000_000);
  expect(reportWeightMicros(afterReconciliation)).toBe(13_140_000);
  expect(lineageVouchers(afterReconciliation)).toEqual(expect.arrayContaining([transfer.name, submittedReconciliation.name]));

  await page.goto(`/app/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(submittedReconciliation.name)}`);
  expectDocumentRoute(page, "Stock Reconciliation", submittedReconciliation.name);
  await expect(page.locator("body")).toContainText(`Authenticated catch-weight count ${suffix}`);

  const cancelledReconciliation = await cancelRaw(page, managerCsrfForApproval, "Stock Reconciliation", submittedReconciliation.name);
  expect(cancelledReconciliation.ok, cancelledReconciliation.text).toBe(true);
  expect((await getResource(page, "Stock Reconciliation", submittedReconciliation.name)).docstatus).toBe(2);
  const afterReversal = await physicalStock(page, managerCsrfForApproval, targetWarehouse.name, itemCode);
  expect(reportQtyMicros(afterReversal)).toBe(3_000_000);
  expect(reportWeightMicros(afterReversal)).toBe(19_710_000);
  expect(lineageVouchers(afterReversal)).toContain(submittedReconciliation.name);

  expect((await getResource(page, "Stock Entry", transfer.name)).docstatus).toBe(1);
  expect(pageErrors).toEqual([]);
});