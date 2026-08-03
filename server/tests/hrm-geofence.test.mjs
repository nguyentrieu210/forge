import test from "node:test";
import assert from "node:assert/strict";
import { AttendanceGeofenceController, GeofencedEmployeeCheckinController, GeofencedShiftTypeController } from "../dist/packages/clouderp-erpnext/src/hrm-geofence-controllers.js";

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

test("attendance geofence validates company branch scope and configured radius", async () => {
  const masters = { "Company:Demo": {}, "Branch:BR-A": { company: "Demo" } };
  const result = await new AttendanceGeofenceController().normalize(context("Attendance Geofence", "HQ", "save", { geofence_name: "HQ", company: "Demo", branch: "BR-A", latitude: 10.762622, longitude: 106.660172, radius_m: 100, max_accuracy_m: 50 }, fakeReader({ masters })));
  assert.equal(result.radius_m, 100);
  assert.equal(result.max_accuracy_m, 50);
});

test("shift requiring mobile geofence must point to an enabled geofence", async () => {
  const masters = { "Attendance Geofence:HQ": { company: "Demo", branch: "BR-A", disabled: 0 } };
  const controller = new GeofencedShiftTypeController();
  await assert.rejects(controller.normalize(context("Shift Type", "DAY", "save", { shift_name: "DAY", start_time: "08:00:00", end_time: "17:00:00", working_minutes: 480, geofence_required: 1 }, fakeReader({ masters }))), /requires default_geofence/);
  const result = await controller.normalize(context("Shift Type", "DAY", "save", { shift_name: "DAY", start_time: "08:00:00", end_time: "17:00:00", working_minutes: 480, geofence_required: 1, default_geofence: "HQ" }, fakeReader({ masters })));
  assert.equal(result.geofence_required, 1);
});

test("mobile checkin stores deterministic geofence evidence when inside radius", async () => {
  const masters = {
    "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A", department: "OPS", user_id: "employee@example.test" },
    "Shift Type:DAY": { start_time: "08:00:00", end_time: "17:00:00", working_minutes: 480, geofence_required: 1, default_geofence: "HQ", disabled: 0 },
    "Attendance Geofence:HQ": { company: "Demo", branch: "BR-A", latitude: 10.762622, longitude: 106.660172, radius_m: 150, max_accuracy_m: 50, disabled: 0 },
  };
  const documents = { "Shift Assignment:SA-1": document("SA-1", { employee: "EMP-1", shift_type: "DAY", start_date: "2026-08-01", end_date: "2026-08-31" }) };
  const input = { employee: "EMP-1", company: "Demo", branch: "BR-A", time: "2026-08-03T08:00:00Z", log_type: "IN", source: "Mobile", latitude: 10.7627, longitude: 106.6602, accuracy_m: 10 };
  const result = await new GeofencedEmployeeCheckinController().normalize(context("Employee Checkin", "CHK-1", "submit", input, fakeReader({ masters, documents })));
  assert.equal(result.geofence, "HQ");
  assert.equal(result.geofence_passed, 1);
  assert.ok(result.distance_from_geofence_m < 150);
});

test("mobile checkin fails closed on poor GPS accuracy or outside configured radius", async () => {
  const masters = {
    "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A", department: "OPS", user_id: "employee@example.test" },
    "Shift Type:DAY": { start_time: "08:00:00", end_time: "17:00:00", working_minutes: 480, geofence_required: 1, default_geofence: "HQ", disabled: 0 },
    "Attendance Geofence:HQ": { company: "Demo", branch: "BR-A", latitude: 10.762622, longitude: 106.660172, radius_m: 100, max_accuracy_m: 20, disabled: 0 },
  };
  const documents = { "Shift Assignment:SA-1": document("SA-1", { employee: "EMP-1", shift_type: "DAY", start_date: "2026-08-01", end_date: "2026-08-31" }) };
  const controller = new GeofencedEmployeeCheckinController();
  const base = { employee: "EMP-1", company: "Demo", branch: "BR-A", time: "2026-08-03T08:00:00Z", log_type: "IN", source: "Mobile" };
  await assert.rejects(controller.normalize(context("Employee Checkin", "CHK-1", "submit", { ...base, latitude: 10.7627, longitude: 106.6602, accuracy_m: 30 }, fakeReader({ masters, documents }))), /GPS accuracy/);
  await assert.rejects(controller.normalize(context("Employee Checkin", "CHK-2", "submit", { ...base, latitude: 10.77, longitude: 106.67, accuracy_m: 10 }, fakeReader({ masters, documents }))), /outside allowed/);
});
