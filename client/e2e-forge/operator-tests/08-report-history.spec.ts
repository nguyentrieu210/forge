import { expect, test } from "@playwright/test";
import { annotate, browserRequest, login, openModule, OperatorAudit, unwrap } from "./harness.js";

async function newestPurchaseOrder(page: import("@playwright/test").Page): Promise<string | null> {
  const params = new URLSearchParams({ fields: JSON.stringify(["name"]), order_by: "creation desc", limit_page_length: "1" });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Purchase Order")}?${params}`);
  if (response.status !== 200) return null;
  return (unwrap(response.body) as Array<{ name?: string }>)?.[0]?.name ?? null;
}

test("E2E-08 manager can trace a canonical purchase document through history and report @core @mobile", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-08", "Quản lý/Kế toán");
  const audit = new OperatorAudit(page);
  await login(page, audit);
  const po = await newestPurchaseOrder(page);
  test.skip(!po, "BLOCKED_DATA no Purchase Order exists for report/history drilldown");

  await openModule(page, "Mua hàng");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Mua hàng" });
  await expect(tabs).toBeVisible();

  const history = tabs.getByRole("button", { name: "Lịch sử mua hàng", exact: true });
  await expect(history).toBeVisible();
  await history.click();
  await expect(page.locator("body")).toContainText(po!, { timeout: 20_000 });
  await audit.checkpoint("Purchase history drilldown source visible");

  const report = tabs.getByRole("button", { name: "Báo cáo", exact: true });
  await expect(report).toBeVisible();
  await report.click();
  await expect(page.locator("body")).toContainText(/nhà cung cấp|đơn mua|mua hàng|giá trị/i, { timeout: 20_000 });
  await audit.checkpoint("Purchase operational report");
  await audit.finish(testInfo);
});
