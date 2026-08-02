import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class EmploymentContractController extends SuiteController<JsonObject> {
  readonly doctype = "Employment Contract";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const company = H.requiredText(input.company, "Company");
    const startDate = H.requiredDate(input.start_date, "Contract start_date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, startDate);
    H.assertEmployeeStateActive(employeeState, employeeName, startDate);
    H.assertEmployeeScope(employeeState, company, H.text(input.branch), H.text(input.department));
    const endDate = H.optionalDate(input.end_date, "Contract end_date");
    if (endDate && endDate < startDate) throw errors.validation("Employment Contract end_date must not precede start_date");
    const salary = H.positiveNumber(input.base_salary, "Employment Contract base_salary");

    if (context.command.action === "submit") {
      const contracts = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const contract of contracts) {
        if (contract.name === context.command.aggregate.name || contract.docstatus !== 1) continue;
        if (H.text(contract.data.employee) !== employeeName) continue;
        const otherStart = H.optionalDate(contract.data.start_date, "Existing contract start_date");
        if (!otherStart) continue;
        const otherEnd = H.optionalDate(contract.data.end_date, "Existing contract end_date");
        if (H.rangesOverlap(startDate, endDate, otherStart, otherEnd)) {
          throw errors.reference(`Employee ${employeeName} already has an active contract overlapping this period`);
        }
      }
    }

    return { ...input, company, base_salary: salary };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Active" : super.status(context, context.command.document);
  }
}

export class EmployeeTransferController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Transfer";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const effectiveDate = H.requiredDate(input.effective_date, "Transfer effective_date");
    const previous = await H.resolveEmployeeState(context, employeeName, employee, H.previousDate(effectiveDate), context.command.aggregate.name);
    H.assertEmployeeStateActive(previous, employeeName, effectiveDate);
    const company = H.requiredText(previous.company, "Employee company");
    if (H.text(input.company) && H.text(input.company) !== company) throw errors.reference("Employee Transfer cannot change company");
    const toBranch = H.requiredText(input.to_branch, "Target branch");
    const toDepartment = H.requiredText(input.to_department, "Target department");
    const toCostCenter = H.requiredText(input.to_cost_center, "Target cost center");
    await H.requireRecord(context, "Branch", toBranch);
    await H.requireRecord(context, "Department", toDepartment);
    await H.requireRecord(context, "Cost Center", toCostCenter);
    const newManager = H.text(input.new_reports_to);
    if (newManager === employeeName) throw errors.validation("Employee cannot report to themselves");
    if (newManager) {
      const manager = await H.requireRecord(context, "Employee", newManager);
      const managerState = await H.resolveEmployeeState(context, newManager, manager, effectiveDate);
      H.assertEmployeeStateActive(managerState, newManager, effectiveDate);
      if (H.text(managerState.company) !== company) throw errors.reference("New manager belongs to another company");
    }
    if (context.command.action === "submit") {
      const transfers = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (transfers.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.employee) === employeeName && H.text(item.data.effective_date) === effectiveDate)) {
        throw errors.exists(`Employee ${employeeName} already has a transfer on ${effectiveDate}`);
      }
    }
    return {
      ...input,
      employee: employeeName,
      company,
      effective_date: effectiveDate,
      from_branch: H.requiredText(previous.branch, "Current branch"),
      to_branch: toBranch,
      from_department: H.requiredText(previous.department, "Current department"),
      to_department: toDepartment,
      from_cost_center: H.requiredText(previous.cost_center, "Current cost center"),
      to_cost_center: toCostCenter,
      ...(newManager ? { new_reports_to: newManager } : {}),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Effective" : super.status(context, context.command.document);
  }
}

export class EmployeePromotionController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Promotion";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const effectiveDate = H.requiredDate(input.effective_date, "Promotion effective_date");
    const previous = await H.resolveEmployeeState(context, employeeName, employee, H.previousDate(effectiveDate), context.command.aggregate.name);
    H.assertEmployeeStateActive(previous, employeeName, effectiveDate);
    const company = H.requiredText(previous.company, "Employee company");
    if (H.text(input.company) && H.text(input.company) !== company) throw errors.reference("Employee Promotion cannot change company");
    const target = H.requiredText(input.to_designation, "Target designation");
    await H.requireRecord(context, "Designation", target);
    if (target === H.text(previous.designation)) throw errors.validation("Promotion target designation must differ from the current designation");
    if (context.command.action === "submit") {
      const promotions = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (promotions.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.employee) === employeeName && H.text(item.data.effective_date) === effectiveDate)) {
        throw errors.exists(`Employee ${employeeName} already has a promotion on ${effectiveDate}`);
      }
    }
    return {
      ...input,
      employee: employeeName,
      company,
      effective_date: effectiveDate,
      from_designation: H.requiredText(previous.designation, "Current designation"),
      to_designation: target,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Effective" : super.status(context, context.command.document);
  }
}

