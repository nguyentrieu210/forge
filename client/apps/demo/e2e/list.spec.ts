import { test, expect, type Page } from "@playwright/test";

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

function visibleList(page: Page) {
  return isMobile(page) ? page.locator(".mf-list-mobile") : page.getByRole("table");
}

/**
 * E2E List data-table (M04) — filter/search/sort/URL-state/selection thao tác THẬT trên UI mock.
 * Gate cho M04-LIST-01..07 (không chỉ screenshot).
 */
test.describe("List data-table", () => {
  test("render cột metadata + STT + status badge + summary", async ({ page }) => {
    await page.goto("/view/list");
    if (isMobile(page)) {
      await expect(page.locator(".mf-list-mobile article").first()).toBeVisible();
      await expect(visibleList(page).getByText("Chuẩn bị demo")).toBeVisible();
      await expect(visibleList(page).getByText("Trạng thái").first()).toBeVisible();
    } else {
      await expect(page.getByRole("columnheader", { name: "Tiêu đề" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Trạng thái" })).toBeVisible();
      await expect(visibleList(page).getByText("Chuẩn bị demo")).toBeVisible();
    }
    // pagination "1–12 / 12"
    await expect(page.getByText("/ 12")).toBeVisible();
  });

  test("sticky checkbox and STT headers stay above rows while scrolling", async ({ page }) => {
    test.skip(isMobile(page), "Mobile uses record cards");
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto("/view/list");

    const scroller = page.locator(".mf-list-scroll");
    await scroller.evaluate((element) => {
      element.scrollTop = Math.min(120, element.scrollHeight - element.clientHeight);
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    for (let index = 0; index < 2; index += 1) {
      const headerCell = page.locator("thead th").nth(index);
      const box = await headerCell.boundingBox();
      expect(box).not.toBeNull();
      const topmostCell = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("th,td")?.tagName,
        { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
      );
      expect(topmostCell).toBe("TH");
    }

    const backgrounds = await page.locator("thead th").evaluateAll((cells) =>
      cells.slice(0, 3).map((cell) => getComputedStyle(cell).backgroundColor),
    );
    expect(backgrounds).toHaveLength(3);
    expect(new Set(backgrounds).size).toBe(1);
    expect(backgrounds[0]).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("checkbox, STT and title share the same top alignment", async ({ page }) => {
    test.skip(isMobile(page), "Mobile uses record cards");
    await page.goto("/view/list");

    const cells = page.locator("tbody tr").first().locator("td");
    await expect(cells.nth(2)).toBeVisible();
    for (let index = 0; index < 3; index += 1) {
      const cell = cells.nth(index);
      await expect.poll(() => cell.evaluate((element) => getComputedStyle(element).verticalAlign)).toBe("top");
    }
  });

  test("standard filter status → lọc + URL giữ khi reload", async ({ page }) => {
    await page.goto("/view/list?f_status=Working");
    // chỉ còn dòng Working (4)
    await expect(page.getByText("/ 4")).toBeVisible();
    await expect(page.getByText("Verify contract")).toHaveCount(0); // Closed → ẩn
    // reload giữ filter
    await page.reload();
    await expect(page.getByText("/ 4")).toBeVisible();
    await expect(page.getByText("Trạng thái: Working")).toBeVisible(); // chip
  });

  test("search thu hẹp kết quả", async ({ page }) => {
    await page.goto("/view/list");
    await page.getByPlaceholder("Tìm kiếm…").fill("tài liệu");
    await expect(visibleList(page).getByText("Viết tài liệu API")).toBeVisible();
    await expect(page.getByText("Chuẩn bị demo")).toHaveCount(0);
  });

  test("chọn dòng → bulk action bar hiện", async ({ page }) => {
    await page.goto("/view/list");
    // Radix Checkbox là button role=checkbox, không phải <input>; kiểm tra hành vi bằng click.
    await visibleList(page).getByLabel("Chọn TASK-0001").click();
    await expect(visibleList(page).getByLabel("Chọn TASK-0001")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("1 đã chọn")).toBeVisible();
    await expect(page.getByRole("button", { name: "Xoá" })).toBeVisible();
  });

  test("ẩn cột được ghi nhớ và Khôi phục mặc định phục hồi toàn bộ", async ({ page }) => {
    test.skip(isMobile(page), "Mobile dùng card riêng, không dùng bộ cột desktop");
    await page.goto("/view/list");

    await page.getByRole("button", { name: "Cột", exact: true }).click();
    const priorityToggle = page.getByRole("checkbox", { name: "Ưu tiên" });
    await expect(priorityToggle).toBeChecked();
    await priorityToggle.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "Ưu tiên" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("columnheader", { name: "Ưu tiên" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cột", exact: true }).click();
    await page.getByRole("menuitem", { name: "Khôi phục mặc định" }).click();
    await expect(page.getByRole("columnheader", { name: "Ưu tiên" })).toBeVisible();
  });

  test("Alt + mũi tên đổi cột được cả hai hướng", async ({ page }) => {
    test.skip(isMobile(page), "Mobile dùng card riêng");
    await page.goto("/view/list");
    const header = page.getByRole("row").filter({ has: page.getByRole("columnheader", { name: "Tiêu đề" }) }).first();
    await expect(header).toBeVisible();
    // Đọc text NÚT sort, không đọc toàn th: mỗi th còn có separator resize với accessible name
    // "Đổi bề rộng cột …", làm chuỗi header bị ghép thêm và indexOf(label) luôn = -1.
    const labels = async () => (await header.locator("th[data-col] > button").allTextContents()).map((text) => text.trim()).filter(Boolean);

    const before = await labels();
    const statusHeader = page.getByRole("columnheader", { name: "Trạng thái" });
    await statusHeader.getByRole("button").press("Alt+ArrowRight");
    const movedRight = await labels();
    expect(movedRight.indexOf("Trạng thái")).toBe(before.indexOf("Trạng thái") + 1);

    await page.getByRole("columnheader", { name: "Trạng thái" }).getByRole("button").press("Alt+ArrowLeft");
    await expect.poll(async () => (await labels()).indexOf("Trạng thái")).toBe(before.indexOf("Trạng thái"));
  });

  test("resize được ghi nhớ và Khôi phục mặc định trả đúng width ban đầu", async ({ page }) => {
    test.skip(isMobile(page), "Mobile dùng card riêng");
    await page.goto("/view/list");
    const statusHeader = page.getByRole("columnheader", { name: "Trạng thái" });
    await expect(statusHeader).toBeVisible();
    const initialWidth = Math.round((await statusHeader.boundingBox())!.width);
    const grip = statusHeader.getByRole("separator", { name: "Đổi bề rộng cột Trạng thái" });
    const box = await grip.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 48, box!.y + box!.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await statusHeader.boundingBox())!.width)).toBeGreaterThan(initialWidth + 30);

    const resizedWidth = Math.round((await statusHeader.boundingBox())!.width);
    await page.reload();
    await expect.poll(async () => Math.round((await page.getByRole("columnheader", { name: "Trạng thái" }).boundingBox())!.width)).toBe(resizedWidth);

    await page.getByRole("button", { name: "Cột", exact: true }).click();
    await page.getByRole("menuitem", { name: "Khôi phục mặc định" }).click();
    await expect.poll(async () => Math.round((await page.getByRole("columnheader", { name: "Trạng thái" }).boundingBox())!.width)).toBe(initialWidth);
  });

  test("ghim cột tùy ý được ghi nhớ và dòng dùng roving focus", async ({ page }) => {
    test.skip(isMobile(page), "Mobile dùng card riêng");
    await page.goto("/view/list");

    await page.getByRole("button", { name: "Cột", exact: true }).click();
    await page.getByRole("button", { name: "Ghim cột Trạng thái" }).click();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Cột", exact: true }).click();
    await expect(page.getByRole("button", { name: "Bỏ ghim cột Trạng thái" })).toBeVisible();
    await page.keyboard.press("Escape");

    const rows = page.locator("tbody tr[data-list-row]");
    await rows.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await expect.poll(() => rows.evaluateAll((items) => items.filter((item) => item.tabIndex === 0).length)).toBe(1);
  });
});
