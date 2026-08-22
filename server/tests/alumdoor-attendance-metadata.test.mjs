import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseAppManifest } from "../dist/packages/app-registry/src/index.js";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";

const source = path.resolve(import.meta.dirname, "..", "apps-src", "alumdoor-attendance");

function field(meta, fieldname) {
  return meta.fields.find((entry) => entry.fieldname === fieldname);
}

function permission(meta, role) {
  return meta.permissions.find((entry) => entry.role === role);
}

test("AlumDoor attendance payroll metadata stays an isolated HRM-dependent package", async () => {
  const manifest = parseAppManifest(await readAppSource(source));
  assert.equal(manifest.id, "alumdoor-attendance");
  assert.equal(manifest.version, "0.7.5");
  assert.deepEqual(manifest.requires, [{ id: "hrm", version: "1.8.0" }]);
  assert.deepEqual(
    manifest.doctypes.map((meta) => meta.name).sort(),
    [
      "AlumDoor Attendance Day",
      "AlumDoor Attendance Device",
      "AlumDoor Attendance Policy",
      "AlumDoor Attendance Segment",
      "AlumDoor HR Lite Settings",
      "AlumDoor Pay Profile",
      "AlumDoor QR Station",
    ],
  );
  assert.deepEqual(
    manifest.roles.map((entry) => entry.role).sort(),
    [
      "AlumDoor Attendance Manager",
      "AlumDoor Attendance System",
      "AlumDoor Attendance Viewer",
      "AlumDoor Device System",
      "AlumDoor HR Lite System",
      "AlumDoor Payroll Approver",
      "AlumDoor Payroll System",
      "AlumDoor Payroll User",
      "AlumDoor QR System",
    ],
  );
  assert.ok(manifest.custom_fields.some((entry) => entry.dt === "Employee Checkin" && entry.fieldname === "alu_station"));
  assert.ok(manifest.custom_fields.some((entry) => entry.dt === "Attendance Request" && entry.fieldname === "alu_segment_code"));
  assert.ok(manifest.custom_fields.some((entry) => entry.dt === "Payroll Entry" && entry.fieldname === "alu_state"));
  assert.ok(manifest.custom_fields.some((entry) => entry.dt === "Salary Slip" && entry.fieldname === "alu_formula_trace_json"));
  for (const key of [
    "alumdoor-attendance:kiosk",
    "alumdoor-attendance:today",
    "alumdoor-attendance:month",
    "alumdoor-attendance:exceptions",
    "alumdoor-attendance:employees-lite",
    "alumdoor-attendance:payroll-lite",
    "alumdoor-attendance:my-slips-lite",
    "alumdoor-attendance:hr-payroll-settings-lite",
  ]) {
    assert.ok(manifest.nav.some((entry) => entry.kind === "experience" && entry.key === key), `missing experience ${key}`);
  }
});

test("AlumDoor attendance daily projection is writable only by scan/payroll coordinators", async () => {
  const manifest = parseAppManifest(await readAppSource(source));
  const day = manifest.doctypes.find((meta) => meta.name === "AlumDoor Attendance Day");
  assert.equal(day?.kind, "transaction");
  assert.equal(day?.is_submittable, false);
  assert.equal(field(day, "segments")?.fieldtype, "Table");
  assert.equal(field(day, "segments")?.options, "AlumDoor Attendance Segment");
  assert.deepEqual(field(day, "state")?.options, "open\ncomplete\nexception\napproved\nlocked");
  assert.equal(field(day, "locked_by_payroll")?.options, "Payroll Entry");

  const qrSystem = permission(day, "AlumDoor QR System");
  assert.equal(qrSystem?.create, true);
  assert.equal(qrSystem?.write, true);
  const payrollSystem = permission(day, "AlumDoor Payroll System");
  assert.equal(payrollSystem?.write, true);
  assert.equal(payrollSystem?.create, true, "trusted payroll may create a locked paid-leave-only projection");
  for (const role of ["AlumDoor Attendance Viewer", "AlumDoor Attendance Manager", "AlumDoor Payroll User", "AlumDoor Payroll Approver", "HR Manager", "System Manager"]) {
    assert.notEqual(permission(day, role)?.create, true, `${role} must not create a daily projection`);
    assert.notEqual(permission(day, role)?.write, true, `${role} must not modify a daily projection`);
  }
});

