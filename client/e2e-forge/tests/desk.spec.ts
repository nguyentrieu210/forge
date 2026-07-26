import { test, expect, type Page } from "@playwright/test";

/**
 * The MetaForge Desk rendering against the Forge Frappe façade, in a real browser.
 *
 * Everything here goes through the browser's own cookie handling and the client's own
 * runtime: no injected token, no mocked adapter, no server-side dispatch. What this
 * establishes that no server-side test can is that the client AGREES with the contract.
 * A response can be byte-correct and still leave a blank screen — a flag arriving as a
 * boolean where the client's types expect 0/1 is read as absent, and the column
 * silently disappears.
 *
 * Backed by `Field Visit`, the metadata-driven DocType created by `npm run dev:seed`.
 */
const USER = process.env.FORGE_USER ?? "dev@example.com";
const PASSWORD = process.env.FORGE_PASSWORD ?? "local-dev-password-1";
const DOCTYPE = "Field Visit";
const DOCTYPE_PATH = `/app/${encodeURIComponent(DOCTYPE)}`;

/**
 * Signs in through the app's own login screen.
 *
 * Located by element id, NOT by label. `getByLabel("Tài khoản")` also matches the
 * account menu's `aria-label` in the app shell, so after a successful login the
 * "form is gone" assertion would find that button and never pass. The ids are unique
 * to the login screen.
 *
 * Using the form — rather than seeding a cookie — is deliberate: the guest-detection
 * round-trip is part of what is being verified.
 */
async function signIn(page: Page): Promise<void> {
  const username = page.locator("#usr");
  await expect(username).toBeVisible({ timeout: 60_000 });
  await username.fill(USER);
  await page.locator("#pwd").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // The form disappearing is the client confirming it accepted the session.
  await expect(username).toBeHidden({ timeout: 60_000 });
}

async function signInAndOpenList(page: Page): Promise<void> {
  await page.goto(DOCTYPE_PATH);
  await signIn(page);
  // Login may land on the app home, so the list is opened explicitly afterwards.
  await page.goto(DOCTYPE_PATH);
}

test.describe("Desk on the Forge facade (real browser, cookie session)", () => {
  test("a guest is sent to the login screen by the server's own refusal", async ({ page }) => {
    await page.goto(DOCTYPE_PATH);
    // The façade answers an unauthenticated method with PermissionError/403 and
    // "Login to access" — the exact shape the client's error normaliser maps to a lost
    // session. This is what proves the redirect came from the contract rather than from
    // a client-side default.
    await expect(page.locator("#usr")).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing in with a real password hash establishes a session", async ({ page }) => {
    await page.goto(DOCTYPE_PATH);
    await signIn(page);
    // No longer on the login screen: boot succeeded with the cookie login set.
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("wrong credentials are rejected and leave the user on the login screen", async ({ page }) => {
    await page.goto(DOCTYPE_PATH);
    const username = page.locator("#usr");
    await expect(username).toBeVisible({ timeout: 60_000 });
    await username.fill(USER);
    await page.locator("#pwd").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    // Still here after the round-trip: the 401 was surfaced, not swallowed into a
    // half-loaded shell.
    await expect(username).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  /**
   * The list view, end to end: metadata → columns → a server query → rendered rows.
   *
   * This was a known gap for a long time, and closing it took two façade defects that
   * only a real client could expose. Both are recorded here because each is a CLASS of
   * mistake, not a one-off:
   *
   * 1. ENVELOPE. `getdoctype` and `getdoc` do not return their payload — Frappe's own
   *    handler does `frappe.response.docs.extend(docs)` (frappe/desk/form/load.py), so
   *    the keys are TOP-LEVEL with no `message` wrapper. The façade wrapped them. The
   *    Desk reads `r.docs` off the body, got undefined, and raised DoesNotExistError on
   *    an HTTP 200 — with nothing logged. Its list query is gated on the metadata
   *    having loaded, so no list request was ever issued, which is exactly why the
   *    symptom looked like "the client chooses not to query".
   *
   * 2. PROJECTION. The Desk asks for `modified` on every list; the kernel column is
   *    `modified_at`. Filters and sort were translated, the projection was not, so the
   *    server answered "Field is not allowed: modified" for every doctype. Four call
   *    sites had it: list, contextual list, get_value and export.
   *
   * Neither was reachable from a server-side test that builds payloads directly — the
   * first lives in the envelope, the second only fires for field names no server test
   * happened to request. A smoke test that unwraps `message` asserts the first bug
   * rather than the contract.
   *
   * The column header is asserted in Vietnamese: labels come back through
   * `metaforge.api.translate_strings`, so "Chủ đề" also proves the translation path is
   * wired, where "Subject" would have passed with translation broken.
   */
  test("the list view renders rows from server metadata", async ({ page }) => {
    await signInAndOpenList(page);
    // The declared columns, not an ID fallback.
    await expect(page.getByText("Chủ đề", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Customer", { exact: false }).first()).toBeVisible();
    // An actual row from the tenant's own data, addressed by its server-allocated name.
    await expect(page.getByText(/^FV-\d{4}-\d{4}$/).first()).toBeVisible({ timeout: 60_000 });
  });

  test("logging out returns the Desk to the login screen", async ({ page }) => {
    await signInAndOpenList(page);
    await page.getByRole("button", { name: "Tài khoản" }).click();
    // Exact: the same menu also holds "Đăng xuất khỏi thiết bị khác", which a loose
    // match resolves to as well.
    await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
    // Back to login: the server cleared the cookie and the client noticed, rather than
    // continuing to show a shell it can no longer populate.
    await expect(page.locator("#usr")).toBeVisible({ timeout: 60_000 });
  });
});
