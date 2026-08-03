import test from "node:test";
import assert from "node:assert/strict";
import { HiringCompletionController, EmployeeFinalSettlementController } from "../dist/packages/clouderp-erpnext/src/hrm-lifecycle-closure-controllers.js";

function document(name, data, docstatus = 1, version = 1) { return { name, docstatus, version, data }; }
function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) {
      return Object.entries(documents).filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value);
    },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}
function context(doctype, name, action, data, reader) {
  return { command: { tenant_id: "demo", aggregate: { doctype, name }, action, actor: { user_id: "hr@example.test", roles: ["HR Manager"] }, document: data }, reader, existing: null, nextVersion: 1, now: "2026-08-03T00:00:00Z" };
}

test("hiring completion verifies exact offer-contract salary in minor units and full lineage", async () => {
  const masters = {
    "Currency:VND": { currency_scale: 0 },
    "Employee:EMP-1": { company: "Demo", branch: "BR-A", department: "OPS", designation: "TECH", employment_type: "Full-time", date_of_joining: "2026-08-01" },
  };
  const documents = {
    "Job Offer:OFF-1": document("OFF-1", { job_applicant: "APP-1", job_opening: "OPEN-1", company: "Demo", branch: "BR-A", department: "OPS", designation: "TECH", employment_type: "Full-time", joining_date: "2026-08-01", offered_base_salary: "20000000", currency: "VND" }),
    "Employment Contract:CON-1": document("CON-1", { employee: "EMP-1", company: "Demo", branch: "BR-A", department: "OPS", start_date: "2026-08-01", base_salary: "20000000", salary_currency: "VND" }),
    "Employee Onboarding:ONB-1": document("ONB-1", { employee: "EMP-1", company: "Demo", branch: "BR-A", department: "OPS", start_date: "2026-08-01" }),
  };
  const reader = fakeReader({ masters, documents });
  const result = await new HiringCompletionController().normalize(context("Hiring Completion", "HIRE-1", "submit", { job_offer: "OFF-1", employee: "EMP-1", employment_contract: "CON-1", employee_onboarding: "ONB-1", completion_date: "2026-08-05" }, reader));
  const trace = JSON.parse(result.lineage_snapshot_json);
  assert.equal(trace.job_offer, "OFF-1");
  assert.equal(trace.offered_base_salary_minor, 20000000);
  assert.equal(trace.salary_currency, "VND");
});

test("hiring completion rejects one-minor-unit salary drift", async () => {
  const masters = { "Currency:VND": { currency_scale: 0 }, "Employee:EMP-1": { company: "Demo", branch: "BR-A", department: "OPS", designation: "TECH", employment_type: "Full-time", date_of_joining: "2026-08-01" } };
  const documents = {
    "Job Offer:OFF-1": document("OFF-1", { company: "Demo", branch: "BR-A", department: "OPS", designation: "TECH", employment_type: "Full-time", joining_date: "2026-08-01", offered_base_salary: "20000000", currency: "VND" }),
    "Employment Contract:CON-1": document("CON-1", { employee: "EMP-1", company: "Demo", branch: "BR-A", department: "OPS", start_date: "2026-08-01", base_salary: "19999999", salary_currency: "VND" }),
    "Employee Onboarding:ONB-1": document("ONB-1", { employee: "EMP-1", company: "Demo", branch: "BR-A", department: "OPS", start_date: "2026-08-01" }),
  };
  await assert.rejects(new HiringCompletionController().normalize(context("Hiring Completion", "HIRE-1", "submit", { job_offer: "OFF-1", employee: "EMP-1", employment_contract: "CON-1", employee_onboarding: "ONB-1", completion_date: "2026-08-05" }, fakeReader({ masters, documents }))), /salary does not match/);
});

test("final settlement blocks paid employee advances that are not settled", async () => {
  const masters = { "Employee:EMP-1": { company: "Demo", branch: "BR-A", employee_status: "Đang làm việc" } };
  const documents = {
    "Employee Separation:SEP-1": document("SEP-1", { employee: "EMP-1", company: "Demo", last_working_day: "2026-07-31", clearance_status: "Hoàn tất" }),
    "Salary Slip:SLIP-FINAL": document("SLIP-FINAL", { employee: "EMP-1", company: "Demo", start_date: "2026-07-01", end_date: "2026-07-31" }),
    "Employee Advance:ADV-1": document("ADV-1", { employee: "EMP-1", advance_amount: "1000000", currency: "VND", payment_entry: "PAY-1", settlement_ref: "" }),
  };
  await assert.rejects(new EmployeeFinalSettlementController().normalize(context("Employee Final Settlement", "FSET-1", "submit", { employee: "EMP-1", separation: "SEP-1", settlement_date: "2026-08-01", final_salary_slip: "SLIP-FINAL" }, fakeReader({ masters, documents }))), /paid advance\(s\) not yet settled/);
});
