import { test, expect } from "@playwright/test";

test.describe("Tree keyboard", () => {
  test("roving focus follows the ARIA tree keyboard model", async ({ page }) => {
    await page.goto("/view/tree");
    const items = page.getByRole("treeitem");
    await expect(items).toHaveCount(4);

    await items.first().focus();
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(items.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.first()).toBeFocused();

    await page.keyboard.press("d");
    await expect(page.getByRole("treeitem", { name: /Dịch vụ/ })).toBeFocused();
  });
});
