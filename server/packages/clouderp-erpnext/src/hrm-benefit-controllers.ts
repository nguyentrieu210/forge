import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class SalaryStructureAssignmentController extends SuiteController<JsonObject> {
  readonly doctype = "Salary Structure Assignment";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const company = H.requiredText(input.company, "Company");

    const structureName = H.requiredText(input.salary_structure, "Salary Structure");
    const structure = await H.requireSubmitted(context, "Salary Structure", structureName);
    if (H.text(structure.company) !== company) throw errors.reference(`Salary Structure ${structureName} belongs to another company`);

    const payrollRuleName = H.requiredText(input.payroll_rule, "VN Payroll Rule");
    const payrollRule = await H.requireRecord(context, "VN Payroll Rule", payrollRuleName);
    if (H.truthy(payrollRule.disabled)) throw errors.reference(`VN Payroll Rule ${payrollRuleName} is disabled`);

    const fromDate = H.requiredDate(input.from_date, "Salary assignment from_date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(employeeState, employeeName, fromDate);
    H.assertEmployeeScope(employeeState, company, H.text(input.branch), H.text(input.department));
    const toDate = H.optionalDate(input.to_date, "Salary assignment to_date");
    if (toDate && toDate < fromDate) throw errors.validation("Salary Structure Assignment to_date must not precede from_date");
    if (fromDate < H.requiredDate(payrollRule.effective_from, "Payroll rule effective_from")
      || (H.text(payrollRule.effective_to) && fromDate > H.requiredDate(payrollRule.effective_to, "Payroll rule effective_to"))) {
      throw errors.reference(`VN Payroll Rule ${payrollRuleName} is not effective on ${fromDate}`);
    }
    const baseSalary = H.positiveNumber(input.base_salary, "Salary assignment base_salary");

    if (context.command.action === "submit") {
      const assignments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const assignment of assignments) {
        if (assignment.name === context.command.aggregate.name || assignment.docstatus !== 1) continue;
        if (H.text(assignment.data.employee) !== employeeName) continue;
        const otherStart = H.optionalDate(assignment.data.from_date, "Existing salary assignment from_date");
        if (!otherStart) continue;
        const otherEnd = H.optionalDate(assignment.data.to_date, "Existing salary assignment to_date");
        if (H.rangesOverlap(fromDate, toDate, otherStart, otherEnd)) {
          throw errors.reference(`Employee ${employeeName} already has a Salary Structure Assignment overlapping this period`);
        }
      }
    }

    return {
      ...input,
      employee: employeeName,
      company,
      salary_structure: structureName,
      payroll_rule: payrollRuleName,
      base_salary: baseSalary,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, context.command.document);
  }
}

export class PayrollPeriodController extends SuiteController<JsonObject> {
  readonly doctype = "Payroll Period";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const company = H.requiredText(input.company, "Payroll Period company");
    await H.requireRecord(context, "Company", company);
    const branch = H.text(input.branch);
    if (branch) await H.requireRecord(context, "Branch", branch);
    const startDate = H.requiredDate(input.start_date, "Payroll Period start_date");
    const endDate = H.requiredDate(input.end_date, "Payroll Period end_date");
    const payDate = H.requiredDate(input.pay_date, "Payroll Period pay_date");
    if (endDate < startDate) throw errors.validation("Payroll Period end_date must not precede start_date");
    if (payDate < endDate) throw errors.validation("Payroll Period pay_date must not precede end_date");
    if (context.command.action === "submit") {
      const periods = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (periods.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.company) === company && H.text(item.data.branch) === branch
        && H.rangesOverlap(startDate, endDate, H.text(item.data.start_date), H.text(item.data.end_date)))) {
        throw errors.reference(`Payroll Period overlaps an existing period for ${company}${branch ? ` / ${branch}` : ""}`);
      }
    }
    return { ...input, company, ...(branch ? { branch } : {}), start_date: startDate, end_date: endDate, pay_date: payDate, locked: context.command.action === "submit" ? 1 : 0 };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Locked" : super.status(context, context.command.document);
  }
}

