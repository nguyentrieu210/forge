import test from "node:test";
import assert from "node:assert/strict";
import { AlumDoorAttendanceDayController } from "../dist/packages/clouderp-erpnext/src/alumdoor-attendance.js";

const completeDay = {
  employee: "EMP-1",
  work_date: "2026-08-10",
  policy: "ATP-1",
  segments: [
    { segment_code: "SHIFT1", actual_in: "2026-08-10T07:00:00+07:00", actual_out: "2026-08-10T11:30:00+07:00", state: "complete" },
    { segment_code: "SHIFT2", actual_in: "2026-08-10T13:00:00+07:00", actual_out: "2026-08-10T17:00:00+07:00", state: "complete" },
    { segment_code: "SHIFT3", actual_in: "2026-08-10T17:30:00+07:00", actual_out: "2026-08-10T18:00:00+07:00", state: "complete" },
  ],
};

function context(document, roles = ["AlumDoor QR System"]) {
  const records = new Map([
    ["Employee:EMP-1", { employee_status: "Active", status: "Active", company: "ALUMDOOR", branch: "XUONG", department: "SX", date_of_joining: "2025-01-01" }],
    ["AlumDoor Attendance Policy:ATP-1", {
      policy_status: "approved", company: "ALUMDOOR", branch: "XUONG", timezone: "Asia/Ho_Chi_Minh",
      shift1_start_minute: 420, shift1_end_minute: 690,
      shift2_start_minute: 780, shift2_end_minute: 1020,
      shift3_start_minute: 1050, shift3_latest_out_minute: 1439,
      regular_daily_cap_minutes: 480,
    }],
    ["Shift Type:DAY", { start_time: "07:00", end_time: "17:00", working_minutes: 480, disabled: 0 }],
  ]);
  return {
    command: {
      schema_version: 1,
      command_id: "cmd-1",
      tenant_id: "alu",
      actor: { user_id: "employee@example.test", roles },
      aggregate: { doctype: "AlumDoor Attendance Day", name: "AAD-1" },
      action: "create",
      expected_version: null,
      payload_hash: "a".repeat(64),
      document,
      submitted_at: "2026-08-10T18:00:00.000Z",
    },
    existing: null,
    nextVersion: 1,
    now: "2026-08-10T18:00:00.000Z",
    reader: {
      async getDocument(_tenant, doctype, name) {
        const data = records.get(`${doctype}:${name}`);
        return data ? { name, data, docstatus: doctype === "Employee" ? 0 : 1, version: 1 } : null;
      },
      async getMasterRecordData(_tenant, doctype, name) { return records.get(`${doctype}:${name}`) ?? null; },
      async listDocumentsByDoctype(_tenant, doctype) {
        return doctype === "Shift Assignment" ? [{
          name: "SHIFT-EMP-1", docstatus: 1,
          data: { employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG", shift_type: "DAY", start_date: "2026-01-01" },
        }] : [];
      },
    },
  };
}

test("AlumDoor daily projection calculates 3 shifts without changing standard Attendance", async () => {
  const plan = await new AlumDoorAttendanceDayController().buildPlan(context(completeDay));
  assert.equal(plan.document.data.regular_minutes, 480);
  assert.equal(plan.document.data.raw_overtime_minutes, 60);
  assert.equal(plan.document.data.overtime_minutes, 0);
  assert.equal(plan.document.data.payable_work_fraction_bp, 10_000);
  assert.equal(plan.document.status, "complete");
  assert.deepEqual(plan.document.children.map((row) => row.child_doctype), [
    "AlumDoor Attendance Segment",
    "AlumDoor Attendance Segment",
    "AlumDoor Attendance Segment",
  ]);
});

test("QR create keeps scan intent when an administrator also carries correction and payroll roles", async () => {
  const roles = ["Administrator", "AlumDoor QR System", "AlumDoor Attendance System", "AlumDoor Payroll System"];
  const plan = await new AlumDoorAttendanceDayController().buildPlan(context(completeDay, roles));
  assert.equal(plan.document.status, "complete");
  assert.equal(plan.events[0].event_type, "alumdoor_attendance_day.created");
});

test("daily projection refuses a direct save outside internal attendance/payroll roles", async () => {
  await assert.rejects(
    new AlumDoorAttendanceDayController().buildPlan(context(completeDay, ["Employee"])),
    /chỉ được cập nhật từ giao dịch QR, phiếu sửa công đã duyệt hoặc điều phối lương nội bộ/i,
  );
});
