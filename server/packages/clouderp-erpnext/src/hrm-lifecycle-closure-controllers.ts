import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class HiringCompletionController extends SuiteController<JsonObject> {
  readonly doctype = "Hiring Completion";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const offerName = H.requiredText(input.job_offer, "Job Offer");
    const offer = await H.requireSubmitted(context, "Job Offer", offerName);
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const joiningDate = H.requiredDate(offer.joining_date, "Job Offer joining_date");
    const company = H.requiredText(offer.company, "Job Offer company");
    const branch = H.requiredText(offer.branch, "Job Offer branch");
    const department = H.requiredText(offer.department, "Job Offer department");

    const expectedEmployeeFields: Array<[string, string]> = [
      ["company", company],
      ["branch", branch],
      ["department", department],
      ["designation", H.requiredText(offer.designation, "Job Offer designation")],
      ["employment_type", H.requiredText(offer.employment_type, "Job Offer employment_type")],
      ["date_of_joining", joiningDate],
    ];
    for (const [field, expected] of expectedEmployeeFields) {
      if (H.text(employee[field]) !== expected) {
        throw errors.reference(`Employee ${employeeName} ${field} does not match Job Offer ${offerName}`);
      }
    }

    const contractName = H.requiredText(input.employment_contract, "Employment Contract");
    const contract = await H.requireSubmitted(context, "Employment Contract", contractName);
    if (H.text(contract.employee) !== employeeName || H.text(contract.company) !== company
      || H.text(contract.branch) !== branch || H.text(contract.department) !== department) {
      throw errors.reference(`Employment Contract ${contractName} does not match the hired employee scope`);
    }
    if (H.requiredDate(contract.start_date, "Employment Contract start_date") !== joiningDate) {
      throw errors.reference(`Employment Contract ${contractName} must start on Job Offer joining_date`);
    }
    const currency = H.requiredText(offer.currency, "Job Offer currency");
    if (H.text(contract.salary_currency) !== currency) {
      throw errors.reference(`Employment Contract ${contractName} salary currency does not match Job Offer ${offerName}`);
    }
    const currencyData = await H.requireRecord(context, "Currency", currency);
    const scale = Number.isInteger(currencyData.currency_scale) ? Number(currencyData.currency_scale) : 2;
    if (scale < 0 || scale > 6) throw errors.reference(`Currency ${currency} has invalid precision`);
    const offeredMinor = toScaledInt(offer.offered_base_salary as string | number, scale, "Job Offer offered_base_salary");
    const contractMinor = toScaledInt(contract.base_salary as string | number, scale, "Employment Contract base_salary");
    if (offeredMinor !== contractMinor) {
      throw errors.reference(`Employment Contract ${contractName} salary does not match Job Offer ${offerName}`);
    }

    const onboardingName = H.requiredText(input.employee_onboarding, "Employee Onboarding");
    const onboarding = await H.requireSubmitted(context, "Employee Onboarding", onboardingName);
    if (H.text(onboarding.employee) !== employeeName || H.text(onboarding.company) !== company
      || H.text(onboarding.branch) !== branch || H.text(onboarding.department) !== department) {
      throw errors.reference(`Employee Onboarding ${onboardingName} does not match the hired employee scope`);
    }
    if (H.requiredDate(onboarding.start_date, "Employee Onboarding start_date") !== joiningDate) {
      throw errors.reference(`Employee Onboarding ${onboardingName} must start on Job Offer joining_date`);
    }

    const completionDate = H.requiredDate(input.completion_date, "Hiring completion_date");
    if (completionDate < joiningDate) throw errors.validation("Hiring completion_date must not precede joining_date");

    if (context.command.action === "submit") {
      const completions = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (completions.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && (H.text(item.data.job_offer) === offerName || H.text(item.data.employee) === employeeName))) {
        throw errors.exists(`Hiring completion already exists for Job Offer ${offerName} or Employee ${employeeName}`);
      }
    }

    return {
      ...input,
      job_offer: offerName,
      employee: employeeName,
      employment_contract: contractName,
      employee_onboarding: onboardingName,
      company,
      branch,
      department,
      joining_date: joiningDate,
      completion_date: completionDate,
      lineage_snapshot_json: JSON.stringify({
        job_offer: offerName,
        job_applicant: H.text(offer.job_applicant),
        job_opening: H.text(offer.job_opening),
        employee: employeeName,
        employment_contract: contractName,
        employee_onboarding: onboardingName,
        joining_date: joiningDate,
        offered_base_salary_minor: offeredMinor,
        salary_currency: currency,
        employment_cycle: "one Employee record per hire cycle",
      }),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, context.command.document);
  }
}

