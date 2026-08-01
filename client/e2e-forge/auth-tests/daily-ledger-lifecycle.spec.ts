import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_USER = process.env.FORGE_AUTH_USER;
const ADMIN_PASSWORD = process.env.FORGE_AUTH_PASSWORD;
const CLEANUP_MANIFEST = process.env.FORGE_QA_CLEANUP_MANIFEST;
const TENANT_ID = process.env.FORGE_QA_TENANT_ID || "demo";
if (!ADMIN_USER || !ADMIN_PASSWORD) throw new Error("FORGE_AUTH_USER and FORGE_AUTH_PASSWORD are required");
if (!CLEANUP_MANIFEST) throw new Error("FORGE_QA_CLEANUP_MANIFEST is required");

type JsonRecord = Record<string, unknown>;
type FrappeDoc = JsonRecord & {
  doctype: string;
  name: string;
  docstatus: number;
  modified?: string;
  items?: JsonRecord[];
};
type BrowserResponse = { status: number; ok: boolean; body: unknown; text: string };
type Snapshot = {
  snapshot_id: string;
  context_key: string;
  source_fingerprint: string;
  line_count: number;
  existing: boolean;
  frozen: boolean;
};
type LedgerRow = {
  snapshot_id: string;
  line_key: string;
  domain: string;
  source_type: string;
  source_ref: string;
  metric: string;
  snapshot_quantity_micros: number;
  snapshot_amount_minor: number;
  adjusted_quantity_micros: number;
  adjusted_amount_minor: number;
  adjustment_count: number;
};
type Reconciliation = {
  ok: boolean;
  snapshot_id: string;
  snapshot_counts: Record<string, number>;
  live_counts: Record<string, number>;
  mismatches: Array<{ kind: string; domain: string; line_key: string }>;
};

function registerDocument(doc: FrappeDoc) {
  appendFileSync(CLEANUP_MANIFEST!, `${JSON.stringify({ tenant_id: TENANT_ID, kind: "document", doctype: doc.doctype, name: doc.name })}\n`);
  return doc;
}

