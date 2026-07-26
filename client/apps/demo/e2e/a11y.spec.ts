import { test, expect } from "@playwright/test";

/**
 * E2E a11y (P5) — kiểm landmark/aria/keyboard cơ bản (không cần backend, mock mode).
 * Không thay axe (thêm dep sau); đây là gate khả dụng bàn phím + nhãn truy cập tối thiểu.
 */
test.describe("a11y — bàn phím + nhãn truy cập", () => {
  test("landmark: có navigation + main", async ({ page }) => {
    await page.goto("/view/list");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("Awesomebar mở bằng Ctrl+K và đóng bằng Esc", async ({ page }) => {
    await page.goto("/view/list");
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // ô tìm kiếm nhận focus (gõ được ngay)
    await page.keyboard.type("task");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("Awesomebar mở bằng phím /", async ({ page }) => {
    await page.goto("/view/list");
    await page.keyboard.press("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("nút biểu tượng có aria-label (không nút trống)", async ({ page }) => {
    await page.goto("/view/list");
    // các nút icon quan trọng ở topbar có nhãn
    await expect(page.getByRole("button", { name: "Thông báo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "AI" })).toBeVisible();
  });

  test("checkbox chọn tất cả có nhãn", async ({ page }) => {
    await page.goto("/view/list");
    await expect(page.getByLabel("Chọn tất cả trang")).toBeVisible();
  });
});
