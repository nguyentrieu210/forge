import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";

const hrmRoot = new URL("../apps-src/hrm/", import.meta.url);
const accountingRoot = new URL("../apps-src/vn-accounting/", import.meta.url);
const securityRoot = new URL("../apps-src/erp-organization-security/", import.meta.url);

function fieldMap(doctype) {
  return new Map(doctype.fields.map((field) => [field.fieldname, field]));
}

test("HRM package exposes complete operational HR, time and payroll dimensions", async () => {
  const source = await readAppSource(fileURLToPath(hrmRoot));
  const parsed = parseAppManifest(source);

  assert.equal(parsed.id, "hrm");
  assert.equal(parsed.version, "1.5.0");
  for (const key of [
    "Branch", "Department", "Job Opening", "Job Applicant", "Job Offer", "Employee", "Employment Contract",
    "Employee Transfer", "Employee Separation", "Leave Policy", "Leave Allocation", "Leave Application", "Holiday List",
    "Employee Checkin", "Attendance", "Overtime Request", "Salary Structure", "Salary Structure Assignment",
    "Payroll Period", "Additional Salary", "Travel Request", "Appraisal", "Training Event",
  ]) assert.ok(parsed.nav.some((item) => item.key === key), `${key} must be navigable`);
  assert.ok(parsed.nav.some((item) => item.key === "payroll-entry" && item.route === "/app/Payroll%20Entry"));

  const requiredDoctypes = [
    "Employment Type", "Job Opening", "Job Applicant", "Interview", "Job Offer", "Employee Onboarding",
    "Employee Transfer", "Employee Promotion", "Employee Separation", "Leave Policy", "Leave Allocation", "Holiday List",
    "Employee Checkin", "Attendance Request", "Overtime Request", "Salary Structure", "Salary Structure Component",
    "Payroll Period", "Additional Salary", "Travel Request", "Goal", "Appraisal", "Training Event",
  ];
  for (const name of requiredDoctypes) assert.ok(parsed.doctypes.some((item) => item.name === name), `${name} must exist`);

  const employee = parsed.doctypes.find((item) => item.name === "Employee");
  assert.ok(employee);
  const employeeFields = fieldMap(employee);
  for (const required of ["company", "branch", "department", "employee_number", "employment_type", "cost_center"]) {
    assert.equal(employeeFields.get(required)?.required, true, `${required} must be required`);
  }
  assert.equal(employeeFields.get("company")?.set_only_once, true);
  assert.equal(employeeFields.get("employee_number")?.set_only_once, true);
  for (const sensitive of ["personal_email", "mobile", "bank_account_no", "tax_code", "social_insurance_number"]) {
    assert.equal(employeeFields.get(sensitive)?.permlevel, 1, `${sensitive} must be protected at permlevel 1`);
  }

  const leave = parsed.doctypes.find((item) => item.name === "Leave Application");
  const leaveFields = fieldMap(leave);
  assert.equal(leaveFields.get("total_days")?.read_only, true, "leave total must be server-derived");
  assert.equal(leaveFields.get("leave_allocation")?.read_only, true, "leave allocation must be server-derived");

  const attendance = parsed.doctypes.find((item) => item.name === "Attendance");
  const attendanceFields = fieldMap(attendance);
  assert.equal(attendanceFields.get("working_minutes")?.read_only, true);
  assert.equal(attendanceFields.get("overtime_minutes")?.read_only, true);
  assert.equal(attendanceFields.get("late_entry")?.read_only, true);

  const salaryAssignment = parsed.doctypes.find((item) => item.name === "Salary Structure Assignment");
  const salaryFields = fieldMap(salaryAssignment);
  for (const required of ["salary_structure", "from_date", "base_salary", "payroll_rule"]) {
    assert.equal(salaryFields.get(required)?.required, true, `${required} must be required`);
  }

  const branchFixture = source.fixtures.find((item) => item.record_type === "Branch");
  assert.equal(branchFixture?.data.company, "Kairo");
  assert.ok(branchFixture?.data.cost_center);
  for (const department of source.fixtures.filter((item) => item.record_type === "Department")) {
    assert.equal(department.data.company, "Kairo");
    assert.equal(department.data.branch, "HQ");
    assert.ok(department.data.cost_center);
  }
  for (const leaveType of source.fixtures.filter((item) => item.record_type === "Leave Type")) {
    assert.equal("max_days" in leaveType.data, false, "legal leave entitlement must not be hardcoded in generic fixtures");
  }
});

test("organization security package declares versioned scopes, policies, SoD and delegations", async () => {
  const source = await readAppSource(fileURLToPath(securityRoot));
  const parsed = parseAppManifest(source);

  assert.equal(parsed.id, "erp-organization-security");
  assert.deepEqual(parsed.requires, [{ id: "hrm", version: ">=1.4.0" }]);
  assert.deepEqual(
    parsed.doctypes.map((item) => item.name).sort(),
    ["Approval Policy", "Delegation", "Organization Assignment", "Role Policy", "SoD Rule"],
  );
  assert.equal(parsed.workflows.length, 5);
  assert.ok(parsed.nav.some((item) => item.route === "/permissions?tab=approvals"));
  assert.ok(parsed.reports.some((item) => item.name === "Ma trận xung đột nhiệm vụ"));
  assert.equal(parsed.roles.some((item) => item.role === "HR Manager"), false, "dependent app must not reclaim the HRM-owned role");

  const assignment = parsed.doctypes.find((item) => item.name === "Organization Assignment");
  const assignmentFields = fieldMap(assignment);
  for (const required of ["user", "company", "effective_from"]) {
    assert.equal(assignmentFields.get(required)?.required, true, `${required} must be required`);
  }
  assert.ok(assignment.permissions.some((permission) => permission.role === "HR Manager"), "shared HR Manager keeps scoped assignment access");
  assert.equal(assignmentFields.get("company")?.set_only_once, true);

  const rolePolicy = parsed.doctypes.find((item) => item.name === "Role Policy");
  const rolePolicyFields = fieldMap(rolePolicy);
  assert.equal(rolePolicyFields.get("field_rule_json")?.permlevel, 1);
  assert.equal(rolePolicyFields.get("workflow_state")?.read_only, true);
});

test("Vietnam accounting package versions legal rules and traces payroll posting", async () => {
  const source = await readAppSource(fileURLToPath(accountingRoot));
  const parsed = parseAppManifest(source);

  assert.equal(parsed.id, "vn-accounting");
  assert.deepEqual(parsed.requires, [{ id: "hrm", version: ">=1.3.0" }]);

  const policy = parsed.doctypes.find((item) => item.name === "VN Accounting Policy");
  const policyFields = fieldMap(policy);
  for (const required of ["regime_code", "legal_document_no", "fiscal_year_start", "effective_from", "legal_report_currency", "source_url"]) {
    assert.equal(policyFields.get(required)?.required, true, `${required} must be required`);
  }

  const legalRule = parsed.doctypes.find((item) => item.name === "VN Legal Rule");
  const legalFields = fieldMap(legalRule);
  for (const required of ["document_no", "effective_from", "taxpayer_segment", "source_url", "rule_json", "approved_by", "approved_at"]) {
    assert.equal(legalFields.get(required)?.required, true, `${required} must be required`);
  }

  const payrollBatch = parsed.doctypes.find((item) => item.name === "Payroll Accounting Batch");
  const payrollFields = fieldMap(payrollBatch);
  for (const required of ["payroll_entry", "company", "branch", "posting_date", "source_document_id", "rule_trace_json", "approval_trace_json"]) {
    assert.equal(payrollFields.get(required)?.required, true, `${required} must be required`);
  }
});
