import test from "node:test";
import assert from "node:assert/strict";
import { routeFrappeApi } from "../dist/packages/frappe-api/src/index.js";

const TENANT = "tenant-alumdoor-hr-lite-router";
const ACTOR = { user_id: "owner@example.com", roles: ["HR Manager", "AlumDoor Attendance Manager"] };

async function invoke(method, body, overrides = {}) {
  const url = new URL(`https://tenant.test/api/method/${method}`);
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await routeFrappeApi(request, url, {
    tenantId: TENANT,
    actor: ACTOR,
    traceId: "trace-alumdoor-hr-lite-router",
    now: () => "2026-08-22T00:00:00.000Z",
    ...overrides,
  });
  assert.ok(response);
  return { response, body: await response.json() };
}

test("HR Lite native writes reject an unverified browser before reaching a coordinator", async () => {
  let calls = 0;
  const result = await invoke("metaforge.api.commit_alumdoor_employee_lite", {
    employee_name: "Nguyễn Văn A",
    mobile: "0912345678",
    date_of_joining: "2026-08-22",
    idempotency_key: "employee-router-key-01",
  }, {
    async commitAlumdoorEmployeeLite() { calls += 1; return {}; },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.exc_type, "PermissionError");
  assert.equal(calls, 0);
});

test("verified AlumDoor callback receives bounded deterministic HR Lite commands", async () => {
  const observed = [];
  const hooks = {
    appCallbackAppId: "alumdoor",
    async commitAlumdoorEmployeeLite(input) { observed.push(["employee", input]); return input; },
    async commitAlumdoorPayProfileLite(input) { observed.push(["profile", input]); return input; },
    async commitAlumdoorHrLiteSettings(input) { observed.push(["settings", input]); return input; },
    async commitAlumdoorAttendanceStationLite(input) { observed.push(["station", input]); return input; },
  };

  const employeeBody = {
    employee_name: "Nguyễn Văn A", mobile: "0912345678", date_of_joining: "2026-08-22",
    idempotency_key: "employee-router-key-01", ignored: "never forwarded",
  };
  const firstEmployee = await invoke("metaforge.api.commit_alumdoor_employee_lite", employeeBody, hooks);
  const secondEmployee = await invoke("metaforge.api.commit_alumdoor_employee_lite", employeeBody, hooks);
  assert.equal(firstEmployee.response.status, 200);
  assert.equal(secondEmployee.body.message.employeeName, firstEmployee.body.message.employeeName);
  assert.match(firstEmployee.body.message.employeeName, /^NV-[A-F0-9]{10}$/u);
  assert.equal(firstEmployee.body.message.employeeFullName, "Nguyễn Văn A");
  assert.equal(firstEmployee.body.message.ignored, undefined);

  const profile = await invoke("metaforge.api.commit_alumdoor_pay_profile_lite", {
    employee: firstEmployee.body.message.employeeName,
    pay_mode: "MONTHLY", base_salary_vnd: 8_000_000, fixed_allowance_vnd: 500_000,
    effective_from: "2026-08-22", idempotency_key: "profile-router-key-01",
  }, hooks);
  assert.equal(profile.response.status, 200);
  assert.match(profile.body.message.profileName, /^ALU-LUONG-[A-F0-9]{10}$/u);

  const settings = await invoke("metaforge.api.commit_alumdoor_hr_lite_settings", {
    company: "ALUMDOOR", workplace: "XUONG", currency: "VND",
    morning_start: "07:00", morning_end: "11:30", afternoon_start: "13:00", afternoon_end: "17:00",
    overtime_start: "17:30", pay_day_of_month: 5, idempotency_key: "settings-router-key-01",
  }, hooks);
  assert.equal(settings.response.status, 200);
  assert.equal(settings.body.message.payDayOfMonth, 5);

  const station = await invoke("metaforge.api.commit_alumdoor_attendance_station_lite", {
    station_name: "Cổng xưởng", latitude: 10.7769, longitude: 106.7009,
    allowed_radius_m: 50, idempotency_key: "station-router-key-01",
  }, hooks);
  assert.equal(station.response.status, 200);
  assert.match(station.body.message.stationCode, /^ST-[A-F0-9]{10}$/u);
  assert.equal(observed.length, 5);
});

test("HR Lite organization read unions canonical masters and exposes safe defaults", async () => {
  const calls = [];
  const result = await invoke("metaforge.api.get_alumdoor_hr_lite_organization", {}, {
    appCallbackAppId: "alumdoor",
    documents: {
      async listMasterRecordData(tenantId, doctype) {
        calls.push(["list", tenantId, doctype]);
        if (doctype === "Company") return [{ name: "ALUMDOOR", data: { company_name: "Xưởng AlumDoor", default_currency: "VND" } }];
        if (doctype === "Branch") return [{ name: "XUONG", data: { branch_name: "Xưởng chính", company: "ALUMDOOR" } }];
        if (doctype === "Currency") return [];
        return [];
      },
      async getMasterRecordData(tenantId, doctype, name) {
        calls.push(["get", tenantId, doctype, name]);
        return null;
      },
    },
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.message, {
    company: "ALUMDOOR", workplace: "XUONG", currency: "VND",
    ready: true, configured: false,
    morning_start: "07:00", morning_end: "11:30", afternoon_start: "13:00", afternoon_end: "17:00",
    overtime_start: "17:30", pay_day_of_month: 5, owner_only_mode: true,
    overtime_rate_vnd_per_hour: 50_000,
    companies: [{ value: "ALUMDOOR", label: "Xưởng AlumDoor", currency: "VND" }],
    workplaces: [{ value: "XUONG", label: "Xưởng chính", company: "ALUMDOOR" }],
    currencies: [{ value: "VND", label: "VND" }],
  });
  assert.equal(calls.length, 4);
});
