import { test, expect, type Page } from "@playwright/test";

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

function visibleList(page: Page) {
  return isMobile(page) ? page.locator(".mf-list-mobile") : page.getByRole("table");
}

/**
 * E2E SplitView 3 cột (M11-LAYOUT) + Form actions/workflow (M11-ACTIONS/WF) + AI tab.
 * Gate: click dòng mở split (KHÔNG chuyển màn) — list vẫn hiển thị; header có nút server/metadata-driven.
 */
test.describe("Split detail + actions", () => {
  test("click dòng mở chi tiết đúng bố cục responsive", async ({ page }) => {
    await page.goto("/view/list");
    await visibleList(page).getByText("Chuẩn bị demo").click();
    await expect(page.getByRole("tab", { name: "Tổng quan" })).toBeVisible();
    if (isMobile(page)) {
      // Mobile chỉ hiện một vùng: chi tiết toàn màn hình, có đường quay về danh sách
      await expect(page.getByRole("button", { name: /Danh sách/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Hoạt động/ })).toBeVisible();
    } else {
      // Desktop giữ danh sách bên trái; ở 1280px context tự thu gọn để ưu tiên form.
      await expect(page.getByRole("table").getByText("Verify contract")).toBeVisible();
      if (!await page.locator(".mf-context-frame").isVisible()) {
        await page.getByRole("button", { name: "Mở bảng hoạt động" }).click();
      }
      await expect(page.locator(".mf-context-frame").getByText("TASK-0001")).toBeVisible();
      await expect(page.getByText("Đã cập nhật tiến độ, chờ review nhé.")).toBeVisible();
    }
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
    test.skip(isMobile(page), "AI nằm trong context sheet trên màn hình hẹp");
    await page.goto("/view/list?open=TASK-0001");
    if (!await page.getByRole("tab", { name: "AI" }).isVisible()) {
      await page.getByRole("button", { name: "Mở bảng hoạt động" }).click();
    }
    await page.getByRole("tab", { name: "AI" }).click();
    await expect(page.getByText(/Chưa cấu hình nhà cung cấp AI/)).toBeVisible();
  });

  test("chế độ tập trung ưu tiên form và Escape quay lại split", async ({ page }) => {
    test.skip(isMobile(page), "Mobile vốn đã chỉ hiển thị một pane");
    await page.goto("/view/list?open=TASK-0001");
    await page.getByRole("button", { name: "Tập trung vào biểu mẫu" }).click();
    await expect(page.getByRole("button", { name: "Thoát chế độ tập trung" })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("table")).toBeVisible();
  });
});
