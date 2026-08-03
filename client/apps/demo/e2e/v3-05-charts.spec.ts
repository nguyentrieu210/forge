import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    { message: "V3-05 evidence surface must not overflow horizontally" },
  ).toBeLessThanOrEqual(1);
}

async function waitForCharts(page: Page, minimum = 1) {
  await expect.poll(() => page.locator("canvas").count(), { message: "ECharts canvases must mount" }).toBeGreaterThanOrEqual(minimum);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

test.describe("UI V3-05 charts and command-center evidence", () => {
  test("dashboard stays readable across desktop, tablet and mobile and survives theme change", async ({ page }, testInfo) => {
    const viewports = [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "mobile", width: 390, height: 844 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/v3-05.html?mode=dashboard");
      await expect(page.getByTestId("v3-05-dashboard")).toBeVisible();
      await expect(page.getByText("Doanh thu và chi phí", { exact: true })).toBeVisible();
      await waitForCharts(page, 3);
      await expectNoDocumentOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`dashboard-${viewport.name}-light.png`), fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/v3-05.html?mode=dashboard&theme=dark");
    await waitForCharts(page, 3);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expectNoDocumentOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("dashboard-desktop-dark.png"), fullPage: true });
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("command center is fullscreen, reduced-motion aware and leak-free across repeated resizes", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/v3-05.html?mode=command");

    const surface = page.getByTestId("v3-05-command-center");
    await expect(surface).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trung tâm điều hành Forge", exact: true })).toBeVisible();
    await waitForCharts(page, 3);
    await expectNoDocumentOverflow(page);
    await expect(page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).resolves.toBe(true);

    const fullscreenHeight = await surface.evaluate((element) => element.getBoundingClientRect().height);
    expect(fullscreenHeight).toBeGreaterThanOrEqual(898);

    const pulse = page.locator('[class*="motion-reduce:animate-none"]').first();
    await expect(pulse).toBeVisible();
    await expect.poll(() => pulse.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    const initialCanvasCount = await page.locator("canvas").count();
    expect(initialCanvasCount).toBeGreaterThanOrEqual(3);
    const initialWidth = await page.locator("canvas").first().evaluate((canvas) => canvas.getBoundingClientRect().width);

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expectNoDocumentOverflow(page);
      await expect.poll(() => page.locator("canvas").count(), { message: "resize must not multiply ECharts instances" }).toBe(initialCanvasCount);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileWidth = await page.locator("canvas").first().evaluate((canvas) => canvas.getBoundingClientRect().width);
    expect(mobileWidth).toBeLessThan(initialWidth);
    await page.screenshot({ path: testInfo.outputPath("command-center-mobile-reduced-motion.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoDocumentOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("command-center-desktop-fullscreen.png"), fullPage: true });
    await expectNoSeriousAccessibilityViolations(page);
  });
});
