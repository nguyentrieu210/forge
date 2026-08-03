import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { GoalController as BaseGoalController } from "./hrm-policy-controllers.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class ExtendedGoalController extends BaseGoalController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const goalType = H.requiredText(normalized.goal_type || "Goal", "Goal goal_type");
    if (!["Goal", "KPI", "OKR Objective", "OKR Key Result"].includes(goalType)) throw errors.validation("Goal goal_type is invalid");
    const parentGoal = H.text(normalized.parent_goal);
    if (goalType === "OKR Key Result") {
      if (!parentGoal) throw errors.validation("OKR Key Result requires parent_goal");
      const parent = await H.requireSubmitted(context, "Goal", parentGoal);
      if (H.text(parent.goal_type) !== "OKR Objective") throw errors.reference(`Goal ${parentGoal} must be an OKR Objective`);
      if (H.text(parent.employee) !== H.text(normalized.employee) || H.text(parent.company) !== H.text(normalized.company)) {
        throw errors.reference(`OKR parent ${parentGoal} belongs to another employee/company`);
      }
      if (H.text(parent.from_date) > H.text(normalized.from_date) || H.text(parent.to_date) < H.text(normalized.to_date)) {
        throw errors.reference(`OKR parent ${parentGoal} does not cover the Key Result period`);
      }
    } else if (parentGoal) {
      throw errors.validation(`${goalType} must not define parent_goal`);
    }
    return { ...normalized, goal_type: goalType, ...(parentGoal ? { parent_goal: parentGoal } : {}) };
  }
}

export class CompetencyController extends SuiteController<JsonObject> {
  readonly doctype = "Competency";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const code = H.requiredText(input.competency_code, "Competency code");
    const name = H.requiredText(input.competency_name, "Competency name");
    const category = H.requiredText(input.category, "Competency category");
    const maxScore = H.integer(input.max_score, 5);
    if (maxScore < 1 || maxScore > 100) throw errors.validation("Competency max_score must be between 1 and 100");
    return { ...input, competency_code: code, competency_name: name, category, max_score: maxScore, disabled: H.truthy(input.disabled) ? 1 : 0 };
  }
}

export class CompetencyAssessmentController extends SuiteController<JsonObject> {
  readonly doctype = "Competency Assessment";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Competency Assessment employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const date = H.requiredDate(input.assessment_date, "Competency Assessment date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, date);
    const reviewer = H.requiredText(input.reviewer, "Competency Assessment reviewer");
    await H.requireRecord(context, "Employee", reviewer);
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw errors.validation("Competency Assessment requires lines");
    const seen = new Set<string>();
    const lines: JsonObject[] = [];
    let scoreTotal = 0;
    let maxTotal = 0;
    for (const [index, raw] of input.lines.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Competency Assessment line ${index + 1} is invalid`);
      const row = raw as JsonObject;
      const competencyName = H.requiredText(row.competency, `Competency Assessment line ${index + 1} competency`);
      if (seen.has(competencyName)) throw errors.validation(`Competency ${competencyName} is duplicated`);
      seen.add(competencyName);
      const competency = await H.requireRecord(context, "Competency", competencyName);
      if (H.truthy(competency.disabled)) throw errors.reference(`Competency ${competencyName} is disabled`);
      const max = H.integer(competency.max_score, 5);
      const score = H.numeric(row.score, NaN);
      if (!Number.isFinite(score) || score < 0 || score > max) throw errors.validation(`Competency ${competencyName} score must be between 0 and ${max}`);
      H.requiredText(row.evidence, `Competency ${competencyName} evidence`);
      scoreTotal += score; maxTotal += max;
      lines.push({ ...row, competency: competencyName, score });
    }
    return { ...input, employee: employeeName, company: H.requiredText(state.company, "Employee company"), reviewer, assessment_date: date, lines, overall_percent: Math.round((scoreTotal / maxTotal) * 10000) / 100 };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, context.command.document); }
}

export class Review360Controller extends SuiteController<JsonObject> {
  readonly doctype = "360 Review";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "360 Review employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const fromDate = H.requiredDate(input.from_date, "360 Review from_date");
    const toDate = H.requiredDate(input.to_date, "360 Review to_date");
    if (toDate < fromDate) throw errors.validation("360 Review to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    if (!Array.isArray(input.reviews) || input.reviews.length < 2) throw errors.validation("360 Review requires at least two reviewers");
    const seen = new Set<string>(); const reviews: JsonObject[] = []; let total = 0;
    for (const [index, raw] of input.reviews.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`360 Review line ${index + 1} is invalid`);
      const row = raw as JsonObject;
      const reviewer = H.requiredText(row.reviewer, `360 Review line ${index + 1} reviewer`);
      if (reviewer === employeeName) throw errors.validation("360 Review reviewer cannot be the employee themself");
      if (seen.has(reviewer)) throw errors.validation(`360 Review reviewer ${reviewer} is duplicated`);
      seen.add(reviewer); await H.requireRecord(context, "Employee", reviewer);
      const relationship = H.requiredText(row.relationship, `360 Review line ${index + 1} relationship`);
      if (!["Manager", "Peer", "Direct Report", "Cross-functional"].includes(relationship)) throw errors.validation("360 Review relationship is invalid");
      const score = H.numeric(row.score, NaN);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw errors.validation("360 Review score must be between 0 and 100");
      H.requiredText(row.comments, `360 Review line ${index + 1} comments`); total += score; reviews.push({ ...row, reviewer, relationship, score });
    }
    return { ...input, employee: employeeName, company: H.requiredText(state.company, "Employee company"), from_date: fromDate, to_date: toDate, reviews, overall_score: Math.round((total / reviews.length) * 100) / 100 };
  }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, context.command.document); }
}

export class TalentPoolController extends SuiteController<JsonObject> {
  readonly doctype = "Talent Pool";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document; const company = H.requiredText(input.company, "Talent Pool company"); await H.requireRecord(context, "Company", company);
    if (!Array.isArray(input.members) || input.members.length === 0) throw errors.validation("Talent Pool requires members");
    const seen = new Set<string>(); const members: JsonObject[] = [];
    for (const [index, raw] of input.members.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Talent Pool member ${index + 1} is invalid`);
      const row = raw as JsonObject; const employeeName = H.requiredText(row.employee, `Talent Pool member ${index + 1} employee`);
      if (seen.has(employeeName)) throw errors.validation(`Talent Pool employee ${employeeName} is duplicated`); seen.add(employeeName);
      const employee = await H.requireRecord(context, "Employee", employeeName); if (H.text(employee.company) !== company) throw errors.reference(`Employee ${employeeName} belongs to another company`);
      const potential = score100(row.potential_score, "Talent Pool potential_score"); const performance = score100(row.performance_score, "Talent Pool performance_score");
      const readiness = H.requiredText(row.readiness, "Talent Pool readiness"); if (!["Ready now", "< 1 year", "1-2 years", "Developing"].includes(readiness)) throw errors.validation("Talent Pool readiness is invalid");
      members.push({ ...row, employee: employeeName, potential_score: potential, performance_score: performance, readiness });
    }
    return { ...input, company, members, member_count: members.length };
  }
}

