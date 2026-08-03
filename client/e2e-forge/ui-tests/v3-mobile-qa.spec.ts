import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

async function mockGuestSession(page: Page) {
  const guest = JSON.stringify({
    exc_type: "PermissionError",
    exception: "frappe.exceptions.PermissionError: Guest",
  });
  await page.route("**/api/method/metaforge.api.get_app_manifest**", (route) =>
    route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: null }) }),
  );
  await page.route("**/api/method/metaforge.api.get_boot**", (route) =>
    route.fulfill({ status: 403, headers: JSON_HEADERS, body: guest }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `document overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `body overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function expectTouchHeight(locator: Locator, minimum = 44) {
  const box = await locator.boundingBox();
  expect(box, "control must have a bounding box").not.toBeNull();
  // Device-scale rounding can report a nominal 44px CSS box as 43.99997px.
  if (box) expect(box.height).toBeGreaterThanOrEqual(minimum - 0.25);
}

async function attach(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
}

function cssDurationToMs(value: string): number {
  return Math.max(...value.split(",").map((raw) => {
    const item = raw.trim();
    if (item.endsWith("ms")) return Number.parseFloat(item);
    if (item.endsWith("s")) return Number.parseFloat(item) * 1000;
    return 0;
  }));
}

test.describe("V3-07 runtime mobile acceptance", () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestSession(page);
  });

  test("Forge login stays inside every supported viewport", async ({ page }, testInfo) => {
    // `/` is intentionally website-first. `/login` is the reserved canonical Forge auth route.
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const auth = page.getByTestId("forge-auth-login");
    const username = page.locator("#mf-login-usr");
    const password = page.locator("#mf-login-pwd");
    const submit = page.locator('form button[type="submit"]').first();

    await expect(auth).toBeVisible();
    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();
    await expectNoHorizontalOverflow(page);

    if ((page.viewportSize()?.width ?? 1440) < 768) {
      await expectTouchHeight(username);
      await expectTouchHeight(password);
      await expectTouchHeight(submit);
    }

    await attach(page, testInfo, "forge-login");
  });

  test("login keyboard order is stable and visible", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chrome", "desktop keyboard acceptance");
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    const username = page.locator("#mf-login-usr");
    const password = page.locator("#mf-login-pwd");
    const reveal = page.getByRole("button", { name: "Hiện mật khẩu" });

    await expect(username).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(reveal).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test("Alumdoor brand seam keeps mobile login ergonomics", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile-"), "mobile touch acceptance");
    await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });

    const auth = page.getByTestId("forge-auth-login");
    const brandMark = page.getByRole("img", { name: "Alumdoor" });
    const username = page.locator("#mf-login-usr");
    const password = page.locator("#mf-login-pwd");
    const submit = page.locator('form button[type="submit"]').first();

    // V3-03 deliberately removed product-specific login forks. Alumdoor now uses
    // the shared auth surface through the existing brand/brandMark seam.
    await expect(auth).toBeVisible();
    await expect(brandMark).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchHeight(username);
    await expectTouchHeight(password);
    await expectTouchHeight(submit);
    await attach(page, testInfo, "alumdoor-login");
  });

  test("reduced motion clamps global login transition timings", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion-dark", "reduced-motion acceptance");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

    const submit = page.locator('form button[type="submit"]').first();
    await expect(submit).toBeVisible();
    const timing = await submit.evaluate((element) => {
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
