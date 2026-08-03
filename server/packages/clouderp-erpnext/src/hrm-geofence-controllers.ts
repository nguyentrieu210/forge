import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import { EmployeeCheckinController, ShiftTypeController } from "./hrm-shift-attendance-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class AttendanceGeofenceController extends SuiteController<JsonObject> {
  readonly doctype = "Attendance Geofence";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const name = H.requiredText(input.geofence_name, "Attendance Geofence geofence_name");
    const company = H.requiredText(input.company, "Attendance Geofence company");
    const branch = H.requiredText(input.branch, "Attendance Geofence branch");
    await H.requireRecord(context, "Company", company);
    const branchData = await H.requireRecord(context, "Branch", branch);
    if (H.text(branchData.company) && H.text(branchData.company) !== company) throw errors.reference(`Branch ${branch} belongs to another company`);
    const latitude = coordinate(input.latitude, -90, 90, "Attendance Geofence latitude");
    const longitude = coordinate(input.longitude, -180, 180, "Attendance Geofence longitude");
    const radius = positiveFinite(input.radius_m, "Attendance Geofence radius_m");
    const maxAccuracy = positiveFinite(input.max_accuracy_m, "Attendance Geofence max_accuracy_m");
    if (radius > 100_000) throw errors.validation("Attendance Geofence radius_m cannot exceed 100000 meters");
    if (maxAccuracy > 10_000) throw errors.validation("Attendance Geofence max_accuracy_m cannot exceed 10000 meters");
    return { ...input, geofence_name: name, company, branch, latitude, longitude, radius_m: radius, max_accuracy_m: maxAccuracy, disabled: H.truthy(input.disabled) ? 1 : 0 };
  }
}

export class GeofencedShiftTypeController extends ShiftTypeController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const required = H.truthy(normalized.geofence_required);
    const geofenceName = H.text(normalized.default_geofence);
    if (required && !geofenceName) throw errors.validation("Shift Type requires default_geofence when geofence_required is enabled");
    if (geofenceName) {
      const geofence = await H.requireRecord(context, "Attendance Geofence", geofenceName);
      if (H.truthy(geofence.disabled)) throw errors.reference(`Attendance Geofence ${geofenceName} is disabled`);
    }
    return { ...normalized, geofence_required: required ? 1 : 0, ...(geofenceName ? { default_geofence: geofenceName } : {}) };
  }
}

export class GeofencedEmployeeCheckinController extends EmployeeCheckinController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    if (H.text(normalized.source) !== "Mobile") return normalized;

    const date = H.requiredDatetime(normalized.time, "Check-in time").slice(0, 10);
    const assignments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Shift Assignment");
    const active = assignments.filter((assignment) => assignment.docstatus === 1
      && H.text(assignment.data.employee) === H.text(normalized.employee)
      && H.text(assignment.data.start_date) <= date
      && (!H.text(assignment.data.end_date) || H.text(assignment.data.end_date) >= date));
    if (active.length > 1) throw errors.reference(`Multiple active Shift Assignments exist for ${normalized.employee} on ${date}`);
    const shift = active.length === 1
      ? await H.requireRecord(context, "Shift Type", H.requiredText(active[0]!.data.shift_type, "Shift Assignment shift_type"))
      : undefined;
    const required = shift ? H.truthy(shift.geofence_required) : false;
    const geofenceName = H.text(normalized.geofence) || (shift ? H.text(shift.default_geofence) : "");
    if (required && !geofenceName) throw errors.validation("Mobile check-in requires an Attendance Geofence for this shift");
    if (!geofenceName) return { ...normalized, geofence_passed: 0 };

    const geofence = await H.requireRecord(context, "Attendance Geofence", geofenceName);
    if (H.truthy(geofence.disabled)) throw errors.reference(`Attendance Geofence ${geofenceName} is disabled`);
    if (H.text(geofence.company) !== H.text(normalized.company) || H.text(geofence.branch) !== H.text(normalized.branch)) {
      throw errors.reference(`Attendance Geofence ${geofenceName} belongs to another employee company/branch scope`);
    }
    const latitude = coordinate(normalized.latitude, -90, 90, "Employee Checkin latitude");
    const longitude = coordinate(normalized.longitude, -180, 180, "Employee Checkin longitude");
    const accuracy = positiveFinite(normalized.accuracy_m, "Employee Checkin accuracy_m");
    const maxAccuracy = positiveFinite(geofence.max_accuracy_m, `Attendance Geofence ${geofenceName} max_accuracy_m`);
    if (accuracy > maxAccuracy) throw errors.validation(`Employee Checkin GPS accuracy ${accuracy}m exceeds geofence limit ${maxAccuracy}m`);
    const radius = positiveFinite(geofence.radius_m, `Attendance Geofence ${geofenceName} radius_m`);
    const centerLat = coordinate(geofence.latitude, -90, 90, `Attendance Geofence ${geofenceName} latitude`);
    const centerLon = coordinate(geofence.longitude, -180, 180, `Attendance Geofence ${geofenceName} longitude`);
    const distance = haversineMeters(latitude, longitude, centerLat, centerLon);
    if (distance > radius) throw errors.validation(`Employee Checkin is ${Math.round(distance)}m from geofence center, outside allowed ${radius}m radius`);
    return {
      ...normalized,
      geofence: geofenceName,
      latitude,
      longitude,
      accuracy_m: accuracy,
      distance_from_geofence_m: Math.round(distance * 100) / 100,
      geofence_passed: 1,
    };
  }
}

function coordinate(value: unknown, minimum: number, maximum: number, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw errors.validation(`${field} is invalid`);
  return result;
}

function positiveFinite(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw errors.validation(`${field} must be positive`);
  return result;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