function registerUser(user: string) {
  appendFileSync(CLEANUP_MANIFEST!, `${JSON.stringify({ tenant_id: TENANT_ID, kind: "user", user_id: user })}\n`);
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
  return registerDocument(await requireDoc(await browserRequest(page, `/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    csrf,
    body: { doctype, ...document },
  })));
}

async function submit(page: Page, csrf: string, doc: FrappeDoc) {
  return requireDoc(await browserRequest(page, "/api/method/frappe.client.submit", {
    method: "POST",
    csrf,
    body: { doc: JSON.stringify(doc) },
  }));
}

async function createUser(page: Page, csrf: string, user: string, password: string, roles: string[]) {
  const response = await browserRequest(page, "/api/method/metaforge.api.create_user", {
    method: "POST",
    csrf,
    body: {
      user,
      password,
      full_name: `QA Daily Ledger ${roles.join(" ")}`,
      email: user,
      roles: JSON.stringify(roles),
    },
  });
  expect(response.ok, response.text).toBe(true);
  registerUser(user);
  return unwrap(response.body) as { user: string; roles: string[] };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrow(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function postingAt(hour: number): string {
  return `${today()} ${String(hour).padStart(2, "0")}:00:00`;
}

async function createPurchaseFlow(page: Page, csrf: string, warehouse: string, suffix: string, hour: number) {
  const order = await createResource(page, csrf, "Purchase Order", {
    supplier: "QA-SUPPLIER",
    priority: "Thường",
    transaction_date: today(),
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
      qty: 2,
      conversion_factor: 1,
      stock_qty: 2,
      rate: 100000,
      amount: 200000,
      warehouse,
      is_stamped: "Không",
    }],
  });
  const submittedOrder = await submit(page, csrf, order);
  expect(submittedOrder.docstatus).toBe(1);

  const receipt = await createResource(page, csrf, "Purchase Receipt", {
    supplier: "QA-SUPPLIER",
    against_purchase_order: submittedOrder.name,
    posting_at: postingAt(hour),
    supplier_invoice_no: `DL-${suffix}`.slice(0, 120),
    driver: "QA Daily Ledger",
    goods_photo: "/files/qa-daily-ledger.jpg",
    note: `Daily ledger authenticated receipt ${suffix}`,
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
      warehouse,
      purchase_order: submittedOrder.name,
      is_stamped: "Không",
    }],
  });
  const submittedReceipt = await submit(page, csrf, receipt);
  expect(submittedReceipt.docstatus).toBe(1);
  return { order: submittedOrder, receipt: submittedReceipt };
}

async function ledgerCall(page: Page, csrf: string, method: string, body: JsonRecord): Promise<BrowserResponse> {
  return browserRequest(page, `/api/method/metaforge.accounts.${method}`, {
    method: "POST",
    csrf,
    body,
  });
}

test("P1 authenticated Daily Detailed Ledger is idempotent, frozen and append-only", async ({ page }, testInfo) => {
  const suffix = `daily-${testInfo.project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const ledgerUser = `${suffix}-accountant@example.test`;
  const ledgerPassword = `Ledger-${Date.now()}-Qa!`;
  const deniedUser = `${suffix}-stock@example.test`;
  const deniedPassword = `Denied-${Date.now()}-Qa!`;

  const adminCsrf = await loginAs(page, ADMIN_USER!, ADMIN_PASSWORD!);
  const allowed = await createUser(page, adminCsrf, ledgerUser, ledgerPassword, ["General Accountant", "Kế toán"]);
  expect(allowed.roles).toContain("General Accountant");
  const denied = await createUser(page, adminCsrf, deniedUser, deniedPassword, ["Thủ kho"]);
  expect(denied.roles).toContain("Thủ kho");
  const warehouse = await createResource(page, adminCsrf, "Warehouse", {
    warehouse_name: `QA Daily ${suffix}`,
    stock_role: "Kho chính",
    is_group: 0,
    disabled: 0,
  });

  let csrf = await loginAs(page, ledgerUser, ledgerPassword);
  const firstSource = await createPurchaseFlow(page, csrf, warehouse.name, `${suffix}-first`, 9);
  const context = { ledger_date: today(), company: "ALUMDOOR", warehouse: warehouse.name, customer: "", sales_order: "" };

  const generated = await ledgerCall(page, csrf, "daily_ledger_generate", context);
  expect(generated.status, generated.text).toBe(200);
  const firstSnapshot = unwrap(generated.body) as Snapshot;
  expect(firstSnapshot.existing).toBe(false);
  expect(firstSnapshot.frozen).toBe(false);
  expect(firstSnapshot.line_count).toBeGreaterThan(0);

  const rerun = await ledgerCall(page, csrf, "daily_ledger_generate", context);
  expect(rerun.status, rerun.text).toBe(200);
  const sameSnapshot = unwrap(rerun.body) as Snapshot;
  expect(sameSnapshot.snapshot_id).toBe(firstSnapshot.snapshot_id);
  expect(sameSnapshot.source_fingerprint).toBe(firstSnapshot.source_fingerprint);
  expect(sameSnapshot.existing).toBe(true);

  const reportResponse = await ledgerCall(page, csrf, "daily_detailed_ledger", { snapshot_id: firstSnapshot.snapshot_id });
  expect(reportResponse.status, reportResponse.text).toBe(200);
  const rows = unwrap(reportResponse.body) as LedgerRow[];
  expect(rows.some((row) => row.domain === "Purchase" && row.source_ref === firstSource.order.name)).toBe(true);
  expect(rows.some((row) => row.domain === "Purchase" && row.source_ref === firstSource.receipt.name)).toBe(true);
  expect(rows.some((row) => row.domain === "Inventory" && row.source_ref === firstSource.receipt.name)).toBe(true);

  const reconciled = await ledgerCall(page, csrf, "daily_ledger_reconcile", context);
  expect(reconciled.status, reconciled.text).toBe(200);
  const beforeFreeze = unwrap(reconciled.body) as Reconciliation;
  expect(beforeFreeze.ok).toBe(true);
  expect(beforeFreeze.snapshot_id).toBe(firstSnapshot.snapshot_id);
  expect(beforeFreeze.snapshot_counts.Purchase).toBeGreaterThanOrEqual(2);
  expect(beforeFreeze.snapshot_counts.Inventory).toBeGreaterThanOrEqual(1);
  expect(beforeFreeze.mismatches).toEqual([]);

  const tenantInjection = await ledgerCall(page, csrf, "daily_ledger_generate", { ...context, tenant_id: "attacker-tenant" });
  expect(tenantInjection.status, tenantInjection.text).toBe(422);
  const badCsrf = await ledgerCall(page, "invalid-csrf-token", "daily_ledger_generate", context);
  expect(badCsrf.status, badCsrf.text).toBe(403);

  await page.goto("/x/daily-ledger:workbench?alumdoor=1");
  await expect(page.getByRole("heading", { name: "Sổ chi tiết hằng ngày" })).toBeVisible();
  await page.locator('input[type="date"]').fill(context.ledger_date);
  await page.getByPlaceholder("Bắt buộc").fill(context.company);
  await page.getByPlaceholder("Tất cả").nth(0).fill(context.warehouse);
  await page.getByRole("button", { name: /Cập nhật sổ/ }).click();
  await expect(page.getByText(firstSource.order.name, { exact: true })).toBeVisible();
  await expect(page.getByText(firstSource.receipt.name, { exact: true }).first()).toBeVisible();

  const orderRow = page.getByText(firstSource.order.name, { exact: true }).locator("tr");
  await orderRow.click();
  await page.locator("textarea").nth(0).fill("Khóa sổ QA sau đối chiếu nguồn");
  await page.getByRole("button", { name: /Khóa sổ/ }).click();
  await expect(page.getByText("Đã khóa", { exact: true })).toBeVisible();

  await page.locator('input[type="number"]').nth(1).fill("1000");
  await page.locator("textarea").nth(1).fill("Điều chỉnh kiểm thử append-only");
  await page.getByRole("button", { name: "Ghi điều chỉnh" }).click();

  const afterUiAdjustmentResponse = await ledgerCall(page, csrf, "daily_detailed_ledger", { snapshot_id: firstSnapshot.snapshot_id });
  expect(afterUiAdjustmentResponse.status, afterUiAdjustmentResponse.text).toBe(200);
  const adjustedRows = unwrap(afterUiAdjustmentResponse.body) as LedgerRow[];
  const adjustedOrder = adjustedRows.find((row) => row.domain === "Purchase" && row.source_ref === firstSource.order.name);
  expect(adjustedOrder).toBeTruthy();
  expect(adjustedOrder?.adjustment_count).toBe(1);
  expect(adjustedOrder?.adjusted_amount_minor).toBe((adjustedOrder?.snapshot_amount_minor ?? 0) + 1000);

  const deterministicAdjustment = {
    adjustment_id: `QA-DLA-${suffix}`.slice(0, 200),
    snapshot_id: firstSnapshot.snapshot_id,
    line_key: adjustedOrder!.line_key,
    reason: "Kiểm tra idempotency điều chỉnh",
    delta_amount_minor: 500,
    delta_quantity_micros: 0,
    details: { qa: true },
  };
  const firstAdjustment = await ledgerCall(page, csrf, "daily_ledger_adjust", deterministicAdjustment);
  expect(firstAdjustment.status, firstAdjustment.text).toBe(200);
  expect((unwrap(firstAdjustment.body) as { existing: boolean }).existing).toBe(false);
  const repeatedAdjustment = await ledgerCall(page, csrf, "daily_ledger_adjust", deterministicAdjustment);
  expect(repeatedAdjustment.status, repeatedAdjustment.text).toBe(200);
  expect((unwrap(repeatedAdjustment.body) as { existing: boolean }).existing).toBe(true);
  const conflictingAdjustment = await ledgerCall(page, csrf, "daily_ledger_adjust", { ...deterministicAdjustment, delta_amount_minor: 501 });
  expect(conflictingAdjustment.ok).toBe(false);

  await createPurchaseFlow(page, csrf, warehouse.name, `${suffix}-after-freeze`, 11);
  const regenerateFrozen = await ledgerCall(page, csrf, "daily_ledger_generate", context);
  expect(regenerateFrozen.ok).toBe(false);
  expect(regenerateFrozen.text).toContain("frozen");
  const changedReconciliation = await ledgerCall(page, csrf, "daily_ledger_reconcile", context);
  expect(changedReconciliation.status, changedReconciliation.text).toBe(200);
  const changed = unwrap(changedReconciliation.body) as Reconciliation;
  expect(changed.ok).toBe(false);
  expect(changed.mismatches.length).toBeGreaterThan(0);

  csrf = await loginAs(page, deniedUser, deniedPassword);
  const deniedGenerate = await ledgerCall(page, csrf, "daily_ledger_generate", context);
  expect(deniedGenerate.status, deniedGenerate.text).toBe(403);
  const deniedRead = await ledgerCall(page, csrf, "daily_detailed_ledger", { snapshot_id: firstSnapshot.snapshot_id });
  expect(deniedRead.status, deniedRead.text).toBe(403);

  await page.context().clearCookies();
  const staleSession = await ledgerCall(page, csrf, "daily_ledger_generate", context);
  expect(staleSession.status, staleSession.text).toBe(403);
});
