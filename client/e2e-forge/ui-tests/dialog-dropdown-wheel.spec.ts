import { expect, test } from "@playwright/test";

test("Link dropdown inside a dialog scrolls with the mouse wheel", async ({ page }, testInfo) => {
  await page.goto("/?dialog-wheel-fixture=1", { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog", { name: "Kiểm thử cuộn dropdown trong hộp thoại" });
  await expect(dialog).toBeVisible();

  const trigger = dialog.getByRole("button", { name: "Mã hàng" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-state", "open");

  const list = page.locator("[cmdk-list]");
  await expect(list).toBeVisible();
  await expect(page.locator("[cmdk-item]")).toHaveCount(40);

  const dimensions = await list.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(dimensions.scrollHeight, `dropdown must overflow: ${JSON.stringify(dimensions)}`).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.scrollTop).toBe(0);

  await list.hover();
  await page.mouse.wheel(0, 640);

  await expect.poll(
    () => list.evaluate((element) => element.scrollTop),
    { message: "mouse wheel must move the dropdown list without dragging its scrollbar" },
  ).toBeGreaterThan(0);
  await expect(trigger).toHaveAttribute("data-state", "open");

  await page.screenshot({
    path: testInfo.outputPath("dialog-dropdown-after-wheel.png"),
    animations: "disabled",
  });
});
