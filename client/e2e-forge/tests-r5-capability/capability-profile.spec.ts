import { expect, test } from "@playwright/test";

const required = {
  capability_id: "vn-accounting.cash-bank",
  package_id: "vn-accounting",
  label: "Cash & Bank",
  state: "required",
  desired_state: "enabled",
  source: "required",
  blocked_reasons: [],
};
const payroll = {
  capability_id: "hrm.payroll",
  package_id: "hrm",
  label: "Payroll",
  state: "enabled",
  desired_state: "enabled",
  source: "default",
  blocked_reasons: [],
};

function resolution(diff: Array<{ capability_id: string; from: string; to: string }> = []) {
  return {
    profile_id: "alumdoor-pilot",
    valid: true,
    capabilities: [required, { ...payroll, ...(diff.length ? { state: "disabled", desired_state: "disabled", source: "explicit" } : {}) }],
    errors: [],
    implicit_enables: [],
    package_requirements: [],
    diff,
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/method/metaforge.api.get_boot**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: {
        user: "Administrator",
        full_name: "Administrator",
        roles: ["System Manager"],
        user_permissions: {},
        lang: "vi",
        site_name: "r5-browser",
        frappe_version: "16.29.0",
        csrf_token: "csrf-r5",
        sysdefaults: {},
        allowed_workspaces: [],
      } }),
    });
  });

  await page.route("**/api/method/metaforge.api.get_capability_profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: { profile_id: "alumdoor-pilot", version: 1, resolution: resolution() } }),
    });
  });

  await page.route("**/api/method/metaforge.api.preview_capability_profile", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["x-frappe-csrf-token"]).toBe("csrf-r5");
    const payload = request.postDataJSON();
    expect(payload.profile_id).toBe("alumdoor-pilot");
    expect(payload.expected_version).toBe(1);
    expect(payload.selections).toContainEqual({ capability_id: "hrm.payroll", state: "disabled" });
    const diff = [{ capability_id: "hrm.payroll", from: "enabled", to: "disabled" }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: {
        current: { profile_id: "alumdoor-pilot", version: 1 },
        proposal: payload,
        resolution: resolution(diff),
      } }),
    });
  });

  await page.route("**/api/method/metaforge.api.apply_capability_profile", async (route) => {
    const request = route.request();
    expect(request.headers()["x-frappe-csrf-token"]).toBe("csrf-r5");
    const payload = request.postDataJSON();
    const diff = [{ capability_id: "hrm.payroll", from: "enabled", to: "disabled" }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: {
        profile_id: "alumdoor-pilot",
        version: 2,
        resolution: resolution(diff),
        outcome: "applied",
      } }),
    });
  });
});

test("System Manager previews and applies capability changes", async ({ page }) => {
  await page.goto("/app-factory/capabilities");
  await expect(page.getByRole("heading", { name: "Capability Profile" })).toBeVisible();
  await expect(page.getByText("Version hiện tại: 1")).toBeVisible();
  await expect(page.getByText("Cash & Bank")).toBeVisible();
  await expect(page.getByRole("switch", { name: /Bắt buộc/ })).toBeDisabled();

  const payrollSwitch = page.getByRole("switch", { name: /Bật/ }).last();
  await payrollSwitch.click();
  await expect(payrollSwitch).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "Kiểm tra kế hoạch" }).click();
  await expect(page.getByText("Preview thay đổi")).toBeVisible();
  await expect(page.getByText("hrm.payroll").last()).toBeVisible();
  await expect(page.getByText("Diff:").locator("..")).toContainText("1");

  await page.getByRole("button", { name: /Áp dụng/ }).click();
  await expect(page.getByText("Version hiện tại: 2")).toBeVisible();
});
