import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E a11y (P5) — kiểm landmark/aria/keyboard cơ bản (không cần backend, mock mode).
 * Axe + gate khả dụng bàn phím/nhãn truy cập. Vi phạm nghiêm trọng hoặc critical làm test đỏ.
 */
test.describe("a11y — bàn phím + nhãn truy cập", () => {
  test("landmark: có navigation + main", async ({ page }) => {
    await page.goto("/view/list");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  for (const route of ["/view/list", "/view/form", "/view/kanban", "/view/calendar", "/view/dashboard"]) {
    test(`axe không có lỗi nghiêm trọng: ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
      const report = blocking.flatMap((violation) => violation.nodes.map((node) => ({ rule: violation.id, target: node.target.join(" "), html: node.html.slice(0, 180) })));
      expect(report).toEqual([]);
    });
  }

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
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      await page.getByRole("button", { name: "Thêm thao tác" }).click();
      await expect(page.getByRole("menuitem", { name: /AI/ })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "AI" })).toBeVisible();
    }
  });

  test("checkbox chọn tất cả có nhãn", async ({ page }) => {
    await page.goto("/view/list");
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      const checkbox = page.locator(".mf-list-mobile [role='checkbox']").first();
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toHaveAttribute("aria-label", /.+/);
    } else await expect(page.getByLabel("Chọn tất cả trang")).toBeVisible();
  });

  test("bỏ qua menu và mở một dòng danh sách bằng bàn phím", async ({ page }) => {
    await page.goto("/view/list");
    await page.getByRole("link", { name: /Bỏ qua menu/ }).focus();
    await expect(page.getByRole("link", { name: /Bỏ qua menu/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    const row = page.locator("tbody tr[tabindex='0']").first();
    if (await row.count()) { await row.focus(); await page.keyboard.press("Enter"); }
  });
});
