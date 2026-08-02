import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { SalarySlipComponentRow, SalarySlipData } from "./enterprise-types.js";
import { evaluatePayrollRuleFormula, payrollRuleInputRowsToObject } from "./hrm-payroll-rule.js";

interface HrmGeneratedSalaryInput {
  salary_structure_assignment: string;
  payroll_period: string;
  payroll_payable_account: string;
  earnings: SalarySlipComponentRow[];
  deductions: SalarySlipComponentRow[];
  working_days: number;
  payment_days: number;
  input_hash: string;
  rule_trace_json: string;
}

export async function buildHrmSalarySlipInputs(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<HrmGeneratedSalaryInput | null> {
  if (Array.isArray(input.earnings) && input.earnings.length > 0) return null;

  const company = await requireRecord(context, "Company", input.company);
  const currency = requiredText(company.default_currency, `Company ${input.company} default currency`);
  const currencyRecord = await requireRecord(context, "Currency", currency);
  const currencyScale = Number.isInteger(currencyRecord.currency_scale) ? Number(currencyRecord.currency_scale) : 2;
  if (currencyScale < 0 || currencyScale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);

  const assignmentName = text(input.salary_structure_assignment);
  if (!assignmentName) {
    throw errors.validation("Salary Slip requires earnings or salary_structure_assignment");
  }
  const assignment = await requireSubmitted(context, "Salary Structure Assignment", assignmentName);
  if (text(assignment.data.employee) !== input.employee || text(assignment.data.company) !== input.company) {
    throw errors.reference(`Salary Structure Assignment ${assignmentName} does not match Salary Slip employee/company`);
  }
  const assignmentFrom = date(assignment.data.from_date, "Salary Structure Assignment from_date");
  const assignmentTo = optionalDate(assignment.data.to_date, "Salary Structure Assignment to_date");
  if (input.start_date < assignmentFrom || (assignmentTo && input.end_date > assignmentTo)) {
    throw errors.reference(`Salary Structure Assignment ${assignmentName} does not cover the payroll period`);
  }

  const structureName = requiredText(assignment.data.salary_structure, "Salary Structure Assignment salary_structure");
  const structure = await requireSubmitted(context, "Salary Structure", structureName);
  if (text(structure.data.company) !== input.company) throw errors.reference(`Salary Structure ${structureName} belongs to another company`);
  const structureFrom = date(structure.data.effective_from, "Salary Structure effective_from");
  const structureTo = optionalDate(structure.data.effective_to, "Salary Structure effective_to");
  if (input.end_date < structureFrom || (structureTo && input.start_date > structureTo)) {
    throw errors.reference(`Salary Structure ${structureName} is not effective for the payroll period`);
  }

  const payrollRuleName = requiredText(assignment.data.payroll_rule ?? structure.data.payroll_rule, "VN Payroll Rule");
  const payrollRule = await requireRecord(context, "VN Payroll Rule", payrollRuleName);
  if (truthy(payrollRule.disabled)) throw errors.reference(`VN Payroll Rule ${payrollRuleName} is disabled`);
  const ruleFrom = date(payrollRule.effective_from, `VN Payroll Rule ${payrollRuleName} effective_from`);
  const ruleTo = optionalDate(payrollRule.effective_to, `VN Payroll Rule ${payrollRuleName} effective_to`);
  if (input.start_date < ruleFrom || (ruleTo && input.end_date > ruleTo)) {
    throw errors.reference(`VN Payroll Rule ${payrollRuleName} does not cover the payroll period`);
  }
  const ruleCode = requiredText(payrollRule.rule_code, `VN Payroll Rule ${payrollRuleName} rule_code`);
  if (ruleCode !== payrollRuleName) throw errors.reference(`VN Payroll Rule ${payrollRuleName} rule_code does not match its record name`);
  const legalDocumentNo = requiredText(payrollRule.legal_document_no, `VN Payroll Rule ${payrollRuleName} legal_document_no`);
  const sourceUrl = requiredText(payrollRule.source_url, `VN Payroll Rule ${payrollRuleName} source_url`);
  const approvedBy = requiredText(payrollRule.approved_by, `VN Payroll Rule ${payrollRuleName} approved_by`);
  const approvedAt = requiredText(payrollRule.approved_at, `VN Payroll Rule ${payrollRuleName} approved_at`);
  const formulaJson = requiredText(payrollRule.formula_json, `VN Payroll Rule ${payrollRuleName} formula_json`);

  const baseSalaryMinor = toScaledInt(assignment.data.base_salary as string | number, currencyScale, "Salary Structure Assignment base_salary");
  if (baseSalaryMinor <= 0) throw errors.reference("Salary Structure Assignment base_salary must be positive");

  const assignmentBranch = requiredText(assignment.data.branch, "Salary Structure Assignment branch");
  const payrollPeriods = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Payroll Period"))
    .filter((entry) => entry.docstatus === 1
      && text(entry.data.company) === input.company
      && text(entry.data.start_date) === input.start_date
      && text(entry.data.end_date) === input.end_date
      && [assignmentBranch, ""].includes(text(entry.data.branch)))
    .sort((left, right) => Number(text(right.data.branch) === assignmentBranch) - Number(text(left.data.branch) === assignmentBranch));
  const payrollPeriod = payrollPeriods[0];
  if (!payrollPeriod) throw errors.reference(`Submitted Payroll Period is required for ${input.company} / ${assignmentBranch} / ${input.start_date}..${input.end_date}`);

  const holidayListName = requiredText(
    assignment.data.holiday_list ?? structure.data.holiday_list,
    "Salary Structure holiday_list",
  );
  const holidayList = await requireSubmitted(context, "Holiday List", holidayListName);
  const weeklyOff = parseWeeklyOff(text(holidayList.data.weekly_off_days));
  const holidays = parseHolidayDates(text(holidayList.data.holidays_json));
  const workDates = enumerateDates(input.start_date, input.end_date).filter((value) => isWorkingDay(value, weeklyOff, holidays));
  if (workDates.length === 0) throw errors.reference("Payroll period contains no configured working day");

  const attendanceDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Attendance"))
    .filter((entry) =>
      entry.docstatus === 1
      && text(entry.data.employee) === input.employee
      && text(entry.data.attendance_date) >= input.start_date
      && text(entry.data.attendance_date) <= input.end_date);
  const attendanceByDate = new Map(attendanceDocs.map((entry) => [text(entry.data.attendance_date), entry]));
  let paymentUnits = 0; // half-day units to keep calculation integral.
  for (const workDate of workDates) {
    const attendance = attendanceByDate.get(workDate);
    if (!attendance) {
      if (text(structure.data.unmarked_attendance) === "Có mặt") paymentUnits += 2;
      continue;
    }
    const status = text(attendance.data.attendance_status);
    if (status === "Có mặt" || status === "Làm việc từ xa") {
      paymentUnits += 2;
    } else if (status === "Nửa ngày") {
      paymentUnits += 1;
    } else if (status === "Nghỉ phép") {
      const leaveName = requiredText(attendance.data.leave_application, "Attendance leave_application");
      const leave = await requireSubmitted(context, "Leave Application", leaveName);
      const allocationName = requiredText(leave.data.leave_allocation, "Leave Application leave_allocation");
      const allocation = await requireSubmitted(context, "Leave Allocation", allocationName);
      const policyName = requiredText(allocation.data.leave_policy, "Leave Allocation leave_policy");
      const policy = await requireSubmitted(context, "Leave Policy", policyName);
      if (truthy(policy.data.is_paid)) paymentUnits += 2;
    }
  }

  const rawComponents = structure.data.components;
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    throw errors.reference(`Salary Structure ${structureName} has no components`);
  }

  const earnings: SalarySlipComponentRow[] = [];
  const deductions: SalarySlipComponentRow[] = [];
  const ruleComponents: Array<{
    index: number;
    componentName: string;
    componentType: string;
    outputKey: string;
    account: string;
    costCenter?: string;
  }> = [];
  for (const [index, rawValue] of rawComponents.entries()) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      throw errors.reference(`Salary Structure component row ${index + 1} is invalid`);
    }
    const raw = rawValue as JsonObject;
    const componentName = requiredText(raw.salary_component, `Salary Structure component ${index + 1}`);
    const component = await requireRecord(context, "Salary Component", componentName);
    const componentType = requiredText(component.type, `Salary Component ${componentName} type`);
    if (!["Earning", "Deduction"].includes(componentType)) {
      throw errors.reference(`Salary Component ${componentName} has invalid type`);
    }
    const amountType = requiredText(raw.amount_type, `Salary Structure component ${index + 1} amount_type`);
    if (amountType === "Payroll Rule Output") {
      const outputKey = requiredText(raw.rule_output_key, `Salary Structure component ${index + 1} rule_output_key`);
      const account = text(raw.account) || requiredText(component.account, `Salary Component ${componentName} account`);
      const costCenter = text(raw.cost_center)
        || text(assignment.data.payroll_cost_center)
        || text(structure.data.default_cost_center);
      ruleComponents.push({ index, componentName, componentType, outputKey, account, ...(costCenter ? { costCenter } : {}) });
      continue;
    }
    let amountMinor: number;
    if (amountType === "Fixed") {
      amountMinor = toScaledInt(raw.amount as string | number, currencyScale, `${componentName} amount`);
    } else if (amountType === "Percent of Base") {
      const percentage = Number(raw.percentage ?? 0);
      if (!Number.isFinite(percentage) || percentage < 0) throw errors.reference(`${componentName} percentage is invalid`);
      amountMinor = multiplyRatio(baseSalaryMinor, Math.round(percentage * 10_000), 1_000_000);
    } else {
      throw errors.reference(`${componentName} amount_type is invalid`);
    }
    if (amountMinor < 0) throw errors.reference(`${componentName} amount cannot be negative`);
    if (truthy(raw.prorate_by_payment_days)) {
      amountMinor = multiplyRatio(amountMinor, paymentUnits, workDates.length * 2);
    }
    const account = text(raw.account) || requiredText(component.account, `Salary Component ${componentName} account`);
    const costCenter = text(raw.cost_center)
      || text(assignment.data.payroll_cost_center)
      || text(structure.data.default_cost_center);
    const row: SalarySlipComponentRow = {
      row_id: `STRUCT-${index + 1}`,
      salary_component: componentName,
      amount: fromScaledInt(amountMinor, currencyScale),
      amount_minor: amountMinor,
      account,
      ...(costCenter ? { cost_center: costCenter } : {}),
    };
    (componentType === "Earning" ? earnings : deductions).push(row);
  }

  const additionalDocs = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Additional Salary"))
    .filter((entry) => entry.docstatus === 1
      && text(entry.data.employee) === input.employee
      && text(entry.data.company) === input.company
      && additionalSalaryApplies(entry.data, input.start_date, input.end_date));
  for (const [index, additional] of additionalDocs.entries()) {
    const componentName = requiredText(additional.data.salary_component, "Additional Salary salary_component");
    const component = await requireRecord(context, "Salary Component", componentName);
    const componentType = requiredText(component.type, `Salary Component ${componentName} type`);
    if (!["Earning", "Deduction"].includes(componentType)) throw errors.reference(`Salary Component ${componentName} has invalid type`);
    const amountMinor = toScaledInt(additional.data.amount as string | number, currencyScale, "Additional Salary amount");
    if (amountMinor < 0) throw errors.validation("Additional Salary amount cannot be negative");
    const account = requiredText(component.account, `Salary Component ${componentName} account`);
    const costCenter = text(assignment.data.payroll_cost_center) || text(structure.data.default_cost_center);
    const row: SalarySlipComponentRow = {
      row_id: `ADDL-${index + 1}-${additional.name}`,
      salary_component: componentName,
      amount: fromScaledInt(amountMinor, currencyScale),
      amount_minor: amountMinor,
      account,
      ...(costCenter ? { cost_center: costCenter } : {}),
    };
    (componentType === "Earning" ? earnings : deductions).push(row);
  }

  const grossBeforeRuleMinor = earnings.reduce((sum, row) => safeAmountAdd(sum, row.amount_minor ?? 0), 0);
  const deductionsBeforeRuleMinor = deductions.reduce((sum, row) => safeAmountAdd(sum, row.amount_minor ?? 0), 0);
  const statutory = evaluatePayrollRuleFormula(formulaJson, {
    currency,
    currencyScale,
    baseSalaryMinor,
    grossEarningsMinor: grossBeforeRuleMinor,
    preRuleDeductionsMinor: deductionsBeforeRuleMinor,
    workingDays: workDates.length,
    paymentHalfUnits: paymentUnits,
    statutoryInputs: payrollRuleInputRowsToObject(assignment.data.statutory_inputs),
  });
  const formulaHash = await sha256(statutory.canonicalFormulaJson);
  for (const ruleComponent of ruleComponents) {
    const amountMinor = statutory.outputs[ruleComponent.outputKey];
    if (amountMinor === undefined) throw errors.reference(`Payroll rule output ${ruleComponent.outputKey} does not exist`);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw errors.reference(`Payroll rule output ${ruleComponent.outputKey} must be a non-negative minor-unit integer`);
    }
    const row: SalarySlipComponentRow = {
      row_id: `RULE-${ruleComponent.index + 1}`,
      salary_component: ruleComponent.componentName,
      amount: fromScaledInt(amountMinor, currencyScale),
      amount_minor: amountMinor,
      account: ruleComponent.account,
      ...(ruleComponent.costCenter ? { cost_center: ruleComponent.costCenter } : {}),
    };
    (ruleComponent.componentType === "Earning" ? earnings : deductions).push(row);
  }

  if (earnings.length === 0) throw errors.reference("Salary Structure produced no earnings");
  const payrollPayableAccount = text(assignment.data.payable_account)
    || requiredText(structure.data.payroll_payable_account, "Salary Structure payroll payable account");

  const sourceSnapshot = {
    employee: input.employee,
    company: input.company,
    start_date: input.start_date,
    end_date: input.end_date,
    assignment: { name: assignment.name, version: assignment.version },
    structure: { name: structure.name, version: structure.version },
    payroll_period: { name: payrollPeriod.name, version: payrollPeriod.version },
    payroll_rule: {
      name: payrollRuleName,
      rule_code: ruleCode,
      effective_from: ruleFrom,
      ...(ruleTo ? { effective_to: ruleTo } : {}),
      legal_document_no: legalDocumentNo,
      source_url: sourceUrl,
      approved_by: approvedBy,
      approved_at: approvedAt,
      formula_schema_version: statutory.schemaVersion,
      formula_sha256: formulaHash,
      statutory_inputs: statutory.inputs,
      statutory_outputs_minor: statutory.outputs,
    },
    holiday_list: { name: holidayList.name, version: holidayList.version },
    attendance: attendanceDocs.map((entry) => ({ name: entry.name, version: entry.version })).sort(byName),
    additional_salary: additionalDocs.map((entry) => ({ name: entry.name, version: entry.version })).sort(byName),
    working_days: workDates.length,
    payment_days: paymentUnits / 2,
  };
  const inputHash = await sha256(JSON.stringify(sourceSnapshot));
  return {
    salary_structure_assignment: assignmentName,
    payroll_period: payrollPeriod.name,
    payroll_payable_account: payrollPayableAccount,
    earnings,
    deductions,
    working_days: workDates.length,
    payment_days: paymentUnits / 2,
    input_hash: inputHash,
    rule_trace_json: JSON.stringify(sourceSnapshot),
  };
}

