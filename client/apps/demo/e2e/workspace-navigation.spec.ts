import { expect, test, type Page } from "@playwright/test";

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { message: "workspace must not create document-level horizontal overflow" },
  ).toBeLessThanOrEqual(1);
}

test.describe("MetaForge workspace navigation", () => {
  test("keeps process, overview and DocType journeys in the required order", async ({ page }, testInfo) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/view\/process$/);
    await expect(page.getByRole("heading", { name: "QUY TRÌNH NGHIỆP VỤ CÔNG VIỆC" })).toBeVisible();
    await expectNoDocumentOverflow(page);

    const operationsTabs = page.locator(".mf-workspace-tabs nav");
    await expect(operationsTabs.getByRole("button")).toHaveText([
      "Quy trình nghiệp vụ",
      "Báo cáo tổng quan",
      "Công việc",
    ]);
    await expect(operationsTabs.getByRole("button", { name: "Quy trình nghiệp vụ", exact: true })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Tạo công việc", exact: true }).click();
    const taskDialog = page.getByRole("dialog", { name: "Tạo mới công việc" });
    await expect(taskDialog).toBeVisible();
    await taskDialog.getByRole("button", { name: "Mở biểu mẫu Task mới" }).click();

    await expect(page).toHaveURL(/\/view\/form\?new=1$/);
    await expect(page.locator(".mf-workspace-tabs nav").getByRole("button", { name: "Công việc", exact: true })).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Meta", exact: true }).click();
    await expect(page).toHaveURL(/\/view\/meta-process$/);
    await expect(page.getByRole("heading", { name: "QUY TRÌNH THIẾT KẾ META" })).toBeVisible();
    await expectNoDocumentOverflow(page);

    const metaTabs = page.locator(".mf-workspace-tabs nav");
    await expect(metaTabs.getByRole("button")).toHaveText([
      "Quy trình nghiệp vụ",
      "Báo cáo tổng quan",
      "DocType",
      "Workflow",
      "Print Format",
      "Dashboard",
    ]);

    await page.screenshot({ path: testInfo.outputPath("meta-process.png"), fullPage: true });

    await page.getByRole("button", { name: "Tạo mới cấu hình Meta", exact: true }).click();
    const metaDialog = page.getByRole("dialog", { name: "Tạo mới cấu hình Meta" });
    await expect(metaDialog).toBeVisible();
    await metaDialog.getByRole("button", { name: /DocType mới/ }).click();

    await expect(page).toHaveURL(/\/view\/b-doctype\?new=1$/);
    await expect(page.locator(".mf-workspace-tabs nav").getByRole("button", { name: "DocType", exact: true })).toHaveAttribute("aria-current", "page");

    await page.locator(".mf-workspace-tabs nav").getByRole("button", { name: "Báo cáo tổng quan", exact: true }).click();
    await expect(page).toHaveURL(/\/view\/meta-overview$/);
    await expect(page.getByRole("heading", { name: "Báo cáo tổng quan Meta" })).toBeVisible();
    await expectNoDocumentOverflow(page);

    await page.screenshot({ path: testInfo.outputPath("meta-overview.png"), fullPage: true });
  });
});