export class EmployeeSeparationController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Separation";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const noticeDate = H.requiredDate(input.notice_date, "Separation notice_date");
    const lastWorkingDay = H.requiredDate(input.last_working_day, "Separation last_working_day");
    const effectiveDate = H.requiredDate(input.effective_date, "Separation effective_date");
    if (lastWorkingDay < noticeDate) throw errors.validation("last_working_day must not precede notice_date");
    if (effectiveDate < lastWorkingDay) throw errors.validation("Separation effective_date must not precede last_working_day");
    const state = await H.resolveEmployeeState(context, employeeName, employee, noticeDate, context.command.aggregate.name);
    H.assertEmployeeStateActive(state, employeeName, noticeDate);
    const company = H.requiredText(state.company, "Employee company");
    if (H.text(input.company) && H.text(input.company) !== company) throw errors.reference("Employee Separation belongs to another company");
    if (context.command.action === "submit") {
      const separations = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      if (separations.some((item) => item.name !== context.command.aggregate.name && item.docstatus === 1
        && H.text(item.data.employee) === employeeName)) throw errors.exists(`Employee ${employeeName} already has an active separation record`);
    }
    return { ...input, employee: employeeName, company, notice_date: noticeDate, last_working_day: lastWorkingDay, effective_date: effectiveDate };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Scheduled" : super.status(context, context.command.document);
  }
}

export class EmployeeOnboardingController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Onboarding";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const startDate = H.requiredDate(input.start_date, "Onboarding start_date");
    const dueDate = H.requiredDate(input.expected_completion_date, "Onboarding expected_completion_date");
    if (dueDate < startDate) throw errors.validation("Onboarding completion date must not precede start_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, startDate);
    H.assertEmployeeStateActive(state, employeeName, startDate);
    const ownerEmployee = H.requiredText(input.owner_employee, "Onboarding owner_employee");
    if (ownerEmployee === employeeName) throw errors.validation("Onboarding owner must be another employee");
    const owner = await H.requireRecord(context, "Employee", ownerEmployee);
    const ownerState = await H.resolveEmployeeState(context, ownerEmployee, owner, startDate);
    H.assertEmployeeStateActive(ownerState, ownerEmployee, startDate);
    const checklist = H.parseJsonArray(H.text(input.checklist_json), "Onboarding checklist_json");
    if (checklist.length === 0) throw errors.validation("Onboarding checklist must contain at least one activity");
    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(state.company, "Employee company"),
      branch: H.requiredText(state.branch, "Employee branch"),
      department: H.requiredText(state.department, "Employee department"),
      start_date: startDate,
      expected_completion_date: dueDate,
      owner_employee: ownerEmployee,
      checklist_json: JSON.stringify(checklist),
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "In Progress" : super.status(context, context.command.document);
  }
}

export class JobApplicantController extends SuiteController<JsonObject> {
  readonly doctype = "Job Applicant";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const openingName = H.requiredText(input.job_opening, "Job Opening");
    await H.requireSubmitted(context, "Job Opening", openingName);
    const email = H.requiredEmail(input.email, "Applicant email");
    const applicants = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
    if (applicants.some((item) => item.name !== context.command.aggregate.name && item.docstatus !== 2
      && H.text(item.data.job_opening) === openingName && H.text(item.data.email).toLowerCase() === email.toLowerCase())) {
      throw errors.exists(`Applicant ${email} already exists for Job Opening ${openingName}`);
    }
    return { ...input, job_opening: openingName, email };
  }

  status(context: HrmContext): string {
    return H.text(context.command.document.applicant_status) || "Mới";
  }
}

