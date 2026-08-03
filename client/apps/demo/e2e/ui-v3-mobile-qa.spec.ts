import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const SURFACES = [
  { name: "list", route: "/view/list" },
  { name: "form", route: "/view/form" },
  { name: "dashboard", route: "/view/dashboard" },
  { name: "builder", route: "/view/b-dashboard" },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `document overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `body overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
}

async function expectInsideViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(viewport, "viewport must exist").not.toBeNull();
  expect(box, "element must have a bounding box").not.toBeNull();
  if (!viewport || !box) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
}

function cssDurationToMs(value: string): number {
  return Math.max(...value.split(",").map((raw) => {
    const item = raw.trim();
    if (item.endsWith("ms")) return Number.parseFloat(item);
    if (item.endsWith("s")) return Number.parseFloat(item) * 1000;
    return 0;
  }));
}

test.describe("V3-07 mobile / responsive convergence", () => {
  for (const surface of SURFACES) {
    test(`${surface.name} keeps the document inside the viewport`, async ({ page }, testInfo) => {
      await page.goto(surface.route);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await attachViewport(page, testInfo, surface.name);
    });
  }

  test("list switches renderer without creating a second mobile runtime", async ({ page }) => {
    await page.goto("/view/list");
    await expectNoHorizontalOverflow(page);

    const width = page.viewportSize()?.width ?? 1440;
    if (width < 768) {
      await expect(page.getByRole("table")).toBeHidden();
      await expect(page.locator(".mf-list-mobile article").first()).toBeVisible();
    } else {
      await expect(page.getByRole("table")).toBeVisible();
    }
  });

  test("mobile drawer closes with Escape and restores trigger focus", async ({ page }, testInfo) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 768, "mobile-only acceptance");

    await page.goto("/view/list");
    const trigger = page.getByRole("button", { name: "Mở menu", exact: true });
    await expect(trigger).toBeVisible();
    await expectInsideViewport(page, trigger);

    await trigger.click();
    const navigation = page.getByRole("navigation", { name: "Điều hướng ứng dụng" });
    await expect(navigation).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await attachViewport(page, testInfo, "mobile-drawer-restored");
  });

  test("workspace keeps its longest navigation label reachable on mobile", async ({ page }, testInfo) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 768, "mobile-only acceptance");

    await page.goto("/view/list");
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();

    const navigation = page.getByRole("navigation", { name: "Điều hướng ứng dụng" });
    await expect(navigation).toBeVisible();
    const navItems = navigation.locator(".mf-shell-nav-item");
    const labels = (await navItems.allTextContents()).map((label) => label.trim()).filter(Boolean);
    const longestLabel = labels.sort((a, b) => b.length - a.length)[0] ?? "";
    expect(longestLabel.length, "fixture must exercise a non-trivial localized navigation label").toBeGreaterThanOrEqual(8);

    const longestItem = navItems.filter({ hasText: longestLabel }).first();
    await expect(longestItem).toBeVisible();
    await expectInsideViewport(page, longestItem);
    await expectNoHorizontalOverflow(page);
    await attachViewport(page, testInfo, "mobile-longest-label");
  });

  test("reduced motion collapses shell transition timings", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/view/list");

    await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const navItem = page.locator(".mf-shell-nav-item").first();
    await expect(navItem).toBeAttached();
    const timing = await navItem.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration,
        transitionDuration: styles.transitionDuration,
      };
    });

    expect(cssDurationToMs(timing.animationDuration)).toBeLessThanOrEqual(1);
    expect(cssDurationToMs(timing.transitionDuration)).toBeLessThanOrEqual(1);
  });
});
