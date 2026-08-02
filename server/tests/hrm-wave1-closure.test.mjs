import test from "node:test";
import assert from "node:assert/strict";
import { AttendanceController } from "../dist/packages/clouderp-erpnext/src/hrm-shift-attendance-controllers.js";
import { EmployeeFinalSettlementController, HiringCompletionController } from "../dist/packages/clouderp-erpnext/src/hrm-closure-controllers.js";

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
    now: "2026-08-20T18:00:00.000Z",
  };
}

const employee = {
  company: "Demo",
  branch: "BR-A",
  department: "DEP-A",
  cost_center: "CC-A",
  designation: "Engineer",
  employment_type: "Chính thức",
  date_of_joining: "2026-08-03",
  user_id: "employee@example.test",
  employee_status: "Đang làm việc",
};

test("attendance derives authoritative time from submitted raw checkins when auto attendance is enabled", async () => {
  const masters = {
    "Employee:EMP-1": employee,
    "Shift Type:DAY": {
      shift_name: "DAY", start_time: "08:00:00", end_time: "17:00:00",
      working_minutes: 480, late_grace_minutes: 5, early_exit_grace_minutes: 5,
      auto_attendance: 1, disabled: 0,
    },
  };
  const documents = {
    "Shift Assignment:SHIFT-1": document("SHIFT-1", {
      employee: "EMP-1", company: "Demo", branch: "BR-A", department: "DEP-A",
      shift_type: "DAY", start_date: "2026-08-01", end_date: "2026-08-31",
    }),
    "Employee Checkin:CHK-IN": document("CHK-IN", {
      employee: "EMP-1", time: "2026-08-20T08:03:00Z", log_type: "IN", source: "Device",
    }),
    "Employee Checkin:CHK-OUT": document("CHK-OUT", {
      employee: "EMP-1", time: "2026-08-20T17:02:00Z", log_type: "OUT", source: "Device",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const normalized = await new AttendanceController().normalize(context("Attendance", "ATT-1", {
    employee: "EMP-1", attendance_date: "2026-08-20", attendance_status: "Có mặt", source: "Manual",
  }, reader));
  assert.equal(normalized.source, "Checkin");
  assert.equal(normalized.in_time, "2026-08-20T08:03:00Z");
  assert.equal(normalized.out_time, "2026-08-20T17:02:00Z");
  assert.equal(normalized.working_minutes, 539);
  assert.equal(normalized.late_entry, 0);
  assert.equal(normalized.early_exit, 0);
  assert.deepEqual(JSON.parse(normalized.checkin_refs_json), ["CHK-IN", "CHK-OUT"]);
});

test("auto attendance fails closed when one side of the raw checkin pair is missing", async () => {
  const masters = {
    "Employee:EMP-1": employee,
    "Shift Type:DAY": { shift_name: "DAY", start_time: "08:00:00", end_time: "17:00:00", working_minutes: 480, auto_attendance: 1 },
  };
  const documents = {
    "Shift Assignment:SHIFT-1": document("SHIFT-1", { employee: "EMP-1", shift_type: "DAY", start_date: "2026-08-01" }),
    "Employee Checkin:CHK-IN": document("CHK-IN", { employee: "EMP-1", time: "2026-08-20T08:03:00Z", log_type: "IN" }),
  };
  const reader = fakeReader({ masters, documents });
  await assert.rejects(
    new AttendanceController().normalize(context("Attendance", "ATT-1", {
      employee: "EMP-1", attendance_date: "2026-08-20", attendance_status: "Có mặt", source: "Manual",
    }, reader)),
    /requires submitted IN and OUT check-ins/,
  );
});

test("hiring completion proves offer to employee contract and onboarding lineage", async () => {
  const masters = { "Employee:EMP-1": employee };
  const documents = {
    "Job Offer:OFFER-1": document("OFFER-1", {
      job_applicant: "APP-1", job_opening: "OPEN-1", company: "Demo", branch: "BR-A", department: "DEP-A",
      designation: "Engineer", employment_type: "Chính thức", joining_date: "2026-08-03",
      offered_base_salary: 20_000_000, currency: "VND",
    }),
    "Employment Contract:CON-1": document("CON-1", {
      employee: "EMP-1", company: "Demo", branch: "BR-A", department: "DEP-A", start_date: "2026-08-03",
      base_salary: 20_000_000, salary_currency: "VND",
    }),
    "Employee Onboarding:ONB-1": document("ONB-1", {
      employee: "EMP-1", company: "Demo", branch: "BR-A", department: "DEP-A", start_date: "2026-08-03",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const normalized = await new HiringCompletionController().normalize(context("Hiring Completion", "HIRE-1", {
    job_offer: "OFFER-1", employee: "EMP-1", employment_contract: "CON-1", employee_onboarding: "ONB-1",
    completion_date: "2026-08-03",
  }, reader));
  const trace = JSON.parse(normalized.lineage_snapshot_json);
  assert.equal(trace.job_offer, "OFFER-1");
  assert.equal(trace.employee, "EMP-1");
  assert.equal(trace.employment_contract, "CON-1");
  assert.equal(trace.employee_onboarding, "ONB-1");
});

test("final settlement requires completed clearance, final salary slip and zero paid unsettled advances", async () => {
  const masters = { "Employee:EMP-1": employee };
  const documents = {
    "Employee Separation:SEP-1": document("SEP-1", {
      employee: "EMP-1", company: "Demo", notice_date: "2026-08-01", last_working_day: "2026-08-20",
      effective_date: "2026-08-20", clearance_status: "Hoàn tất",
    }),
    "Salary Slip:SAL-FINAL": document("SAL-FINAL", {
      employee: "EMP-1", company: "Demo", start_date: "2026-08-01", end_date: "2026-08-20",
    }),
  };
  const reader = fakeReader({ masters, documents });
  const normalized = await new EmployeeFinalSettlementController().normalize(context("Employee Final Settlement", "FSET-1", {
    employee: "EMP-1", separation: "SEP-1", settlement_date: "2026-08-21", final_salary_slip: "SAL-FINAL",
  }, reader, "submit", ["Payroll Manager"]));
  assert.equal(normalized.unsettled_advance_count, 0);
  assert.equal(normalized.branch, "BR-A");
  assert.equal(JSON.parse(normalized.settlement_snapshot_json).final_salary_slip, "SAL-FINAL");
});

test("final settlement blocks paid advances until a settlement reference exists", async () => {
  const masters = { "Employee:EMP-1": employee };
  const documents = {
    "Employee Separation:SEP-1": document("SEP-1", {
      employee: "EMP-1", company: "Demo", last_working_day: "2026-08-20", clearance_status: "Hoàn tất",
    }),
    "Salary Slip:SAL-FINAL": document("SAL-FINAL", {
      employee: "EMP-1", company: "Demo", start_date: "2026-08-01", end_date: "2026-08-20",
    }),
    "Employee Advance:ADV-1": document("ADV-1", {
      employee: "EMP-1", advance_amount: 5_000_000, currency: "VND", payment_entry: "PE-1",
    }),
  };
  const reader = fakeReader({ masters, documents });
  await assert.rejects(
    new EmployeeFinalSettlementController().normalize(context("Employee Final Settlement", "FSET-1", {
      employee: "EMP-1", separation: "SEP-1", settlement_date: "2026-08-21", final_salary_slip: "SAL-FINAL",
    }, reader, "submit", ["Payroll Manager"])),
    /paid advance\(s\) not yet settled/,
  );
});
