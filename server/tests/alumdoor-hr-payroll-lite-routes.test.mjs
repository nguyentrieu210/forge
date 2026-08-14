import test from "node:test";
import assert from "node:assert/strict";
import {
  employeeLiteCreate,
  payProfileLiteSave,
  payrollLiteSettingsGet,
  payrollLiteSettingsSave,
} from "../dist/apps-src/alumdoor-worker/src/hr-payroll-lite-routes.js";

function callFixture() {
  const observed = [];
  const call = async (path, init = {}) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    observed.push({ path, body });
    if (path === "method/metaforge.api.commit_alumdoor_employee_lite") {
      return Response.json({ message: { name: "EMP-1", employee_name: body.employee_name, mobile: body.mobile } });
    }
    if (path === "method/metaforge.api.commit_alumdoor_pay_profile_lite") {
      return Response.json({ message: { name: "PP-1", employee: body.employee, status: "approved" } });
    }
    if (path === "method/metaforge.api.get_alumdoor_hr_lite_organization") {
      return Response.json({ message: {
        company: "ALUMDOOR", workplace: "XUONG", ready: true, configured: true,
        pay_day_of_month: 5, owner_only_mode: true,
        companies: [{ value: "ALUMDOOR", label: "AlumDoor" }],
        workplaces: [{ value: "XUONG", label: "Xưởng", company: "ALUMDOOR" }],
      } });
    }
    if (path === "method/metaforge.api.commit_alumdoor_hr_lite_settings") {
      return Response.json({ message: { company: body.company, workplace: body.workplace, ready: true } });
    }
    return Response.json({ message: `unexpected ${path}` }, { status: 404 });
  };
  return { call, observed };
}

test("Employee Lite normalizes Vietnamese phone then uses only the trusted employee callback", async () => {
  const fixture = callFixture();
  const response = await employeeLiteCreate({ call: fixture.call, args: {
    employee_name: "Nguyễn Văn A", mobile: "+84 912 345 678", date_of_joining: "2026-08-14",
    idempotency_key: "employee-route-key-01",
  } });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(fixture.observed.map((entry) => entry.path), ["method/metaforge.api.commit_alumdoor_employee_lite"]);
  assert.equal(fixture.observed[0].body.mobile, "0912345678");
  assert.equal("department" in fixture.observed[0].body, false);
});

test("Pay Profile Lite uses the atomic callback and never generic insert/submit", async () => {
  const fixture = callFixture();
  const response = await payProfileLiteSave({ call: fixture.call, args: {
    employee: "EMP-1", pay_mode: "MONTHLY", base_salary_vnd: 8_000_000,
    fixed_allowance_vnd: 500_000, effective_from: "2026-08-14", idempotency_key: "profile-route-key-01",
  } });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(fixture.observed.map((entry) => entry.path), ["method/metaforge.api.commit_alumdoor_pay_profile_lite"]);
});

test("Lite settings expose one small-business organization and immutable overtime policy", async () => {
  const fixture = callFixture();
  const response = await payrollLiteSettingsGet({ call: fixture.call });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.company, "ALUMDOOR");
  assert.equal(body.workplace, "XUONG");
  assert.equal(body.overtime_rate_vnd_per_hour, 50_000);
  assert.equal(body.owner_only_mode, true);
  assert.equal(body.ready, true);
  assert.equal(body.companies.length, 1);
});

test("Lite settings save validates available choices then uses trusted callback", async () => {
  const fixture = callFixture();
  const response = await payrollLiteSettingsSave({ call: fixture.call, args: {
    company: "ALUMDOOR", workplace: "XUONG", pay_day_of_month: 5, idempotency_key: "settings-route-key-01",
  } });
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(fixture.observed.map((entry) => entry.path), [
    "method/metaforge.api.get_alumdoor_hr_lite_organization",
    "method/metaforge.api.commit_alumdoor_hr_lite_settings",
    "method/metaforge.api.get_alumdoor_hr_lite_organization",
  ]);
});
