import test from "node:test";
import assert from "node:assert/strict";
import { EmployeeDisciplineController, PersonnelDocumentController } from "../dist/packages/clouderp-erpnext/src/hrm-personnel-controllers.js";
import { CompetencyAssessmentController, EmployeeCertificateController, ExtendedGoalController, Review360Controller, SuccessionPlanController, TalentPoolController, TrainingAssessmentController } from "../dist/packages/clouderp-erpnext/src/hrm-talent-controllers.js";

function document(name, data, docstatus = 1, version = 1) { return { name, docstatus, version, data }; }
function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) { return Object.entries(documents).filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value); },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}
function context(doctype, name, action, data, reader, now = "2026-08-03T00:00:00Z") { return { command: { tenant_id: "demo", aggregate: { doctype, name }, action, actor: { user_id: "hr@example.test", roles: ["HR Manager"] }, document: data }, reader, existing: null, nextVersion: 1, now }; }

const employeeMasters = {
  "Employee:EMP-1": { employee_status: "Đang làm việc", employee_name: "A", company: "Demo", branch: "BR-A", department: "OPS" },
  "Employee:EMP-2": { employee_status: "Đang làm việc", employee_name: "B", company: "Demo", branch: "BR-A", department: "OPS" },
  "Employee:EMP-3": { employee_status: "Đang làm việc", employee_name: "C", company: "Demo", branch: "BR-A", department: "OPS" },
};

test("discipline preserves effective employee scope and rejects backwards dates", async () => {
  const controller = new EmployeeDisciplineController();
  const reader = fakeReader({ masters: employeeMasters });
  const result = await controller.normalize(context("Employee Discipline", "DISC-1", "submit", { employee: "EMP-1", incident_date: "2026-07-01", effective_date: "2026-07-02", discipline_type: "Khiển trách", reason: "Policy breach" }, reader));
  assert.equal(result.company, "Demo");
  assert.equal(result.branch, "BR-A");
  await assert.rejects(controller.normalize(context("Employee Discipline", "DISC-2", "submit", { employee: "EMP-1", incident_date: "2026-07-02", effective_date: "2026-07-01", discipline_type: "Khiển trách", reason: "Policy breach" }, reader)), /must not precede incident_date/);
});

test("personnel document derives expiry state and prevents duplicate submitted identity", async () => {
  const documents = {
    "Personnel Document:DOC-OLD": document("DOC-OLD", { employee: "EMP-1", document_type: "Passport", document_no: "P123", expiry_date: "2028-01-01" }),
  };
  const controller = new PersonnelDocumentController();
  const reader = fakeReader({ masters: employeeMasters, documents });
  const warning = await controller.normalize(context("Personnel Document", "DOC-NEW", "save", { employee: "EMP-1", document_type: "Work Permit", document_no: "WP1", issue_date: "2026-01-01", expiry_date: "2026-08-20", expiry_warning_days: 30, attachment: "/files/wp.pdf" }, reader));
  assert.equal(warning.document_status, "Sắp hết hạn");
  await assert.rejects(controller.normalize(context("Personnel Document", "DOC-DUP", "submit", { employee: "EMP-1", document_type: "Passport", document_no: "P123", attachment: "/files/p.pdf" }, reader)), /already exists/);
});

test("OKR key result requires a submitted objective for same employee and period", async () => {
  const documents = {
    "Goal:OBJ-1": document("OBJ-1", { employee: "EMP-1", company: "Demo", goal_type: "OKR Objective", from_date: "2026-07-01", to_date: "2026-09-30" }),
  };
  const input = { employee: "EMP-1", company: "Demo", goal_type: "OKR Key Result", parent_goal: "OBJ-1", goal_title: "Ship release", from_date: "2026-07-01", to_date: "2026-09-30", weight: 50, target_value: 1, current_value: 0, progress: 0 };
  const result = await new ExtendedGoalController().normalize(context("Goal", "KR-1", "submit", input, fakeReader({ masters: employeeMasters, documents })));
  assert.equal(result.parent_goal, "OBJ-1");
});

