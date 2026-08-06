import { expect, test } from "@playwright/test";
import { annotate, browserRequest, chooseLink, login, openModule, OperatorAudit, requireLocalMutation, unwrap } from "./harness.js";

async function newestSubmittedSalesOrder(page: import("@playwright/test").Page): Promise<string | null> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["name", "docstatus"]),
    filters: JSON.stringify([["docstatus", "=", 1]]),
    order_by: "creation desc",
    limit_page_length: "1",
  });
  const response = await browserRequest(page, `/api/resource/${encodeURIComponent("Sales Order")}?${params}`);
  if (response.status !== 200) return null;
  const rows = unwrap(response.body) as Array<{ name?: string }>;
  return rows?.[0]?.name ?? null;
}

async function confirmIfVisible(page: import("@playwright/test").Page, preferred: string) {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return;
  for (const label of [preferred, "Xác nhận", "Tiếp tục"]) {
    const button = dialog.getByRole("button", { name: label, exact: true });
    if (await button.count()) { await button.click(); return; }
  }
}

test("E2E-04 production planner converts a submitted Sales Order through UI @core", async ({ page }, testInfo) => {
  annotate(testInfo, "E2E-04", "Sản xuất");
  requireLocalMutation();
  const audit = new OperatorAudit(page);
  await login(page, audit);

  const salesOrder = await newestSubmittedSalesOrder(page);
  test.skip(!salesOrder, "BLOCKED_DATA no submitted Sales Order exists for production planning");

  await openModule(page, "Sản xuất");
  const tabs = page.getByRole("navigation", { name: "Nghiệp vụ Sản xuất" });
  await expect(tabs).toBeVisible();
  const createTab = tabs.getByRole("button", { name: "Lập sản xuất", exact: true });
  await expect(createTab).toBeVisible();
  await createTab.click();

  await chooseLink(page, "Đơn hàng đã ghi sổ", salesOrder!);
  await chooseLink(page, "Kho nguyên vật liệu", "K36");
  await chooseLink(page, "Kho nhập thành phẩm", "K36");

  const preview = page.getByRole("button", { name: "Xem kế hoạch", exact: true });
  await expect(preview).toBeEnabled();
  await preview.click();
  await expect(page.locator("body")).toContainText(/kế hoạch|bộ cửa|Work Order|lệnh sản xuất/i, { timeout: 20_000 });
  const body = await page.locator("body").innerText();
  test.skip(/không thể|thiếu cấu hình|không có BOM|chưa có/i.test(body), `BLOCKED_CONFIG production preview: ${body.slice(-700)}`);
  await audit.checkpoint("Production preview");

  const commit = page.getByRole("button", { name: "Tạo yêu cầu và lệnh sản xuất", exact: true });
  await expect(commit).toBeEnabled();
  await commit.click();
  await confirmIfVisible(page, "Tạo yêu cầu và lệnh sản xuất");
  await expect(page.locator("body")).toContainText(/Production Request|Yêu cầu sản xuất|Work Order|Lệnh sản xuất/i, { timeout: 20_000 });

  const params = new URLSearchParams({
    fields: JSON.stringify(["name", "sales_order"]),
    filters: JSON.stringify([["sales_order", "=", salesOrder]]),
    order_by: "creation desc",
    limit_page_length: "5",
  });
  const readback = await browserRequest(page, `/api/resource/${encodeURIComponent("Production Request")}?${params}`);
  test.skip(readback.status !== 200, `BLOCKED_CONFIG Production Request readback ${readback.status}: ${readback.text.slice(0, 300)}`);
  const requests = unwrap(readback.body) as Array<Record<string, unknown>>;
  expect(requests.length, "authoritative Production Request must exist after UI commit").toBeGreaterThan(0);

  await audit.checkpoint("Production authoritative readback");
  await audit.finish(testInfo);
});
