import test from "node:test";
import assert from "node:assert/strict";
import { buildAlumDoorSalarySlipInputs } from "../dist/packages/clouderp-erpnext/src/alumdoor-payroll.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data };
}

function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) {
      return Object.entries(documents)
        .filter(([key]) => key.startsWith(`${doctype}:`))
        .map(([, value]) => value);
    },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}

function context(input, reader) {
  return {
    command: {
      document: input,
      tenant_id: "alu",
      aggregate: { doctype: "Salary Slip", name: "SAL-ALU-1" },
      action: "create",
      actor: { user_id: "payroll@example.test", roles: ["AlumDoor Payroll User"] },
    },
    reader,
    existing: null,
    nextVersion: 1,
    now: "2026-08-31T12:00:00.000Z",
  };
}

test("AlumDoor Salary Slip input is calculated from Attendance Day, never standard Attendance", async () => {
  const masters = {
    "Company:ALUMDOOR": { default_currency: "VND" },
    "Salary Component:Lương": { type: "Earning", account: "Chi phí lương" },
    "Salary Component:Khấu trừ": { type: "Deduction", account: "Khấu trừ lương" },
  };
  const documents = {
    "AlumDoor Pay Profile:ALU-LUONG-1": document("ALU-LUONG-1", {
      employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG",
      pay_mode: "MONTHLY", base_salary_vnd: 13_000_000, overtime_multiplier_bp: 15_000,
      fixed_allowance_vnd: 500_000, effective_from: "2026-01-01", status: "approved",
    }, 1, 3),
    "Salary Structure Assignment:SSA-1": document("SSA-1", {
      employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG",
      from_date: "2026-01-01", salary_structure: "SS-1", payable_account: "Phải trả lương",
    }),
    "Salary Structure:SS-1": document("SS-1", {
      company: "ALUMDOOR", payroll_payable_account: "Phải trả lương",
      components: [{ salary_component: "Lương" }, { salary_component: "Khấu trừ" }],
    }),
    "Shift Assignment:SA-1": document("SA-1", {
      employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG", shift_type: "DAY", start_date: "2026-01-01",
    }),
    "Shift Type:DAY": document("DAY", { working_minutes: 480, disabled: 0 }),
    "AlumDoor Attendance Day:AAD-01": document("AAD-01", {
      employee: "EMP-1", work_date: "2026-08-01", state: "complete",
      regular_minutes: 480, overtime_minutes: 120, payable_work_fraction_bp: 10_000,
    }, 0, 2),
    "AlumDoor Attendance Day:AAD-02": document("AAD-02", {
      employee: "EMP-1", work_date: "2026-08-02", state: "approved",
      regular_minutes: 240, overtime_minutes: 0, payable_work_fraction_bp: 5_000,
    }, 0, 4),
    "Overtime Request:OT-01": document("OT-01", {
      employee: "EMP-1", company: "ALUMDOOR", overtime_date: "2026-08-01",
      approved_minutes: 120,
    }),
    // This standard Attendance record is intentionally contradictory. AlumDoor payroll must ignore it.
    "Attendance:WRONG": document("WRONG", { employee: "EMP-1", attendance_date: "2026-08-01", attendance_status: "Vắng" }),
  };
  const input = {
    employee: "EMP-1", company: "ALUMDOOR", posting_at: "2026-08-31T12:00:00Z",
    start_date: "2026-08-01", end_date: "2026-08-31", earnings: [], deductions: [],
    payroll_payable_account: "", alu_payroll_entry: "PAY-ALU-1", alu_pay_profile: "ALU-LUONG-1",
    alu_standard_work_days_bp: 260_000, alu_calculation_version: 1,
  };
  const generated = await buildAlumDoorSalarySlipInputs(context(input, fakeReader({ masters, documents })), input);
  assert.ok(generated);
  assert.equal(generated.alu_regular_minutes, 720);
  assert.equal(generated.alu_overtime_minutes, 120);
  assert.equal(generated.alu_work_fraction_bp, 15_000);
  assert.equal(generated.alu_base_pay_vnd, 750_000);
  assert.equal(generated.alu_overtime_pay_vnd, 187_500);
  assert.equal(generated.alu_allowance_vnd, 500_000);
  assert.equal(generated.input_hash.length, 64);
  assert.equal(generated.earnings.reduce((sum, row) => sum + Number(row.amount), 0), 1_437_500);
  const trace = JSON.parse(generated.alu_formula_trace_json);
  assert.equal(trace.attendance.length, 2);
  assert.equal(trace.outputs_vnd.net_pay, 1_437_500);
});

test("AlumDoor payroll blocks open or exception attendance", async () => {
  const masters = {
    "Company:ALUMDOOR": { default_currency: "VND" },
    "Salary Component:Lương": { type: "Earning", account: "Chi phí lương" },
  };
  const documents = {
    "AlumDoor Pay Profile:ALU-LUONG-1": document("ALU-LUONG-1", {
      employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG", pay_mode: "DAILY",
      base_salary_vnd: 500_000, overtime_multiplier_bp: 15_000, fixed_allowance_vnd: 0,
      effective_from: "2026-01-01", status: "approved",
    }),
    "Salary Structure Assignment:SSA-1": document("SSA-1", { employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG", from_date: "2026-01-01", salary_structure: "SS-1", payable_account: "Phải trả lương" }),
    "Salary Structure:SS-1": document("SS-1", { company: "ALUMDOOR", components: [{ salary_component: "Lương" }], payroll_payable_account: "Phải trả lương" }),
    "AlumDoor Attendance Day:AAD-01": document("AAD-01", { employee: "EMP-1", work_date: "2026-08-01", state: "exception", regular_minutes: 0, overtime_minutes: 0, payable_work_fraction_bp: 0 }, 0),
  };
  const input = { employee: "EMP-1", company: "ALUMDOOR", posting_at: "2026-08-31T12:00:00Z", start_date: "2026-08-01", end_date: "2026-08-31", earnings: [], payroll_payable_account: "", alu_payroll_entry: "PAY-1", alu_pay_profile: "ALU-LUONG-1", alu_standard_work_days_bp: 260_000 };
  await assert.rejects(() => buildAlumDoorSalarySlipInputs(context(input, fakeReader({ masters, documents })), input), /PAYROLL_BLOCKED/);
});
