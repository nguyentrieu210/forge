import { describe, expect, it } from "vitest";
import { paidLeaveProjectionsFromTrace } from "../../../apps/tenant-worker/src/payroll-coordinator.js";

function trace(paidLeave: unknown): string {
  return JSON.stringify({ paid_leave: paidLeave });
}

describe("AlumDoor paid-leave payroll projections", () => {
  it("projects full and half paid leave to canonical minutes with source versions", () => {
    const projections = paidLeaveProjectionsFromTrace(trace([
      {
        leave_application: { name: "LEAVE-001", version: 7 },
        paid_dates: [
          { work_date: "2026-08-10", shift_assignment: "SHIFT-ASG-001", shift_type: "DAY", scheduled_minutes: 480, payable_work_fraction_bp: 10_000 },
          { work_date: "2026-08-11", shift_assignment: "SHIFT-ASG-001", shift_type: "DAY", scheduled_minutes: 480, payable_work_fraction_bp: 5_000 },
        ],
      },
    ]), "EMP-001");

    expect(projections).toEqual([
      {
        employee: "EMP-001",
        workDate: "2026-08-10",
        shiftAssignment: "SHIFT-ASG-001",
        shiftType: "DAY",
        scheduledMinutes: 480,
        paidLeaveMinutes: 480,
        sourceLeaveApplication: "LEAVE-001",
        sourceLeaveVersion: 7,
      },
      {
        employee: "EMP-001",
        workDate: "2026-08-11",
        shiftAssignment: "SHIFT-ASG-001",
        shiftType: "DAY",
        scheduledMinutes: 480,
        paidLeaveMinutes: 240,
        sourceLeaveApplication: "LEAVE-001",
        sourceLeaveVersion: 7,
      },
    ]);
  });

  it("rejects duplicate paid-leave dates before finalize can create two attendance sources", () => {
    expect(() => paidLeaveProjectionsFromTrace(trace([
      {
        leave_application: { name: "LEAVE-001", version: 1 },
        paid_dates: [{ work_date: "2026-08-10", shift_assignment: "SHIFT-ASG-001", shift_type: "DAY", scheduled_minutes: 480, payable_work_fraction_bp: 10_000 }],
      },
      {
        leave_application: { name: "LEAVE-002", version: 1 },
        paid_dates: [{ work_date: "2026-08-10", shift_assignment: "SHIFT-ASG-001", shift_type: "DAY", scheduled_minutes: 480, payable_work_fraction_bp: 10_000 }],
      },
    ]), "EMP-001")).toThrow(/Duplicate paid leave trace date/u);
  });
});
