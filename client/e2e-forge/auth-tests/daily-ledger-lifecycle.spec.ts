import { appendFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
const CLEANUP_MANIFEST = process.env.FORGE_QA_CLEANUP_MANIFEST;
const TENANT_ID = process.env.FORGE_QA_TENANT_ID || "demo";
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");
if (!CLEANUP_MANIFEST) throw new Error("FORGE_QA_CLEANUP_MANIFEST is required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & { doctype: string; name: string; docstatus: number; modified?: string };
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type Snapshot = { snapshot_id: string; source_fingerprint: string; line_count: number; existing: boolean; frozen: boolean };
type Reconciliation = { ok: boolean; snapshot_id: string; mismatches: JsonRecord[] };
type LedgerRow = { line_key: string; domain: string; source_type: string; source_ref: string; adjustment_count: number };

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

async function createResource(page: Page, csrf: string, doctype: string, document: JsonRecord): Promise<FrappeDoc> {
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    csrf,
    body: { doctype, ...document },
  });
  expect(response.ok, response.text).toBe(true);
  return registerDocument(unwrap(response.body) as FrappeDoc);
}

async function submit(page: Page, csrf: string, doc: FrappeDoc): Promise<FrappeDoc> {
  const response = await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  });
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as FrappeDoc;
}

async function cancel(page: Page, csrf: string, doc: FrappeDoc): Promise<FrappeDoc> {
  const response = await browserRequest(page, "/api/method/frappe.client.cancel", {
    method: "POST",
    csrf,
    body: { doctype: doc.doctype, name: doc.name },
  });
  expect(response.ok, response.text).toBe(true);
  return unwrap(response.body) as FrappeDoc;
}

async function createUser(page: Page, csrf: string, user: string, password: string, role: string) {
  const response = await browserRequest(page, "/api/method/metaforge.api.create_user", {
    method: "POST",
    csrf,
    body: { user, password, full_name: `QA ${role}`, email: user, roles: JSON.stringify([role]) },
  });
  expect(response.ok, response.text).toBe(true);
  registerUser(user);
}

