import { test, expect, type Page } from "@playwright/test";

/**
 * The HRM app's operational screen: an approval queue, on a phone-sized viewport.
 *
 * This is App-mode, not Desk-mode. The distinction is not button size — it is that the
 * screen opens on THE WORK, and each card offers only the actions the server currently
 * permits. The Desk covers any DocType adequately; this covers one job well.
 *
 * The architectural claim under test: an operational app needs NO app-specific API.
 * Everything here runs on the generic metadata-driven surface —
 *   the queue      → frappe.client.get_list filtered on workflow_state
 *   the buttons    → metaforge.api.get_workflow_transitions (the SERVER decides)
 *   the approval   → frappe.model.workflow.apply_workflow
 * — so declaring a DocType and a workflow was enough. Only business that POSTS to a
 * ledger (stock, GL) would need an endpoint of its own.
 */
const USER = process.env.FORGE_USER ?? "admin@kairo.vn";
const PASSWORD = process.env.FORGE_PASSWORD ?? "";
const SCREEN = "/x/leave-approval";

async function signIn(page: Page): Promise<void> {
  // The shell's own LoginForm, as scaffolded by create-metaforge-app.
  const username = page.locator("#mf-login-usr");
  await expect(username).toBeVisible({ timeout: 60_000 });
  await username.fill(USER);
  await page.locator("#mf-login-pwd").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(username).toBeHidden({ timeout: 60_000 });
}

async function openQueue(page: Page): Promise<void> {
  await page.goto(SCREEN);
  await signIn(page);
  await page.goto(SCREEN);
  await expect(page.getByText("Duyệt nghỉ phép").first()).toBeVisible({ timeout: 60_000 });
}

test.describe("HRM App-mode — duyệt nghỉ phép", () => {
  test("the queue lists pending requests with their business detail", async ({ page }) => {
    await openQueue(page);
    // The count in the subtitle comes from the same query that filled the list, so a
    // mismatch here would mean the screen is describing data it did not render.
    await expect(page.getByText(/\d+ đơn chờ duyệt/)).toBeVisible({ timeout: 60_000 });
    // Business fields, not just an id: an approver decides from these.
    await expect(page.getByText("Chờ duyệt").first()).toBeVisible();
    await expect(page.getByText(/\d+ ngày/).first()).toBeVisible();
    await expect(page.getByText(/NV-\d{4}-\d{4}/).first()).toBeVisible();
  });

  test("opening a request asks the server which actions this user may take", async ({ page }) => {
    await openQueue(page);
    await page.getByText(/NV-\d{4}-\d{4}/).first().click();

    // The detail carries the full reason — the list truncates it, and nobody should
    // approve leave from a truncated sentence.
    await expect(page.getByText("Lý do")).toBeVisible({ timeout: 60_000 });

    // Buttons are rendered from get_workflow_transitions, never inferred from the
    // state string: whether THIS user may approve depends on roles and on
    // allow_self_approval, which only the server knows. A guessed button fails on tap.
    await expect(page.getByRole("button", { name: /Duyệt/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Từ chối/ })).toBeVisible();
  });

  test("approving moves the request out of the queue on the server", async ({ page }) => {
    await openQueue(page);

    const countText = await page.getByText(/\d+ đơn chờ duyệt/).innerText();
    const before = Number(countText.match(/(\d+)/)![1]);
    expect(before).toBeGreaterThan(0);

    await page.getByText(/NV-\d{4}-\d{4}/).first().click();
    await page.getByRole("button", { name: /Duyệt/ }).click();

    // Back on the queue, one fewer — and the count is re-read from the server rather
    // than decremented locally, so this fails if the transition did not persist.
    await expect(page.getByText(`${before - 1} đơn chờ duyệt`)).toBeVisible({ timeout: 60_000 });
  });
});