export class InterviewController extends SuiteController<JsonObject> {
  readonly doctype = "Interview";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const applicantName = H.requiredText(input.job_applicant, "Job Applicant");
    const applicant = await H.requireRecord(context, "Job Applicant", applicantName);
    const openingName = H.requiredText(input.job_opening, "Job Opening");
    if (H.text(applicant.job_opening) !== openingName) throw errors.reference("Interview job opening does not match Job Applicant");
    await H.requireSubmitted(context, "Job Opening", openingName);
    const interviewer = H.requiredText(input.interviewer, "Interviewer");
    const interviewerEmployee = await H.requireRecord(context, "Employee", interviewer);
    const scheduledAt = H.requiredDatetime(input.scheduled_at, "Interview scheduled_at");
    const state = await H.resolveEmployeeState(context, interviewer, interviewerEmployee, scheduledAt.slice(0, 10));
    H.assertEmployeeStateActive(state, interviewer, scheduledAt.slice(0, 10));
    const score = H.numeric(input.score, 0);
    if (score < 0 || score > 100) throw errors.validation("Interview score must be between 0 and 100");
    return { ...input, job_applicant: applicantName, job_opening: openingName, interviewer, scheduled_at: scheduledAt, score };
  }
}

export class JobOfferController extends SuiteController<JsonObject> {
  readonly doctype = "Job Offer";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const applicantName = H.requiredText(input.job_applicant, "Job Applicant");
    const applicant = await H.requireRecord(context, "Job Applicant", applicantName);
    const openingName = H.requiredText(input.job_opening, "Job Opening");
    const opening = await H.requireSubmitted(context, "Job Opening", openingName);
    if (H.text(applicant.job_opening) !== openingName) throw errors.reference("Job Offer job opening does not match Job Applicant");
    const company = H.requiredText(opening.company, "Job Opening company");
    if (H.text(input.company) !== company) throw errors.reference("Job Offer company does not match Job Opening");
    for (const field of ["branch", "department", "designation", "employment_type"] as const) {
      if (H.text(input[field]) !== H.text(opening[field])) throw errors.reference(`Job Offer ${field} does not match Job Opening`);
    }
    const offerDate = H.requiredDate(input.offer_date, "Job Offer offer_date");
    const joiningDate = H.requiredDate(input.joining_date, "Job Offer joining_date");
    const expiryDate = H.requiredDate(input.offer_expiry_date, "Job Offer offer_expiry_date");
    if (joiningDate < offerDate) throw errors.validation("Job Offer joining_date must not precede offer_date");
    if (expiryDate < offerDate) throw errors.validation("Job Offer expiry date must not precede offer_date");
    const salary = H.positiveNumber(input.offered_base_salary, "Job Offer offered_base_salary");
    return { ...input, job_applicant: applicantName, job_opening: openingName, company, offer_date: offerDate, joining_date: joiningDate, offer_expiry_date: expiryDate, offered_base_salary: salary };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class JobOpeningController extends SuiteController<JsonObject> {
  readonly doctype = "Job Opening";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const company = H.requiredText(input.company, "Job Opening company");
    await H.requireRecord(context, "Company", company);
    const branch = H.requiredText(input.branch, "Job Opening branch");
    const branchData = await H.requireRecord(context, "Branch", branch);
    if (H.text(branchData.company) && H.text(branchData.company) !== company) throw errors.reference("Job Opening branch belongs to another company");
    const department = H.requiredText(input.department, "Job Opening department");
    const departmentData = await H.requireRecord(context, "Department", department);
    if (H.text(departmentData.company) && H.text(departmentData.company) !== company) throw errors.reference("Job Opening department belongs to another company");
    if (H.text(departmentData.branch) && H.text(departmentData.branch) !== branch) throw errors.reference("Job Opening department belongs to another branch");
    const designation = H.requiredText(input.designation, "Job Opening designation");
    await H.requireRecord(context, "Designation", designation);
    const employmentType = H.requiredText(input.employment_type, "Job Opening employment_type");
    const type = await H.requireRecord(context, "Employment Type", employmentType);
    if (H.truthy(type.disabled)) throw errors.reference(`Employment Type ${employmentType} is disabled`);
    const headcount = H.integer(input.planned_headcount, 0);
    if (headcount <= 0) throw errors.validation("Job Opening planned_headcount must be positive");
    const targetDate = H.requiredDate(input.target_date, "Job Opening target_date");
    return { ...input, company, branch, department, designation, employment_type: employmentType, planned_headcount: headcount, target_date: targetDate };
  }
}
