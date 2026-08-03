import test from "node:test";
import assert from "node:assert/strict";
import { CandidateMatchController, CandidateProfileController, ExtendedJobOpeningController, InterviewScorecardController, JobOfferResponseController } from "../dist/packages/clouderp-erpnext/src/hrm-recruitment-depth-controllers.js";

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
function context(doctype, name, action, data, reader) { return { command: { tenant_id: "demo", aggregate: { doctype, name }, action, actor: { user_id: "hr@example.test", roles: ["HR Manager"] }, document: data }, reader, existing: null, nextVersion: 1, now: "2026-08-03T00:00:00Z" }; }

test("candidate profile normalizes deterministic structured evidence and rejects resume email mismatch", async () => {
  const controller = new CandidateProfileController();
  const reader = fakeReader();
  const input = { candidate_name: "Nguyen A", email: "a@example.com", years_experience: 4, skills_json: JSON.stringify(["TypeScript", "ERP", "typescript"]), resume_text: "Nguyen A - a@example.com - +84 912 345 678", active: 1 };
  const result = await controller.normalize(context("Candidate Profile", "CAND-1", "save", input, reader));
  assert.deepEqual(JSON.parse(result.skills_json), ["ERP", "TypeScript"]);
  const parsed = JSON.parse(result.parsed_profile_json);
  assert.equal(parsed.email, "a@example.com");
  assert.equal(parsed.years_experience, 4);
  await assert.rejects(controller.normalize(context("Candidate Profile", "CAND-2", "save", { ...input, email: "b@example.com" }, reader)), /resume_text email does not match/);
});

test("candidate matching uses opening-specific skill and experience weights with full trace", async () => {
  const documents = {
    "Job Opening:OPEN-1": document("OPEN-1", { required_skills_json: JSON.stringify(["ERP", "TypeScript", "SQL"]), minimum_years_experience: 4, skill_weight_percent: 80, experience_weight_percent: 20 }),
  };
  const masters = {
    "Candidate Profile:CAND-1": { candidate_name: "Nguyen A", email: "a@example.com", skills_json: JSON.stringify(["ERP", "SQL"]), years_experience: 2, active: 1 },
  };
  const result = await new CandidateMatchController().normalize(context("Candidate Match", "MATCH-1", "submit", { candidate_profile: "CAND-1", job_opening: "OPEN-1" }, fakeReader({ masters, documents })));
  assert.equal(result.skill_match_score, 66.67);
  assert.equal(result.experience_score, 50);
  assert.ok(result.total_score > 63 && result.total_score < 64);
  assert.deepEqual(JSON.parse(result.missing_skills_json), ["TypeScript"]);
});

test("job opening rejects match weights that do not total 100", async () => {
  const masters = {
    "Company:Demo": {}, "Branch:BR-A": { company: "Demo" }, "Department:OPS": { company: "Demo", branch: "BR-A" }, "Designation:TECH": {}, "Employment Type:Full-time": {},
  };
  const input = { job_title: "ERP Engineer", company: "Demo", branch: "BR-A", department: "OPS", designation: "TECH", employment_type: "Full-time", planned_headcount: 1, target_date: "2026-09-01", minimum_years_experience: 2, required_skills_json: "[]", skill_weight_percent: 60, experience_weight_percent: 30, job_description: "Build ERP" };
  await assert.rejects(new ExtendedJobOpeningController().normalize(context("Job Opening", "OPEN-1", "submit", input, fakeReader({ masters }))), /weights must be non-negative and sum to 100/);
});

test("interview scorecard calculates weighted score and requires exact 100 percent weights", async () => {
  const documents = { "Interview:INT-1": document("INT-1", { job_applicant: "APP-1", job_opening: "OPEN-1", interviewer: "EMP-MGR" }) };
  const reader = fakeReader({ documents });
  const controller = new InterviewScorecardController();
  const input = { interview: "INT-1", review_date: "2026-08-03", recommendation: "Hire", summary: "Good", scores: [{ criterion: "Technical", weight: 70, score: 90, comments: "Strong" }, { criterion: "Communication", weight: 30, score: 80, comments: "Good" }] };
  const result = await controller.normalize(context("Interview Scorecard", "SC-1", "submit", input, reader));
  assert.equal(result.total_score, 87);
  await assert.rejects(controller.normalize(context("Interview Scorecard", "SC-2", "submit", { ...input, scores: [{ criterion: "Technical", weight: 60, score: 90, comments: "Strong" }] }, reader)), /weights must sum to 100/);
});

test("job offer response is unique by business flow and constrained to offer window", async () => {
  const documents = { "Job Offer:OFF-1": document("OFF-1", { job_applicant: "APP-1", offer_date: "2026-08-01", offer_expiry_date: "2026-08-10" }) };
  const controller = new JobOfferResponseController();
  const reader = fakeReader({ documents });
  const accepted = await controller.normalize(context("Job Offer Response", "RESP-1", "submit", { job_offer: "OFF-1", response: "Accepted", response_date: "2026-08-05" }, reader));
  assert.equal(accepted.job_applicant, "APP-1");
  await assert.rejects(controller.normalize(context("Job Offer Response", "RESP-2", "submit", { job_offer: "OFF-1", response: "Rejected", response_date: "2026-08-11", rejection_reason: "Other" }, reader)), /inside the offer response window/);
});
