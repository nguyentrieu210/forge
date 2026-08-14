import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { SalarySlipComponentRow, SalarySlipData } from "./enterprise-types.js";
import * as H from "./hrm-shared.js";
import {
  calculateAlumDoorPayroll,
  calculateAlumDoorPayrollV2,
  type AlumDoorPayMode,
} from "../../../apps-src/alumdoor-worker/src/payroll-core.js";
import { ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR } from "../../alumdoor-hr-payroll-contract/src/index.js";

type HrmContext = H.HrmContext;

/**
 * Lightweight AlumDoor pay configuration. It deliberately does not create a second
 * payroll engine: Salary Slip / Payroll Entry remain the accounting authority.
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
  alu_overtime_rate_vnd_per_hour: number;
  alu_allowance_vnd: number;
  alu_advance_vnd: number;
  alu_manual_deduction_vnd: number;
  alu_calculation_version: number;
  alu_state: string;
}

/**
 * Turns the three-segment daily projection into an ordinary Salary Slip payload.
 * The accounting document, its GL and its Payment Ledger remain the platform's
 * canonical Salary Slip implementation; this function only supplies deterministic inputs.
 */
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
    throw errors.reference("AlumDoor Pay Profile stores integer VND and requires company currency VND");
  }

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

  const attendanceDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "AlumDoor Attendance Day"))
    .filter((entry) => H.text(entry.data.employee) === input.employee
      && H.text(entry.data.work_date) >= input.start_date
      && H.text(entry.data.work_date) <= input.end_date)
    .sort((left, right) => H.text(left.data.work_date).localeCompare(H.text(right.data.work_date)));
  const seenDate = new Set<string>();
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let workFractionBp = 0;
  for (const attendance of attendanceDocs) {
    const date = H.requiredDate(attendance.data.work_date, "Attendance Day work_date");
    if (seenDate.has(date)) throw errors.reference(`Duplicate AlumDoor Attendance Day for ${input.employee} / ${date}`);
    seenDate.add(date);
    const state = H.requiredText(attendance.data.state, "Attendance Day state");
    if (["open", "exception"].includes(state)) {
      throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} has ${state} attendance on ${date}`);
    }
    if (state === "locked") {
      throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} attendance on ${date} is already locked by another payroll`);
    }
    regularMinutes += exactInteger(attendance.data.regular_minutes ?? 0, "Attendance regular_minutes", 0, 1_440);
    overtimeMinutes += exactInteger(attendance.data.overtime_minutes ?? 0, "Attendance overtime_minutes", 0, 1_440);
    workFractionBp += exactInteger(attendance.data.payable_work_fraction_bp ?? 0, "Attendance payable_work_fraction_bp", 0, 10_000);
  }
  if (attendanceDocs.length === 0) {
    throw errors.validation(`PAYROLL_BLOCKED: ${input.employee} has no AlumDoor Attendance Day in this period`);
  }

  const standardWorkDaysBp = exactInteger(input.alu_standard_work_days_bp, "Payroll standard work days", 1, 310_000);
  const allowance = optionalInteger(input.alu_allowance_vnd, exactInteger(profile.data.fixed_allowance_vnd ?? 0, "Pay Profile allowance", 0, 999_999_999_999));
  const advance = optionalInteger(input.alu_advance_vnd, 0);
  const manualDeduction = optionalInteger(input.alu_manual_deduction_vnd, 0);
  if (manualDeduction > 0 && !H.text(input.alu_adjustment_reason)) {
    throw errors.validation("Salary Slip manual deduction requires alu_adjustment_reason");
  }
  const calculationVersion = optionalInteger(input.alu_calculation_version, 1, 1, 1_000_000);
  const payMode = H.requiredText(profile.data.pay_mode, "Pay Profile pay_mode") as AlumDoorPayMode;
  const baseSalaryVnd = exactInteger(profile.data.base_salary_vnd, "Pay Profile base_salary_vnd", 0, 999_999_999_999);
  const calculated = calculationVersion >= 2
    ? (() => {
        const v2 = calculateAlumDoorPayrollV2({
          payMode,
          baseSalaryVnd,
          standardWorkDaysBp,
          workFractionBp,
          regularMinutes,
          approvedOvertimeMinutes: overtimeMinutes,
          overtimeRateVndPerHour: exactInteger(input.alu_overtime_rate_vnd_per_hour ?? ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR, "Mức tăng ca", ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR, ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR),
          fixedAllowanceVnd: allowance,
          advanceDeductionVnd: advance,
          approvedLegalDeductionsVnd: manualDeduction,
          legalOvertimeFloorVnd: optionalInteger(input.alu_overtime_legal_floor_vnd, 0),
        });
        return {
          basePayVnd: v2.basePayVnd,
          overtimePayVnd: v2.overtimePayVnd,
          allowanceVnd: v2.fixedAllowanceVnd,
          advanceVnd: v2.advanceDeductionVnd,
          manualDeductionVnd: v2.approvedLegalDeductionsVnd,
          grossPayVnd: v2.grossPayVnd,
          totalDeductionVnd: v2.totalDeductionVnd,
          netPayVnd: v2.netPayVnd,
          dailyRate: v2.dailyRate,
          v2Trace: v2.trace,
        };
      })()
    : {
        ...calculateAlumDoorPayroll({
          payMode,
          baseSalaryVnd,
          standardWorkDaysBp,
          workFractionBp,
          regularMinutes,
          overtimeMinutes,
          overtimeMultiplierBp: exactInteger(profile.data.overtime_multiplier_bp, "Pay Profile overtime_multiplier_bp", 0, 100_000),
          allowanceVnd: allowance,
          advanceVnd: advance,
          manualDeductionVnd: manualDeduction,
        }),
        v2Trace: undefined,
      };

  const earnings: SalarySlipComponentRow[] = [
    salaryRow("ALU-BASE", earning, calculated.basePayVnd),
    ...(calculated.overtimePayVnd > 0 ? [salaryRow("ALU-OT", earning, calculated.overtimePayVnd)] : []),
    ...(calculated.allowanceVnd > 0 ? [salaryRow("ALU-ALLOWANCE", earning, calculated.allowanceVnd)] : []),
  ];
  const deductions: SalarySlipComponentRow[] = [];
  if (calculated.advanceVnd > 0 || calculated.manualDeductionVnd > 0) {
    if (!deduction) throw errors.reference(`Salary Structure ${structureName} needs at least one Deduction component for AlumDoor deductions`);
    if (calculated.advanceVnd > 0) deductions.push(salaryRow("ALU-ADVANCE", deduction, calculated.advanceVnd));
    if (calculated.manualDeductionVnd > 0) deductions.push(salaryRow("ALU-DEDUCTION", deduction, calculated.manualDeductionVnd));
  }

  const trace = {
    schema_version: 1,
    calculation_version: calculationVersion,
    payroll_entry: payrollEntryName,
    period: { start_date: input.start_date, end_date: input.end_date, standard_work_days_bp: standardWorkDaysBp },
    employee: input.employee,
    pay_profile: { name: profile.name, version: profile.version, data: profile.data },
    salary_structure_assignment: { name: assignment.name, version: assignment.version },
    salary_structure: { name: structure.name, version: structure.version },
    attendance: attendanceDocs.map((entry) => ({ name: entry.name, version: entry.version, work_date: entry.data.work_date, regular_minutes: entry.data.regular_minutes, overtime_minutes: entry.data.overtime_minutes, payable_work_fraction_bp: entry.data.payable_work_fraction_bp })),
    totals: { regular_minutes: regularMinutes, overtime_minutes: overtimeMinutes, work_fraction_bp: workFractionBp },
    rational: {
      daily_rate: calculated.dailyRate,
      rounding: "half_up",
      ...(calculationVersion >= 2 ? {
        overtime_rate_vnd_per_hour: ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR,
        overtime: calculated.v2Trace?.overtimePay,
      } : {}),
    },
    outputs_vnd: {
      base_pay: calculated.basePayVnd,
      overtime_pay: calculated.overtimePayVnd,
      allowance: calculated.allowanceVnd,
      advance: calculated.advanceVnd,
      manual_deduction: calculated.manualDeductionVnd,
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
    alu_overtime_rate_vnd_per_hour: calculationVersion >= 2 ? ALUMDOOR_OVERTIME_RATE_VND_PER_HOUR : 0,
    alu_allowance_vnd: calculated.allowanceVnd,
    alu_advance_vnd: calculated.advanceVnd,
    alu_manual_deduction_vnd: calculated.manualDeductionVnd,
    alu_calculation_version: calculationVersion,
    alu_state: "draft",
  };
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
