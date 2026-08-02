import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../apps-src/hrm/", import.meta.url);
const readJson = (relative) => JSON.parse(readFileSync(new URL(relative, root), "utf8"));
const permission = (meta, role, permlevel = 0) => meta.permissions.filter((row) => row.role === role && (row.permlevel ?? 0) === permlevel);

test("HRM Wave 1 manifest exposes secure self-service and closure navigation", () => {
  const app = readJson("app.json");
  assert.equal(app.version, "1.7.0");
  assert.ok(app.nav.some((item) => item.key === "Hiring Completion"));
  assert.ok(app.nav.some((item) => item.key === "Employee Final Settlement"));
  assert.ok(app.nav.some((item) => item.key === "VN Payroll Rule"));
  const self = app.nav.find((item) => item.key === "hr-self-service");
  assert.equal(self.route, "/x/screen:hr-self-service");
  assert.deepEqual(self.required_roles, ["Employee"]);
  const payslip = app.nav.find((item) => item.key === "salary-slip");
  assert.ok(payslip.required_roles.includes("Employee"));
  const screen = app.screens.find((item) => item.name === "hr-self-service");
  assert.ok(screen);
  assert.deepEqual(
    new Set(screen.blocks.map((block) => block.doctype)),
    new Set(["Leave Application", "Attendance Request", "Overtime Request", "Employee Advance", "Goal", "Appraisal", "Employee Checkin"]),
  );
  assert.ok(app.reports.some((report) => report.name === "hr-recruitment-pipeline"));
  assert.ok(app.reports.some((report) => report.name === "hr-attendance-status"));
});

test("employee profile, contract and attendance do not grant broad employee reads", () => {
  for (const file of ["doctypes/employee.json", "doctypes/employment-contract.json", "doctypes/attendance.json"]) {
    const meta = readJson(file);
    const employeeRead = permission(meta, "Employee").filter((row) => row.read);
    assert.ok(employeeRead.length > 0, file);
    assert.ok(employeeRead.every((row) => row.if_owner === true), `${file} must remain owner-scoped at permlevel 0`);
    assert.equal(meta.permissions.filter((row) => row.role === "Employee" && row.read && (row.permlevel ?? 0) > 0).length, 0, `${file} must not use high permlevels as document grants`);
  }
  const contract = readJson("doctypes/employment-contract.json");
  const contractFields = Object.fromEntries(contract.fields.map((field) => [field.fieldname, field]));
  assert.equal(contractFields.base_salary.permlevel ?? 0, 0);
  assert.equal(contractFields.salary_currency.permlevel ?? 0, 0);
});

test("employee profile keeps private identity and payroll data at HR/payroll permlevel", () => {
  const meta = readJson("doctypes/employee.json");
  const fields = Object.fromEntries(meta.fields.map((field) => [field.fieldname, field]));
  for (const field of ["personal_email", "mobile", "date_of_birth", "tax_code", "social_insurance_number", "bank_account_no", "bank_name"]) {
    assert.equal(fields[field].permlevel, 1, field);
  }
  assert.ok(permission(meta, "HR Manager", 1).some((row) => row.read && row.write));
  assert.ok(permission(meta, "Payroll Manager", 1).some((row) => row.read));
});

test("employee advances isolate requested amount from accounting settlement fields", () => {
  const meta = readJson("doctypes/employee-advance.json");
  const fields = Object.fromEntries(meta.fields.map((field) => [field.fieldname, field]));
  assert.equal(fields.advance_amount.permlevel, 2);
  for (const field of ["payment_entry", "settlement_type", "settlement_ref_doctype", "settlement_ref"]) {
    assert.equal(fields[field].permlevel, 1, field);
  }
  assert.equal(permission(meta, "Employee", 1).length, 0);
  assert.ok(permission(meta, "Employee", 2).some((row) => row.create && row.if_owner !== true));
  assert.ok(permission(meta, "Employee", 2).some((row) => row.read && row.write && row.if_owner === true));
});

test("appraisal keeps manager results in exact document scope and self score separately writable", () => {
  const meta = readJson("doctypes/appraisal.json");
  const fields = Object.fromEntries(meta.fields.map((field) => [field.fieldname, field]));
  assert.equal(fields.self_score.permlevel, 2);
  assert.equal(fields.manager_score.permlevel ?? 0, 0);
  assert.equal(fields.final_score.permlevel ?? 0, 0);
  assert.equal(permission(meta, "Employee", 1).length, 0);
  assert.ok(permission(meta, "Employee", 2).some((row) => row.read && row.write && row.if_owner === true));
});
