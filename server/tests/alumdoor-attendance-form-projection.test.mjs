import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const appSourceDir = fileURLToPath(new URL("../apps-src/alumdoor-attendance/", import.meta.url));

async function meta(name) {
  const app = await readAppSource(appSourceDir);
  const doctype = app.doctypes.find((entry) => entry.name === name);
  assert.ok(doctype, `${name} must exist in alumdoor-attendance app source`);
  return doctype;
}

test("Attendance Day is a read-oriented operational surface, not Quick Entry", async () => {
  const attendanceDay = await meta("AlumDoor Attendance Day");

  assert.equal(attendanceDay.viewPolicy.quickEntry.enabled, false);
  assert.deepEqual(attendanceDay.viewPolicy.quickEntry.fields, []);
  assert.deepEqual(attendanceDay.viewPolicy.list.columns, [
    "employee",
    "work_date",
    "branch",
    "state",
    "regular_minutes",
    "overtime_minutes",
    "payable_work_fraction_bp",
    "locked_by_payroll",
    "calculated_at",
  ]);

  for (const field of [
    "employee",
    "work_date",
    "policy",
    "state",
    "locked_by_payroll",
    "regular_minutes",
    "overtime_minutes",
    "payable_work_fraction_bp",
    "segments",
  ]) {
    assert.ok(attendanceDay.viewPolicy.form.fields.includes(field), `Attendance Day form must project ${field}`);
  }

  const humanRoles = new Set([
    "AlumDoor Attendance Viewer",
    "AlumDoor Attendance Manager",
    "AlumDoor Payroll User",
    "AlumDoor Payroll Approver",
    "HR Manager",
    "System Manager",
  ]);
  for (const permission of attendanceDay.permissions.filter((entry) => humanRoles.has(entry.role))) {
    assert.notEqual(permission.create, true, `${permission.role} must not create Attendance Day directly`);
  }
});

test("Attendance Policy uses the full workflow form", async () => {
  const policy = await meta("AlumDoor Attendance Policy");

  assert.equal(policy.viewPolicy.quickEntry.enabled, false);
  assert.deepEqual(policy.viewPolicy.list.columns, [
    "policy_name",
    "company",
    "timezone",
    "effective_from",
    "effective_to",
    "policy_status",
  ]);

  const editableRequired = policy.fields
    .filter((field) => field.required && field.editMode !== "readonly" && field.editMode !== "hidden")
    .map((field) => field.fieldname);
  for (const field of editableRequired) {
    assert.ok(policy.viewPolicy.form.fields.includes(field), `Attendance Policy full form must expose required ${field}`);
  }
});

test("Pay Profile keeps version keys internal and uses the full workflow form", async () => {
  const payProfile = await meta("AlumDoor Pay Profile");

  assert.equal(payProfile.viewPolicy.quickEntry.enabled, false);
  assert.deepEqual(payProfile.viewPolicy.list.columns, [
    "profile_code",
    "employee",
    "branch",
    "pay_mode",
    "base_salary_vnd",
    "effective_from",
    "effective_to",
    "status",
  ]);
  assert.equal(payProfile.viewPolicy.form.fields.includes("profile_key"), false);

  const profileKey = payProfile.fields.find((field) => field.fieldname === "profile_key");
  assert.equal(profileKey.surface, "internal");
  assert.equal(profileKey.editMode, "hidden");
  assert.equal(profileKey.serverEnforced, true);

  const editableRequired = payProfile.fields
    .filter((field) => field.required && field.editMode !== "readonly" && field.editMode !== "hidden")
    .map((field) => field.fieldname);
  for (const field of editableRequired) {
    assert.ok(payProfile.viewPolicy.form.fields.includes(field), `Pay Profile full form must expose required ${field}`);
  }
});
