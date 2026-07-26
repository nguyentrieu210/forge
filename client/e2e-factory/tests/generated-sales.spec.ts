import { test, expect, type Page } from "@playwright/test";

/**
 * App SINH RA THỨ HAI (sample-sales, home=User, module/nav khác) — chứng minh generator TỔNG QUÁT,
 * không ngầm hard-code một app. Chỉ boot + list smoke là đủ để chứng minh khác biệt cấu hình.
 */
function watch(page: Page) {
  const reqs: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => reqs.push(r.url()));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { reqs, errors };
}
const fatal = (errors: string[]) => errors.filter((e) => !/favicon|React DevTools|ResizeObserver/i.test(e));

test("boot + home=User từ manifest + live list (generator generic, LIVE)", async ({ page }) => {
  const { reqs, errors } = watch(page);
  await page.goto("/");
  await expect(page.getByText(/Lỗi kết nối/i)).toHaveCount(0);
  // manifest home KHÁC sample-wms: "User"
  await expect(page.getByText("User").first()).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/app\/User/);

  await page.waitForTimeout(2000);
  const api = reqs.filter((u) => u.includes("/api/method") || u.includes("/api/resource"));
  expect(api.some((u) => /get_list|get_count|reportview/i.test(u)), "gọi list User").toBeTruthy();
  // KHÔNG dính cấu hình app kia (ToDo/WMS) — chứng minh không hard-code
  expect(reqs.some((u) => /aphvh|warehouse|receive/i.test(u)), "không endpoint WMS").toBeFalsy();

  const listRendered = await page.locator("table, [role='table'], .cursor-pointer").first().isVisible().catch(() => false);
  const emptyState = await page.getByText(/Chưa có|Không có dữ liệu|trống/i).first().isVisible().catch(() => false);
  expect(listRendered || emptyState, "list User render").toBeTruthy();

  expect(fatal(errors), fatal(errors).join("\n")).toHaveLength(0);
});