export class EmployeeFinalSettlementController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Final Settlement";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const separationName = H.requiredText(input.separation, "Employee Separation");
    const separation = await H.requireSubmitted(context, "Employee Separation", separationName);
    if (H.text(separation.employee) !== employeeName) {
      throw errors.reference(`Employee Separation ${separationName} belongs to another employee`);
    }
    if (H.text(separation.clearance_status) !== "Hoàn tất") {
      throw errors.reference(`Employee Separation ${separationName} clearance must be completed before final settlement`);
    }
    const company = H.requiredText(separation.company, "Employee Separation company");
    const lastWorkingDay = H.requiredDate(separation.last_working_day, "Employee Separation last_working_day");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, lastWorkingDay, separationName);
    if (H.text(employeeState.company) !== company) throw errors.reference("Employee Separation company does not match employee state");
    const settlementDate = H.requiredDate(input.settlement_date, "Final settlement_date");
    if (settlementDate < lastWorkingDay) throw errors.validation("Final settlement_date must not precede last_working_day");

    const finalSlipName = H.requiredText(input.final_salary_slip, "Final Salary Slip");
    const finalSlip = await H.requireSubmitted(context, "Salary Slip", finalSlipName);
    if (H.text(finalSlip.employee) !== employeeName || H.text(finalSlip.company) !== company) {
      throw errors.reference(`Salary Slip ${finalSlipName} does not belong to this employee/company`);
    }
    const slipStart = H.requiredDate(finalSlip.start_date, "Final Salary Slip start_date");
    const slipEnd = H.requiredDate(finalSlip.end_date, "Final Salary Slip end_date");
    if (lastWorkingDay < slipStart || lastWorkingDay > slipEnd) {
      throw errors.reference(`Salary Slip ${finalSlipName} does not cover the employee last working day`);
    }

    const advances = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Employee Advance");
    const unsettled = advances.filter((item) => item.docstatus === 1
      && H.text(item.data.employee) === employeeName
      && Boolean(H.text(item.data.payment_entry))
      && !H.text(item.data.settlement_ref));
    const unsettledDetails = unsettled.map((item) => ({
      name: item.name,
      amount: item.data.advance_amount,
      currency: H.text(item.data.currency),
      payment_entry: H.text(item.data.payment_entry),
    }));

    if (context.command.action === "submit" && unsettled.length > 0) {
      throw errors.reference(`Employee ${employeeName} has ${unsettled.length} paid advance(s) not yet settled`);
    }
    if (context.command.action === "submit") {
      const settlements = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (settlements.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.separation) === separationName)) {
        throw errors.exists(`Final settlement already exists for Employee Separation ${separationName}`);
      }
    }

    return {
      ...input,
      employee: employeeName,
      separation: separationName,
      company,
      branch: H.text(employeeState.branch),
      last_working_day: lastWorkingDay,
      settlement_date: settlementDate,
      final_salary_slip: finalSlipName,
      unsettled_advance_count: unsettled.length,
      unsettled_advances_json: JSON.stringify(unsettledDetails),
      settlement_snapshot_json: JSON.stringify({
        separation: separationName,
        employee: employeeName,
        company,
        branch: H.text(employeeState.branch),
        last_working_day: lastWorkingDay,
        final_salary_slip: finalSlipName,
        salary_slip_period: { start_date: slipStart, end_date: slipEnd },
        unsettled_advances: unsettledDetails,
        employee_loan_exit_policy: "not_auto_settled_by_ws06_without_business_policy",
      }),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Settled" : super.status(context, context.command.document);
  }
}
