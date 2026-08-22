import { expect, test, type Page } from "@playwright/test";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const nav = [
  { key: "alumdoor-attendance:employees-lite", label: "Nhân viên", kind: "experience", group: "Nhân sự & Tiền lương" },
  { key: "alumdoor-attendance:payroll-lite", label: "Tính lương", kind: "experience", group: "Nhân sự & Tiền lương" },
  { key: "alumdoor-attendance:my-slips-lite", label: "Phiếu lương của tôi", kind: "experience", group: "Nhân sự & Tiền lương" },
  { key: "alumdoor-attendance:hr-payroll-settings-lite", label: "Cài đặt mặc định", kind: "experience", group: "Nhân sự & Tiền lương" },
];
const manifest = { id: "alumdoor", name: "AlumDoor", version: "2.11.1", domain: "alumdoor", home: { route: "/x/alumdoor-attendance%3Aemployees-lite" }, nav };

async function mockRuntime(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mf-theme-welcome:v1:owner@example.test", "1"));
  await page.route("**/api/method/metaforge.api.get_boot**", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: {
    user: "owner@example.test", full_name: "Chủ xưởng", roles: ["HR Manager", "System Manager"], user_permissions: {}, lang: "vi",
    site_name: "alumdoor-ui.test", frappe_version: "16.0.0", csrf_token: "qa-csrf",
    sysdefaults: { date_format: "dd/mm/yyyy", number_format: "#.###,##", currency: "VND" }, allowed_workspaces: [],
  } }) }));
  await page.route("**/api/method/metaforge.api.get_app_manifest**", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: manifest }) }));
  await page.route("**/api/method/metaforge.api.get_application_catalog**", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: { apps: [] } }) }));
  await page.route("**/api/method/metaforge.api.get_business_context**", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: { dimensions: [], selection: {}, policies: {} } }) }));
}

test("Employee Lite creates an employee and then an effective pay profile", async ({ page }) => {
  await mockRuntime(page);
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.route("**/api/method/frappe.client.get_list", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: [] }) }));
  await page.route("**/api/method/alumdoor.hr.employee_lite_create", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    calls.push({ path: "employee", body });
    await route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: { name: "NV-123", employee_name: body.employee_name, mobile: body.mobile } }) });
  });
  await page.route("**/api/method/alumdoor.hr.pay_profile_lite_save", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    calls.push({ path: "profile", body });
    await route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: { name: "ALU-LUONG-123", employee: body.employee, status: "approved" } }) });
  });
  await page.goto("/x/alumdoor-attendance%3Aemployees-lite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Nhân viên & mức lương" })).toBeVisible();
  await page.getByPlaceholder("Họ và tên").fill("Nguyễn Văn A");
  await page.getByPlaceholder("Số điện thoại").fill("0912345678");
  await page.getByRole("button", { name: "Tạo nhân viên" }).click();
  await expect(page.getByText(/Đã tạo Nguyễn Văn A/)).toBeVisible();
  await page.getByPlaceholder("Lương cơ bản (VND)").fill("8000000");
  await page.getByRole("button", { name: "Lưu và duyệt mức lương" }).click();
  await expect(page.getByText(/Đã duyệt hồ sơ lương mới/)).toBeVisible();
  expect(calls.map((entry) => entry.path)).toEqual(["employee", "profile"]);
  expect(calls[1]?.body.employee).toBe("NV-123");
  expect(String(calls[0]?.body.idempotency_key)).toMatch(/^employee:/u);
  expect(String(calls[1]?.body.idempotency_key)).toMatch(/^pay-profile:/u);
});

test("HR Lite settings load canonical choices and save the fixed overtime contract", async ({ page }) => {
  await mockRuntime(page);
  const settings = {
    company: "ALUMDOOR", workplace: "XUONG", currency: "VND", ready: true, configured: true,
    morning_start: "07:00", morning_end: "11:30", afternoon_start: "13:00", afternoon_end: "17:00", overtime_start: "17:30",
    pay_day_of_month: 5, owner_only_mode: true, overtime_rate_vnd_per_hour: 50000,
    companies: [{ value: "ALUMDOOR", label: "Xưởng AlumDoor", currency: "VND" }],
    workplaces: [{ value: "XUONG", label: "Xưởng chính", company: "ALUMDOOR" }], currencies: [{ value: "VND", label: "VND" }],
  };
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/method/alumdoor.hr.payroll_lite_settings_get", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: settings }) }));
  await page.route("**/api/method/alumdoor.hr.payroll_lite_settings_save", async (route) => {
    saved = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: settings }) });
  });
  await page.goto("/x/alumdoor-attendance%3Ahr-payroll-settings-lite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Cài đặt nhân sự & tiền lương" })).toBeVisible();
  await expect(page.getByText("50.000 ₫ / giờ")).toBeVisible();
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Đã lưu cấu hình giờ làm và kỳ lương.")).toBeVisible();
  expect(saved?.company).toBe("ALUMDOOR");
  expect(saved?.overtime_rate_vnd_per_hour).toBeUndefined();
  expect(String(saved?.idempotency_key)).toMatch(/^hr-settings:/u);
});

test("current payroll and self-slip navigation keys mount their real screens", async ({ page }) => {
  await mockRuntime(page);
  await page.route("**/api/method/alumdoor.payroll.period_list", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: [] }) }));
  await page.route("**/api/method/alumdoor.payroll.my_slips", (route) => route.fulfill({ status: 200, headers: JSON_HEADERS, body: JSON.stringify({ message: [] }) }));
  await page.goto("/x/alumdoor-attendance%3Apayroll-lite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Tính lương" })).toBeVisible();
  await page.goto("/x/alumdoor-attendance%3Amy-slips-lite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Phiếu lương của tôi" })).toBeVisible();
});
