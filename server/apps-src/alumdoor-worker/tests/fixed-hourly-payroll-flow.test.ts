import { describe, expect, it } from "vitest";
import { calculateAttendance, type AttendanceSegmentWindow } from "../src/attendance-core.js";
import { calculateAlumDoorPayrollV3 } from "../src/payroll-core.js";
import { reconcileAlumDoorPayrollDailyInputs } from "../src/payroll-reconciliation.js";

const RATE = 50_000;
const nightWithOvertimeWindow: readonly AttendanceSegmentWindow[] = [
  { code: "SHIFT1", scanStartMinute: 330, scanEndMinute: 749, workStartMinute: 420, workEndMinute: 690 },
  { code: "SHIFT2", scanStartMinute: 750, scanEndMinute: 1049, workStartMinute: 780, workEndMinute: 1020 },
  // Assigned night shift is 22:00 -> 06:00 (480 minutes), while scan evidence may continue
  // to 07:00; the extra 60 minutes are automatic OT for AlumDoor Lite.
  { code: "SHIFT3", scanStartMinute: 1320, scanEndMinute: 420, workStartMinute: 1320, workEndMinute: 420 },
];

describe("AlumDoor fixed-hourly payroll flow", () => {
  it("pays an assigned night shift plus 60 automatic overtime minutes", () => {
    const attendance = calculateAttendance({
      workDate: "2026-08-17",
      windows: nightWithOvertimeWindow,
      regularDailyCapMinutes: 480,
      regularSegmentCodes: ["SHIFT3"],
      segments: [
        { code: "SHIFT1", status: "empty" },
        { code: "SHIFT2", status: "empty" },
        {
          code: "SHIFT3",
          status: "complete",
          // Vietnam local: 22:00 Aug 17 -> 07:00 Aug 18.
          actualIn: "2026-08-17T15:00:00Z",
          actualOut: "2026-08-18T00:00:00Z",
        },
      ],
    });
    expect(attendance.regularMinutes).toBe(480);
    expect(attendance.overtimeMinutes).toBe(60);

    const reconciled = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{
        workDate: attendance.workDate,
        scheduledMinutes: 480,
        regularMinutes: attendance.regularMinutes,
        overtimeMinutes: attendance.overtimeMinutes,
        payableWorkFractionBp: attendance.payableWorkFractionBp,
      }],
      paidLeaveDays: [],
    });
    expect(reconciled.payableRegularMinutes).toBe(480);
    expect(reconciled.overtimeMinutes).toBe(60);

    const payroll = calculateAlumDoorPayrollV3({
      regularMinutes: reconciled.regularMinutes,
      paidLeaveMinutes: reconciled.paidLeaveMinutes,
      approvedOvertimeMinutes: reconciled.overtimeMinutes,
      shiftHourlyRateVnd: RATE,
      overtimeRateVndPerHour: RATE,
    });
    expect(payroll.basePayVnd).toBe(400_000);
    expect(payroll.overtimePayVnd).toBe(50_000);
    expect(payroll.netPayVnd).toBe(450_000);
  });

  it("pays 120 automatic overtime minutes as 100,000 VND", () => {
    const reconciled = reconcileAlumDoorPayrollDailyInputs({
      attendanceDays: [{ workDate: "2026-08-18", scheduledMinutes: 480, regularMinutes: 480, overtimeMinutes: 120, payableWorkFractionBp: 10_000 }],
      paidLeaveDays: [],
    });
    const payroll = calculateAlumDoorPayrollV3({
      regularMinutes: reconciled.regularMinutes,
      paidLeaveMinutes: reconciled.paidLeaveMinutes,
      approvedOvertimeMinutes: reconciled.overtimeMinutes,
      shiftHourlyRateVnd: RATE,
      overtimeRateVndPerHour: RATE,
    });
    expect(reconciled.overtimeMinutes).toBe(120);
    expect(payroll.overtimePayVnd).toBe(100_000);
    expect(payroll.netPayVnd).toBe(500_000);
  });
});
