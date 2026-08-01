import { expect, test, type Locator, type Page } from "@playwright/test";
import { BRANDS, BRAND_COLOR_COUNT } from "@metaforge/shell";

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect.poll(
    () => locator.evaluate((element) => element.scrollWidth - element.clientWidth),
    { message: "workspace tabs must fit without horizontal scrolling" },
  ).toBeLessThanOrEqual(1);
}

async function visibleButton(page: Page, label: string): Promise<Locator | null> {
  const candidates = page.getByRole("button", { name: label, exact: true });
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function sidebarButton(page: Page, label: string): Promise<Locator> {
  const existing = await visibleButton(page, label);
  if (existing) return existing;

  await page.getByRole("button", { name: "Mở menu", exact: true }).click();
  const opened = await visibleButton(page, label);
  if (!opened) throw new Error(`Không tìm thấy mục sidebar đang hiển thị: ${label}`);
  await expect(opened).toBeVisible();
  return opened;
}

async function openSidebarModule(page: Page, label: string) {
  await (await sidebarButton(page, label)).click();
}

test.describe("MetaForge MISA-style workspace", () => {
  test("keeps overview in sidebar and compact nghiệp vụ tabs", async ({ page }, testInfo) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/view\/overview$/);
    await expect(page.getByRole("heading", { name: "Tổng quan điều hành" })).toBeVisible();
    await expect(await sidebarButton(page, "Tổng quan")).toBeVisible();

    await openSidebarModule(page, "Nghiệp vụ");
    await expect(page).toHaveURL(/\/view\/process$/);

    const operationTabs = page.locator(".mf-workspace-tabs nav");
    await expect(operationTabs.getByRole("button")).toHaveText([
      "Quy trình",
      "Công việc",
      "Kanban",
      "Lịch",
      "Báo cáo",
    ]);
    await expect(operationTabs.getByRole("button", { name: "Tổng quan", exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(operationTabs);

    await openSidebarModule(page, "Danh mục");
    await expect(page).toHaveURL(/\/view\/catalog$/);
    await expect(page.getByRole("heading", { name: "Danh mục", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "DocType", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspace-catalog.png"), fullPage: true });
  });

  test("opens the Meta report builder with data, widget, canvas and inspector panels", async ({ page }, testInfo) => {
    await page.goto("/view/meta-process");

    const metaTabs = page.locator(".mf-workspace-tabs nav");
    await expect(metaTabs.getByRole("button")).toHaveText([
      "Quy trình",
      "DocType",
      "Workflow",
      "Mẫu in",
      "Thiết kế báo cáo",
    ]);
    await expectNoHorizontalOverflow(metaTabs);

    await metaTabs.getByRole("button", { name: "Thiết kế báo cáo", exact: true }).click();
    await expect(page).toHaveURL(/\/view\/b-dashboard$/);
    await expect(page.getByText("Nguồn dữ liệu", { exact: true })).toBeVisible();
    await expect(page.getByText("Thành phần", { exact: true })).toBeVisible();
    await expect(page.getByText("Canvas báo cáo", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bố cục", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thuộc tính", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Chỉ tiêu", exact: true }).first().click();
    await expect(page.getByText("Chỉ tiêu 1", { exact: true })).toBeVisible();
    await expect(page.locator('input[value="Chỉ tiêu 1"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("report-builder.png"), fullPage: true });
  });

  test("exposes exactly 13 color palettes", async () => {
    expect(BRAND_COLOR_COUNT).toBe(13);
    expect(BRANDS).toHaveLength(13);
    expect(new Set(BRANDS.map((brand) => brand.id)).size).toBe(13);
  });
});
