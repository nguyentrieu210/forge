export type AlumDoorPayMode = "MONTHLY" | "DAILY";

export interface AlumDoorPayrollInput {
  payMode: AlumDoorPayMode;
  baseSalaryVnd: number;
  standardWorkDaysBp: number;
  workFractionBp: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtimeMultiplierBp: number;
  allowanceVnd?: number;
  advanceVnd?: number;
  manualDeductionVnd?: number;
}

export interface AlumDoorPayrollResult {
  basePayVnd: number;
  overtimePayVnd: number;
  allowanceVnd: number;
  advanceVnd: number;
  manualDeductionVnd: number;
  grossPayVnd: number;
  totalDeductionVnd: number;
  netPayVnd: number;
  dailyRate: { numerator: string; denominator: string };
}

export interface AlumDoorPayrollV2Input {
  payMode: AlumDoorPayMode;
  baseSalaryVnd: number;
  standardWorkDaysBp: number;
  workFractionBp: number;
  regularMinutes: number;
  approvedOvertimeMinutes: number;
  overtimeRateVndPerHour: number;
  fixedAllowanceVnd?: number;
  approvedEarningsVnd?: number;
  insuranceDeductionVnd?: number;
  pitDeductionVnd?: number;
  advanceDeductionVnd?: number;
  approvedLegalDeductionsVnd?: number;
  legalOvertimeFloorVnd?: number;
}

export interface AlumDoorPayrollV2Result {
  calculationVersion: 2;
  basePayVnd: number;
  overtimePayVnd: number;
  overtimeRateVndPerHour: number;
  fixedAllowanceVnd: number;
  approvedEarningsVnd: number;
  grossPayVnd: number;
  insuranceDeductionVnd: number;
  pitDeductionVnd: number;
  advanceDeductionVnd: number;
  approvedLegalDeductionsVnd: number;
  totalDeductionVnd: number;
  netPayVnd: number;
  dailyRate: { numerator: string; denominator: string };
  trace: {
    basePay: { numerator: string; denominator: string };
    overtimePay: { numerator: string; denominator: "60"; rounding: "HALF_UP_ON_TOTAL" };
  };
}

export class AlumDoorPayrollRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AlumDoorPayrollRuleError";
  }
}

function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", `${label} phải là số nguyên hợp lệ.`);
  }
  return Number(value);
}

function roundHalfUpRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", "Tỷ lệ tính lương không hợp lệ.");
  }
  return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new AlumDoorPayrollRuleError("PAYROLL_AMOUNT_OVERFLOW", `${label} vượt giới hạn tính toán.`);
  }
  return result;
}

/**
 * AlumDoor payroll MVP calculation.
 *
 * Money stays integer VND and ratios stay basis points. No floating-point value is
 * authoritative. DAILY means baseSalaryVnd is one full-day rate. MONTHLY means it is
 * the monthly salary and standardWorkDaysBp is the period's standard paid days × 10000.
 */
export function calculateAlumDoorPayroll(input: AlumDoorPayrollInput): AlumDoorPayrollResult {
  if (input.payMode !== "MONTHLY" && input.payMode !== "DAILY") {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", "Cách trả lương không hợp lệ.");
  }
  const baseSalary = integer(input.baseSalaryVnd, "Lương cơ bản", 0, 999_999_999_999);
  const standardDays = integer(input.standardWorkDaysBp, "Ngày công chuẩn", 1, 310_000);
  const workFraction = integer(input.workFractionBp, "Ngày công thực tế", 0, 310_000);
  integer(input.regularMinutes, "Phút công thường", 0, 60 * 24 * 31);
  const overtimeMinutes = integer(input.overtimeMinutes, "Phút tăng ca", 0, 60 * 24 * 31);
  const overtimeMultiplier = integer(input.overtimeMultiplierBp, "Hệ số tăng ca", 0, 100_000);
  const allowance = integer(input.allowanceVnd ?? 0, "Phụ cấp", 0, 999_999_999_999);
  const advance = integer(input.advanceVnd ?? 0, "Tạm ứng", 0, 999_999_999_999);
  const deduction = integer(input.manualDeductionVnd ?? 0, "Khấu trừ", 0, 999_999_999_999);

  const base = BigInt(baseSalary);
  const work = BigInt(workFraction);
  const standard = BigInt(standardDays);
  const otMinutes = BigInt(overtimeMinutes);
  const otMultiplier = BigInt(overtimeMultiplier);

  const basePay = input.payMode === "DAILY"
    ? roundHalfUpRatio(base * work, 10_000n)
    : roundHalfUpRatio(base * work, standard);

  // hourly = daily / 8; overtime fraction is minutes / 60; multiplier is bp / 10000.
  // DAILY:   base * minutes * multiplier / (480 * 10000)
  // MONTHLY: (base * 10000 / standardDaysBp) * minutes * multiplier / (480 * 10000)
  //          = base * minutes * multiplier / (480 * standardDaysBp)
  const overtimePay = input.payMode === "DAILY"
    ? roundHalfUpRatio(base * otMinutes * otMultiplier, 480n * 10_000n)
    : roundHalfUpRatio(base * otMinutes * otMultiplier, 480n * standard);

  const gross = basePay + overtimePay + BigInt(allowance);
  const totalDeduction = BigInt(advance) + BigInt(deduction);
  if (totalDeduction > gross) {
    throw new AlumDoorPayrollRuleError("PAYROLL_NEGATIVE_NET", "Tổng tạm ứng và khấu trừ vượt thu nhập kỳ lương.");
  }
  const net = gross - totalDeduction;

  return {
    basePayVnd: safeNumber(basePay, "Lương thường"),
    overtimePayVnd: safeNumber(overtimePay, "Tiền tăng ca"),
    allowanceVnd: allowance,
    advanceVnd: advance,
    manualDeductionVnd: deduction,
    grossPayVnd: safeNumber(gross, "Tổng thu nhập"),
    totalDeductionVnd: safeNumber(totalDeduction, "Tổng khấu trừ"),
    netPayVnd: safeNumber(net, "Thực nhận"),
    dailyRate: input.payMode === "DAILY"
      ? { numerator: String(baseSalary), denominator: "1" }
      : { numerator: String(BigInt(baseSalary) * 10_000n), denominator: String(standardDays) },
  };
}

