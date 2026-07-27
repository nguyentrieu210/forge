import { test, expect, type Page } from "@playwright/test";

/**
 * An app that was DESCRIBED, not built — opened in a real browser on the real deployment.
 *
 * Nothing about this app exists in any bundle. `server/briefs/assets.json` (≈70 lines) was
 * compiled into metadata and written to a tenant; the client here is the same generic
 * bundle every other app on the platform uses. So what these tests check is the factory
 * claim: that "describe an app" and "a user can open the app" are one step apart.
 *
 * Three things would each falsify it, and each has its own test:
 *   1. the shell reads its identity from the SERVER (name, nav, landing screen);
 *   2. the operational screen is derived from workflow metadata, with no code per app;
 *   3. the policy the brief declared is enforced against a real user in a real session.
 *
 * There is no proxy. The page and the API share an origin because the gateway serves both.
 */
const USER = process.env.FORGE_USER ?? "forge@kairo.vn";
const PASSWORD = process.env.FORGE_PASSWORD ?? "";
const INBOX = "/x/approval%3AAsset%20Request";
const DESK = "/app/IT%20Asset";
/** Cards are headed by the doctype's `title_field` (`requested_for`), not by the name. */
const CARD = "Nguyễn Văn A";

async function signIn(page: Page): Promise<void> {
  const username = page.locator("#mf-login-usr");
  await expect(username).toBeVisible({ timeout: 60_000 });
  await username.fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(username).toBeHidden({ timeout: 60_000 });
}

async function open(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await signIn(page);
  await page.goto(route);
}

test.describe("app sinh từ brief — chạy trên deployment thật", () => {
  test("the deep link is served by the gateway, not by a local proxy", async ({ page }) => {
    const response = await page.goto(INBOX);
    // A client route with no matching asset must reach the Worker and come back as the SPA
    // shell. Were assets handling set to single-page-application instead, the API would
    // answer HTML too and nothing below would work.
    expect(response?.status()).toBe(200);
    expect(response?.headers()["content-type"]).toContain("text/html");
    await signIn(page);
  });

  test("the Desk shell takes its identity from the server, so no bundle names this app", async ({ page }) => {
    await open(page, DESK);
    // `Quản lý tài sản CNTT` appears in no source file in this repo's client — it is the
    // app name from the manifest the server assembled out of what is installed.
    await expect(page.getByText("Quản lý tài sản CNTT").first()).toBeVisible({ timeout: 60_000 });
    // The sidebar GROUPS, which is what the brief's `group` fields produce. Asserted on the
    // groups rather than the leaf items because groups render collapsed: an item inside one
    // is present but not visible, and a test that demanded visibility would be asserting on
    // the sidebar's default expansion rather than on the manifest.
    await expect(page.getByRole("button", { name: "Tác nghiệp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nghiệp vụ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tài sản", exact: true })).toBeVisible();
  });

  test("the operational screen is derived from workflow metadata, not written per app", async ({ page }) => {
    await open(page, INBOX);
    // The screen is titled by the nav label the brief gave it, not by the DocType name.
    await expect(page.getByText("Duyệt yêu cầu cấp tài sản").first()).toBeVisible({ timeout: 60_000 });
    // The queue: documents in states the workflow graph can still leave — derived, not
    // configured anywhere.
    await expect(page.getByText(/hồ sơ chờ xử lý/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(CARD).first()).toBeVisible({ timeout: 60_000 });
    // Card fields come from the doctype's own `in_list_view`. This screen was never told
    // that this app has a `category` or a `needed_by`; it read them from the metadata.
    await expect(page.getByText("Nhóm tài sản").first()).toBeVisible();
    await expect(page.getByText("Máy tính").first()).toBeVisible();
    await expect(page.getByText("Cần trước ngày").first()).toBeVisible();
  });

  test("the server decides the buttons — a draft this user owns still offers submission", async ({ page }) => {
    await open(page, INBOX);
    // The DRAFT card. Targeted by state rather than by position: the queue holds records in
    // several states, and "the first card" would silently be a different document as data
    // changes — which is how this test first passed and failed for unrelated reasons.
    await page.locator("button", { hasText: "Nháp" }).first().click();
    // Submitting your own draft is not self-approval: the transition does not raise
    // docstatus, so the compiled workflow leaves it alone and the server offers it.
    await expect(page.getByRole("button", { name: "Gửi duyệt" })).toBeVisible({ timeout: 60_000 });
  });

  test("the policy the brief declared is enforced on a real session", async ({ page }) => {
    await open(page, INBOX);
    // The PENDING card — the one where approval is the next step, and therefore the only
    // one where separation of duties has anything to say.
    await page.locator("button", { hasText: "Chờ duyệt" }).first().click();

    // Buttons come from get_workflow_transitions. This user RAISED this request, and the
    // brief's compiled workflow blocks self-approval on any transition that raises
    // docstatus — so the server offers no approval, and the screen says so rather than
    // rendering a "Duyệt" button that would fail on tap.
    await expect(page.getByText("Bạn không có quyền thao tác trên hồ sơ này")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toHaveCount(0);
  });
});