test("competency assessment respects each competency scale and computes percentage", async () => {
  const masters = { ...employeeMasters, "Competency:ERP": { competency_code: "ERP", max_score: 5, disabled: 0 }, "Competency:LEAD": { competency_code: "LEAD", max_score: 10, disabled: 0 } };
  const input = { employee: "EMP-1", reviewer: "EMP-2", assessment_date: "2026-08-01", summary: "Assessment", lines: [{ competency: "ERP", score: 4, evidence: "Project" }, { competency: "LEAD", score: 8, evidence: "Team" }] };
  const result = await new CompetencyAssessmentController().normalize(context("Competency Assessment", "CA-1", "submit", input, fakeReader({ masters })));
  assert.equal(result.overall_percent, 80);
});

test("360 review rejects duplicate/self reviewers and averages accepted reviews", async () => {
  const controller = new Review360Controller();
  const reader = fakeReader({ masters: employeeMasters });
  const input = { employee: "EMP-1", from_date: "2026-01-01", to_date: "2026-06-30", summary: "360", reviews: [{ reviewer: "EMP-2", relationship: "Manager", score: 90, comments: "Good" }, { reviewer: "EMP-3", relationship: "Peer", score: 80, comments: "Good" }] };
  const result = await controller.normalize(context("360 Review", "R360-1", "submit", input, reader));
  assert.equal(result.overall_score, 85);
  await assert.rejects(controller.normalize(context("360 Review", "R360-2", "submit", { ...input, reviews: [{ reviewer: "EMP-1", relationship: "Peer", score: 80, comments: "Self" }, { reviewer: "EMP-2", relationship: "Manager", score: 90, comments: "Good" }] }, reader)), /cannot be the employee themself/);
});

test("talent pool and succession enforce company and unique priority semantics", async () => {
  const masters = { ...employeeMasters, "Company:Demo": {}, "Branch:BR-A": { company: "Demo" }, "Department:OPS": { company: "Demo" }, "Designation:MANAGER": {} };
  const reader = fakeReader({ masters });
  const pool = await new TalentPoolController().normalize(context("Talent Pool", "POOL-1", "submit", { pool_name: "HiPo", company: "Demo", description: "High potential", members: [{ employee: "EMP-1", potential_score: 90, performance_score: 85, readiness: "< 1 year" }] }, reader));
  assert.equal(pool.member_count, 1);
  const planInput = { company: "Demo", branch: "BR-A", department: "OPS", designation: "MANAGER", incumbent: "EMP-1", review_date: "2026-08-01", candidates: [{ employee: "EMP-2", readiness: "Ready now", priority: 1, development_actions: "Mentoring" }, { employee: "EMP-3", readiness: "1-2 years", priority: 1, development_actions: "Rotation" }] };
  await assert.rejects(new SuccessionPlanController().normalize(context("Succession Plan", "SP-1", "submit", planInput, reader)), /priority must be positive and unique/);
});

test("training assessment determines pass and certificate requires passed assessment", async () => {
  const masters = { ...employeeMasters, "Training Course:ERP-101": { passing_score: 70, validity_months: 12, disabled: 0 } };
  const reader = fakeReader({ masters });
  const assessment = await new TrainingAssessmentController().normalize(context("Training Assessment", "TA-1", "submit", { employee: "EMP-1", course: "ERP-101", assessment_date: "2026-08-01", score: 85 }, reader));
  assert.equal(assessment.result, "Pass");
  const documents = { "Training Assessment:TA-1": document("TA-1", assessment) };
  const certificate = await new EmployeeCertificateController().normalize(context("Employee Certificate", "CERT-1", "submit", { employee: "EMP-1", course: "ERP-101", assessment: "TA-1", certificate_no: "CERT-2026-1", issue_date: "2026-08-03" }, fakeReader({ masters, documents })));
  assert.equal(certificate.expiry_date, "2027-08-03");
  assert.equal(certificate.certificate_status, "Còn hiệu lực");
});
