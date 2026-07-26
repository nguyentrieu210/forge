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
   * KNOWN GAP — the list view does not populate against the façade yet.
   *
   * Marked `fixme` rather than deleted or loosened: a suite that quietly stops
   * checking is worse than one that records what it cannot yet prove.
   *
   * What was established while narrowing it:
   * - `getdoctype` returns the right thing. `title_field: "subject"`, both
   *   `in_list_view` fields present with integer flags, DocPerm rows for the actor's
   *   role, and `sort_field`/`sort_order` — all verified over HTTP.
   * - The screen renders: shell, sidebar, user, business-context selectors populated
   *   from this tenant's master data, notification badge, capabilities. Only the table
   *   body is empty, showing "ID" as its single column.
   * - No list request is ever issued — not `/api/resource/...`, not
   *   `frappe.client.get_list`, not `reportview.get`, not
   *   `metaforge.api.get_contextual_list`.
   * - It is NOT an exception: a vite dev build (unminified, full React messages)
   *   produces no console or page error. The only failures are the expected guest 403
   *   and the two deliberate 404s for `metaforge.api.get_overview`.
   *
   * So the client is choosing not to query — the query is gated, not failing.
   *
   * The metadata contract has since been RULED OUT as the cause, by feeding the façade's
   * own `getdoctype` output into the client's real `normalizeMeta` and `deriveColumns`
   * (`server/tests/client-contract.test.mjs`, 9 assertions): they accept it and produce
   * exactly the declared columns — Subject and Customer, not an ID fallback. So whatever
   * gates the query lives further into the demo's own live list wiring.
   *
   * One hypothesis was disproved along the way and is recorded so it is not chased
   * twice: an empty `permissions` array does NOT collapse the list to an ID column. The
   * client treats permlevel 0 as readable regardless; DocPerm rows decide WRITABILITY.
   *
   * Two real façade contract gaps were found and fixed during the hunt, so it was not
   * wasted: `getdoctype` returned an empty `permissions` array (the Frappe contract
   * carries the rows and field editability depends on them), and `sort_field` was
   * omitted when the kernel metadata lacked it, where Frappe always sends one.
   */
  test.fixme("the list view renders rows from server metadata", async ({ page }) => {
    await signInAndOpenList(page);
    await expect(page.getByText("Subject", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Customer", { exact: false }).first()).toBeVisible();
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
