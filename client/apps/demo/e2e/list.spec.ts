import { test, expect, type Page } from "@playwright/test";

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

function visibleList(page: Page) {
  return isMobile(page) ? page.locator(".mf-list-mobile") : page.getByRole("table");
}

/**
 * E2E List data-table (M04) — filter/search/sort/URL-state/selection thao tác THẬT trên UI mock.
 * Gate cho M04-LIST-01..07 (không chỉ screenshot).
 */
test.describe("List data-table", () => {
  test("render cột metadata + STT + status badge + summary", async ({ page }) => {
    await page.goto("/view/list");
    if (isMobile(page)) {
      await expect(page.locator(".mf-list-mobile article").first()).toBeVisible();
      await expect(visibleList(page).getByText("Chuẩn bị demo")).toBeVisible();
      await expect(visibleList(page).getByText("Trạng thái").first()).toBeVisible();
    } else {
      await expect(page.getByRole("columnheader", { name: "Tiêu đề" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
      await expect(visibleList(page).getByText("Chuẩn bị demo")).toBeVisible();
    }
    // pagination "1–12 / 12"
    await expect(page.getByText("/ 12")).toBeVisible();
  });

  test("standard filter status → lọc + URL giữ khi reload", async ({ page }) => {
    await page.goto("/view/list?f_status=Working");
    // chỉ còn dòng Working (4)
    await expect(page.getByText("/ 4")).toBeVisible();
    await expect(page.getByText("Verify contract")).toHaveCount(0); // Closed → ẩn
    // reload giữ filter
    await page.reload();
    await expect(page.getByText("/ 4")).toBeVisible();
    await expect(page.getByText("Trạng thái: Working")).toBeVisible(); // chip
  });

  test("search thu hẹp kết quả", async ({ page }) => {
    await page.goto("/view/list");
    await page.getByPlaceholder("Tìm kiếm…").fill("tài liệu");
    await expect(visibleList(page).getByText("Viết tài liệu API")).toBeVisible();
    await expect(page.getByText("Chuẩn bị demo")).toHaveCount(0);
  });

  test("chọn dòng → bulk action bar hiện", async ({ page }) => {
    await page.goto("/view/list");
    // Radix Checkbox là button role=checkbox, không phải <input>; kiểm tra hành vi bằng click.
    await visibleList(page).getByLabel("Chọn TASK-0001").click();
    await expect(visibleList(page).getByLabel("Chọn TASK-0001")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("1 đã chọn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Xoá" })).toBeVisible();
  });
});
