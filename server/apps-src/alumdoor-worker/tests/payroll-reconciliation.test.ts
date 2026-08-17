import { describe, expect, it } from "vitest";
import { reconcileAlumDoorPayrollDailyInputs } from "../src/payroll-reconciliation.js";

describe("AlumDoor payroll daily reconciliation", () => {
  it("fills half-day attendance with half-day paid leave without double counting", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-10", scheduledMinutes: 480, regularMinutes: 240, overtimeMinutes: 0, payableWorkFractionBp: 5_000 }],
      paidLeaveDays: [{ workDate: "2026-08-10", scheduledMinutes: 480, payableWorkFractionBp: 5_000 }],
    });

    expect(result.regularMinutes).toBe(240);
    expect(result.paidLeaveMinutes).toBe(240);
    expect(result.payableRegularMinutes).toBe(480);
    expect(result.attendanceWorkFractionBp).toBe(5_000);
    expect(result.paidLeaveFractionBp).toBe(5_000);
    expect(result.workFractionBp).toBe(10_000);
  });

  it("pays a full paid-leave day even when there is no attendance scan row", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [],
      paidLeaveDays: [{ workDate: "2026-08-11", scheduledMinutes: 480, payableWorkFractionBp: 10_000 }],
    });

    expect(result.regularMinutes).toBe(0);
    expect(result.paidLeaveMinutes).toBe(480);
    expect(result.payableRegularMinutes).toBe(480);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.workFractionBp).toBe(10_000);
  });

  it("pays a complete leave-only 20-day period without inventing attendance work", () => {
    const paidLeaveDays = Array.from({ length: 20 }, (_, index) => ({
      workDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
      scheduledMinutes: 480,
      payableWorkFractionBp: 10_000,
    }));
    const result = reconcileAlumDoorPayrollDailyInputs({ attendanceDays: [], paidLeaveDays });

    expect(result.regularMinutes).toBe(0);
    expect(result.paidLeaveMinutes).toBe(9_600);
    expect(result.payableRegularMinutes).toBe(9_600);
    expect(result.overtimeMinutes).toBe(0);
  });

  it("does not pay leave twice when a full assigned shift was already worked", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-12", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 0, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [{ workDate: "2026-08-12", scheduledMinutes: 480, payableWorkFractionBp: 10_000 }],
    });

    expect(result.paidLeaveMinutes).toBe(0);
    expect(result.payableRegularMinutes).toBe(480);
    expect(result.workFractionBp).toBe(10_000);
  });

  it("does not pay raw overtime without a submitted approval", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-13", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 60, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [],
    });

    expect(result.rawOvertimeMinutes).toBe(60);
    expect(result.overtimeMinutes).toBe(0);
    expect(result.overtimeByDate).toEqual([{ workDate: "2026-08-13", rawOvertimeMinutes: 60, approvedMinutes: 0, payableOvertimeMinutes: 0 }]);
  });

  it("caps payable overtime at the submitted approval", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-14", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 120, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [],
      overtimeApprovals: [{ workDate: "2026-08-14", approvedMinutes: 60 }],
    });

    expect(result.rawOvertimeMinutes).toBe(120);
    expect(result.overtimeMinutes).toBe(60);
  });

  it("never pays more overtime than the raw attendance evidence", () => {
    const result = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-15", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 30, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [],
      overtimeApprovals: [{ workDate: "2026-08-15", approvedMinutes: 120 }],
    });

    expect(result.rawOvertimeMinutes).toBe(30);
    expect(result.overtimeMinutes).toBe(30);
  });

  it("fails closed on duplicate overtime approvals for one date", () => {
    expect(() => reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-16", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 30, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [],
      overtimeApprovals: [
        { workDate: "2026-08-16", approvedMinutes: 15 },
        { workDate: "2026-08-16", approvedMinutes: 15 },
      ],
    })).toThrow(/Trùng duyệt tăng ca/u);
  });
});
