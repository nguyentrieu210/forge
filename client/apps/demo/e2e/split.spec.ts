import { test, expect } from "@playwright/test";

/**
 * E2E SplitView 3 cột (M11-LAYOUT) + Form actions/workflow (M11-ACTIONS/WF) + AI tab.
 * Gate: click dòng mở split (KHÔNG chuyển màn) — list vẫn hiển thị; header có nút server/metadata-driven.
 */
test.describe("Split detail + actions", () => {
  test("click dòng mở 3 cột — list vẫn còn, form + context hiện", async ({ page }) => {
    await page.goto("/view/list");
    await page.getByText("Chuẩn bị demo").click();
    // list trái vẫn còn dòng khác
    await expect(page.getByText("Verify contract")).toBeVisible();
    // giữa: form header + tabs
    await expect(page.getByRole("tab", { name: "Tổng quan" })).toBeVisible();
    // phải: context panel + timeline
    await expect(page.getByText("TASK-0001")).toBeVisible();
    await expect(page.getByText("Đã cập nhật tiến độ, chờ review nhé.")).toBeVisible();
  });

  test("mở URL trực tiếp ?open= giữ đúng record", async ({ page }) => {
    await page.goto("/view/list?open=TASK-0003");
    await expect(page.getByRole("tab", { name: "Tổng quan" })).toBeVisible();
    // "Build renderer" xuất hiện ở CẢ list lẫn form header (chứng minh split) → scope vào form
    await expect(page.locator("form").getByText("Build renderer")).toBeVisible();
  });

  test("header có workflow action + form action (metadata-driven)", async ({ page }) => {
    await page.goto("/view/list?open=TASK-0001");
    await expect(page.getByRole("button", { name: "Hoàn thành" })).toBeVisible(); // workflow transition
    await expect(page.getByRole("button", { name: "Lưu" })).toBeVisible(); // form action
  });

  test("tab AI hiện trạng thái chưa cấu hình", async ({ page }) => {
    await page.goto("/view/list?open=TASK-0001");
    await page.getByRole("tab", { name: "AI" }).click();
    await expect(page.getByText(/Chưa cấu hình nhà cung cấp AI/)).toBeVisible();
  });
});
