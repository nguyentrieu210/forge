import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { SalarySlipComponentRow, SalarySlipData } from "./enterprise-types.js";
import * as H from "./hrm-shared.js";
import {
  calculateAlumDoorPayroll,
  calculateAlumDoorPayrollV2,
  calculateAlumDoorPayrollV3,
  type AlumDoorPayMode,
} from "../../../apps-src/alumdoor-worker/src/payroll-core.js";
import {
  reconcileAlumDoorPayrollDailyInputs,
  type PayrollOvertimeApprovalInput,
  type PayrollPaidLeaveDayInput,
} from "../../../apps-src/alumdoor-worker/src/payroll-reconciliation.js";
import {
  ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
  ALUMDOOR_SHIFT_HOURLY_RATE_VND,
} from "../../alumdoor-hr-payroll-contract/src/index.js";

type HrmContext = H.HrmContext;

type ShiftScheduleEntry = {
  assignmentName: string;
  assignmentVersion: number;
  shiftName: string;
  shiftVersion: number;
  fromDate: string;
  toDate?: string;
  scheduledMinutes: number;
};

/**
 * Lightweight AlumDoor pay configuration. Salary Slip / Payroll Entry remain the platform
 * documents; calculation v3 ignores monthly/day base salary and pays canonical minutes at
 * the fixed AlumDoor hourly rates.
 */
export class AlumDoorPayProfileController extends SuiteController<JsonObject> {
  readonly doctype = "AlumDoor Pay Profile";
  readonly allowSubmittedSave = true;

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    if (context.command.action === "save" && context.existing?.docstatus === 1) {
      if (!context.command.actor.roles.includes("AlumDoor Payroll System")) {
        throw errors.permission("Submitted Pay Profile may only be closed by the trusted payroll coordinator");
      }
      const existing = context.existing.data;
      const effectiveFrom = H.requiredDate(existing.effective_from, "Pay Profile effective_from");
      const effectiveTo = H.requiredDate(input.effective_to, "Pay Profile effective_to");
      if (effectiveTo < effectiveFrom) throw errors.validation("Pay Profile effective_to must not precede effective_from");
      return { ...existing, effective_to: effectiveTo, status: "approved" };
    }
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);

    const effectiveFrom = H.requiredDate(input.effective_from, "Pay Profile effective_from");
    const effectiveTo = H.optionalDate(input.effective_to, "Pay Profile effective_to");
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw errors.validation("Pay Profile effective_to must not precede effective_from");
    }
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, effectiveFrom);
    H.assertEmployeeStateActive(employeeState, employeeName, effectiveFrom);
    const company = H.requiredText(employeeState.company, "Employee company");
    const branch = H.requiredText(employeeState.branch, "Employee branch");
    if (H.text(input.company) && H.text(input.company) !== company) throw errors.reference("Pay Profile company does not match Employee");
    if (H.text(input.branch) && H.text(input.branch) !== branch) throw errors.reference("Pay Profile branch does not match Employee");

    const payMode = H.requiredText(input.pay_mode, "Pay Profile pay_mode");
    if (!["MONTHLY", "DAILY"].includes(payMode)) throw errors.validation("Pay Profile pay_mode must be MONTHLY or DAILY");
    const baseSalaryVnd = exactInteger(input.base_salary_vnd, "Pay Profile base_salary_vnd", 0, 999_999_999_999);
    const overtimeMultiplierBp = exactInteger(input.overtime_multiplier_bp, "Pay Profile overtime_multiplier_bp", 0, 100_000);
    const fixedAllowanceVnd = exactInteger(input.fixed_allowance_vnd ?? 0, "Pay Profile fixed_allowance_vnd", 0, 999_999_999_999);

    if (context.command.action === "submit") {
      const profiles = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const profile of profiles) {
        if (profile.name === context.command.aggregate.name || profile.docstatus !== 1) continue;
        if (H.text(profile.data.employee) !== employeeName) continue;
        const otherFrom = H.optionalDate(profile.data.effective_from, "Existing Pay Profile effective_from");
        if (!otherFrom) continue;
        const otherTo = H.optionalDate(profile.data.effective_to, "Existing Pay Profile effective_to");
        if (H.rangesOverlap(effectiveFrom, effectiveTo, otherFrom, otherTo)) {
          throw errors.reference(`Employee ${employeeName} already has an approved Pay Profile overlapping this period`);
        }
      }
    }

    const status = context.command.action === "submit"
      ? "approved"
      : context.command.action === "cancel"
        ? "retired"
        : "draft";
    return {
      ...input,
      profile_code: context.command.aggregate.name,
      employee: employeeName,
      company,
      branch,
      pay_mode: payMode,
      base_salary_vnd: baseSalaryVnd,
      overtime_multiplier_bp: overtimeMultiplierBp,
      fixed_allowance_vnd: fixedAllowanceVnd,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      profile_key: `${employeeName}|${effectiveFrom}|${context.command.aggregate.name}`,
      status,
      ...(context.command.action === "submit" ? { approved_by: context.command.actor.user_id, approved_at: context.now } : {}),
    };
  }

  status(context: HrmContext): string {
    if (context.command.action === "submit") return "approved";
    if (context.command.action === "cancel") return "retired";
    if (context.command.action === "save" && context.existing?.docstatus === 1) return "approved";
    return "draft";
  }
}

