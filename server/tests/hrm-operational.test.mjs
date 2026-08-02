import test from "node:test";
import assert from "node:assert/strict";
import { EmployeeTransferController } from "../dist/packages/clouderp-erpnext/src/hrm-core-controllers.js";
import { AttendanceRequestController } from "../dist/packages/clouderp-erpnext/src/hrm-shift-attendance-controllers.js";
import { LeaveApplicationController } from "../dist/packages/clouderp-erpnext/src/hrm-leave-overtime-controllers.js";
import { buildHrmSalarySlipInputs } from "../dist/packages/clouderp-erpnext/src/hrm-payroll.js";

function document(name, data, docstatus = 1, version = 1) {
  return { name, docstatus, version, data };
}

function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) {
      return documents[`${doctype}:${name}`] ?? null;
    },
    async getMasterRecordData(_tenant, doctype, name) {
      return masters[`${doctype}:${name}`] ?? null;
    },
    async listDocumentsByDoctype(_tenant, doctype) {
      return Object.entries(documents)
        .filter(([key]) => key.startsWith(`${doctype}:`))
        .map(([, value]) => value);
    },
    async hasMasterRecord(_tenant, doctype, name) {
      return Boolean(masters[`${doctype}:${name}`]);
    },
    async getPeriodLockDate() { return null; },
  };
}

function context(doctype, name, documentData, reader, action = "submit", roles = ["HR Manager"]) {
  return {
    command: {
      document: documentData,
      tenant_id: "demo",
      aggregate: { doctype, name },
      action,
      actor: { user_id: "hr@example.test", roles },
    },
    reader,
    existing: null,
    nextVersion: 1,
    now: "2026-08-20T09:00:00.000Z",
  };
}

const employee = {
  company: "Demo",
  branch: "BR-A",
  department: "DEP-A",
  cost_center: "CC-A",
  designation: "Worker",
  reports_to: "EMP-MGR",
  user_id: "employee@example.test",
  employee_status: "Đang làm việc",
};

test("approved employee transfer becomes effective state for later HR transactions", async () => {
  const masters = {
    "Employee:EMP-1": employee,
    "Employee:EMP-MGR": { ...employee, branch: "BR-B", department: "DEP-B", cost_center: "CC-B" },
    "Branch:BR-B": { company: "Demo" },
    "Department:DEP-B": { company: "Demo", branch: "BR-B" },
    "Cost Center:CC-B": { company: "Demo" },
  };
  const documents = {};
  let reader = fakeReader({ masters, documents });
  const transferController = new EmployeeTransferController();
  const transfer = await transferController.normalize(context("Employee Transfer", "TR-1", {
    employee: "EMP-1", company: "Demo", effective_date: "2026-08-15",
    to_branch: "BR-B", to_department: "DEP-B", to_cost_center: "CC-B", new_reports_to: "EMP-MGR", reason: "Điều chuyển",
  }, reader));
  assert.equal(transfer.from_branch, "BR-A");
  assert.equal(transfer.from_department, "DEP-A");
  assert.equal(transfer.to_branch, "BR-B");

  documents["Employee Transfer:TR-1"] = document("TR-1", transfer);
  reader = fakeReader({ masters, documents });
  const attendanceRequest = await new AttendanceRequestController().normalize(context("Attendance Request", "AR-1", {
    employee: "EMP-1", company: "FORGED", branch: "FORGED", from_date: "2026-08-18", to_date: "2026-08-18",
    request_type: "Làm việc từ xa", reason: "Khách hàng",
  }, reader));
  assert.equal(attendanceRequest.company, "Demo");
  assert.equal(attendanceRequest.branch, "BR-B");
});