function additionalSalaryApplies(data: JsonObject, startDate: string, endDate: string): boolean {
  const payrollDate = text(data.payroll_date);
  if (payrollDate >= startDate && payrollDate <= endDate) return true;
  if (!truthy(data.is_recurring)) return false;
  const fromDate = text(data.from_date) || payrollDate;
  const toDate = text(data.to_date);
  return fromDate <= endDate && (!toDate || toDate >= startDate);
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

async function requireRecord(context: ControllerContext<SalarySlipData>, doctype: string, name: string): Promise<JsonObject> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (document && document.docstatus !== 2) return document.data;
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist`);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.reference(`${field} is required`);
  return result;
}

function date(value: unknown, field: string): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw errors.reference(`${field} must use YYYY-MM-DD`);
  }
  return result;
}

function optionalDate(value: unknown, field: string): string | undefined {
  const result = text(value);
  return result ? date(result, field) : undefined;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function parseWeeklyOff(value: string): Set<number> {
  const result = new Set<number>();
  for (const raw of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const day = Number(raw);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw errors.reference("Holiday List weekly_off_days must contain integers 0..6");
    result.add(day);
  }
  return result;
}

function parseHolidayDates(value: string): Set<string> {
  if (!value) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw errors.reference("Holiday List holidays_json must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item))) {
    throw errors.reference("Holiday List holidays_json must be an array of YYYY-MM-DD strings");
  }
  return new Set(parsed);
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const result: string[] = [];
  for (let cursor = Date.parse(`${fromDate}T00:00:00Z`), end = Date.parse(`${toDate}T00:00:00Z`); cursor <= end; cursor += 86_400_000) {
    result.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return result;
}

function isWorkingDay(dateValue: string, weeklyOff: Set<number>, holidays: Set<string>): boolean {
  return !weeklyOff.has(new Date(`${dateValue}T00:00:00Z`).getUTCDay()) && !holidays.has(dateValue);
}

function safeAmountAdd(left: number, right: number): number {
  const result = Number(BigInt(left) + BigInt(right));
  if (!Number.isSafeInteger(result)) throw errors.validation("Payroll amount exceeds safe integer bounds");
  return result;
}

function multiplyRatio(value: number, numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw errors.validation("Payroll ratio inputs exceed safe integer bounds");
  }
  const result = Number((BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
  if (!Number.isSafeInteger(result)) throw errors.validation("Payroll amount exceeds safe integer bounds");
  return result;
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