export interface AlumDoorGeneratedSalaryInput {
  salary_structure_assignment: string;
  payroll_payable_account: string;
  earnings: SalarySlipComponentRow[];
  deductions: SalarySlipComponentRow[];
  working_days: number;
  payment_days: number;
  input_hash: string;
  rule_trace_json: string;
  alu_input_hash: string;
  alu_formula_trace_json: string;
  alu_regular_minutes: number;
  alu_overtime_minutes: number;
  alu_work_fraction_bp: number;
  alu_base_pay_vnd: number;
  alu_overtime_pay_vnd: number;
  alu_shift_hourly_rate_vnd: number;
  alu_overtime_rate_vnd_per_hour: number;
  alu_allowance_vnd: number;
  alu_advance_vnd: number;
  alu_manual_deduction_vnd: number;
  alu_calculation_version: number;
  alu_state: string;
}

/** Turns canonical AlumDoor attendance/leave/OT sources into deterministic Salary Slip rows. */
export async function buildAlumDoorSalarySlipInputs(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<AlumDoorGeneratedSalaryInput | null> {
  const profileName = H.text(input.alu_pay_profile);
  if (!profileName) return null;
  const payrollEntryName = H.requiredText(input.alu_payroll_entry, "AlumDoor payroll entry");
  const profile = await requireSubmitted(context, "AlumDoor Pay Profile", profileName);
  if (H.text(profile.data.employee) !== input.employee || H.text(profile.data.company) !== input.company) {
    throw errors.reference(`AlumDoor Pay Profile ${profileName} does not match Salary Slip employee/company`);
  }
  const profileFrom = H.requiredDate(profile.data.effective_from, "Pay Profile effective_from");
  const profileTo = H.optionalDate(profile.data.effective_to, "Pay Profile effective_to");
  if (input.start_date < profileFrom || (profileTo && input.end_date > profileTo)) {
    throw errors.reference(`AlumDoor Pay Profile ${profileName} does not cover the payroll period`);
  }

  const company = await H.requireRecord(context as HrmContext, "Company", input.company);
  if (H.requiredText(company.default_currency, "Company default currency") !== "VND") {
    throw errors.reference("AlumDoor payroll stores integer VND and requires company currency VND");
  }

  // Compatibility seam: Salary Slip still uses the generic accounting structure for rows/GL.
  // Calculation v3 does not use its salary amount or overtime multiplier.
  const assignments = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Salary Structure Assignment"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && H.text(entry.data.from_date) <= input.start_date
      && (!H.text(entry.data.to_date) || H.text(entry.data.to_date) >= input.end_date));
  if (assignments.length !== 1) {
    throw errors.reference(`Exactly one submitted Salary Structure Assignment is required for ${input.employee} / ${input.start_date}..${input.end_date}`);
  }
  const assignment = assignments[0]!;
  if (H.text(profile.data.branch) && H.text(assignment.data.branch) !== H.text(profile.data.branch)) {
    throw errors.reference(`Salary Structure Assignment ${assignment.name} belongs to another branch`);
  }
  const structureName = H.requiredText(assignment.data.salary_structure, "Salary Structure Assignment salary_structure");
  const structure = await requireSubmitted(context, "Salary Structure", structureName);
  const payrollPayableAccount = H.text(assignment.data.payable_account)
    || H.requiredText(structure.data.payroll_payable_account, "Salary Structure payroll_payable_account");
  const { earning, deduction } = await accountingComponents(context, structure.data);

  const shiftSchedule = await loadEmployeeShiftSchedule(context, input);
  const attendanceDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "AlumDoor Attendance Day"))
    .filter((entry) => H.text(entry.data.employee) === input.employee
      && H.text(entry.data.work_date) >= input.start_date
      && H.text(entry.data.work_date) <= input.end_date)
    .sort((left, right) => H.text(left.data.work_date).localeCompare(H.text(right.data.work_date)));
  if (attendanceDocs.length === 0) {
    // Approval currently locks Attendance Day rows atomically, so do not create a payroll
    // that cannot later be approved. Full-period paid leave without a day projection remains
    // a deliberate follow-up rather than a silent bypass of the lock invariant.
    throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} has no AlumDoor Attendance Day in this period`);
  }

  const seenDate = new Set<string>();
  const attendanceDays = [] as Array<{
    workDate: string;
    scheduledMinutes: number;
    regularMinutes: number;
    overtimeMinutes: number;
    payableWorkFractionBp: number;
  }>;
  for (const attendance of attendanceDocs) {
    const workDate = H.requiredDate(attendance.data.work_date, "Attendance Day work_date");
    if (seenDate.has(workDate)) throw errors.reference(`Duplicate AlumDoor Attendance Day for ${input.employee} / ${workDate}`);
    seenDate.add(workDate);
    const state = H.requiredText(attendance.data.state, "Attendance Day state");
    if (["open", "exception"].includes(state)) {
      throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} has ${state} attendance on ${workDate}`);
    }
    if (state === "locked") {
      throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} attendance on ${workDate} is already locked by another payroll`);
    }
    const scheduled = resolveShiftSchedule(shiftSchedule, workDate);
    const persistedAssignment = H.text(attendance.data.shift_assignment);
    if (persistedAssignment && persistedAssignment !== scheduled.assignmentName) {
      throw errors.reference(`Attendance Day ${attendance.name} is bound to another Shift Assignment`);
    }
    const persistedShift = H.text(attendance.data.shift_type);
    if (persistedShift && persistedShift !== scheduled.shiftName) {
      throw errors.reference(`Attendance Day ${attendance.name} is bound to another Shift Type`);
    }
    const scheduledMinutes = H.text(attendance.data.scheduled_minutes)
      ? exactInteger(attendance.data.scheduled_minutes, `Attendance Day ${attendance.name} scheduled_minutes`, 1, 1_440)
      : scheduled.scheduledMinutes;
    if (scheduledMinutes !== scheduled.scheduledMinutes) {
      throw errors.reference(`Attendance Day ${attendance.name} scheduled minutes no longer match its Shift Assignment`);
    }
    attendanceDays.push({
      workDate,
      scheduledMinutes,
      regularMinutes: exactInteger(attendance.data.regular_minutes ?? 0, "Attendance regular_minutes", 0, scheduledMinutes),
      // New Attendance Days keep raw scan evidence separate from approved OT. The fallback
      // preserves old rows created before `raw_overtime_minutes` existed.
      overtimeMinutes: exactInteger(attendance.data.raw_overtime_minutes ?? attendance.data.overtime_minutes ?? 0, "Attendance raw_overtime_minutes", 0, 1_440),
      payableWorkFractionBp: exactInteger(attendance.data.payable_work_fraction_bp ?? 0, "Attendance payable_work_fraction_bp", 0, 10_000),
    });
  }

  const paidLeave = await loadPaidLeaveDays(context, input, shiftSchedule);
  const approvedOvertime = await loadApprovedOvertime(context, input);
  const adjustments = await loadPeriodAdjustments(context, input);
  const reconciled = reconcileAlumDoorPayrollDailyInputs({
    attendanceDays,
    paidLeaveDays: paidLeave.days,
    overtimeApprovals: approvedOvertime.approvals,
  });
  const { regularMinutes, overtimeMinutes, workFractionBp } = reconciled;

  // Manual/profile inputs stay separate from generated period adjustments so recomputing
  // a draft cannot add the same Additional Salary twice.
  const fixedAllowance = optionalInteger(input.alu_allowance_vnd, exactInteger(profile.data.fixed_allowance_vnd ?? 0, "Pay Profile allowance", 0, 999_999_999_999));
  const advance = optionalInteger(input.alu_advance_vnd, 0);
  const manualDeduction = optionalInteger(input.alu_manual_deduction_vnd, 0);
  if (manualDeduction > 0 && !H.text(input.alu_adjustment_reason)) {
    throw errors.validation("Salary Slip manual deduction requires alu_adjustment_reason");
  }
  const totalPeriodDeduction = safeVndAdd(manualDeduction, adjustments.deductionsVnd, "Payroll deductions");
  const totalAllowanceAndEarnings = safeVndAdd(fixedAllowance, adjustments.earningsVnd, "Payroll earnings");
  const standardWorkDaysBp = exactInteger(input.alu_standard_work_days_bp, "Payroll standard work days", 1, 310_000);
  const calculationVersion = optionalInteger(input.alu_calculation_version, 1, 1, 3);

  const payMode = calculationVersion < 3
    ? H.requiredText(profile.data.pay_mode, "Pay Profile pay_mode") as AlumDoorPayMode
    : "DAILY" as AlumDoorPayMode;
  const baseSalaryVnd = calculationVersion < 3
    ? exactInteger(profile.data.base_salary_vnd, "Pay Profile base_salary_vnd", 0, 999_999_999_999)
    : 0;

  const calculated = calculationVersion >= 3
    ? (() => {
        const shiftHourlyRateVnd = exactInteger(
          input.alu_shift_hourly_rate_vnd ?? ALUMDOOR_SHIFT_HOURLY_RATE_VND,
          "Mức lương ca",
          ALUMDOOR_SHIFT_HOURLY_RATE_VND,
          ALUMDOOR_SHIFT_HOURLY_RATE_VND,
        );
        const overtimeRateVndPerHour = exactInteger(
          input.alu_overtime_rate_vnd_per_hour ?? ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
          "Mức tăng ca",
          ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
          ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
        );
        const v3 = calculateAlumDoorPayrollV3({
          regularMinutes,
          paidLeaveMinutes: reconciled.paidLeaveMinutes,
          approvedOvertimeMinutes: overtimeMinutes,
          shiftHourlyRateVnd,
          overtimeRateVndPerHour,
          fixedAllowanceVnd: fixedAllowance,
          approvedEarningsVnd: adjustments.earningsVnd,
          advanceDeductionVnd: advance,
          approvedDeductionsVnd: totalPeriodDeduction,
        });
        return {
          basePayVnd: v3.basePayVnd,
          overtimePayVnd: v3.overtimePayVnd,
          allowanceVnd: safeVndAdd(v3.fixedAllowanceVnd, v3.approvedEarningsVnd, "Payroll earnings"),
          fixedAllowanceVnd: v3.fixedAllowanceVnd,
          additionalEarningsVnd: v3.approvedEarningsVnd,
          advanceVnd: v3.advanceDeductionVnd,
          manualDeductionVnd: v3.approvedDeductionsVnd,
          grossPayVnd: v3.grossPayVnd,
          totalDeductionVnd: v3.totalDeductionVnd,
          netPayVnd: v3.netPayVnd,
          shiftHourlyRateVnd: v3.shiftHourlyRateVnd,
          overtimeRateVndPerHour: v3.overtimeRateVndPerHour,
          dailyRate: undefined,
          v2Trace: undefined,
          v3Trace: v3.trace,
        };
      })()
    : calculationVersion >= 2
      ? (() => {
          const v2 = calculateAlumDoorPayrollV2({
            payMode,
            baseSalaryVnd,
            standardWorkDaysBp,
            workFractionBp,
            regularMinutes,
            approvedOvertimeMinutes: overtimeMinutes,
            overtimeRateVndPerHour: exactInteger(input.alu_overtime_rate_vnd_per_hour ?? ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR, "Mức tăng ca", ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR, ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR),
            fixedAllowanceVnd: fixedAllowance,
            approvedEarningsVnd: adjustments.earningsVnd,
            advanceDeductionVnd: advance,
            approvedLegalDeductionsVnd: totalPeriodDeduction,
            legalOvertimeFloorVnd: optionalInteger(input.alu_overtime_legal_floor_vnd, 0),
          });
          return {
            basePayVnd: v2.basePayVnd,
            overtimePayVnd: v2.overtimePayVnd,
            allowanceVnd: safeVndAdd(v2.fixedAllowanceVnd, v2.approvedEarningsVnd, "Payroll earnings"),
            fixedAllowanceVnd: v2.fixedAllowanceVnd,
            additionalEarningsVnd: v2.approvedEarningsVnd,
            advanceVnd: v2.advanceDeductionVnd,
            manualDeductionVnd: v2.approvedLegalDeductionsVnd,
            grossPayVnd: v2.grossPayVnd,
            totalDeductionVnd: v2.totalDeductionVnd,
            netPayVnd: v2.netPayVnd,
            shiftHourlyRateVnd: 0,
            overtimeRateVndPerHour: v2.overtimeRateVndPerHour,
            dailyRate: v2.dailyRate,
            v2Trace: v2.trace,
            v3Trace: undefined,
          };
        })()
      : (() => {
          const v1 = calculateAlumDoorPayroll({
            payMode,
            baseSalaryVnd,
            standardWorkDaysBp,
            workFractionBp,
            regularMinutes,
            overtimeMinutes,
            overtimeMultiplierBp: exactInteger(profile.data.overtime_multiplier_bp, "Pay Profile overtime_multiplier_bp", 0, 100_000),
            allowanceVnd: totalAllowanceAndEarnings,
            advanceVnd: advance,
            manualDeductionVnd: totalPeriodDeduction,
          });
          return {
            ...v1,
            fixedAllowanceVnd: fixedAllowance,
            additionalEarningsVnd: adjustments.earningsVnd,
            shiftHourlyRateVnd: 0,
            overtimeRateVndPerHour: 0,
            v2Trace: undefined,
            v3Trace: undefined,
          };
        })();

  const earnings: SalarySlipComponentRow[] = [
    salaryRow("ALU-BASE", earning, calculated.basePayVnd),
    ...(calculated.overtimePayVnd > 0 ? [salaryRow("ALU-OT", earning, calculated.overtimePayVnd)] : []),
    ...(calculated.fixedAllowanceVnd > 0 ? [salaryRow("ALU-ALLOWANCE", earning, calculated.fixedAllowanceVnd)] : []),
    ...(calculated.additionalEarningsVnd > 0 ? [salaryRow("ALU-ADJUSTMENT-EARNING", earning, calculated.additionalEarningsVnd)] : []),
  ];
  const deductions: SalarySlipComponentRow[] = [];
  if (advance > 0 || manualDeduction > 0 || adjustments.deductionsVnd > 0) {
    if (!deduction) throw errors.reference(`Salary Structure ${structureName} needs at least one Deduction component for AlumDoor deductions`);
    if (advance > 0) deductions.push(salaryRow("ALU-ADVANCE", deduction, advance));
    if (manualDeduction > 0) deductions.push(salaryRow("ALU-DEDUCTION", deduction, manualDeduction));
    if (adjustments.deductionsVnd > 0) deductions.push(salaryRow("ALU-ADJUSTMENT-DEDUCTION", deduction, adjustments.deductionsVnd));
  }

  const trace = {
    schema_version: 1,
    reconciliation_version: 3,
    calculation_version: calculationVersion,
    payroll_entry: payrollEntryName,
    period: { start_date: input.start_date, end_date: input.end_date, standard_work_days_bp: standardWorkDaysBp },
    employee: input.employee,
    pay_profile: { name: profile.name, version: profile.version, data: profile.data },
    salary_structure_assignment: { name: assignment.name, version: assignment.version },
    salary_structure: { name: structure.name, version: structure.version },
    shift_schedule: shiftSchedule.map((entry) => ({
      shift_assignment: { name: entry.assignmentName, version: entry.assignmentVersion },
      shift_type: { name: entry.shiftName, version: entry.shiftVersion, scheduled_minutes: entry.scheduledMinutes },
      from_date: entry.fromDate,
      ...(entry.toDate ? { to_date: entry.toDate } : {}),
    })),
    attendance: attendanceDocs.map((entry) => ({
      name: entry.name,
      version: entry.version,
      work_date: entry.data.work_date,
      shift_assignment: entry.data.shift_assignment,
      shift_type: entry.data.shift_type,
      scheduled_minutes: entry.data.scheduled_minutes,
      regular_minutes: entry.data.regular_minutes,
      raw_overtime_minutes: entry.data.raw_overtime_minutes ?? entry.data.overtime_minutes,
      approved_overtime_minutes: entry.data.overtime_minutes ?? 0,
      payable_work_fraction_bp: entry.data.payable_work_fraction_bp,
    })),
    paid_leave: paidLeave.trace,
    overtime_requests: approvedOvertime.trace,
    additional_salary: adjustments.trace,
    totals: {
      regular_minutes: regularMinutes,
      paid_leave_minutes: reconciled.paidLeaveMinutes,
      payable_regular_minutes: reconciled.payableRegularMinutes,
      raw_overtime_minutes: reconciled.rawOvertimeMinutes,
      approved_overtime_minutes: overtimeMinutes,
      attendance_work_fraction_bp: reconciled.attendanceWorkFractionBp,
      paid_leave_fraction_bp: reconciled.paidLeaveFractionBp,
      work_fraction_bp: workFractionBp,
      shift_hourly_rate_vnd: calculated.shiftHourlyRateVnd,
      overtime_hourly_rate_vnd: calculated.overtimeRateVndPerHour,
      fixed_allowance_vnd: fixedAllowance,
      additional_earnings_vnd: adjustments.earningsVnd,
      manual_deduction_vnd: manualDeduction,
      additional_deductions_vnd: adjustments.deductionsVnd,
    },
    rational: {
      rounding: "half_up",
      ...(calculated.dailyRate ? { daily_rate: calculated.dailyRate } : {}),
      ...(calculationVersion === 2 ? {
        overtime_hourly_rate_vnd: calculated.overtimeRateVndPerHour,
        overtime: calculated.v2Trace?.overtimePay,
      } : {}),
      ...(calculationVersion >= 3 ? {
        shift_hourly_rate_vnd: ALUMDOOR_SHIFT_HOURLY_RATE_VND,
        overtime_hourly_rate_vnd: ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
        shift_pay: calculated.v3Trace?.shiftPay,
        overtime_pay: calculated.v3Trace?.overtimePay,
      } : {}),
    },
    outputs_vnd: {
      base_pay: calculated.basePayVnd,
      overtime_pay: calculated.overtimePayVnd,
      allowance_and_additional_earnings: calculated.allowanceVnd,
      advance,
      manual_deduction: manualDeduction,
      additional_deductions: adjustments.deductionsVnd,
      gross_pay: calculated.grossPayVnd,
      total_deduction: calculated.totalDeductionVnd,
      net_pay: calculated.netPayVnd,
    },
    actor: context.command.actor.user_id,
    calculated_at: context.now,
  };
  const traceJson = JSON.stringify(trace);
  const inputHash = await sha256(traceJson);
  return {
    salary_structure_assignment: assignment.name,
    payroll_payable_account: payrollPayableAccount,
    earnings,
    deductions,
    working_days: Math.ceil(standardWorkDaysBp / 10_000),
    payment_days: workFractionBp / 10_000,
    input_hash: inputHash,
    rule_trace_json: traceJson,
    alu_input_hash: inputHash,
    alu_formula_trace_json: traceJson,
    alu_regular_minutes: regularMinutes,
    alu_overtime_minutes: overtimeMinutes,
    alu_work_fraction_bp: workFractionBp,
    alu_base_pay_vnd: calculated.basePayVnd,
    alu_overtime_pay_vnd: calculated.overtimePayVnd,
    alu_shift_hourly_rate_vnd: calculationVersion >= 3 ? ALUMDOOR_SHIFT_HOURLY_RATE_VND : 0,
    alu_overtime_rate_vnd_per_hour: calculationVersion >= 2 ? ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR : 0,
    alu_allowance_vnd: fixedAllowance,
    alu_advance_vnd: advance,
    alu_manual_deduction_vnd: manualDeduction,
    alu_calculation_version: calculationVersion,
    alu_state: "draft",
  };
}

async function loadEmployeeShiftSchedule(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<ShiftScheduleEntry[]> {
  const documents = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Shift Assignment"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && H.text(entry.data.start_date) <= input.end_date
      && (!H.text(entry.data.end_date) || H.text(entry.data.end_date) >= input.start_date))
    .sort((left, right) => H.text(left.data.start_date).localeCompare(H.text(right.data.start_date)) || left.name.localeCompare(right.name));
  const result: ShiftScheduleEntry[] = [];
  const shiftCache = new Map<string, CanonicalDocument<JsonObject>>();
  for (const assignment of documents) {
    const shiftName = H.requiredText(assignment.data.shift_type, `Shift Assignment ${assignment.name} shift_type`);
    let shift = shiftCache.get(shiftName);
    if (!shift) {
      const loaded = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Shift Type", shiftName);
      if (!loaded || loaded.docstatus === 2) throw errors.reference(`Shift Type ${shiftName} is required`);
      shift = loaded;
      shiftCache.set(shiftName, loaded);
    }
    if (H.truthy(shift.data.disabled)) throw errors.reference(`Shift Type ${shiftName} is disabled`);
    result.push({
      assignmentName: assignment.name,
      assignmentVersion: assignment.version,
      shiftName,
      shiftVersion: shift.version,
      fromDate: H.requiredDate(assignment.data.start_date, `Shift Assignment ${assignment.name} start_date`),
      ...(H.text(assignment.data.end_date) ? { toDate: H.requiredDate(assignment.data.end_date, `Shift Assignment ${assignment.name} end_date`) } : {}),
      scheduledMinutes: exactInteger(shift.data.working_minutes, `Shift Type ${shiftName} working_minutes`, 1, 1_440),
    });
  }
  return result;
}

function resolveShiftSchedule(schedule: readonly ShiftScheduleEntry[], workDate: string): ShiftScheduleEntry {
  const matches = schedule.filter((entry) => entry.fromDate <= workDate && (!entry.toDate || entry.toDate >= workDate));
  if (matches.length !== 1) throw errors.reference(`Exactly one submitted Shift Assignment is required on ${workDate}`);
  return matches[0]!;
}

async function loadPaidLeaveDays(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
  shiftSchedule: readonly ShiftScheduleEntry[],
): Promise<{ days: PayrollPaidLeaveDayInput[]; trace: JsonObject[] }> {
  const leaveDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Leave Application"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && H.text(entry.data.from_date) <= input.end_date
      && H.text(entry.data.to_date) >= input.start_date)
    .sort((left, right) => H.text(left.data.from_date).localeCompare(H.text(right.data.from_date)) || left.name.localeCompare(right.name));
  const days: PayrollPaidLeaveDayInput[] = [];
  const trace: JsonObject[] = [];
  const paidDateOwner = new Map<string, string>();

  for (const leave of leaveDocs) {
    const allocationName = H.requiredText(leave.data.leave_allocation, `Leave Application ${leave.name} leave_allocation`);
    const allocation = await requireSubmitted(context, "Leave Allocation", allocationName);
    if (H.text(allocation.data.employee) !== input.employee || H.text(allocation.data.company) !== input.company) {
      throw errors.reference(`Leave Allocation ${allocationName} does not match Salary Slip employee/company`);
    }
    if (H.text(allocation.data.leave_type) !== H.text(leave.data.leave_type)) {
      throw errors.reference(`Leave Allocation ${allocationName} does not match Leave Application ${leave.name} type`);
    }

    const policyName = H.requiredText(allocation.data.leave_policy, `Leave Allocation ${allocationName} leave_policy`);
    const policy = await requireSubmitted(context, "Leave Policy", policyName);
    if (H.text(policy.data.company) !== input.company || H.text(policy.data.leave_type) !== H.text(leave.data.leave_type)) {
      throw errors.reference(`Leave Policy ${policyName} does not match Leave Application ${leave.name}`);
    }
    if (!H.truthy(policy.data.is_paid)) continue;

    const holidayListName = H.text(leave.data.holiday_list)
      || H.requiredText(allocation.data.holiday_list, `Leave Allocation ${allocationName} holiday_list`);
    const holidayList = await requireSubmitted(context, "Holiday List", holidayListName);
    if (H.text(holidayList.data.company) !== input.company) {
      throw errors.reference(`Holiday List ${holidayListName} belongs to another company`);
    }
    const weeklyOff = H.parseWeeklyOff(H.text(holidayList.data.weekly_off_days));
    const holidays = H.parseHolidayDates(H.text(holidayList.data.holidays_json));
    const fromDate = maxDate(H.requiredDate(leave.data.from_date, `Leave Application ${leave.name} from_date`), input.start_date);
    const toDate = minDate(H.requiredDate(leave.data.to_date, `Leave Application ${leave.name} to_date`), input.end_date);
    const halfDay = H.truthy(leave.data.half_day);
    const halfDayDate = halfDay
      ? H.requiredDate(leave.data.half_day_date, `Leave Application ${leave.name} half_day_date`)
      : "";
    const paidDates: JsonObject[] = [];

    for (const workDate of enumerateDates(fromDate, toDate)) {
      if (!H.isWorkingDay(workDate, weeklyOff, holidays)) continue;
      const existingOwner = paidDateOwner.get(workDate);
      if (existingOwner) {
        throw errors.reference(`Paid leave overlaps for ${input.employee} / ${workDate}: ${existingOwner} and ${leave.name}`);
      }
      paidDateOwner.set(workDate, leave.name);
      const schedule = resolveShiftSchedule(shiftSchedule, workDate);
      const payableWorkFractionBp = halfDay && workDate === halfDayDate ? 5_000 : 10_000;
      days.push({ workDate, scheduledMinutes: schedule.scheduledMinutes, payableWorkFractionBp });
      paidDates.push({
        work_date: workDate,
        shift_assignment: schedule.assignmentName,
        shift_type: schedule.shiftName,
        scheduled_minutes: schedule.scheduledMinutes,
        payable_work_fraction_bp: payableWorkFractionBp,
      });
    }

    trace.push({
      leave_application: { name: leave.name, version: leave.version },
      leave_allocation: { name: allocation.name, version: allocation.version },
      leave_policy: { name: policy.name, version: policy.version, is_paid: true },
      holiday_list: { name: holidayList.name, version: holidayList.version },
      paid_dates: paidDates,
    });
  }

  return { days, trace };
}

async function loadApprovedOvertime(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<{ approvals: PayrollOvertimeApprovalInput[]; trace: JsonObject[] }> {
  const overtimeDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Overtime Request"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && H.text(entry.data.overtime_date) >= input.start_date
      && H.text(entry.data.overtime_date) <= input.end_date)
    .sort((left, right) => H.text(left.data.overtime_date).localeCompare(H.text(right.data.overtime_date)) || left.name.localeCompare(right.name));
  const approvals: PayrollOvertimeApprovalInput[] = [];
  const trace: JsonObject[] = [];
  const seenDate = new Set<string>();

  for (const overtime of overtimeDocs) {
    const workDate = H.requiredDate(overtime.data.overtime_date, `Overtime Request ${overtime.name} overtime_date`);
    if (seenDate.has(workDate)) {
      throw errors.reference(`Duplicate submitted Overtime Request for ${input.employee} / ${workDate}`);
    }
    seenDate.add(workDate);
    const approvedMinutes = exactInteger(overtime.data.approved_minutes ?? 0, `Overtime Request ${overtime.name} approved_minutes`, 0, 1_440);
    approvals.push({ workDate, approvedMinutes });
    trace.push({ name: overtime.name, version: overtime.version, overtime_date: workDate, approved_minutes: approvedMinutes });
  }

  return { approvals, trace };
}

async function loadPeriodAdjustments(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<{ earningsVnd: number; deductionsVnd: number; trace: JsonObject[] }> {
  const documents = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Additional Salary"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && additionalSalaryApplies(entry.data, input.start_date, input.end_date))
    .sort((left, right) => H.text(left.data.payroll_date).localeCompare(H.text(right.data.payroll_date)) || left.name.localeCompare(right.name));
  let earningsVnd = 0;
  let deductionsVnd = 0;
  const trace: JsonObject[] = [];

  for (const document of documents) {
    const componentName = H.requiredText(document.data.salary_component, `Additional Salary ${document.name} salary_component`);
    const component = await H.requireRecord(context as HrmContext, "Salary Component", componentName);
    const componentType = H.requiredText(component.type, `Salary Component ${componentName} type`);
    if (!["Earning", "Deduction"].includes(componentType)) {
      throw errors.reference(`Salary Component ${componentName} must be Earning or Deduction`);
    }
    const amountVnd = exactInteger(document.data.amount, `Additional Salary ${document.name} amount`, 0, 999_999_999_999);
    if (componentType === "Earning") earningsVnd = safeVndAdd(earningsVnd, amountVnd, "Additional Salary earnings");
    else deductionsVnd = safeVndAdd(deductionsVnd, amountVnd, "Additional Salary deductions");
    trace.push({
      name: document.name,
      version: document.version,
      payroll_date: document.data.payroll_date,
      salary_component: componentName,
      component_type: componentType,
      amount_vnd: amountVnd,
      is_recurring: H.truthy(document.data.is_recurring),
      ...(H.text(document.data.from_date) ? { from_date: document.data.from_date } : {}),
      ...(H.text(document.data.to_date) ? { to_date: document.data.to_date } : {}),
    });
  }
  return { earningsVnd, deductionsVnd, trace };
}

function additionalSalaryApplies(data: JsonObject, startDate: string, endDate: string): boolean {
  const payrollDate = H.text(data.payroll_date);
  if (payrollDate >= startDate && payrollDate <= endDate) return true;
  if (!H.truthy(data.is_recurring)) return false;
  const fromDate = H.text(data.from_date) || payrollDate;
  const toDate = H.text(data.to_date);
  return fromDate <= endDate && (!toDate || toDate >= startDate);
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const result: string[] = [];
  for (let cursor = Date.parse(`${fromDate}T00:00:00Z`), end = Date.parse(`${toDate}T00:00:00Z`); cursor <= end; cursor += 86_400_000) {
    result.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return result;
}

function maxDate(left: string, right: string): string {
  return left >= right ? left : right;
}

function minDate(left: string, right: string): string {
  return left <= right ? left : right;
}

async function accountingComponents(
  context: ControllerContext<SalarySlipData>,
  structure: JsonObject,
): Promise<{ earning: string; deduction?: string }> {
  if (!Array.isArray(structure.components) || structure.components.length === 0) {
    throw errors.reference("Salary Structure requires components for AlumDoor payroll accounting");
  }
  let earning = "";
  let deduction = "";
  for (const value of structure.components) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const componentName = H.text((value as JsonObject).salary_component);
    if (!componentName) continue;
    const component = await H.requireRecord(context as HrmContext, "Salary Component", componentName);
    if (!earning && H.text(component.type) === "Earning") earning = componentName;
    if (!deduction && H.text(component.type) === "Deduction") deduction = componentName;
  }
  if (!earning) throw errors.reference("Salary Structure needs at least one Earning component for AlumDoor payroll");
  return { earning, ...(deduction ? { deduction } : {}) };
}

function salaryRow(rowId: string, salaryComponent: string, amountVnd: number): SalarySlipComponentRow {
  return { row_id: rowId, salary_component: salaryComponent, amount: String(amountVnd) };
}

async function requireSubmitted(
  context: ControllerContext<SalarySlipData>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<JsonObject>> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

function optionalInteger(value: unknown, fallback: number, min = 0, max = 999_999_999_999): number {
  if (value === undefined || value === null || value === "") return fallback;
  return exactInteger(value, "Payroll value", min, max);
}

function exactInteger(value: unknown, field: string, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw errors.validation(`${field} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function safeVndAdd(left: number, right: number, field: string): number {
  const value = Number(BigInt(left) + BigInt(right));
  if (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999) {
    throw errors.validation(`${field} exceeds supported VND bounds`);
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
