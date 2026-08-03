import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const SURFACES = [
  { name: "list", route: "/view/list" },
  { name: "form", route: "/view/form" },
  { name: "dashboard", route: "/view/dashboard" },
  { name: "builder", route: "/view/b-dashboard" },
] as const;

async function dismissAppearanceSetup(page: Page) {
  const useTheme = page.getByRole("button", { name: "Dùng giao diện này", exact: true });
  try {
    await useTheme.waitFor({ state: "visible", timeout: 1_500 });
    await useTheme.click();
  } catch {
    // Only rendered for a fresh browser profile.
  }
}

async function gotoSurface(page: Page, route: string) {
  await page.goto(route);
  await dismissAppearanceSetup(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const overflowers = documentWidth > viewport + 1
      ? Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: typeof element.className === "string" ? element.className.slice(0, 180) : "",
            role: element.getAttribute("role"),
            ariaLabel: element.getAttribute("aria-label"),
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            position: style.position,
            transform: style.transform,
            overflowX: style.overflowX,
            visibility: style.visibility,
          };
        })
        .filter((item) => item.width > 0 && (item.right > viewport + 1 || item.left < -1))
        .sort((a, b) => Math.max(b.right - viewport, -b.left) - Math.max(a.right - viewport, -a.left))
        .slice(0, 12)
      : [];
    return { viewport, document: documentWidth, body: bodyWidth, overflowers };
  });

  expect(
    result.document,
    `document overflow: ${JSON.stringify(result)}`,
  ).toBeLessThanOrEqual(result.viewport + 1);
  expect(result.body, `body overflow: ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.viewport + 1);
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
      await gotoSurface(page, surface.route);
      await expect(page.locator("#mf-main-content")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await attachViewport(page, testInfo, surface.name);
    });
  }

  test("list switches renderer without creating a second mobile runtime", async ({ page }) => {
    await gotoSurface(page, "/view/list");
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

    await gotoSurface(page, "/view/list");
    const trigger = page.getByRole("button", { name: "Mở menu", exact: true });
    await expect(trigger).toBeVisible();
    await expectInsideViewport(page, trigger);

    await trigger.click();
    const navigation = page.getByRole("navigation", { name: /Điều hướng (ngữ cảnh|ứng dụng)/ });
    await expect(navigation).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await attachViewport(page, testInfo, "mobile-drawer-restored");
  });

  test("workspace keeps its longest navigation label reachable on mobile", async ({ page }, testInfo) => {
    test.skip((page.viewportSize()?.width ?? 1440) >= 768, "mobile-only acceptance");

    await gotoSurface(page, "/view/list");
    await page.getByRole("button", { name: "Mở menu", exact: true }).click();

    const navigation = page.getByRole("navigation", { name: /Điều hướng (ngữ cảnh|ứng dụng)/ });
    await expect(navigation).toBeVisible();
    const candidates = navigation.getByRole("button").filter({ hasNot: page.locator("svg.lucide-pin") });
    const labels = (await candidates.allTextContents()).map((label) => label.trim()).filter(Boolean);
    const longestLabel = labels.sort((a, b) => b.length - a.length)[0] ?? "";
    expect(longestLabel.length, "fixture must exercise a non-trivial localized navigation label").toBeGreaterThanOrEqual(8);

    const longestItem = navigation.getByRole("button", { name: longestLabel, exact: true }).first();
    await expect(longestItem).toBeVisible();
    await expectInsideViewport(page, longestItem);
    await expectNoHorizontalOverflow(page);
    await attachViewport(page, testInfo, "mobile-longest-label");
  });

  test("reduced motion collapses shared control transition timings", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoSurface(page, "/view/list");

    await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const control = page.getByRole("textbox", { name: "Tìm menu" });
    await expect(control).toBeVisible();
    const timing = await control.evaluate((element) => {
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