export class SuccessionPlanController extends SuiteController<JsonObject> {
  readonly doctype = "Succession Plan";
  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document; const company = H.requiredText(input.company, "Succession Plan company"); const branch = H.requiredText(input.branch, "Succession Plan branch"); const department = H.requiredText(input.department, "Succession Plan department"); const designation = H.requiredText(input.designation, "Succession Plan designation");
    await H.requireRecord(context, "Company", company); const branchData = await H.requireRecord(context, "Branch", branch); const deptData = await H.requireRecord(context, "Department", department); await H.requireRecord(context, "Designation", designation);
    if (H.text(branchData.company) && H.text(branchData.company) !== company) throw errors.reference("Succession Plan branch belongs to another company"); if (H.text(deptData.company) && H.text(deptData.company) !== company) throw errors.reference("Succession Plan department belongs to another company");
    const incumbent = H.text(input.incumbent); if (incumbent) { const emp = await H.requireRecord(context, "Employee", incumbent); if (H.text(emp.company) !== company) throw errors.reference("Succession Plan incumbent belongs to another company"); }
    const reviewDate = H.requiredDate(input.review_date, "Succession Plan review_date"); if (!Array.isArray(input.candidates) || input.candidates.length === 0) throw errors.validation("Succession Plan requires candidates");
    const seen = new Set<string>(); const priorities = new Set<number>(); const candidates: JsonObject[] = [];
    for (const [index, raw] of input.candidates.entries()) { if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Succession candidate ${index + 1} is invalid`); const row = raw as JsonObject; const employeeName = H.requiredText(row.employee, `Succession candidate ${index + 1} employee`); if (employeeName === incumbent) throw errors.validation("Succession candidate cannot be the incumbent"); if (seen.has(employeeName)) throw errors.validation(`Succession candidate ${employeeName} is duplicated`); seen.add(employeeName); const emp = await H.requireRecord(context, "Employee", employeeName); if (H.text(emp.company) !== company) throw errors.reference(`Succession candidate ${employeeName} belongs to another company`); const priority = H.integer(row.priority, 0); if (priority < 1 || priorities.has(priority)) throw errors.validation("Succession candidate priority must be positive and unique"); priorities.add(priority); candidates.push({ ...row, employee: employeeName, priority }); }
    return { ...input, company, branch, department, designation, ...(incumbent ? { incumbent } : {}), review_date: reviewDate, candidates, candidate_count: candidates.length };
  }
}

export class TrainingCourseController extends SuiteController<JsonObject> {
  readonly doctype = "Training Course";
  async normalize(context: HrmContext): Promise<JsonObject> { const input = context.command.document; const duration = H.numeric(input.duration_hours, NaN); if (!Number.isFinite(duration) || duration <= 0) throw errors.validation("Training Course duration_hours must be positive"); const passing = score100(input.passing_score, "Training Course passing_score"); const validity = H.integer(input.validity_months, 0); if (validity < 0 || validity > 1200) throw errors.validation("Training Course validity_months is invalid"); return { ...input, duration_hours: duration, passing_score: passing, validity_months: validity, disabled: H.truthy(input.disabled) ? 1 : 0 }; }
}

export class TrainingAssessmentController extends SuiteController<JsonObject> {
  readonly doctype = "Training Assessment";
  async normalize(context: HrmContext): Promise<JsonObject> { const input = context.command.document; const employeeName = H.requiredText(input.employee, "Training Assessment employee"); const employee = await H.requireRecord(context, "Employee", employeeName); const courseName = H.requiredText(input.course, "Training Assessment course"); const course = await H.requireRecord(context, "Training Course", courseName); if (H.truthy(course.disabled)) throw errors.reference(`Training Course ${courseName} is disabled`); const date = H.requiredDate(input.assessment_date, "Training Assessment date"); const state = await H.resolveEmployeeState(context, employeeName, employee, date); const score = score100(input.score, "Training Assessment score"); const passing = score100(course.passing_score, `Training Course ${courseName} passing_score`); const eventName = H.text(input.training_event); if (eventName) { const event = await H.requireSubmitted(context, "Training Event", eventName); if (H.text(event.company) !== H.text(state.company)) throw errors.reference(`Training Event ${eventName} belongs to another company`); } return { ...input, employee: employeeName, company: H.requiredText(state.company, "Employee company"), course: courseName, ...(eventName ? { training_event: eventName } : {}), assessment_date: date, score, result: score >= passing ? "Pass" : "Fail" }; }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? H.text(context.command.document.result) || "Completed" : super.status(context, context.command.document); }
}

export class EmployeeCertificateController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Certificate";
  async normalize(context: HrmContext): Promise<JsonObject> { const input = context.command.document; const employeeName = H.requiredText(input.employee, "Employee Certificate employee"); const employee = await H.requireRecord(context, "Employee", employeeName); const assessmentName = H.requiredText(input.assessment, "Employee Certificate assessment"); const assessment = await H.requireSubmitted(context, "Training Assessment", assessmentName); if (H.text(assessment.employee) !== employeeName || H.text(assessment.result) !== "Pass") throw errors.reference(`Training Assessment ${assessmentName} is not a passed assessment for ${employeeName}`); const courseName = H.requiredText(input.course, "Employee Certificate course"); if (H.text(assessment.course) !== courseName) throw errors.reference(`Training Assessment ${assessmentName} belongs to another course`); const course = await H.requireRecord(context, "Training Course", courseName); const issueDate = H.requiredDate(input.issue_date, "Employee Certificate issue_date"); let expiryDate = H.optionalDate(input.expiry_date, "Employee Certificate expiry_date"); const validity = H.integer(course.validity_months, 0); if (!expiryDate && validity > 0) expiryDate = addMonthsClamped(issueDate, validity); if (expiryDate && expiryDate < issueDate) throw errors.validation("Employee Certificate expiry_date must not precede issue_date"); const today = context.now.slice(0, 10); return { ...input, employee: employeeName, company: H.requiredText(employee.company, "Employee company"), course: courseName, assessment: assessmentName, issue_date: issueDate, ...(expiryDate ? { expiry_date: expiryDate } : {}), certificate_status: !expiryDate ? "Không thời hạn" : expiryDate < today ? "Hết hạn" : "Còn hiệu lực" }; }
  status(context: HrmContext): string { return nextDocStatus(context.command.action) === 1 ? "Issued" : super.status(context, context.command.document); }
}

function score100(value: unknown, field: string): number { const score = H.numeric(value, NaN); if (!Number.isFinite(score) || score < 0 || score > 100) throw errors.validation(`${field} must be between 0 and 100`); return score; }
function addMonthsClamped(value: string, months: number): string { const source = new Date(`${value}T00:00:00Z`); const monthIndex = source.getUTCMonth() + months; const year = source.getUTCFullYear() + Math.floor(monthIndex / 12); const month = ((monthIndex % 12) + 12) % 12; const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), last))).toISOString().slice(0, 10); }
