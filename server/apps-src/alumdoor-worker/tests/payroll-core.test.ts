import { describe, expect, it } from "vitest";
import { calculateAlumDoorPayrollV3 } from "../src/payroll-core.js";

const RATE = 50_000;

function calculate(input: { regularMinutes: number; paidLeaveMinutes?: number; overtimeMinutes?: number }) {
  return calculateAlumDoorPayrollV3({
    regularMinutes: input.regularMinutes,
    paidLeaveMinutes: input.paidLeaveMinutes ?? 0,
    approvedOvertimeMinutes: input.overtimeMinutes ?? 0,
    shiftHourlyRateVnd: RATE,
    overtimeRateVndPerHour: RATE,
  });
}

describe("AlumDoor payroll v3 fixed hourly rate", () => {
  it("pays an eight-hour assigned shift at 400,000 VND", () => {
    const result = calculate({ regularMinutes: 480 });
    expect(result.basePayVnd).toBe(400_000);
    expect(result.overtimePayVnd).toBe(0);
    expect(result.netPayVnd).toBe(400_000);
  });

  it("pays 60 automatic overtime minutes at another 50,000 VND", () => {
    const result = calculate({ regularMinutes: 480, overtimeMinutes: 60 });
    expect(result.basePayVnd).toBe(400_000);
    expect(result.overtimePayVnd).toBe(50_000);
    expect(result.netPayVnd).toBe(450_000);
  });

  it("pays 30 minutes exactly at 25,000 VND without floating point", () => {
    const result = calculate({ regularMinutes: 30 });
    expect(result.basePayVnd).toBe(25_000);
    expect(result.netPayVnd).toBe(25_000);
  });

  it("pays approved leave minutes at the same fixed shift rate", () => {
    const result = calculate({ regularMinutes: 240, paidLeaveMinutes: 240 });
    expect(result.payableRegularMinutes).toBe(480);
    expect(result.basePayVnd).toBe(400_000);
  });

  it("is deterministic when the same payroll input is recomputed", () => {
    const input = {
      regularMinutes: 480,
      paidLeaveMinutes: 0,
      approvedOvertimeMinutes: 60,
      shiftHourlyRateVnd: RATE,
      overtimeRateVndPerHour: RATE,
      fixedAllowanceVnd: 20_000,
      approvedEarningsVnd: 10_000,
      advanceDeductionVnd: 30_000,
      approvedDeductionsVnd: 5_000,
    };
    const first = calculateAlumDoorPayrollV3(input);
    const second = calculateAlumDoorPayrollV3(input);
    expect(second).toEqual(first);
    expect(second.netPayVnd).toBe(445_000);
  });

  it("applies a 50,000 Additional Salary earning and 20,000 deduction exactly once on every recompute", () => {
    const authoritativePeriodInput = {
      regularMinutes: 480,
      paidLeaveMinutes: 0,
      approvedOvertimeMinutes: 0,
      shiftHourlyRateVnd: RATE,
      overtimeRateVndPerHour: RATE,
      fixedAllowanceVnd: 0,
      // The builder maps submitted Additional Salary rows into these two v3 buckets.
      approvedEarningsVnd: 50_000,
      advanceDeductionVnd: 0,
      approvedDeductionsVnd: 20_000,
    };

    const first = calculateAlumDoorPayrollV3(authoritativePeriodInput);
    const second = calculateAlumDoorPayrollV3(authoritativePeriodInput);
    const fifth = Array.from({ length: 3 }).reduce(
      () => calculateAlumDoorPayrollV3(authoritativePeriodInput),
      second,
    );

    for (const result of [first, second, fifth]) {
      expect(result.basePayVnd).toBe(400_000);
      expect(result.approvedEarningsVnd).toBe(50_000);
      expect(result.approvedDeductionsVnd).toBe(20_000);
      expect(result.netPayVnd).toBe(430_000);
    }
    expect(second).toEqual(first);
    expect(fifth).toEqual(first);
  });
});
