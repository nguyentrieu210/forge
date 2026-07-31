import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function noDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport + 1);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

async function submissionCount(page: Page) {
  return page.evaluate(() => JSON.parse(document.body.getAttribute("data-submissions") ?? "[]").length as number);
}

test("settlement actions are capability-gated, require reason and submit through the adapter", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Phân bổ PR-QA-0001" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đóng cửa sổ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đảo tất toán" })).toBeVisible();

  await page.getByRole("button", { name: "Đóng cửa sổ" }).click();
  await expect(page.getByRole("heading", { name: "Đóng cửa sổ tất toán" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng cửa sổ", exact: true }).last().click();
  await expect(page.getByRole("alert")).toContainText("Lý do là bắt buộc");
  await page.locator("#allocation-action-reason").fill("Nhà máy xác nhận đây là chuyến giao cuối");
  await page.getByRole("button", { name: "Đóng cửa sổ", exact: true }).last().click();
  await expect.poll(() => submissionCount(page)).toBe(1);
  await expect(page.getByRole("heading", { name: "Đóng cửa sổ tất toán" })).toBeHidden();

  await page.getByRole("button", { name: "Đảo tất toán" }).click();
  await page.locator("#allocation-action-reason").fill("Đính chính biên bản giao cuối");
  await page.getByRole("button", { name: "Đảo tất toán", exact: true }).last().click();
  await expect.poll(() => submissionCount(page)).toBe(2);
  await noDocumentOverflow(page);
  await screenshot(page, testInfo, "purchase-settlement-actions");
});

test("manual override validates target and positive quantity", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Điều chỉnh" })).toBeVisible();
  await page.getByRole("button", { name: "Điều chỉnh" }).click();
  await expect(page.getByRole("heading", { name: "Điều chỉnh phân bổ FIFO" })).toBeVisible();
  await page.locator("#allocation-action-reason").fill("Điều chuyển theo xác nhận nhà máy");
  await page.getByRole("button", { name: "Ghi điều chỉnh" }).click();
  await expect(page.getByRole("alert")).toContainText("Đơn mua đích");
  await page.locator("#allocation-target-po").fill("PO-QA-0002");
  await page.locator("#allocation-target-row").fill("PO-ROW-2");
  await page.locator("#allocation-override-qty").fill("0");
  await page.getByRole("button", { name: "Ghi điều chỉnh" }).click();
  await expect(page.getByRole("alert")).toContainText("lớn hơn 0");
  await page.locator("#allocation-override-qty").fill("10");
  await page.getByRole("button", { name: "Ghi điều chỉnh" }).click();
  await expect.poll(() => submissionCount(page)).toBe(1);
  await noDocumentOverflow(page);
  await screenshot(page, testInfo, "purchase-manual-override");
});

test("supplier debt report filters, resets and exports CSV", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Công nợ NCC" }).click();
  await expect(page.getByRole("heading", { name: "Công nợ giao hàng nhà cung cấp" })).toBeVisible();
  await expect(page.getByText("FACTORY-1", { exact: true })).toBeVisible();
  const supplier = page.getByRole("textbox", { name: "Nhà cung cấp" });
  await supplier.fill("không tồn tại");
  await expect(page.getByText("Không có cửa sổ phù hợp bộ lọc.")).toBeVisible();
  await page.getByRole("button", { name: "Đặt lại" }).click();
  await expect(page.getByText("FACTORY-1", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^purchase-supplier-debt-/);
  await noDocumentOverflow(page);
  await screenshot(page, testInfo, "purchase-supplier-debt-report");
});
