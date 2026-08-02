import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import {
  AppraisalController as BaseAppraisalController,
  PayrollPeriodController as BasePayrollPeriodController,
  SalaryStructureAssignmentController as BaseSalaryStructureAssignmentController,
} from "./hrm-benefit-controllers.js";
import * as H from "./hrm-shared.js";
import { evaluatePayrollRuleFormula, inspectPayrollRuleFormula, payrollRuleInputRowsToObject } from "./hrm-payroll-rule.js";

type HrmContext = H.HrmContext;

export class HrmSalaryStructureAssignmentController extends BaseSalaryStructureAssignmentController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const structureName = H.requiredText(normalized.salary_structure, "Salary Structure");
    const structure = await H.requireSubmitted(context, "Salary Structure", structureName);
    const fromDate = H.requiredDate(normalized.from_date, "Salary assignment from_date");
    const toDate = H.optionalDate(normalized.to_date, "Salary assignment to_date");
    const structureFrom = H.requiredDate(structure.effective_from, "Salary Structure effective_from");
    const structureTo = H.optionalDate(structure.effective_to, "Salary Structure effective_to");
    if (fromDate < structureFrom || (structureTo && (toDate ?? fromDate) > structureTo)) throw errors.reference(`Salary Structure ${structureName} does not cover the assignment period`);
    if (H.text(structure.payroll_rule) !== H.text(normalized.payroll_rule)) throw errors.reference("Salary Structure Assignment payroll_rule must match Salary Structure");
    if (H.text(structure.holiday_list) !== H.text(normalized.holiday_list)) throw errors.reference("Salary Structure Assignment holiday_list must match Salary Structure");
    if (H.text(structure.payroll_payable_account) !== H.text(normalized.payable_account)) throw errors.reference("Salary Structure Assignment payable_account must match Salary Structure");
    const payrollRule = await H.requireRecord(context, "VN Payroll Rule", H.requiredText(normalized.payroll_rule, "VN Payroll Rule"));
    if (fromDate < H.requiredDate(payrollRule.effective_from, "Payroll rule effective_from")
      || (H.text(payrollRule.effective_to) && (toDate ?? fromDate) > H.requiredDate(payrollRule.effective_to, "Payroll rule effective_to"))) {
      throw errors.reference(`VN Payroll Rule ${normalized.payroll_rule} is not effective for the assignment period`);
    }
    const currency = H.requiredText(structure.currency, "Salary Structure currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const currencyScale = Number.isInteger(currencyData.currency_scale) ? Number(currencyData.currency_scale) : 2;
    if (currencyScale < 0 || currencyScale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);
    evaluatePayrollRuleFormula(H.requiredText(payrollRule.formula_json, "VN Payroll Rule formula_json"), {
      currency,
      currencyScale,
      baseSalaryMinor: toScaledInt(normalized.base_salary as string | number, currencyScale, "Salary assignment base_salary"),
      grossEarningsMinor: 0,
      preRuleDeductionsMinor: 0,
      workingDays: 1,
      paymentHalfUnits: 2,
      statutoryInputs: payrollRuleInputRowsToObject(normalized.statutory_inputs),
    });
    return normalized;
  }
}

export class HrmPayrollPeriodController extends BasePayrollPeriodController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const branch = H.text(normalized.branch);
    if (branch) {
      const branchData = await H.requireRecord(context, "Branch", branch);
      if (H.text(branchData.company) && H.text(branchData.company) !== H.text(normalized.company)) throw errors.reference("Payroll Period branch belongs to another company");
    }
    return normalized;
  }
}

export class HrmAppraisalController extends BaseAppraisalController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const employeeName = H.requiredText(context.command.document.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);
    return super.normalize(context);
  }
}

