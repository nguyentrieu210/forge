import { AlumDoorPayrollRuleError } from "./payroll-core.js";

export interface PayrollAttendanceDayInput {
  workDate: string;
  scheduledMinutes: number;
  regularMinutes: number;
  /** Raw scan-derived minutes outside the assigned shift. */
  overtimeMinutes: number;
  payableWorkFractionBp: number;
}

export interface PayrollPaidLeaveDayInput {
  workDate: string;
  scheduledMinutes: number;
  payableWorkFractionBp: number;
}

export interface PayrollOvertimeApprovalInput {
  workDate: string;
  approvedMinutes: number;
}

export interface ReconciledOvertimeDay {
  workDate: string;
  rawOvertimeMinutes: number;
  approvedMinutes: number;
  payableOvertimeMinutes: number;
}

export interface ReconciledPayrollDailyInputs {
  regularMinutes: number;
  paidLeaveMinutes: number;
  payableRegularMinutes: number;
  /** Approved/payable overtime only. */
  overtimeMinutes: number;
  rawOvertimeMinutes: number;
  overtimeByDate: ReconciledOvertimeDay[];
  attendanceWorkFractionBp: number;
  paidLeaveFractionBp: number;
  workFractionBp: number;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `${label} phải là số nguyên hợp lệ.`);
  }
  return Number(value);
}

function date(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `${label} phải dùng YYYY-MM-DD.`);
  }
  return value;
}

function roundHalfUpRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator < 0n) {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", "Tỷ lệ phút công không hợp lệ.");
  }
  const value = (numerator + denominator / 2n) / denominator;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AlumDoorPayrollRuleError("PAYROLL_AMOUNT_OVERFLOW", "Số phút công vượt giới hạn tính toán.");
  }
  return result;
}

/**
 * Reconciles canonical daily payroll inputs for AlumDoor Lite.
 *
 * - `AlumDoor Attendance Day` is the attendance evidence authority used by payroll.
 * - Regular minutes are payable up to the assigned shift duration.
 * - Raw overtime is scan evidence outside the assigned shift; it is never payable by itself.
 * - Only one submitted Overtime Request may approve a work date.
 * - Payable OT is `min(raw overtime, approved overtime)`; without an approval it is zero.
 * - Paid leave fills only the unpaid part of the assigned shift, so attendance + leave can
 *   never pay more than the scheduled minutes for one work date.
 */