test("leave application calculates working days from allocation and holiday list", async () => {
  const masters = {
    "Employee:EMP-1": employee,
    "Leave Type:AL": { leave_type_name: "Annual", is_paid: 1 },
  };
  const documents = {
    "Holiday List:HL-1": document("HL-1", { company: "Demo", weekly_off_days: "0,6", holidays_json: "[\"2026-08-03\"]" }),
    "Leave Policy:LP-1": document("LP-1", { company: "Demo", leave_type: "AL", effective_from: "2026-01-01", effective_to: "2026-12-31", annual_days: 12, requires_attachment_after_days: 0 }),
    "Leave Allocation:LA-1": document("LA-1", { employee: "EMP-1", company: "Demo", leave_type: "AL", leave_policy: "LP-1", from_date: "2026-01-01", to_date: "2026-12-31", allocated_days: 12, carry_forward_days: 0, holiday_list: "HL-1" }),
  };
  const reader = fakeReader({ masters, documents });
  const normalized = await new LeaveApplicationController().normalize(context("Leave Application", "LEAVE-1", {
    employee: "EMP-1", leave_type: "AL", from_date: "2026-08-03", to_date: "2026-08-07", reason: "Nghỉ phép",
  }, reader));
  assert.equal(normalized.total_days, 4);
  assert.equal(normalized.leave_allocation, "LA-1");
  assert.equal(normalized.holiday_list, "HL-1");
});

test("salary slip input is generated from effective structure, attendance and server salary components", async () => {
  const masters = {
    "Company:Demo": { default_currency: "USD" },
    "Currency:USD": { currency_scale: 2 },
    "Salary Component:Basic": { type: "Earning", account: "Salary Expense" },
  };
  const documents = {
    "Salary Structure Assignment:SSA-1": document("SSA-1", {
      employee: "EMP-1", company: "Demo", branch: "BR-A", from_date: "2026-08-01", to_date: "2026-08-31",
      salary_structure: "SS-1", base_salary: "1000", holiday_list: "HL-PAY", payable_account: "Payroll Payable", payroll_cost_center: "CC-A",
    }, 1, 3),
    "Salary Structure:SS-1": document("SS-1", {
      company: "Demo", effective_from: "2026-01-01", payroll_rule: "RULE-1", holiday_list: "HL-PAY",
      payroll_payable_account: "Payroll Payable", default_cost_center: "CC-A", unmarked_attendance: "Vắng",
      components: [{ salary_component: "Basic", amount_type: "Fixed", amount: "1000", prorate_by_payment_days: 1 }],
    }, 1, 2),
    "Holiday List:HL-PAY": document("HL-PAY", { company: "Demo", weekly_off_days: "0,6", holidays_json: "[]" }, 1, 4),
    "Payroll Period:PP-1": document("PP-1", { company: "Demo", branch: "BR-A", start_date: "2026-08-03", end_date: "2026-08-07", pay_date: "2026-08-10" }, 1, 1),
    "Attendance:A-03": document("A-03", { employee: "EMP-1", attendance_date: "2026-08-03", attendance_status: "Có mặt" }),
    "Attendance:A-04": document("A-04", { employee: "EMP-1", attendance_date: "2026-08-04", attendance_status: "Có mặt" }),
    "Attendance:A-05": document("A-05", { employee: "EMP-1", attendance_date: "2026-08-05", attendance_status: "Có mặt" }),
    "Attendance:A-06": document("A-06", { employee: "EMP-1", attendance_date: "2026-08-06", attendance_status: "Có mặt" }),
    "Attendance:A-07": document("A-07", { employee: "EMP-1", attendance_date: "2026-08-07", attendance_status: "Vắng" }),
  };
  const reader = fakeReader({ masters, documents });
  const input = {
    employee: "EMP-1", company: "Demo", posting_at: "2026-08-07T12:00:00Z",
    start_date: "2026-08-03", end_date: "2026-08-07", payroll_payable_account: "", earnings: [],
    salary_structure_assignment: "SSA-1",
  };
  const generated = await buildHrmSalarySlipInputs(context("Salary Slip", "SAL-1", input, reader, "submit", ["Payroll Manager"]), input);
  assert.ok(generated);
  assert.equal(generated.working_days, 5);
  assert.equal(generated.payment_days, 4);
  assert.equal(generated.earnings[0].salary_component, "Basic");
  assert.equal(generated.earnings[0].account, "Salary Expense");
  assert.equal(generated.earnings[0].amount, "800.00");
  assert.equal(generated.input_hash.length, 64);
});
