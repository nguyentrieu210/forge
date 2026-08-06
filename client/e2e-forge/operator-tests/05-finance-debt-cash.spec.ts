import { expect, test } from "@playwright/test";
import { annotate, browserRequest, login, openModule, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

async function newestOpenReceivable(page: import("@playwright/test").Page): Promise<string | null> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["name", "customer", "docstatus", "outstanding_amount"]),
    filters: JSON.stringify([["customer", "=", "QA-CUSTOMER"], ["docstatus", "=", 1], ["outstanding_amount", ">", 0]]),
    order_by: "creation desc",
    limit_page_length: "1",
  });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Sales Invoice")}?${params}`);
  if (response.status !== 200) return null;
  const rows = unwrap(response.body) as Array<{ name?: string }>;
  return rows?.[0]?.name ?? null;
}

test("E2E-05 accountant reaches receivable payment from the real Công nợ workspace @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-05", "Kế toán");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  const invoice = await newestOpenReceivable(page);
  test.skip(!invoice, "BLOCKED_DATA no submitted open Sales Invoice for QA-CUSTOMER; finance flow cannot be proven from an empty AR opening");

  await openModule(page, "Công nợ");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Công nợ" });
  await expect(tabs).toBeVisible();
  const paymentTab = tabs.getByRole("button", { name: "Thu / chi công nợ", exact: true });
  await expect(paymentTab).toBeVisible();
  await paymentTab.click();
  await expect(page.locator("body")).toContainText(/Payment Entry|Thanh toán|Thu.*chi/i);

  // The current reference workspace exposes canonical Payment Entry. Until the local fixture
  // has a deterministic invoice + allocation preset, do not fake a green write with an API call.
  // Reaching the actual transaction surface is evidence; task completion remains BLOCKED_DATA.
  await audit.checkpoint("Finance payment surface");
  test.skip(true, `BLOCKED_DATA open invoice ${invoice} exists but no canonical local Payment Entry allocation fixture is declared yet; UI write intentionally not bypassed`);
});