/**
 * AlumDoor HR & Payroll Lite calculation v2.
 *
 * Historical v1 slips keep using `calculateAlumDoorPayroll`. V2 snapshots one fixed
 * company overtime rate and rounds only once after summing all approved minutes.
 */
export function calculateAlumDoorPayrollV2(input: AlumDoorPayrollV2Input): AlumDoorPayrollV2Result {
  if (input.payMode !== "MONTHLY" && input.payMode !== "DAILY") {
    throw new AlumDoorPayrollRuleError("PAYROLL_INPUT_INVALID", "Cách trả lương không hợp lệ.");
  }
  const baseSalary = integer(input.baseSalaryVnd, "Lương cơ bản", 0, 999_999_999_999);
  const standardDays = integer(input.standardWorkDaysBp, "Ngày công chuẩn", 1, 310_000);
  const workFraction = integer(input.workFractionBp, "Ngày công thực tế", 0, 310_000);
  integer(input.regularMinutes, "Phút công thường", 0, 60 * 24 * 31);
  const overtimeMinutes = integer(input.approvedOvertimeMinutes, "Phút tăng ca đã duyệt", 0, 60 * 24 * 31);
  const overtimeRate = integer(input.overtimeRateVndPerHour, "Mức tăng ca", 1, 999_999_999);
  const fixedAllowance = integer(input.fixedAllowanceVnd ?? 0, "Phụ cấp cố định", 0, 999_999_999_999);
  const approvedEarnings = integer(input.approvedEarningsVnd ?? 0, "Khoản cộng đã duyệt", 0, 999_999_999_999);
  const insurance = integer(input.insuranceDeductionVnd ?? 0, "Khấu trừ bảo hiểm", 0, 999_999_999_999);
  const pit = integer(input.pitDeductionVnd ?? 0, "Khấu trừ thuế TNCN", 0, 999_999_999_999);
  const advance = integer(input.advanceDeductionVnd ?? 0, "Tạm ứng", 0, 999_999_999_999);
  const legalDeductions = integer(input.approvedLegalDeductionsVnd ?? 0, "Khấu trừ hợp lệ", 0, 999_999_999_999);
  const legalFloor = integer(input.legalOvertimeFloorVnd ?? 0, "Sàn tăng ca pháp lý", 0, 999_999_999_999);

  const base = BigInt(baseSalary);
  const work = BigInt(workFraction);
  const standard = BigInt(standardDays);
  const baseNumerator = input.payMode === "DAILY" ? base * work : base * work;
  const baseDenominator = input.payMode === "DAILY" ? 10_000n : standard;
  const basePay = roundHalfUpRatio(baseNumerator, baseDenominator);
  const overtimeNumerator = BigInt(overtimeMinutes) * BigInt(overtimeRate);
  const overtimePay = roundHalfUpRatio(overtimeNumerator, 60n);
  if (overtimePay < BigInt(legalFloor)) {
    throw new AlumDoorPayrollRuleError(
      "PAYROLL_OVERTIME_BELOW_LEGAL_FLOOR",
      "Mức tăng ca cố định thấp hơn sàn áp dụng; cần xử lý kiểm tra pháp lý trước khi chốt lương.",
    );
  }

  const gross = basePay + overtimePay + BigInt(fixedAllowance) + BigInt(approvedEarnings);
  const totalDeduction = BigInt(insurance) + BigInt(pit) + BigInt(advance) + BigInt(legalDeductions);
  if (totalDeduction > gross) {
    throw new AlumDoorPayrollRuleError("PAYROLL_NEGATIVE_NET", "Tổng khấu trừ vượt thu nhập kỳ lương.");
  }
  const net = gross - totalDeduction;
  return {
    calculationVersion: 2,
    basePayVnd: safeNumber(basePay, "Lương theo công"),
    overtimePayVnd: safeNumber(overtimePay, "Tiền tăng ca"),
    overtimeRateVndPerHour: overtimeRate,
    fixedAllowanceVnd: fixedAllowance,
    approvedEarningsVnd: approvedEarnings,
    grossPayVnd: safeNumber(gross, "Tổng thu nhập"),
    insuranceDeductionVnd: insurance,
    pitDeductionVnd: pit,
    advanceDeductionVnd: advance,
    approvedLegalDeductionsVnd: legalDeductions,
    totalDeductionVnd: safeNumber(totalDeduction, "Tổng khấu trừ"),
    netPayVnd: safeNumber(net, "Thực nhận"),
    dailyRate: input.payMode === "DAILY"
      ? { numerator: String(baseSalary), denominator: "1" }
      : { numerator: String(BigInt(baseSalary) * 10_000n), denominator: String(standardDays) },
    trace: {
      basePay: { numerator: String(baseNumerator), denominator: String(baseDenominator) },
      overtimePay: { numerator: String(overtimeNumerator), denominator: "60", rounding: "HALF_UP_ON_TOTAL" },
    },
  };
}