export class SalaryStructureController extends SuiteController<JsonObject> {
  readonly doctype = "Salary Structure";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const companyName = H.requiredText(input.company, "Salary Structure company");
    const company = await H.requireRecord(context, "Company", companyName);
    const currency = H.requiredText(input.currency, "Salary Structure currency");
    if (H.text(company.default_currency) && H.text(company.default_currency) !== currency) throw errors.reference("Salary Structure currency must match the company default currency");
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const currencyScale = Number.isInteger(currencyData.currency_scale) ? Number(currencyData.currency_scale) : 2;
    if (currencyScale < 0 || currencyScale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);
    const fromDate = H.requiredDate(input.effective_from, "Salary Structure effective_from");
    const toDate = H.optionalDate(input.effective_to, "Salary Structure effective_to");
    if (toDate && toDate < fromDate) throw errors.validation("Salary Structure effective_to must not precede effective_from");
    const payrollRuleName = H.requiredText(input.payroll_rule, "Salary Structure payroll_rule");
    const payrollRule = await H.requireRecord(context, "VN Payroll Rule", payrollRuleName);
    if (H.truthy(payrollRule.disabled)) throw errors.reference(`VN Payroll Rule ${payrollRuleName} is disabled`);
    const ruleFormula = inspectPayrollRuleFormula(H.requiredText(payrollRule.formula_json, `VN Payroll Rule ${payrollRuleName} formula_json`), currency, currencyScale);
    const payable = H.requiredText(input.payroll_payable_account, "Salary Structure payroll_payable_account");
    await H.requireRecord(context, "Account", payable);
    const costCenter = H.requiredText(input.default_cost_center, "Salary Structure default_cost_center");
    await H.requireRecord(context, "Cost Center", costCenter);
    const holidayList = H.requiredText(input.holiday_list, "Salary Structure holiday_list");
    const holiday = await H.requireSubmitted(context, "Holiday List", holidayList);
    if (H.text(holiday.company) !== companyName) throw errors.reference("Salary Structure Holiday List belongs to another company");
    if (!Array.isArray(input.components) || input.components.length === 0) throw errors.validation("Salary Structure requires at least one component");
    const seen = new Set<string>();
    const components: JsonObject[] = [];
    for (const [index, value] of input.components.entries()) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`Salary Structure component ${index + 1} is invalid`);
      const row = value as JsonObject;
      const componentName = H.requiredText(row.salary_component, `Salary Structure component ${index + 1}`);
      if (seen.has(componentName)) throw errors.validation(`Salary Component ${componentName} is duplicated`);
      seen.add(componentName);
      const component = await H.requireRecord(context, "Salary Component", componentName);
      if (!["Earning", "Deduction"].includes(H.text(component.type))) throw errors.reference(`Salary Component ${componentName} has invalid type`);
      const amountType = H.requiredText(row.amount_type, `${componentName} amount_type`);
      if (amountType === "Fixed") {
        const amount = H.numeric(row.amount, NaN);
        if (!Number.isFinite(amount) || amount < 0) throw errors.validation(`${componentName} amount cannot be negative`);
      } else if (amountType === "Percent of Base") {
        const pct = H.numeric(row.percentage, NaN);
        if (!Number.isFinite(pct) || pct < 0) throw errors.validation(`${componentName} percentage must be non-negative`);
      } else if (amountType === "Payroll Rule Output") {
        const outputKey = H.requiredText(row.rule_output_key, `${componentName} rule_output_key`);
        if (!ruleFormula.outputKeys.has(outputKey)) throw errors.reference(`Payroll rule output ${outputKey} does not exist`);
        if (ruleFormula.outputTypes.get(outputKey) !== "amount") throw errors.reference(`Payroll rule output ${outputKey} must be an amount`);
      } else throw errors.validation(`${componentName} amount_type is invalid`);
      const account = H.text(row.account) || H.requiredText(component.account, `Salary Component ${componentName} account`);
      await H.requireRecord(context, "Account", account);
      const rowCostCenter = H.text(row.cost_center) || costCenter;
      await H.requireRecord(context, "Cost Center", rowCostCenter);
      components.push({ ...row, salary_component: componentName, account, cost_center: rowCostCenter });
    }
    return { ...input, company: companyName, currency, effective_from: fromDate, ...(toDate ? { effective_to: toDate } : {}), payroll_rule: payrollRuleName, payroll_payable_account: payable, default_cost_center: costCenter, holiday_list: holidayList, components };
  }
}

export class GoalController extends SuiteController<JsonObject> {
  readonly doctype = "Goal";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Goal employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);
    const fromDate = H.requiredDate(input.from_date, "Goal from_date");
    const toDate = H.requiredDate(input.to_date, "Goal to_date");
    if (toDate < fromDate) throw errors.validation("Goal to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const weight = H.numeric(input.weight, NaN);
    const progress = H.numeric(input.progress, 0);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw errors.validation("Goal weight must be between 0 and 100");
    if (progress < 0 || progress > 100) throw errors.validation("Goal progress must be between 0 and 100");
    return { ...input, employee: employeeName, company: H.requiredText(state.company, "Employee company"), from_date: fromDate, to_date: toDate, weight, progress };
  }
}
