import test from "node:test";
import assert from "node:assert/strict";
import { calculateAlumDoorPayroll, calculateAlumDoorPayrollV2 } from "../dist/apps-src/alumdoor-worker/src/payroll-core.js";

test("monthly payroll prorates by work fraction and calculates OT with integer VND", () => {
  const result = calculateAlumDoorPayroll({
    payMode: "MONTHLY",
    baseSalaryVnd: 13_000_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 250_000,
    regularMinutes: 12_000,
    overtimeMinutes: 600,
    overtimeMultiplierBp: 15_000,
    allowanceVnd: 500_000,
    advanceVnd: 1_000_000,
    manualDeductionVnd: 100_000,
  });
  assert.equal(result.basePayVnd, 12_500_000);
  assert.equal(result.overtimePayVnd, 937_500);
  assert.equal(result.grossPayVnd, 13_937_500);
  assert.equal(result.totalDeductionVnd, 1_100_000);
  assert.equal(result.netPayVnd, 12_837_500);
  assert.deepEqual(result.dailyRate, { numerator: "130000000000", denominator: "260000" });
});

test("daily payroll treats base salary as one full-day rate", () => {
  const result = calculateAlumDoorPayroll({
    payMode: "DAILY",
    baseSalaryVnd: 500_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 15_000,
    regularMinutes: 720,
    overtimeMinutes: 120,
    overtimeMultiplierBp: 20_000,
  });
  assert.equal(result.basePayVnd, 750_000);
  assert.equal(result.overtimePayVnd, 250_000);
  assert.equal(result.netPayVnd, 1_000_000);
});

test("payroll fails closed when deductions would make net pay negative", () => {
  assert.throws(() => calculateAlumDoorPayroll({
    payMode: "DAILY",
    baseSalaryVnd: 100_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 10_000,
    regularMinutes: 480,
    overtimeMinutes: 0,
    overtimeMultiplierBp: 15_000,
    advanceVnd: 150_000,
  }), /vượt thu nhập/);
});

test("payroll v2 pays approved overtime at fixed 50,000 VND per hour", () => {
  const result = calculateAlumDoorPayrollV2({
    payMode: "MONTHLY",
    baseSalaryVnd: 13_000_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 250_000,
    regularMinutes: 12_000,
    approvedOvertimeMinutes: 90,
    overtimeRateVndPerHour: 50_000,
    fixedAllowanceVnd: 300_000,
  });
  assert.equal(result.calculationVersion, 2);
  assert.equal(result.basePayVnd, 12_500_000);
  assert.equal(result.overtimePayVnd, 75_000);
  assert.equal(result.grossPayVnd, 12_875_000);
  assert.equal(result.netPayVnd, 12_875_000);
  assert.deepEqual(result.trace.overtimePay, { numerator: "4500000", denominator: "60", rounding: "HALF_UP_ON_TOTAL" });
});

test("payroll v2 rounds overtime once on total approved minutes", () => {
  const result = calculateAlumDoorPayrollV2({
    payMode: "DAILY",
    baseSalaryVnd: 500_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 10_000,
    regularMinutes: 480,
    approvedOvertimeMinutes: 1,
    overtimeRateVndPerHour: 50_000,
  });
  assert.equal(result.overtimePayVnd, 833);
});

test("payroll v2 blocks a fixed overtime policy below the legal floor", () => {
  assert.throws(() => calculateAlumDoorPayrollV2({
    payMode: "DAILY",
    baseSalaryVnd: 500_000,
    standardWorkDaysBp: 260_000,
    workFractionBp: 10_000,
    regularMinutes: 480,
    approvedOvertimeMinutes: 60,
    overtimeRateVndPerHour: 50_000,
    legalOvertimeFloorVnd: 60_000,
  }), (error) => error?.code === "PAYROLL_OVERTIME_BELOW_LEGAL_FLOOR");
});
