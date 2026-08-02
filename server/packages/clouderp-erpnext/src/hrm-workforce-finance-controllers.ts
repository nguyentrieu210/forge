import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class WorkforcePlanController extends SuiteController<JsonObject> {
  readonly doctype = "Workforce Plan";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const companyName = H.requiredText(input.company, "Workforce Plan company");
    const company = await H.requireRecord(context, "Company", companyName);
    const fiscalYear = H.requiredText(input.fiscal_year, "Workforce Plan fiscal_year");
    await H.requireRecord(context, "Fiscal Year", fiscalYear);
    const fromDate = H.requiredDate(input.from_date, "Workforce Plan from_date");
    const toDate = H.requiredDate(input.to_date, "Workforce Plan to_date");
    if (toDate < fromDate) throw errors.validation("Workforce Plan to_date must not precede from_date");
    const currency = H.requiredText(input.currency || company.default_currency, "Workforce Plan currency");
    if (H.text(company.default_currency) && H.text(company.default_currency) !== currency) {
      throw errors.reference("Workforce Plan currency must match the company default currency");
    }
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const plannedMonths = monthsInclusive(fromDate, toDate);
    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw errors.validation("Workforce Plan requires at least one line");
    }
    const seen = new Set<string>();
    const lines: JsonObject[] = [];
    let totalHeadcount = 0;
    let totalMonthlyMinor = 0;
    let totalPeriodMinor = 0;
    for (const [index, raw] of input.lines.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Workforce Plan line ${index + 1} is invalid`);
      const row = raw as JsonObject;
      const branch = H.requiredText(row.branch, `Workforce Plan line ${index + 1} branch`);
      const department = H.requiredText(row.department, `Workforce Plan line ${index + 1} department`);
      const designation = H.requiredText(row.designation, `Workforce Plan line ${index + 1} designation`);
      const employmentType = H.text(row.employment_type);
      const branchData = await H.requireRecord(context, "Branch", branch);
      const departmentData = await H.requireRecord(context, "Department", department);
      await H.requireRecord(context, "Designation", designation);
      if (employmentType) await H.requireRecord(context, "Employment Type", employmentType);
      if (H.text(branchData.company) && H.text(branchData.company) !== companyName) throw errors.reference(`Branch ${branch} belongs to another company`);
      if (H.text(departmentData.company) && H.text(departmentData.company) !== companyName) throw errors.reference(`Department ${department} belongs to another company`);
      const key = [branch, department, designation, employmentType].join("|");
      if (seen.has(key)) throw errors.validation(`Workforce Plan line ${index + 1} duplicates an existing position scope`);
      seen.add(key);
      const headcount = H.integer(row.planned_headcount, 0);
      if (headcount <= 0) throw errors.validation(`Workforce Plan line ${index + 1} planned_headcount must be positive`);
      const perHeadMinor = toScaledInt(row.monthly_budget_per_head as string | number, scale, `Workforce Plan line ${index + 1} monthly_budget_per_head`);
      if (perHeadMinor < 0) throw errors.validation(`Workforce Plan line ${index + 1} monthly budget cannot be negative`);
      const monthlyMinor = safeMultiply(perHeadMinor, headcount, "Workforce Plan monthly budget overflow");
      const periodMinor = safeMultiply(monthlyMinor, plannedMonths, "Workforce Plan period budget overflow");
      totalHeadcount = safeIntegerAdd(totalHeadcount, headcount, "Workforce Plan headcount overflow");
      totalMonthlyMinor = safeAdd(totalMonthlyMinor, monthlyMinor, "Workforce Plan budget overflow");
      totalPeriodMinor = safeAdd(totalPeriodMinor, periodMinor, "Workforce Plan budget overflow");
      lines.push({
        ...row,
        branch,
        department,
        designation,
        ...(employmentType ? { employment_type: employmentType } : {}),
        planned_headcount: headcount,
        monthly_budget_per_head: fromScaledInt(perHeadMinor, scale),
        monthly_budget: fromScaledInt(monthlyMinor, scale),
        period_budget: fromScaledInt(periodMinor, scale),
      });
    }
    if (context.command.action === "submit") {
      const existing = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (existing.some((plan) => plan.name !== context.command.aggregate.name && plan.docstatus === 1
        && H.text(plan.data.company) === companyName && H.text(plan.data.fiscal_year) === fiscalYear)) {
        throw errors.reference(`A submitted Workforce Plan already exists for ${companyName} / ${fiscalYear}; cancel/amend it instead of creating a competing plan`);
      }
    }
    return {
      ...input,
      company: companyName,
      fiscal_year: fiscalYear,
      from_date: fromDate,
      to_date: toDate,
      currency,
      planned_months: plannedMonths,
      lines,
      total_planned_headcount: totalHeadcount,
      total_monthly_budget: fromScaledInt(totalMonthlyMinor, scale),
      total_period_budget: fromScaledInt(totalPeriodMinor, scale),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class EmployeeBenefitEnrollmentController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Benefit Enrollment";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee Benefit employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const fromDate = H.requiredDate(input.effective_from, "Employee Benefit effective_from");
    const toDate = H.optionalDate(input.effective_to, "Employee Benefit effective_to");
    if (toDate && toDate < fromDate) throw errors.validation("Employee Benefit effective_to must not precede effective_from");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const companyName = H.requiredText(state.company, "Employee company");
    const company = await H.requireRecord(context, "Company", companyName);
    const branch = H.requiredText(state.branch, "Employee branch");
    const componentName = H.requiredText(input.salary_component, "Employee Benefit salary_component");
    const component = await H.requireRecord(context, "Salary Component", componentName);
    if (!["Earning", "Deduction"].includes(H.text(component.type))) throw errors.reference(`Salary Component ${componentName} has invalid type`);
    const currency = H.requiredText(input.currency || company.default_currency, "Employee Benefit currency");
    if (H.text(company.default_currency) && H.text(company.default_currency) !== currency) throw errors.reference("Employee Benefit currency must match company default currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const amountMinor = toScaledInt(input.amount as string | number, scale, "Employee Benefit amount");
    if (amountMinor <= 0) throw errors.validation("Employee Benefit amount must be positive");
    const frequency = H.requiredText(input.frequency, "Employee Benefit frequency");
    if (!["Monthly", "One-time"].includes(frequency)) throw errors.validation("Employee Benefit frequency is invalid");
    const oneTimeDate = frequency === "One-time" ? H.requiredDate(input.one_time_date, "Employee Benefit one_time_date") : undefined;
    if (oneTimeDate && (oneTimeDate < fromDate || (toDate && oneTimeDate > toDate))) throw errors.validation("Employee Benefit one_time_date must fall inside the effective period");
    const benefitCode = H.requiredText(input.benefit_code, "Employee Benefit benefit_code");
    if (context.command.action === "submit") {
      const enrollments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const enrollment of enrollments) {
        if (enrollment.name === context.command.aggregate.name || enrollment.docstatus !== 1) continue;
        if (H.text(enrollment.data.employee) !== employeeName || H.text(enrollment.data.benefit_code) !== benefitCode) continue;
        const otherFrom = H.requiredDate(enrollment.data.effective_from, "Existing Employee Benefit effective_from");
        const otherTo = H.optionalDate(enrollment.data.effective_to, "Existing Employee Benefit effective_to");
        if (H.rangesOverlap(fromDate, toDate, otherFrom, otherTo)) {
          throw errors.reference(`Employee ${employeeName} already has benefit ${benefitCode} overlapping this period`);
        }
      }
    }
    return {
      ...input,
      benefit_code: benefitCode,
      employee: employeeName,
      company: companyName,
      branch,
      salary_component: componentName,
      currency,
      amount: fromScaledInt(amountMinor, scale),
      frequency,
      effective_from: fromDate,
      ...(toDate ? { effective_to: toDate } : {}),
      ...(oneTimeDate ? { one_time_date: oneTimeDate } : {}),
      prorate_by_payment_days: H.truthy(input.prorate_by_payment_days) ? 1 : 0,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, context.command.document);
  }
}

export class EmployeeLoanController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Loan";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee Loan employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const loanDate = H.requiredDate(input.loan_date, "Employee Loan loan_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, loanDate);
    H.assertEmployeeStateActive(state, employeeName, loanDate);
    const companyName = H.requiredText(state.company, "Employee company");
    const company = await H.requireRecord(context, "Company", companyName);
    const branch = H.requiredText(state.branch, "Employee branch");
    const currency = H.requiredText(input.currency || company.default_currency, "Employee Loan currency");
    if (H.text(company.default_currency) && H.text(company.default_currency) !== currency) throw errors.reference("Employee Loan currency must match company default currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const principalMinor = toScaledInt(input.principal_amount as string | number, scale, "Employee Loan principal_amount");
    if (principalMinor <= 0) throw errors.validation("Employee Loan principal_amount must be positive");
    const installmentCount = H.integer(input.installment_count, 0);
    if (installmentCount < 1 || installmentCount > 120) throw errors.validation("Employee Loan installment_count must be between 1 and 120");
    const installmentMinor = Math.floor(principalMinor / installmentCount);
    if (installmentMinor <= 0) throw errors.validation("Employee Loan installment_count is too high for the principal amount");
    const finalMinor = safeAdd(principalMinor, -safeMultiply(installmentMinor, installmentCount - 1, "Employee Loan installment overflow"), "Employee Loan installment overflow");
    const firstRepaymentDate = H.requiredDate(input.first_repayment_date, "Employee Loan first_repayment_date");
    if (firstRepaymentDate < loanDate) throw errors.validation("Employee Loan first_repayment_date must not precede loan_date");
    const componentName = H.requiredText(input.salary_component, "Employee Loan salary_component");
    const component = await H.requireRecord(context, "Salary Component", componentName);
    if (H.text(component.type) !== "Deduction") throw errors.reference(`Salary Component ${componentName} must be a Deduction for Employee Loan`);
    await H.requireRecord(context, "Account", H.requiredText(component.account, `Salary Component ${componentName} account`));
    return {
      ...input,
      employee: employeeName,
      company: companyName,
      branch,
      loan_date: loanDate,
      principal_amount: fromScaledInt(principalMinor, scale),
      currency,
      installment_count: installmentCount,
      first_repayment_date: firstRepaymentDate,
      installment_amount: fromScaledInt(installmentMinor, scale),
      final_installment_amount: fromScaledInt(finalMinor, scale),
      salary_component: componentName,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, context.command.document);
  }
}

export class EmployeeLoanRepaymentController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Loan Repayment";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const loanName = H.requiredText(input.employee_loan, "Employee Loan Repayment employee_loan");
    const loan = await H.requireSubmitted(context, "Employee Loan", loanName);
    const employeeName = H.requiredText(loan.employee, "Employee Loan employee");
    const companyName = H.requiredText(loan.company, "Employee Loan company");
    const postingDate = H.requiredDate(input.posting_date, "Employee Loan Repayment posting_date");
    if (postingDate < H.requiredDate(loan.loan_date, "Employee Loan loan_date")) throw errors.validation("Employee Loan Repayment posting_date must not precede loan_date");
    const currency = H.requiredText(loan.currency, "Employee Loan currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const amountMinor = toScaledInt(input.amount as string | number, scale, "Employee Loan Repayment amount");
    if (amountMinor <= 0) throw errors.validation("Employee Loan Repayment amount must be positive");
    const principalMinor = toScaledInt(loan.principal_amount as string | number, scale, "Employee Loan principal_amount");
    const repaidMinor = await loanRepaidMinor(context, loanName, scale, context.command.aggregate.name);
    if (safeAdd(repaidMinor, amountMinor, "Employee Loan repayment overflow") > principalMinor) {
      throw errors.reference(`Employee Loan Repayment exceeds the outstanding amount for ${loanName}`);
    }
    const paymentEntry = H.requiredText(input.payment_entry, "Employee Loan Repayment payment_entry");
    const payment = await H.requireSubmitted(context, "Payment Entry", paymentEntry);
    if (H.text(payment.company) && H.text(payment.company) !== companyName) throw errors.reference(`Payment Entry ${paymentEntry} belongs to another company`);
    if (H.text(payment.party_type) && H.text(payment.party_type) !== "Employee") throw errors.reference(`Payment Entry ${paymentEntry} is not an Employee payment`);
    if (H.text(payment.party) && H.text(payment.party) !== employeeName) throw errors.reference(`Payment Entry ${paymentEntry} belongs to another employee`);
    return {
      ...input,
      employee_loan: loanName,
      employee: employeeName,
      company: companyName,
      posting_date: postingDate,
      amount: fromScaledInt(amountMinor, scale),
      currency,
      payment_entry: paymentEntry,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Applied" : super.status(context, context.command.document);
  }
}

export class SalaryBankBatchController extends SuiteController<JsonObject> {
  readonly doctype = "Salary Bank Batch";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const payrollEntryName = H.requiredText(input.payroll_entry, "Salary Bank Batch payroll_entry");
    const payroll = await H.requireSubmitted(context, "Payroll Entry", payrollEntryName);
    const companyName = H.requiredText(payroll.company, "Payroll Entry company");
    const currency = H.requiredText(payroll.currency, "Payroll Entry currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = currencyScale(currencyData, currency);
    const transferDate = H.requiredDate(input.transfer_date, "Salary Bank Batch transfer_date");
    const payrollEnd = H.requiredDate(payroll.end_date, "Payroll Entry end_date");
    if (transferDate < payrollEnd) throw errors.validation("Salary Bank Batch transfer_date must not precede payroll end_date");
    const bankAccount = H.requiredText(input.bank_account, "Salary Bank Batch bank_account");
    const bank = await H.requireRecord(context, "Bank Account", bankAccount);
    if (H.text(bank.company) && H.text(bank.company) !== companyName) throw errors.reference(`Bank Account ${bankAccount} belongs to another company`);
    if (H.text(bank.currency) && H.text(bank.currency) !== currency) throw errors.reference(`Bank Account ${bankAccount} uses another currency`);
    if (!Array.isArray(payroll.salary_slips) || payroll.salary_slips.length === 0) throw errors.reference(`Payroll Entry ${payrollEntryName} has no Salary Slips`);
    const transfers: JsonObject[] = [];
    const seen = new Set<string>();
    let totalMinor = 0;
    for (const [index, row] of payroll.salary_slips.entries()) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw errors.reference(`Payroll Entry ${payrollEntryName} salary_slips row ${index + 1} is invalid`);
      const salarySlipName = H.requiredText((row as JsonObject).salary_slip, `Payroll Entry salary_slips row ${index + 1}`);
      if (seen.has(salarySlipName)) throw errors.reference(`Payroll Entry ${payrollEntryName} contains duplicate Salary Slip ${salarySlipName}`);
      seen.add(salarySlipName);
      const slip = await H.requireSubmitted(context, "Salary Slip", salarySlipName);
      if (H.text(slip.company) !== companyName) throw errors.reference(`Salary Slip ${salarySlipName} belongs to another company`);
      const employeeName = H.requiredText(slip.employee, `Salary Slip ${salarySlipName} employee`);
      const employee = await H.requireRecord(context, "Employee", employeeName);
      const bankName = H.requiredText(employee.bank_name, `Employee ${employeeName} bank_name`);
      const bankAccountNo = H.requiredText(employee.bank_account_no, `Employee ${employeeName} bank_account_no`);
      const amountMinor = typeof slip.net_pay_minor === "number" && Number.isSafeInteger(slip.net_pay_minor)
        ? slip.net_pay_minor
        : toScaledInt(slip.net_pay as string | number, scale, `Salary Slip ${salarySlipName} net_pay`);
      if (amountMinor <= 0) throw errors.reference(`Salary Slip ${salarySlipName} has no positive net pay to transfer`);
      totalMinor = safeAdd(totalMinor, amountMinor, "Salary Bank Batch total overflow");
      transfers.push({
        salary_slip: salarySlipName,
        employee: employeeName,
        employee_name: H.requiredText(employee.employee_name, `Employee ${employeeName} employee_name`),
        bank_name: bankName,
        bank_account_no: bankAccountNo,
        amount: fromScaledInt(amountMinor, scale),
      });
    }
    const payrollTotalMinor = typeof payroll.total_net_pay_minor === "number" && Number.isSafeInteger(payroll.total_net_pay_minor)
      ? payroll.total_net_pay_minor
      : toScaledInt(payroll.total_net_pay as string | number, scale, "Payroll Entry total_net_pay");
    if (totalMinor !== payrollTotalMinor) throw errors.reference(`Salary Bank Batch total ${totalMinor} does not reconcile with Payroll Entry ${payrollTotalMinor}`);
    if (context.command.action === "submit") {
      const batches = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (batches.some((batch) => batch.name !== context.command.aggregate.name && batch.docstatus === 1 && H.text(batch.data.payroll_entry) === payrollEntryName)) {
        throw errors.reference(`Payroll Entry ${payrollEntryName} already has a submitted Salary Bank Batch; cancel/amend it instead`);
      }
    }
    return {
      ...input,
      payroll_entry: payrollEntryName,
      company: companyName,
      transfer_date: transferDate,
      bank_account: bankAccount,
      currency,
      employee_count: transfers.length,
      total_amount: fromScaledInt(totalMinor, scale),
      transfers,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Ready for Bank" : super.status(context, context.command.document);
  }
}

export async function loanRepaidMinor(
  context: HrmContext,
  loanName: string,
  scale: number,
  excludeRepaymentName?: string,
  throughDate = H.text(context.command.document.end_date),
): Promise<number> {
  let total = 0;
  const repayments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Employee Loan Repayment");
  for (const repayment of repayments) {
    if (repayment.docstatus !== 1 || repayment.name === excludeRepaymentName || H.text(repayment.data.employee_loan) !== loanName) continue;
    if (throughDate && H.text(repayment.data.posting_date) > throughDate) continue;
    total = safeAdd(total, toScaledInt(repayment.data.amount as string | number, scale, `Employee Loan Repayment ${repayment.name} amount`), "Employee Loan repayment overflow");
  }
  const slips = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Salary Slip");
  for (const slip of slips) {
    if (slip.docstatus !== 1) continue;
    if (throughDate && H.text(slip.data.end_date) > throughDate) continue;
    const trace = parseTrace(H.text(slip.data.rule_trace_json));
    const rows = Array.isArray(trace.employee_loans) ? trace.employee_loans : [];
    for (const raw of rows) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const row = raw as JsonObject;
      if (H.text(row.name) !== loanName) continue;
      const amount = Number(row.amount_minor);
      if (!Number.isSafeInteger(amount) || amount < 0) throw errors.reference(`Salary Slip ${slip.name} has invalid Employee Loan trace`);
      total = safeAdd(total, amount, "Employee Loan repayment overflow");
    }
  }
  return total;
}

function parseTrace(value: string): JsonObject {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {};
  } catch {
    return {};
  }
}

function currencyScale(currency: JsonObject, code: string): number {
  const scale = Number.isInteger(currency.currency_scale) ? Number(currency.currency_scale) : 2;
  if (scale < 0 || scale > 6) throw errors.reference(`Currency ${code} has invalid precision`);
  return scale;
}

function monthsInclusive(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
}

function safeAdd(left: number, right: number, message: string): number {
  const value = Number(BigInt(left) + BigInt(right));
  if (!Number.isSafeInteger(value)) throw errors.validation(message);
  return value;
}

function safeIntegerAdd(left: number, right: number, message: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation(message);
  return value;
}

function safeMultiply(left: number, right: number, message: string): number {
  const value = Number(BigInt(left) * BigInt(right));
  if (!Number.isSafeInteger(value)) throw errors.validation(message);
  return value;
}
