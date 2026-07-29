import { test, expect, type Page } from "@playwright/test";

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

test.describe("Child table spreadsheet controls", () => {
  test("customizes columns and supports multi-row delete with undo", async ({ page }) => {
    await page.goto("/view/form");
    await page.getByRole("tab", { name: "Checklist" }).click();
    await page.getByRole("button", { name: "Mở bảng lớn" }).click();

    await page.getByRole("button", { name: "Cột", exact: true }).click();
    await page.getByRole("textbox", { name: "Tên hiển thị cột Xong" }).fill("Hoàn tất");
    await page.getByRole("button", { name: "Ghim cột Xong" }).click();
    await page.getByRole("button", { name: "Xong", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Hoàn tất" })).toBeVisible();

    await page.getByRole("checkbox", { name: "Chọn dòng 1" }).click();
    await page.getByRole("button", { name: "Xóa 1 dòng" }).click();
    await expect(page.getByText("0 dòng", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hoàn tác xóa" }).click();
    await expect(page.getByText("1 dòng", { exact: true })).toBeVisible();
  });

  test("Tab wraps to the next row and paste starts at the active cell", async ({ page }) => {
    test.skip(isMobile(page), "Spreadsheet keyboard flow is a desktop workflow");
    await page.goto("/view/form");
    await page.getByRole("tab", { name: "Checklist" }).click();
    await page.getByRole("button", { name: "Mở bảng lớn" }).click();
    await page.getByRole("button", { name: "Thêm dòng" }).click();

    const grid = page.locator(".mf-grid-excel");
    const firstDone = grid.locator('[data-cell="0:1"]').getByRole("checkbox");
    await firstDone.focus();
    await page.keyboard.press("Tab");
    await expect(grid.locator('[data-cell="1:0"] input')).toBeFocused();

    await firstDone.focus();
    await firstDone.evaluate((element) => {
      const data = new DataTransfer();
      data.setData("text/plain", "0\tignored\n1\tignored");
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await expect(firstDone).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("2 dòng", { exact: true })).toBeVisible();
  });
});
