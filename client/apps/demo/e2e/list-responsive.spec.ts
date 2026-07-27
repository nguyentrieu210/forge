import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { width: 390, height: 844, mode: "mobile" },
  { width: 412, height: 915, mode: "mobile" },
  { width: 768, height: 1024, mode: "desktop" },
  { width: 1280, height: 800, mode: "desktop" },
  { width: 1440, height: 900, mode: "desktop" },
] as const;

test("List giữ đúng renderer và không tràn trang ở 5 breakpoint chuẩn", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Một browser run kiểm đủ 5 viewport");

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/view/list");
    await expect(page.getByPlaceholder("Tìm kiếm…")).toBeVisible();

    const layout = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(layout.pageOverflow, `${viewport.width}px không được tràn ngang cả trang`).toBe(false);

    if (viewport.mode === "mobile") {
      await expect(page.getByRole("table")).toBeHidden();
      await expect(page.locator(".mf-list-mobile article").first()).toBeVisible();
    } else {
      const table = page.getByRole("table");
      await expect(table).toBeVisible();
      const leadWidths = await table.locator("thead th").evaluateAll((headers) =>
        headers.slice(0, 2).map((header) => Math.round(header.getBoundingClientRect().width)));
      expect(leadWidths).toEqual([44, 56]);

      if (viewport.width >= 1280) {
        const horizontal = await table.evaluate((element) => {
          const scroller = element.parentElement;
          return Boolean(scroller && scroller.scrollWidth > scroller.clientWidth);
        });
        expect(horizontal, `${viewport.width}px không nên có thanh cuộn ngang khi dùng bộ cột mặc định`).toBe(false);
      }
    }

    await testInfo.attach(`list-${viewport.width}x${viewport.height}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  }
});