export function reconcileAlumDoorPayrollDailyInputs(input: {
  attendanceDays: PayrollAttendanceDayInput[];
  paidLeaveDays: PayrollPaidLeaveDayInput[];
  overtimeApprovals?: PayrollOvertimeApprovalInput[];
}): ReconciledPayrollDailyInputs {
  const attendanceByDate = new Map<string, { scheduledMinutes: number; regularMinutes: number; rawOvertimeMinutes: number; fractionBp: number }>();
  let regularMinutes = 0;
  let attendanceWorkFractionBp = 0;

  for (const day of input.attendanceDays) {
    const workDate = date(day.workDate, "Ngày chấm công");
    if (attendanceByDate.has(workDate)) {
      throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `Trùng ngày chấm công ${workDate}.`);
    }
    const scheduled = integer(day.scheduledMinutes, "Phút ca chuẩn", 1, 1_440);
    const regular = integer(day.regularMinutes, "Phút công thường", 0, scheduled);
    const rawOvertime = integer(day.overtimeMinutes, "Phút tăng ca thô", 0, 1_440);
    const fraction = integer(day.payableWorkFractionBp, "Tỷ lệ công", 0, 10_000);
    attendanceByDate.set(workDate, { scheduledMinutes: scheduled, regularMinutes: regular, rawOvertimeMinutes: rawOvertime, fractionBp: fraction });
    regularMinutes += regular;
    attendanceWorkFractionBp += fraction;
  }

  const approvalByDate = new Map<string, number>();
  for (const approval of input.overtimeApprovals ?? []) {
    const workDate = date(approval.workDate, "Ngày duyệt tăng ca");
    if (approvalByDate.has(workDate)) {
      throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `Trùng duyệt tăng ca ${workDate}.`);
    }
    approvalByDate.set(workDate, integer(approval.approvedMinutes, "Phút tăng ca đã duyệt", 0, 1_440));
  }

  let rawOvertimeMinutes = 0;
  let overtimeMinutes = 0;
  const overtimeByDate: ReconciledOvertimeDay[] = [];
  for (const [workDate, attendance] of attendanceByDate) {
    const approvedMinutes = approvalByDate.get(workDate) ?? 0;
    const payableOvertimeMinutes = Math.min(attendance.rawOvertimeMinutes, approvedMinutes);
    rawOvertimeMinutes += attendance.rawOvertimeMinutes;
    overtimeMinutes += payableOvertimeMinutes;
    overtimeByDate.push({
      workDate,
      rawOvertimeMinutes: attendance.rawOvertimeMinutes,
      approvedMinutes,
      payableOvertimeMinutes,
    });
  }

  const leaveFractionByDate = new Map<string, { scheduledMinutes: number; fractionBp: number }>();
  for (const leave of input.paidLeaveDays) {
    const workDate = date(leave.workDate, "Ngày nghỉ hưởng lương");
    const scheduled = integer(leave.scheduledMinutes, "Phút ca chuẩn ngày nghỉ", 1, 1_440);
    const fraction = integer(leave.payableWorkFractionBp, "Tỷ lệ nghỉ hưởng lương", 0, 10_000);
    const attendance = attendanceByDate.get(workDate);
    if (attendance && attendance.scheduledMinutes !== scheduled) {
      throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `Ca chuẩn không nhất quán cho ${workDate}.`);
    }
    const existing = leaveFractionByDate.get(workDate);
    if (existing && existing.scheduledMinutes !== scheduled) {
      throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `Ca nghỉ hưởng lương không nhất quán cho ${workDate}.`);
    }
    leaveFractionByDate.set(workDate, {
      scheduledMinutes: scheduled,
      fractionBp: Math.min(10_000, (existing?.fractionBp ?? 0) + fraction),
    });
  }

  let paidLeaveMinutes = 0;
  let paidLeaveFractionBp = 0;
  let workFractionBp = 0;
  const payableDates = new Set([...attendanceByDate.keys(), ...leaveFractionByDate.keys()]);
  for (const workDate of payableDates) {
    const attendance = attendanceByDate.get(workDate);
    const leave = leaveFractionByDate.get(workDate);
    const scheduled = attendance?.scheduledMinutes ?? leave?.scheduledMinutes;
    if (!scheduled) throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `Thiếu phút ca chuẩn cho ${workDate}.`);
    const actualRegular = attendance?.regularMinutes ?? 0;
    const requestedLeaveMinutes = leave
      ? roundHalfUpRatio(BigInt(scheduled) * BigInt(leave.fractionBp), 10_000n)
      : 0;
    const appliedLeaveMinutes = Math.min(requestedLeaveMinutes, Math.max(0, scheduled - actualRegular));
    const payableMinutes = actualRegular + appliedLeaveMinutes;
    paidLeaveMinutes += appliedLeaveMinutes;
    paidLeaveFractionBp += roundHalfUpRatio(BigInt(appliedLeaveMinutes) * 10_000n, BigInt(scheduled));
    workFractionBp += roundHalfUpRatio(BigInt(payableMinutes) * 10_000n, BigInt(scheduled));
  }

  return {
    regularMinutes,
    paidLeaveMinutes,
    payableRegularMinutes: regularMinutes + paidLeaveMinutes,
    overtimeMinutes,
    rawOvertimeMinutes,
    overtimeByDate,
    attendanceWorkFractionBp,
    paidLeaveFractionBp,
    workFractionBp,
  };
}