async function call(page: Page, csrf: string, method: string, body: JsonRecord, token = csrf) {
  return browserRequest(page, `/api/method/${method}`, { method: "POST", csrf: token, body });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function createSubmittedPurchaseOrder(page: Page, csrf: string, note: string) {
  const order = await createResource(page, csrf, "Purchase Order", {
    supplier: "QA-SUPPLIER",
    priority: "Thường",
    transaction_date: today(),
    schedule_date: tomorrow(),
    company: "ALUMDOOR",
    currency: "VND",
    note,
    items: [{
      doctype: "Purchase Order Item",
      item_code: "QA-PURCHASE-ITEM",
      item_name: "QA Purchase Item",
      inventory_mode: "Hàng thường",
      measurement_profile: "Hàng thường",
      stock_uom: "Cái",
      uom: "Cái",
      qty: 1,
      conversion_factor: 1,
      stock_qty: 1,
      rate: 100000,
      amount: 100000,
      warehouse: "K36",
      is_stamped: "Không",
    }],
  });
  return submit(page, csrf, order);
}

async function openPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

test("P1 authenticated daily ledger rejects stale freeze and keeps freeze/adjustment immutable", async ({ page: adminPage, browser }, testInfo) => {
  const adminCsrf = await loginAs(adminPage, ADMIN_USER!, ADMIN_PASSWORD!);
  const suffix = `ledger-${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const ledgerUser = `${suffix}-accounting@example.test`;
  const ledgerPassword = `Ledger-${Date.now()}-Qa!`;
  const deniedUser = `${suffix}-stock@example.test`;
  const deniedPassword = `Stock-${Date.now()}-Qa!`;

  const stableOrder = await createSubmittedPurchaseOrder(adminPage, adminCsrf, `P1 stable ${suffix}`);
  const staleOrder = await createSubmittedPurchaseOrder(adminPage, adminCsrf, `P1 stale ${suffix}`);
  await createUser(adminPage, adminCsrf, ledgerUser, ledgerPassword, "Chief Accountant");
  await createUser(adminPage, adminCsrf, deniedUser, deniedPassword, "Stock Manager");

  const ledger = await openPage(browser);
  const denied = await openPage(browser);
  const anonymous = await openPage(browser);
  try {
    const ledgerCsrf = await loginAs(ledger.page, ledgerUser, ledgerPassword);
    const context = { ledger_date: today(), company: "ALUMDOOR", warehouse: "K36", customer: "", sales_order: "" };

    const badCsrf = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_generate", context, "wrong-csrf-token");
    expect(badCsrf.status, badCsrf.text).toBe(403);

    const injectedTenant = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_generate", { ...context, tenant_id: "other-tenant" });
    expect(injectedTenant.status, injectedTenant.text).toBe(417);
    expect(injectedTenant.text).toMatch(/tenant scope is controlled by the authenticated server context/i);

    const generated = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_generate", context);
    expect(generated.status, generated.text).toBe(200);
    const first = unwrap(generated.body) as Snapshot;
    expect(first.line_count).toBeGreaterThanOrEqual(2);
    expect(first.frozen).toBe(false);

    const rerun = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_generate", context);
    expect(rerun.status, rerun.text).toBe(200);
    const same = unwrap(rerun.body) as Snapshot;
    expect(same.snapshot_id).toBe(first.snapshot_id);
    expect(same.source_fingerprint).toBe(first.source_fingerprint);
    expect(same.existing).toBe(true);

    const initialReconcile = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_reconcile", context);
    expect(initialReconcile.status, initialReconcile.text).toBe(200);
    const initialMatch = unwrap(initialReconcile.body) as Reconciliation;
    expect(initialMatch.ok).toBe(true);
    expect(initialMatch.snapshot_id).toBe(first.snapshot_id);

    const cancelled = await cancel(adminPage, adminCsrf, staleOrder);
    expect(cancelled.docstatus).toBe(2);

    const staleFreeze = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_freeze", {
      snapshot_id: first.snapshot_id,
      reason: "must reject stale snapshot",
    });
    expect(staleFreeze.ok, staleFreeze.text).toBe(false);
    expect(staleFreeze.status).toBe(409);
    expect(staleFreeze.text).toMatch(/source changed/i);

    const currentResponse = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_generate", context);
    expect(currentResponse.status, currentResponse.text).toBe(200);
    const current = unwrap(currentResponse.body) as Snapshot;
    expect(current.snapshot_id).not.toBe(first.snapshot_id);
    expect(current.existing).toBe(true);

    const reconcileResponse = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_reconcile", context);
    expect(reconcileResponse.status, reconcileResponse.text).toBe(200);
    const reconciliation = unwrap(reconcileResponse.body) as Reconciliation;
    expect(reconciliation.ok).toBe(true);
    expect(reconciliation.snapshot_id).toBe(current.snapshot_id);

    const reportResponse = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_detailed_ledger", { snapshot_id: current.snapshot_id });
    expect(reportResponse.status, reportResponse.text).toBe(200);
    const rows = unwrap(reportResponse.body) as LedgerRow[];
    const purchase = rows.find((row) => row.domain === "Purchase" && row.source_ref === stableOrder.name);
    expect(purchase).toBeTruthy();
    expect(rows.some((row) => row.source_ref === staleOrder.name)).toBe(false);

    await ledger.page.goto("/x/daily-ledger:workbench");
    await expect(ledger.page.getByRole("heading", { name: "Sổ chi tiết hằng ngày" })).toBeVisible();
    const noHorizontalOverflow = await ledger.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHorizontalOverflow).toBe(true);

    const freezeResponse = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_freeze", {
      snapshot_id: current.snapshot_id,
      reason: "authenticated P1 close",
    });
    expect(freezeResponse.status, freezeResponse.text).toBe(200);
    expect((unwrap(freezeResponse.body) as { existing?: boolean }).existing).toBe(false);

    const freezeReplay = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_freeze", {
      snapshot_id: current.snapshot_id,
      reason: "authenticated P1 close",
    });
    expect(freezeReplay.status, freezeReplay.text).toBe(200);
    expect((unwrap(freezeReplay.body) as { existing?: boolean }).existing).toBe(true);

    const adjustmentId = `QA-ADJ-${suffix}`.slice(0, 220);
    const adjustmentPayload = {
      adjustment_id: adjustmentId,
      snapshot_id: current.snapshot_id,
      line_key: purchase!.line_key,
      reason: "Authenticated P1 correction",
      delta_amount_minor: 1,
      delta_quantity_micros: 0,
    };
    const adjustment = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_adjust", adjustmentPayload);
    expect(adjustment.status, adjustment.text).toBe(200);
    expect((unwrap(adjustment.body) as { existing?: boolean }).existing).toBe(false);

    const adjustmentReplay = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_adjust", adjustmentPayload);
    expect(adjustmentReplay.status, adjustmentReplay.text).toBe(200);
    expect((unwrap(adjustmentReplay.body) as { existing?: boolean }).existing).toBe(true);

    const conflictingReplay = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_ledger_adjust", {
      ...adjustmentPayload,
      delta_amount_minor: 2,
    });
    expect(conflictingReplay.ok, conflictingReplay.text).toBe(false);
    expect(conflictingReplay.status).toBe(409);

    const reportAfterAdjustment = await call(ledger.page, ledgerCsrf, "metaforge.accounts.daily_detailed_ledger", { snapshot_id: current.snapshot_id });
    const adjustedRows = unwrap(reportAfterAdjustment.body) as LedgerRow[];
    expect(adjustedRows.find((row) => row.line_key === purchase!.line_key)?.adjustment_count).toBe(1);

    const deniedCsrf = await loginAs(denied.page, deniedUser, deniedPassword);
    const deniedGenerate = await call(denied.page, deniedCsrf, "metaforge.accounts.daily_ledger_generate", context);
    expect(deniedGenerate.status, deniedGenerate.text).toBe(403);

    await anonymous.page.goto("/?alumdoor=1");
    const noSession = await browserRequest(anonymous.page, "/api/method/metaforge.accounts.daily_detailed_ledger", {
      method: "POST",
      body: { snapshot_id: current.snapshot_id },
    });
    expect(noSession.status, noSession.text).toBe(401);
  } finally {
    await ledger.close();
    await denied.close();
    await anonymous.close();
  }
});
