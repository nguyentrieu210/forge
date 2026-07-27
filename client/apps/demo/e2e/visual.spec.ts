import { test, expect } from "@playwright/test";

/**
 * Cổng hồi quy hình ảnh cho ba bề rộng đại diện trong playwright.config.
 * Ảnh chỉ thay khi người review chủ động chạy với --update-snapshots.
 */
test.describe("visual regression", () => {
  for (const [name, route] of [
    ["list", "/view/list"],
    ["form", "/view/form"],
    ["calendar", "/view/calendar"],
    ["builder", "/view/b-doctype"],
  ] as const) {
    test(`${name} giữ bố cục`, async ({ page }, testInfo) => {
      await page.goto(route);
      if (name === "builder") await expect(page.getByText("Loại trường")).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page).toHaveScreenshot(`${testInfo.project.name}-${name}.png`, {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
