import { expect, test } from "@playwright/test";

const HARNESS = "/grid-parity-harness.html";

test("desktop smart-grid operator path", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop evidence only");
  await page.goto(HARNESS);

  const grid = page.locator('[data-metadata-child-grid="QA Line"]');
  await expect(grid).toBeVisible();
  await expect(grid).toHaveAttribute("data-smart-child-grid", "true");
  await expect(page.getByText("Secret snapshot", { exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Tùy chỉnh cột" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mở toàn màn hình" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm nhiều" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm dòng" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Dimension/ })).toBeVisible();

  const qtyCell = grid.locator('[data-smart-grid-cell="0:3"] input');
  await qtyCell.fill("7");
  await expect(page.getByTestId("qa-state")).toContainText('"net_amount":70');

  await page.getByRole("button", { name: "Mở rộng" }).click();
  await expect(page.getByRole("columnheader", { name: /Note/ })).toBeVisible();
  await page.getByRole("button", { name: "Thu gọn" }).click();

  await page.getByRole("button", { name: "Tùy chỉnh cột" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const kindVisibility = page.getByRole("checkbox", { name: "Hiện Kind" });
  await kindVisibility.uncheck();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: /Kind/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("columnheader", { name: /Kind/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Mở toàn màn hình" }).click();
  await expect(page.getByRole("button", { name: "Thoát toàn màn hình" })).toBeVisible();
  await page.getByRole("button", { name: "Thoát toàn màn hình" }).click();

  await page.getByRole("button", { name: "Xóa dòng 2" }).click();
  await expect(page.getByRole("columnheader", { name: /Dimension/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Hoàn tác xóa dòng" }).click();
  await expect(page.getByRole("columnheader", { name: /Dimension/ })).toBeVisible();

  await page.getByRole("checkbox", { name: "Chọn dòng 1" }).check();
  await page.getByRole("checkbox", { name: "Chọn dòng 2" }).check();
  await expect(page.getByRole("button", { name: "Nhân bản dòng đã chọn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xóa dòng đã chọn" })).toBeVisible();

  await page.getByRole("button", { name: "Chi tiết" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("tablet keeps the full grid operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "tablet evidence uses Chromium with explicit viewport");
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(HARNESS);
  const grid = page.locator('[data-metadata-child-grid="QA Line"]');
  await expect(grid).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Item/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tùy chỉnh cột" })).toBeVisible();
  await page.getByRole("button", { name: "Mở toàn màn hình" }).click();
  await expect(page.getByRole("button", { name: "Thoát toàn màn hình" })).toBeVisible();
});

test("mobile uses touch-friendly cards without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-pixel7", "one mobile Chromium profile is sufficient for the grid card contract");
  await page.goto(HARNESS);
  const grid = page.locator('[data-metadata-child-grid="QA Line"]');
  await expect(grid).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Item/ })).not.toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Chọn dòng 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chi tiết" }).first()).toBeVisible();
  await expect(page.getByText("Secret snapshot", { exact: true })).toHaveCount(0);
  const overflow = await grid.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
