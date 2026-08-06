import { expect, test, type Page } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

async function newestSubmittedCut(page: Page): Promise<string | null> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["name", "docstatus", "cut_state"]),
    filters: JSON.stringify([["docstatus", "=", 1]]),
    order_by: "creation desc",
    limit_page_length: "1",
  });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}?${params}`);
  if (response.status !== 200) return null;
  return (unwrap(response.body) as Array<{ name?: string }>)?.[0]?.name ?? null;
}

async function firstReason(page: Page): Promise<string | null> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), limit_page_length: "1" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Lý do huỷ")}?${params}`);
  if (response.status !== 200) return null;
  return (unwrap(response.body) as Array<{ name?: string }>)?.[0]?.name ?? null;
}

async function confirmIfVisible(page: Page, preferred: string) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return;
  for (const label of [preferred, "Xác nhận", "Tiếp tục"]) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    if (await button.count()) { await button.click(); return; }
  }
}

test("E2E-09 operator reverses a posted Cut Order and retry does not duplicate authority @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-09", "Thủ kho/Quản lý");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  const cut = await newestSubmittedCut(page);
  test.skip(!cut, "BLOCKED_DATA no submitted Cut Order exists for correction/retry audit");
  const reason = await firstReason(page);
  test.skip(!reason, "BLOCKED_DATA no canonical Lý do huỷ exists for correction semantics");

  // Correction is intentionally not a first-click daily task. The exception route is still a
  // canonical app action and must execute with the same operator identity and server permission.
  await page.goto("/x/action%3Ahoan-cat");
  await expect(page.locator('[data-action-screen="hoan-cat"]')).toBeVisible();
  await chooseLink(page, "Phiếu cắt", cut!);
  await chooseLink(page, "Lý do", reason!);
  const note = page.getByLabel("Diễn giải", { exact: true });
  if (await note.count()) await note.fill("Operator E2E correction");
  await audit.checkpoint("Correction ready");

  const reverse = page.getByRole("button", { name: "Hoàn cắt", exact: true });
  await expect(reverse).toBeEnabled();
  await reverse.click();
  await confirmIfVisible(page, "Hoàn cắt");
  await expect(page.locator("body")).toContainText(/đã đảo|hoàn cắt|bút toán gốc/i, { timeout: 20_000 });

  const corrected = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}/${encodeURIComponent(cut!)}`);
  expect(corrected.status, corrected.text).toBe(200);
  expect(Number((unwrap(corrected.body) as Record<string, unknown>).docstatus)).toBe(2);

  // Retry must be safe. Current contract is allowed to reject the already-cancelled source.
  audit.allowHttp(409, /api\/method\/alumdoor\.cut\.reverse/, 1);
  audit.allowHttp(417, /api\/method\/alumdoor\.cut\.reverse/, 1);
  audit.allowHttp(422, /api\/method\/alumdoor\.cut\.reverse/, 1);
  await reverse.click();
  await confirmIfVisible(page, "Hoàn cắt");
  await page.waitForTimeout(1000);
  const afterRetry = await browserRequest(page, `/api/resource/${encodeURIComponent("Cut Order")}/${encodeURIComponent(cut!)}`);
  expect(afterRetry.status, afterRetry.text).toBe(200);
  expect(Number((unwrap(afterRetry.body) as Record<string, unknown>).docstatus)).toBe(2);

  // Navigate away from an expected business rejection before the global unexpected-error check.
  await page.goto("/?alumdoor=1");
  await audit.finish(testInfo);
});