export class AdditionalSalaryController extends SuiteController<JsonObject> {
  readonly doctype = "Additional Salary";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const payrollDate = H.requiredDate(input.payroll_date, "Additional Salary payroll_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, payrollDate);
    H.assertEmployeeStateActive(state, employeeName, payrollDate);
    const company = H.requiredText(input.company, "Additional Salary company");
    if (company !== H.text(state.company)) throw errors.reference("Additional Salary belongs to another company");
    const componentName = H.requiredText(input.salary_component, "Salary Component");
    const component = await H.requireRecord(context, "Salary Component", componentName);
    if (!['Earning', 'Deduction'].includes(H.text(component.type))) throw errors.reference(`Salary Component ${componentName} has invalid type`);
    const amount = H.positiveNumber(input.amount, "Additional Salary amount");
    const recurring = H.truthy(input.is_recurring);
    const fromDate = recurring ? H.requiredDate(input.from_date || payrollDate, "Additional Salary from_date") : undefined;
    const toDate = recurring ? H.optionalDate(input.to_date, "Additional Salary to_date") : undefined;
    if (fromDate && toDate && toDate < fromDate) throw errors.validation("Additional Salary to_date must not precede from_date");
    return { ...input, employee: employeeName, company, payroll_date: payrollDate, salary_component: componentName, amount, is_recurring: recurring ? 1 : 0, ...(fromDate ? { from_date: fromDate } : {}), ...(toDate ? { to_date: toDate } : {}) };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class TravelRequestController extends SuiteController<JsonObject> {
  readonly doctype = "Travel Request";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);
    const fromDate = H.requiredDate(input.from_date, "Travel from_date");
    const toDate = H.requiredDate(input.to_date, "Travel to_date");
    if (toDate < fromDate) throw errors.validation("Travel to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const amount = H.positiveNumber(input.estimated_amount, "Travel estimated_amount");
    const advanceName = H.text(input.employee_advance);
    if (advanceName) {
      const advance = await H.requireSubmitted(context, "Employee Advance", advanceName);
      if (H.text(advance.employee) !== employeeName || H.text(advance.company) !== H.text(state.company)) {
        throw errors.reference(`Employee Advance ${advanceName} does not belong to this employee/company`);
      }
    }
    const claimName = H.text(input.expense_claim);
    if (claimName) {
      const claim = await H.requireSubmitted(context, "Expense Claim", claimName);
      if (H.text(claim.employee) && H.text(claim.employee) !== employeeName) throw errors.reference(`Expense Claim ${claimName} belongs to another employee`);
    }
    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(state.company, "Employee company"),
      branch: H.requiredText(state.branch, "Employee branch"),
      from_date: fromDate,
      to_date: toDate,
      estimated_amount: amount,
      currency: H.requiredText(input.currency, "Travel currency"),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class AppraisalController extends SuiteController<JsonObject> {
  readonly doctype = "Appraisal";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const fromDate = H.requiredDate(input.from_date, "Appraisal from_date");
    const toDate = H.requiredDate(input.to_date, "Appraisal to_date");
    if (toDate < fromDate) throw errors.validation("Appraisal to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const reviewer = H.requiredText(input.reviewer, "Appraisal reviewer");
    if (reviewer === employeeName) throw errors.validation("Appraisal reviewer must be another employee");
    const reviewerEmployee = await H.requireRecord(context, "Employee", reviewer);
    const reviewerState = await H.resolveEmployeeState(context, reviewer, reviewerEmployee, fromDate);
    H.assertEmployeeStateActive(reviewerState, reviewer, fromDate);
    const selfScore = H.boundedScore(input.self_score, "self_score");
    const managerScore = H.boundedScore(input.manager_score, "manager_score");
    const finalScore = managerScore ?? selfScore ?? 0;
    return { ...input, employee: employeeName, company: H.requiredText(state.company, "Employee company"), from_date: fromDate, to_date: toDate, reviewer, ...(selfScore !== undefined ? { self_score: selfScore } : {}), ...(managerScore !== undefined ? { manager_score: managerScore } : {}), final_score: finalScore };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Finalized" : super.status(context, context.command.document);
  }
}

export class TrainingEventController extends SuiteController<JsonObject> {
  readonly doctype = "Training Event";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const company = H.requiredText(input.company, "Training company");
    const fromDate = H.requiredDate(input.from_date, "Training from_date");
    const toDate = H.requiredDate(input.to_date, "Training to_date");
    if (toDate < fromDate) throw errors.validation("Training to_date must not precede from_date");
    const participants = H.parseStringArray(H.text(input.participants_json), "Training participants_json");
    if (participants.length === 0) throw errors.validation("Training Event requires at least one participant");
    if (new Set(participants).size !== participants.length) throw errors.validation("Training Event participants must be unique");
    for (const employeeName of participants) {
      const employee = await H.requireRecord(context, "Employee", employeeName);
      const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
      H.assertEmployeeStateActive(state, employeeName, fromDate);
      if (H.text(state.company) !== company) throw errors.reference(`Training participant ${employeeName} belongs to another company`);
    }
    const cost = H.numeric(input.cost, 0);
    if (cost < 0) throw errors.validation("Training cost cannot be negative");
    if (cost > 0 && !H.text(input.currency)) throw errors.validation("Training currency is required when cost is entered");
    return { ...input, company, from_date: fromDate, to_date: toDate, participants_json: JSON.stringify(participants), cost };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, context.command.document);
  }
}

export class EmployeeAdvanceController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Advance";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);

    const postingDate = H.requiredDate(input.posting_date, "Employee Advance posting_date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, postingDate);
    H.assertEmployeeStateActive(employeeState, employeeName, postingDate);
    const amount = H.positiveNumber(input.advance_amount, "Employee Advance amount");
    const repayFromSalary = H.truthy(input.repay_from_salary);
    if (repayFromSalary && H.integer(input.repay_months, 0) <= 0) {
      throw errors.validation("repay_months must be positive when repay_from_salary is enabled");
    }
    const paymentEntry = H.text(input.payment_entry);
    if (paymentEntry) {
      const payment = await H.requireSubmitted(context, "Payment Entry", paymentEntry);
      if (H.text(payment.party_type) && H.text(payment.party_type) !== "Employee") {
        throw errors.reference(`Payment Entry ${paymentEntry} is not an Employee payment`);
      }
      if (H.text(payment.party) && H.text(payment.party) !== employeeName) {
        throw errors.reference(`Payment Entry ${paymentEntry} belongs to another employee`);
      }
    }

    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(employeeState.company, "Employee company"),
      branch: H.requiredText(employeeState.branch, "Employee branch"),
      posting_date: postingDate,
      advance_amount: amount,
    };
  }

  status(context: HrmContext): string {
    if (nextDocStatus(context.command.action) !== 1) return super.status(context, context.command.document);
    return H.text(context.command.document.payment_entry) ? "Paid" : "Approved";
  }
}
