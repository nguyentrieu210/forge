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
      full_name: user.startsWith("stock-manager") ? "QA Stock Manager" : "QA Stock User",
      email: user,
      roles: JSON.stringify(roles),
    },
  });
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as { user: string; roles: string[] };
}

async function physicalStock(page: Page, csrf: string, warehouse: string) {
  const response = await browserRequest(page, "/api/method/metaforge.inventory.physical_stock", {
    method: "POST",
    csrf,
    body: {
      args: JSON.stringify({
        company: "ALUMDOOR",
        warehouse,
        item_code: "QA-PURCHASE-ITEM",
        include_lineage: true,
        limit: 50,
      }),
    },
  });
  expect(response.status, response.text).toBe(200);
  return unwrap(response.body) as {
    rows?: Array<{ item_code?: string; warehouse?: string; quantity_micros?: number; quantity?: string | number }>;
    totals?: { quantity_micros?: number };
  };
}

function reportQtyMicros(report: Awaited<ReturnType<typeof physicalStock>>): number {
  if (typeof report.totals?.quantity_micros === "number") return report.totals.quantity_micros;
  return (report.rows ?? []).reduce((sum, row) => {
    if (typeof row.quantity_micros === "number") return sum + row.quantity_micros;
    return sum + Math.round(Number(row.quantity ?? 0) * 1_000_000);
  }, 0);
}

function postingAt(): string {
  return `${new Date().toISOString().slice(0, 10)} 10:00:00`;
}

async function createAndSubmitStockEntry(
  page: Page,
  csrf: string,
  purpose: "Material Receipt" | "Material Issue" | "Material Transfer",
  qty: number,
  sourceWarehouse?: string,
  targetWarehouse?: string,
) {
  const created = await createResource(page, csrf, "Stock Entry", {
    company: "ALUMDOOR",
    posting_at: postingAt(),
    purpose,
    note: `Authenticated stock QA ${purpose}`,
    items: [{
      doctype: "Stock Entry Detail",
      item_code: "QA-PURCHASE-ITEM",
      qty,
      uom: "Cái",
      ...(sourceWarehouse ? { source_warehouse: sourceWarehouse } : {}),
      ...(targetWarehouse ? { target_warehouse: targetWarehouse } : {}),
      ...(purpose === "Material Receipt" ? { valuation_rate: 100000 } : {}),
    }],
  });
  expect(created.docstatus).toBe(0);
  const submitted = await submit(page, csrf, created);
  expect(submitted.docstatus).toBe(1);
  return submitted;
}

function expectDocumentRoute(page: Page, doctype: string, name: string) {
  expect(page.url()).toContain(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
}

test("authenticated receipt, issue, transfer and reconciliation preserve stock lifecycle", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const adminCsrf = await loginAs(page, ADMIN_USER, ADMIN_PASSWORD);
  const suffix = `${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const stockUser = `stock-user-${suffix}@example.test`;
  const stockManager = `stock-manager-${suffix}@example.test`;
  const stockUserPassword = `StockUser-${Date.now()}-Qa!`;
  const stockManagerPassword = `StockManager-${Date.now()}-Qa!`;

  const createdUser = await createUser(page, adminCsrf, stockUser, stockUserPassword, ["Thủ kho"]);
  expect(createdUser.user).toBe(stockUser);
  const createdManager = await createUser(page, adminCsrf, stockManager, stockManagerPassword, ["Chủ xưởng"]);
  expect(createdManager.user).toBe(stockManager);

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

  const receipt = await createAndSubmitStockEntry(page, adminCsrf, "Material Receipt", 10, undefined, sourceWarehouse.name);
  expect(reportQtyMicros(await physicalStock(page, adminCsrf, sourceWarehouse.name))).toBe(10_000_000);

  await page.goto(`/app/${encodeURIComponent("Stock Entry")}/${encodeURIComponent(receipt.name)}`);
  expectDocumentRoute(page, "Stock Entry", receipt.name);
  await expect(page.locator("body")).toContainText("QA-PURCHASE-ITEM");

  await createAndSubmitStockEntry(page, adminCsrf, "Material Issue", 2, sourceWarehouse.name);
  expect(reportQtyMicros(await physicalStock(page, adminCsrf, sourceWarehouse.name))).toBe(8_000_000);

  const transfer = await createAndSubmitStockEntry(
    page,
    adminCsrf,
    "Material Transfer",
    3,
    sourceWarehouse.name,
    targetWarehouse.name,
  );
  expect(reportQtyMicros(await physicalStock(page, adminCsrf, sourceWarehouse.name))).toBe(5_000_000);
  expect(reportQtyMicros(await physicalStock(page, adminCsrf, targetWarehouse.name))).toBe(3_000_000);

  const stockUserCsrf = await loginAs(page, stockUser, stockUserPassword);
  const reconciliation = await createResource(page, stockUserCsrf, "Stock Reconciliation", {
    warehouse: targetWarehouse.name,
    scope: "Một mặt hàng",
    item_code: "QA-PURCHASE-ITEM",
    snapshot_at: postingAt(),
    counted_by: stockUser,
    note: `Authenticated stock count ${suffix}`,
    items: [{
      doctype: "Stock Reconciliation Item",
      item_code: "QA-PURCHASE-ITEM",
      counted_qty: 2,
      variance_reason: "Khác",
      variance_note: "Authenticated QA count variance",
    }],
  });
  expect(reconciliation.docstatus).toBe(0);

  const selfApprove = await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf: stockUserCsrf,
    body: { doc: JSON.stringify(reconciliation) },
  });
  expect(selfApprove.ok, selfApprove.text).toBe(false);
  expect([403, 417, 422]).toContain(selfApprove.status);

  const managerCsrf = await loginAs(page, stockManager, stockManagerPassword);
  const managerView = await getResource(page, "Stock Reconciliation", reconciliation.name);
  const submittedReconciliation = await submit(page, managerCsrf, managerView);
  expect(submittedReconciliation.docstatus).toBe(1);
  expect(reportQtyMicros(await physicalStock(page, managerCsrf, targetWarehouse.name))).toBe(2_000_000);

  await page.goto(`/app/${encodeURIComponent("Stock Reconciliation")}/${encodeURIComponent(submittedReconciliation.name)}`);
  expectDocumentRoute(page, "Stock Reconciliation", submittedReconciliation.name);
  await expect(page.locator("body")).toContainText("QA-PURCHASE-ITEM");

  const immutableCancel = await cancelRaw(page, managerCsrf, "Stock Reconciliation", submittedReconciliation.name);
  expect(immutableCancel.ok, immutableCancel.text).toBe(false);
  expect([409, 417, 422]).toContain(immutableCancel.status);
  expect((await getResource(page, "Stock Reconciliation", submittedReconciliation.name)).docstatus).toBe(1);

  expect((await getResource(page, "Stock Entry", transfer.name)).docstatus).toBe(1);
  expect(pageErrors).toEqual([]);
});
