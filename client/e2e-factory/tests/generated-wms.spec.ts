import { test, expect, type Page } from "@playwright/test";

/**
 * App SINH RA (sample-wms, home=ToDo) chạy LIVE — KHÔNG dùng apps/demo. Tất cả LIVE (real backend
 * qua proxy). Chứng minh: boot · manifest nav · locale · route · list thật · mở doc · sửa+lưu+reload ·
 * network không hard-code WMS/demo · không lỗi runtime nghiêm trọng.
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

test("boot + manifest nav + locale + live list + network sạch (LIVE)", async ({ page }) => {
  const { reqs, errors } = watch(page);
  await page.goto("/");

  // BOOT: không lỗi kết nối, "Đang tải…" biến mất, shell hiện nav từ manifest (ToDo).
  await expect(page.getByText(/Lỗi kết nối/i)).toHaveCount(0);
  await expect(page.getByText("ToDo").first()).toBeVisible({ timeout: 30_000 });
  // HOME ROUTE từ manifest: redirect "/" → /app/ToDo.
  await expect(page).toHaveURL(/\/app\/ToDo/);

  await page.waitForTimeout(2000);
  const api = reqs.filter((u) => u.includes("/api/method") || u.includes("/api/resource"));
  // boot call thật
  expect(api.some((u) => /get_boot|metaforge\.api|get_logged_user|bootinfo/i.test(u)), "gọi boot").toBeTruthy();
  // list call thật (get_list/get_count/reportview)
  expect(api.some((u) => /get_list|get_count|reportview/i.test(u)), "gọi list").toBeTruthy();
  // KHÔNG endpoint hard-code WMS/demo/sample
  expect(reqs.some((u) => /aphvh|\bwms\b|warehouse|receive|inventory_discrepancy/i.test(u)), "không endpoint WMS/demo").toBeFalsy();

  // list render (bảng hoặc empty-state — không kẹt loading)
  const listRendered = await page.locator("table, [role='table'], .cursor-pointer").first().isVisible().catch(() => false);
  const emptyState = await page.getByText(/Chưa có|Không có dữ liệu|trống/i).first().isVisible().catch(() => false);
  expect(listRendered || emptyState, "list đã render (rows hoặc empty-state)").toBeTruthy();

  expect(fatal(errors), fatal(errors).join("\n")).toHaveLength(0);
});

test("mở document: click row → form render (LIVE)", async ({ page }) => {
  await page.goto("/app/ToDo");
  const row = page.locator("tr[data-index]").first();
  await row.waitFor({ state: "visible", timeout: 25_000 }); // ToDo có dữ liệu thật
  await row.click();
  await expect(page).toHaveURL(/\/app\/ToDo\/.+/);
  await expect(page.locator("textarea, input").first()).toBeVisible({ timeout: 15_000 });
});

test("sửa field → lưu → reload còn dữ liệu → cleanup (LIVE edit cycle)", async ({ page }) => {
  const stamp = `MF-E2E-${Date.now()}`;
  // record disposable qua API (minimal insert an toàn)
  const ins = await page.request.post("/api/method/frappe.client.insert", { data: { doc: { doctype: "ToDo", description: "MF-E2E base" } } });
  expect(ins.status()).toBe(200);
  const name = (await ins.json()).message.name as string;
  try {
    // MỞ trong app sinh ra → SỬA description → LƯU (patch chỉ field đổi + OCC modified).
    // Target field theo id (#mf-description) — KHÔNG .first() vì context panel cũng có textarea (ô comment).
    await page.goto(`/app/ToDo/${encodeURIComponent(name)}`);
    const ta = page.locator("#mf-description");
    await ta.waitFor({ state: "visible", timeout: 20_000 });
    await ta.fill(`MF-E2E ${stamp}`);
    // đợi ĐÚNG request save (PUT /api/resource/ToDo/<name>) — bằng chứng deterministic, không phụ thuộc toast ephemeral
    const savePromise = page.waitForResponse((r) => /\/api\/resource\/ToDo\//.test(r.url()) && r.request().method() === "PUT", { timeout: 20_000 });
    await page.getByRole("button", { name: /^lưu|save/i }).first().click();
    const saveResp = await savePromise;
    expect(saveResp.status(), "save PUT live thành công").toBe(200);
    // RELOAD → persistence THẬT
    await page.reload();
    await expect(page.locator("#mf-description")).toHaveValue(new RegExp(stamp), { timeout: 20_000 });
  } finally {
    const del = await page.request.post("/api/method/frappe.client.delete", { data: { doctype: "ToDo", name } });
    expect([200, 202]).toContain(del.status());
  }
});
