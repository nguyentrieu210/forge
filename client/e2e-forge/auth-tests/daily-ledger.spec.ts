import { expect, test, type Page } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");

type JsonRecord = Record<string, unknown>;
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type FrappeDoc = JsonRecord & { doctype: string; name: string; docstatus: number; modified?: string };

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
  const value = body as JsonRecord;
  if ("data" in value) return value.data;
  if ("message" in value) return value.message;
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
  return requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", csrf, body: { doctype, ...document },
  }));
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST", csrf, body: { doc: JSON.stringify(doc) },
  }));
}

async function createUser(page: Page, csrf: string, user: string, password: string, role: string) {
  const response = await browserRequest(page, "/api/method/metaforge.api.create_user", {
    method: "POST", csrf,
    body: { user, password, full_name: "QA Daily Ledger Accountant", email: user, roles: JSON.stringify([role]) },
  });
  expect(response.ok, response.text).toBe(true);
}

async function daily(page: Page, csrf: string, method: string, args: JsonRecord): Promise<BrowserResponse> {
  return browserRequest(page, `/api/method/metaforge.accounts.${method}`, {
    method: "POST", csrf, body: { args: JSON.stringify(args) },
  });
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("authenticated daily ledger is idempotent, frozen and append-only", async ({ page }, testInfo) => {
  const adminCsrf = await loginAs(page, ADMIN_USER!, ADMIN_PASSWORD!);
  const today = new Date().toISOString().slice(0, 10);
  const suffix = `${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const accountant = `daily-ledger-${suffix}@example.test`;
  const accountantPassword = `DailyLedger-${Date.now()}-Qa!`;
  await createUser(page, adminCsrf, accountant, accountantPassword, "Kế toán tổng hợp");

  const order = await createResource(page, adminCsrf, "Purchase Order", {
    supplier: "QA-SUPPLIER",
    priority: "Thường",
    transaction_date: today,
    schedule_date: tomorrow(),
    company: "ALUMDOOR",
    currency: "VND",
    note: `Daily ledger authenticated source ${suffix}`,
    items: [{
      doctype: "Purchase Order Item",
      item_code: "QA-PURCHASE-ITEM",
      item_name: "QA Purchase Item",
      inventory_mode: "Hàng thường",
      measurement_profile: "Hàng thường",
      stock_uom: "Cái",
      uom: "Cái",
      qty: 3,
      conversion_factor: 1,
      stock_qty: 3,
      rate: 120000,
      amount: 360000,
      warehouse: "K36",
      is_stamped: "Không",
    }],
  });
  const submittedOrder = await submit(page, adminCsrf, order);
  expect(submittedOrder.docstatus).toBe(1);

  const csrf = await loginAs(page, accountant, accountantPassword);
  const context = { ledger_date: today, company: "ALUMDOOR" };

  const first = await daily(page, csrf, "daily_ledger_generate", context);
  expect(first.status, first.text).toBe(200);
  const generated = unwrap(first.body) as { snapshot_id: string; existing: boolean; frozen: boolean; line_count: number };
  expect(generated.existing).toBe(false);
  expect(generated.frozen).toBe(false);
  expect(generated.line_count).toBeGreaterThan(0);

  const second = await daily(page, csrf, "daily_ledger_generate", context);
  expect(second.status, second.text).toBe(200);
  const repeated = unwrap(second.body) as { snapshot_id: string; existing: boolean };
  expect(repeated.snapshot_id).toBe(generated.snapshot_id);
  expect(repeated.existing).toBe(true);

  const reconciliation = await daily(page, csrf, "daily_ledger_reconcile", context);
  expect(reconciliation.status, reconciliation.text).toBe(200);
  const reconciled = unwrap(reconciliation.body) as { ok: boolean; live_counts: JsonRecord; snapshot_counts: JsonRecord; mismatches: unknown[] };
  expect(reconciled.ok).toBe(true);
  expect(Number(reconciled.live_counts.Purchase)).toBeGreaterThan(0);
  expect(Number(reconciled.snapshot_counts.Purchase)).toBeGreaterThan(0);
  expect(reconciled.mismatches).toEqual([]);

  const report = await daily(page, csrf, "daily_detailed_ledger", { snapshot_id: generated.snapshot_id });
  expect(report.status, report.text).toBe(200);
  const rows = unwrap(report.body) as Array<{ line_key: string; domain: string; adjusted_amount_minor: number; adjustment_count: number }>;
  const purchaseLine = rows.find((row) => row.domain === "Purchase");
  expect(purchaseLine).toBeTruthy();

  const freeze = await daily(page, csrf, "daily_ledger_freeze", {
    snapshot_id: generated.snapshot_id,
    reason: "Khóa sổ QA authenticated",
  });
  expect(freeze.status, freeze.text).toBe(200);

  const frozenGenerate = await daily(page, csrf, "daily_ledger_generate", context);
  expect(frozenGenerate.status, frozenGenerate.text).toBe(200);
  const frozen = unwrap(frozenGenerate.body) as { snapshot_id: string; existing: boolean; frozen: boolean };
  expect(frozen.snapshot_id).toBe(generated.snapshot_id);
  expect(frozen.existing).toBe(true);
  expect(frozen.frozen).toBe(true);

  const adjustmentId = `QA-DLA-${suffix}`.slice(0, 200);
  const adjustment = {
    adjustment_id: adjustmentId,
    snapshot_id: generated.snapshot_id,
    line_key: purchaseLine!.line_key,
    reason: "Điều chỉnh QA sau khóa",
    delta_amount_minor: 12345,
    details: { source: "authenticated-p1" },
  };
  const firstAdjustment = await daily(page, csrf, "daily_ledger_adjust", adjustment);
  expect(firstAdjustment.status, firstAdjustment.text).toBe(200);
  expect((unwrap(firstAdjustment.body) as { existing: boolean }).existing).toBe(false);

  const repeatedAdjustment = await daily(page, csrf, "daily_ledger_adjust", adjustment);
  expect(repeatedAdjustment.status, repeatedAdjustment.text).toBe(200);
  expect((unwrap(repeatedAdjustment.body) as { existing: boolean }).existing).toBe(true);

  const conflictingAdjustment = await daily(page, csrf, "daily_ledger_adjust", { ...adjustment, delta_amount_minor: 12346 });
  expect([409, 417]).toContain(conflictingAdjustment.status);

  const adjustedReport = await daily(page, csrf, "daily_detailed_ledger", { snapshot_id: generated.snapshot_id });
  expect(adjustedReport.status, adjustedReport.text).toBe(200);
  const adjustedRows = unwrap(adjustedReport.body) as Array<{ line_key: string; adjusted_amount_minor: number; adjustment_count: number }>;
  const adjusted = adjustedRows.find((row) => row.line_key === purchaseLine!.line_key);
  expect(adjusted?.adjustment_count).toBe(1);

  const tenantInjection = await daily(page, csrf, "daily_ledger_generate", { ...context, tenant_id: "other-tenant" });
  expect([403, 417, 422]).toContain(tenantInjection.status);
});
