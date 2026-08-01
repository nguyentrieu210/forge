import { expect, test, type Page, type TestInfo } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function capturePageErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  return {
    expectClean(options: { allowHttpErrors?: boolean } = {}) {
      const unexpectedConsole = options.allowHttpErrors
        ? consoleErrors.filter((message) => !/failed to load resource|\b40[13]\b/i.test(message))
        : consoleErrors;
      expect(pageErrors, "uncaught browser errors").toEqual([]);
      expect(unexpectedConsole, "unexpected console errors").toEqual([]);
    },
  };
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

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function expectAlumdoorPalette(page: Page, mode: "light" | "dark") {
  const palette = await page.locator("[data-alumdoor-login]").evaluate((element) => {
    const styles = getComputedStyle(element);
    const normalizeHex = (value: string) => value
      .trim()
      .toLowerCase()
      .replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");
    return {
      primary: normalizeHex(styles.getPropertyValue("--primary")),
      background: normalizeHex(styles.getPropertyValue("--background")),
      foreground: normalizeHex(styles.getPropertyValue("--foreground")),
      card: normalizeHex(styles.getPropertyValue("--card")),
    };
  });

  expect(palette).toEqual(mode === "dark"
    ? { primary: "#f45b24", background: "#1d1d1c", foreground: "#faf8f5", card: "#282827" }
    : { primary: "#f45b24", background: "#f7f7f7", foreground: "#202020", card: "#ffffff" });

  await expect(page.locator('form img[alt="Alumdoor"]')).toHaveAttribute("src", "/alumdoor/logo.png");
  await expect(page.locator('form button[type="submit"]')).toHaveCSS(
    "background-color",
    "rgb(244, 91, 36)",
  );
}

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

test("Alumdoor guest experience opens the login directly", async ({ page }, testInfo) => {
  const errors = capturePageErrors(page);
  await mockGuestSession(page);

  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });

  await expect(page.locator("[data-alumdoor-login]")).toBeVisible();
  await expect(page).toHaveTitle("Alumdoor — Đăng nhập");
  await expect(page.getByRole("heading", { name: "Đăng nhập Alumdoor", exact: true })).toBeVisible();
  await expect(page.locator("[data-alumdoor-landing]")).toHaveCount(0);
  await expect(page.locator("#mf-login-usr")).toBeVisible();
  await expect(page.locator("#mf-login-pwd")).toBeVisible();
  await expectAlumdoorPalette(page, "light");
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, "alumdoor-landing-light");

  errors.expectClean({ allowHttpErrors: true });
});

test("Alumdoor login remains usable in dark and reduced-motion modes", async ({ page }, testInfo) => {
  const errors = capturePageErrors(page);
  await mockGuestSession(page);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });

  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });

  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await expect(page.locator("[data-alumdoor-login]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đăng nhập Alumdoor", exact: true })).toBeVisible();
  await expectAlumdoorPalette(page, "dark");
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, "alumdoor-landing-dark-reduced-motion");

  errors.expectClean({ allowHttpErrors: true });
});

test("Alumdoor login supports keyboard, password reveal and error state", async ({ page }, testInfo) => {
  const errors = capturePageErrors(page);
  await mockGuestSession(page);

  let markLoginStarted!: () => void;
  let releaseLoginResponse!: () => void;
  const loginStarted = new Promise<void>((resolve) => { markLoginStarted = resolve; });
  const loginResponseAllowed = new Promise<void>((resolve) => { releaseLoginResponse = resolve; });
  await page.route("**/api/method/login**", async (route) => {
    markLoginStarted();
    await loginResponseAllowed;
    await route.fulfill({
      status: 401,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        exc_type: "AuthenticationError",
        exception: "frappe.exceptions.AuthenticationError: Invalid login credentials",
      }),
    });
  });

  await page.goto("/?alumdoor=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Đăng nhập Alumdoor", exact: true })).toBeVisible();

  const username = page.locator("#mf-login-usr");
  const password = page.locator("#mf-login-pwd");
  const submit = page.locator('form button[type="submit"]').first();

  await expect(username).toBeFocused();
  await expect(submit).toBeDisabled();
  await username.fill("qa@example.test");
  await password.fill("not-the-password");
  await expect(submit).toBeEnabled();

  await page.getByRole("button", { name: "Hiện mật khẩu" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ẩn mật khẩu" }).click();
  await expect(password).toHaveAttribute("type", "password");

  const keyboardSubmit = password.press("Enter");
  await loginStarted;
  await expect(submit).toBeDisabled();
  releaseLoginResponse();
  await keyboardSubmit;
  await expect(page.getByRole("alert")).toBeVisible();

  await expectAlumdoorPalette(page, "light");
  await expectNoHorizontalOverflow(page);
  await saveScreenshot(page, testInfo, "alumdoor-login-error-light");

  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await expect(page.locator('form img[alt="Alumdoor"]')).toHaveCSS("mix-blend-mode", "screen");
  await expect(page.locator('form img[alt="Alumdoor"]')).not.toHaveCSS("filter", "none");
  await expectAlumdoorPalette(page, "dark");
  await saveScreenshot(page, testInfo, "alumdoor-login-error-dark");

  errors.expectClean({ allowHttpErrors: true });
});
