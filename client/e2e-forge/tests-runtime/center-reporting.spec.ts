import { test, expect, type Page } from "@playwright/test";

/**
 * Reporting and data exchange, in a real browser, on the real deployment.
 *
 * These four things were each "done" in code and each invisible on screen, which is why
 * they are tested HERE rather than only against the API:
 *
 *   · A report whose columns arrive under the engine's own field names renders correct
 *     headers, the correct row count, and every cell blank. The API answer looks perfect.
 *   · A `Link` column that lost its target doctype renders the id (`LOP-2026-0001`) where
 *     a class name belongs. Also a valid-looking API answer.
 *   · Currency with no symbol prints `400000`. Nothing fails.
 *   · The list view's export button exists in the component and was never passed a
 *     handler, so it never appeared. Grepping the source finds it; using the app does not.
 *
 * Every one of those is invisible to an API-level check and obvious to a browser.
 */
const USER = process.env.FORGE_USER ?? "admin";
const PASSWORD = process.env.FORGE_PASSWORD ?? "";
const ENROLMENTS_BY_CLASS = `/report/${encodeURIComponent("Ghi danh theo lớp")}`;
const TEACHER_COST = `/report/${encodeURIComponent("Chi phí giáo viên theo buổi")}`;

async function signIn(page: Page): Promise<void> {
  const username = page.locator("#mf-login-usr");
  await expect(username).toBeVisible({ timeout: 60_000 });
  await username.fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(username).toBeHidden({ timeout: 60_000 });
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await signIn(page);
  await page.goto(route);
}

test.describe("báo cáo do APP tự khai — trên deployment thật", () => {
  test("báo cáo gộp hiện dữ liệu, nhãn Link và tiền tệ", async ({ page }) => {
    await open(page, ENROLMENTS_BY_CLASS);
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    expect(await rows.count()).toBeGreaterThan(1);

    // Nhãn Link tới trong lượt gọi THỨ HAI (giải mã → tên), nên phải chờ chứ không đọc
    // ngay: đọc ngay thì thấy mã và tưởng là lỗi hiển thị.
    await expect(page.locator("tbody")).toContainText(/IELTS|TOEIC|Tiếng/, { timeout: 30_000 });

    const table = (await page.locator("table").first().innerText()).replace(/\s+/g, " ");
    // Đồng: ký hiệu SAU số, không phần lẻ.
    expect(table).toMatch(/\d\.\d{3} ₫/);
    expect(table).not.toMatch(/₫ \d/);
  });

  test("cột tiền của báo cáo khác cũng đúng định dạng", async ({ page }) => {
    await open(page, TEACHER_COST);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    expect((await page.locator("table").first().innerText()).replace(/\s+/g, " ")).toMatch(/\d\.\d{3} ₫/);
  });

  test("báo cáo xuất được ra file", async ({ page }) => {
    await open(page, ENROLMENTS_BY_CLASS);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /Xuất Excel/ }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
  });
});

test.describe("trao đổi dữ liệu", () => {
  // Chỉ desktop: trên mobile danh sách là thẻ, không phải bảng, và không có ô chọn dòng.
  test("danh sách xuất được ra Excel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "danh sách mobile là thẻ, không có chọn hàng loạt");
    await open(page, "/app/Student");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });

    // Chọn một dòng để hiện thanh thao tác hàng loạt — nơi nút Xuất sống.
    await page.locator("tbody tr").first().locator("input[type=checkbox], [role=checkbox]").first().click();
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Xuất$/ }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
  });

  test("màn nhập dữ liệu có trong runtime, không chỉ trong app demo", async ({ page }) => {
    await open(page, "/import");
    // Trình thuật sĩ bắt đầu ở bước chọn doctype + tải file mẫu.
    await expect(page.getByText(/mẫu/i).first()).toBeVisible({ timeout: 60_000 });
  });
});