test("AlumDoor QR station stores a version reference, never signing material", async () => {
  const manifest = parseAppManifest(await readAppSource(source));
  const station = manifest.doctypes.find((meta) => meta.name === "AlumDoor QR Station");
  assert.equal(field(station, "secret_version")?.default, 1);
  assert.equal(field(station, "secret_version")?.read_only, true);
  assert.equal(field(station, "secret_version")?.hidden, true);
  assert.equal(field(station, "secret_version")?.serverEnforced, true);
  assert.equal(field(station, "policy")?.options, "AlumDoor Attendance Policy");
  assert.equal(field(station, "latitude")?.ui_control, "coordinate_pair");
  assert.equal(field(station, "latitude")?.options, "longitude");
  for (const required of ["company", "branch", "latitude", "longitude", "allowed_radius_m", "max_gps_accuracy_m"]) {
    assert.equal(field(station, required)?.required, true, `station.${required} must be required`);
  }
  assert.equal(station?.fields.some((entry) => /secret|token|private.?key/i.test(entry.fieldname) && entry.fieldname !== "secret_version"), false);
});

test("registered device stores only a credential hash and can be revoked by managers", async () => {
  const manifest = parseAppManifest(await readAppSource(source));
  const device = manifest.doctypes.find((meta) => meta.name === "AlumDoor Attendance Device");
  assert.equal(field(device, "credential_hash")?.hidden, true);
  assert.equal(field(device, "credential_hash")?.read_only, true);
  assert.equal(field(device, "employee")?.options, "Employee");
  assert.deepEqual(field(device, "status")?.options, "Active\nRevoked");
  assert.equal(permission(device, "AlumDoor Attendance Manager")?.write, true);
  assert.notEqual(permission(device, "AlumDoor Attendance Manager")?.create, true);
});

test("Attendance policy and pay profile use explicit approval workflows", async () => {
  const manifest = parseAppManifest(await readAppSource(source));
  const policy = manifest.doctypes.find((meta) => meta.name === "AlumDoor Attendance Policy");
  const policyWorkflow = manifest.workflows.find((entry) => entry.document_type === "AlumDoor Attendance Policy");
  assert.equal(policy?.is_submittable, true);
  assert.equal(policyWorkflow?.state_field, "policy_status");
  assert.equal(field(policy, "qr_ttl_seconds"), undefined);
  assert.equal(field(policy, "duplicate_scan_window_seconds")?.default, 60);
  assert.equal(field(policy, "max_devices_per_employee")?.default, 2);
  assert.ok(policy?.viewPolicy?.form?.fields?.includes("duplicate_scan_window_seconds"));
  assert.ok(policy?.viewPolicy?.form?.fields?.includes("max_devices_per_employee"));
  assert.equal(policy?.viewPolicy?.form?.fields?.includes("qr_ttl_seconds"), false);

  const profile = manifest.doctypes.find((meta) => meta.name === "AlumDoor Pay Profile");
  const profileWorkflow = manifest.workflows.find((entry) => entry.document_type === "AlumDoor Pay Profile");
  assert.equal(profile?.is_submittable, true);
  assert.equal(field(profile, "base_salary_vnd")?.fieldtype, "Int");
  assert.equal(field(profile, "overtime_multiplier_bp")?.fieldtype, "Int");
  assert.equal(field(profile, "alu_lite_idempotency_key")?.unique, true);
  assert.equal(profileWorkflow?.state_field, "status");
  assert.ok(profileWorkflow?.transitions.some((entry) => entry.state === "draft" && entry.next_state === "approved" && entry.allow_self_approval === false));
});
