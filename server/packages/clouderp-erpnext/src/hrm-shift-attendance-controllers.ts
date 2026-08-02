import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class ShiftAssignmentController extends SuiteController<JsonObject> {
  readonly doctype = "Shift Assignment";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    const company = H.requiredText(input.company, "Company");
    const branch = H.requiredText(input.branch, "Branch");
    const department = H.requiredText(input.department, "Department");

    const shiftName = H.requiredText(input.shift_type, "Shift Type");
    const shift = await H.requireRecord(context, "Shift Type", shiftName);
    if (H.truthy(shift.disabled)) throw errors.reference(`Shift Type ${shiftName} is disabled`);

    const startDate = H.requiredDate(input.start_date, "Shift start_date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, startDate);
    H.assertEmployeeStateActive(employeeState, employeeName, startDate);
    H.assertEmployeeScope(employeeState, company, branch, department);
    const endDate = H.optionalDate(input.end_date, "Shift end_date");
    if (endDate && endDate < startDate) throw errors.validation("Shift Assignment end_date must not precede start_date");

    if (context.command.action === "submit") {
      const assignments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const assignment of assignments) {
        if (assignment.name === context.command.aggregate.name || assignment.docstatus !== 1) continue;
        if (H.text(assignment.data.employee) !== employeeName) continue;
        const otherStart = H.optionalDate(assignment.data.start_date, "Existing shift start_date");
        if (!otherStart) continue;
        const otherEnd = H.optionalDate(assignment.data.end_date, "Existing shift end_date");
        if (H.rangesOverlap(startDate, endDate, otherStart, otherEnd)) {
          throw errors.reference(`Employee ${employeeName} already has a Shift Assignment overlapping this period`);
        }
      }
    }

    return { ...input, company, branch, department, shift_type: shiftName };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Assigned" : super.status(context, context.command.document);
  }
}

export class EmployeeCheckinController extends SuiteController<JsonObject> {
  readonly doctype = "Employee Checkin";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);

    const timestamp = H.requiredDatetime(input.time, "Check-in time");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, timestamp.slice(0, 10));
    H.assertEmployeeStateActive(employeeState, employeeName, timestamp.slice(0, 10));
    const logType = H.requiredText(input.log_type, "Check-in type");
    if (!["IN", "OUT"].includes(logType)) throw errors.validation("Employee Checkin log_type must be IN or OUT");
    const source = H.requiredText(input.source, "Check-in source");
    if (!["Mobile", "Device", "Import", "Manual"].includes(source)) throw errors.validation("Employee Checkin source is invalid");
    const externalId = H.text(input.external_id);
    if (["Device", "Import"].includes(source) && !externalId) {
      throw errors.validation("Device/import check-ins require external_id for idempotency");
    }

    if (context.command.action === "submit") {
      const events = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, this.doctype);
      for (const event of events) {
        if (event.name === context.command.aggregate.name || event.docstatus !== 1) continue;
        if (externalId && H.text(event.data.external_id) === externalId) {
          throw errors.exists(`Employee Checkin external_id ${externalId} already exists`);
        }
        if (H.text(event.data.employee) === employeeName
          && H.text(event.data.time) === timestamp
          && H.text(event.data.log_type) === logType) {
          throw errors.exists("Duplicate Employee Checkin event");
        }
      }
    }

    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(employeeState.company, "Employee company"),
      branch: H.requiredText(employeeState.branch, "Employee branch"),
      time: timestamp,
      log_type: logType,
      source,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Captured" : super.status(context, context.command.document);
  }
}

export class AttendanceRequestController extends SuiteController<JsonObject> {
  readonly doctype = "Attendance Request";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    await H.assertOwnEmployeeOrPrivileged(context, employeeName, employee);
    const fromDate = H.requiredDate(input.from_date, "Attendance Request from_date");
    const toDate = H.requiredDate(input.to_date, "Attendance Request to_date");
    if (toDate < fromDate) throw errors.validation("Attendance Request to_date must not precede from_date");
    const state = await H.resolveEmployeeState(context, employeeName, employee, fromDate);
    H.assertEmployeeStateActive(state, employeeName, fromDate);
    const requestType = H.requiredText(input.request_type, "Attendance Request type");
    if (!["Có mặt", "Làm việc từ xa", "Sửa chấm công"].includes(requestType)) throw errors.validation("Attendance Request type is invalid");
    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(state.company, "Employee company"),
      branch: H.requiredText(state.branch, "Employee branch"),
      from_date: fromDate,
      to_date: toDate,
      request_type: requestType,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class AttendanceController extends SuiteController<JsonObject> {
  readonly doctype = "Attendance";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const employeeName = H.requiredText(input.employee, "Employee");
    const employee = await H.requireRecord(context, "Employee", employeeName);
    H.assertEmployeeActive(employee, employeeName);
    const attendanceDate = H.requiredDate(input.attendance_date, "Attendance date");
    const employeeState = await H.resolveEmployeeState(context, employeeName, employee, attendanceDate);
    H.assertEmployeeStateActive(employeeState, employeeName, attendanceDate);
    if (attendanceDate > context.now.slice(0, 10)) throw errors.validation("Attendance cannot be submitted for a future date");

    const assignments = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Shift Assignment");
    const activeAssignments = assignments.filter((assignment) =>
      assignment.docstatus === 1
      && H.text(assignment.data.employee) === employeeName
      && H.text(assignment.data.start_date) <= attendanceDate
      && (!H.text(assignment.data.end_date) || H.text(assignment.data.end_date) >= attendanceDate));
    if (activeAssignments.length !== 1) {
      throw errors.reference(`Exactly one active Shift Assignment is required for ${employeeName} on ${attendanceDate}`);
    }
    const assignment = activeAssignments[0];
    const shiftName = H.requiredText(assignment.data.shift_type, "Shift Assignment shift_type");
    const shift = await H.requireRecord(context, "Shift Type", shiftName);
    if (H.truthy(shift.disabled)) throw errors.reference(`Shift Type ${shiftName} is disabled`);

    const attendanceStatus = H.requiredText(input.attendance_status, "Attendance status");
    if (!["Có mặt", "Vắng", "Nửa ngày", "Nghỉ phép", "Làm việc từ xa"].includes(attendanceStatus)) {
      throw errors.validation("Attendance status is invalid");
    }

    if (attendanceStatus === "Nghỉ phép") {
      const leaveName = H.requiredText(input.leave_application, "Leave Application");
      const leave = await H.requireSubmitted(context, "Leave Application", leaveName);
      if (H.text(leave.employee) !== employeeName || H.text(leave.from_date) > attendanceDate || H.text(leave.to_date) < attendanceDate) {
        throw errors.reference(`Leave Application ${leaveName} does not cover ${employeeName} on ${attendanceDate}`);
      }
    }
    if (H.text(input.source) === "Correction") {
      const requestName = H.requiredText(input.attendance_request, "Attendance Request");
      const request = await H.requireSubmitted(context, "Attendance Request", requestName);
      if (H.text(request.employee) !== employeeName || H.text(request.from_date) > attendanceDate || H.text(request.to_date) < attendanceDate) {
        throw errors.reference(`Attendance Request ${requestName} does not cover ${employeeName} on ${attendanceDate}`);
      }
    }

    let workingMinutes = 0;
    let overtimeMinutes = 0;
    let lateEntry = false;
    let earlyExit = false;
    const inTime = H.text(input.in_time);
    const outTime = H.text(input.out_time);
    if ((inTime && !outTime) || (!inTime && outTime)) throw errors.validation("Attendance requires both in_time and out_time");
    if (inTime && outTime) {
      const start = H.datetimeMs(inTime, "Attendance in_time");
      const end = H.datetimeMs(outTime, "Attendance out_time");
      if (end <= start) throw errors.validation("Attendance out_time must be after in_time");
      workingMinutes = Math.floor((end - start) / 60_000);
      const standardMinutes = H.integer(shift.working_minutes, 0);
      if (standardMinutes <= 0) throw errors.reference(`Shift Type ${shiftName} has invalid working_minutes`);
      const extraMinutes = Math.max(0, workingMinutes - standardMinutes);
      const overtimeRequest = H.text(input.overtime_request);
      if (overtimeRequest) {
        const overtime = await H.requireSubmitted(context, "Overtime Request", overtimeRequest);
        if (H.text(overtime.employee) !== employeeName || H.text(overtime.overtime_date) !== attendanceDate) {
          throw errors.reference(`Overtime Request ${overtimeRequest} does not belong to this attendance`);
        }
        overtimeMinutes = Math.min(extraMinutes, H.integer(overtime.approved_minutes, 0));
      }
      const shiftStart = H.requiredTime(shift.start_time, "Shift start_time");
      const shiftEnd = H.requiredTime(shift.end_time, "Shift end_time");
      const actualIn = H.hhmmss(inTime);
      const actualOut = H.hhmmss(outTime);
      lateEntry = H.secondsOfDay(actualIn) > H.secondsOfDay(shiftStart) + H.integer(shift.late_grace_minutes, 0) * 60;
      if (H.secondsOfDay(shiftEnd) >= H.secondsOfDay(shiftStart)) {
        earlyExit = H.secondsOfDay(actualOut) + H.integer(shift.early_exit_grace_minutes, 0) * 60 < H.secondsOfDay(shiftEnd);
      }
    } else if (attendanceStatus === "Có mặt" || attendanceStatus === "Làm việc từ xa") {
      workingMinutes = H.integer(shift.working_minutes, 0);
    } else if (attendanceStatus === "Nửa ngày") {
      workingMinutes = Math.floor(H.integer(shift.working_minutes, 0) / 2);
    }

    return {
      ...input,
      employee: employeeName,
      company: H.requiredText(employeeState.company, "Employee company"),
      branch: H.requiredText(employeeState.branch, "Employee branch"),
      department: H.requiredText(employeeState.department, "Employee department"),
      shift_type: shiftName,
      attendance_date: attendanceDate,
      working_minutes: workingMinutes,
      working_hours: workingMinutes / 60,
      overtime_minutes: overtimeMinutes,
      overtime_hours: overtimeMinutes / 60,
      late_entry: lateEntry ? 1 : 0,
      early_exit: earlyExit ? 1 : 0,
    };
  }

  status(context: HrmContext): string {
    return nextDocStatus(context.command.action) === 1 ? "Approved" : super.status(context, context.command.document);
  }
}

export class ShiftTypeController extends SuiteController<JsonObject> {
  readonly doctype = "Shift Type";

  async normalize(context: HrmContext): Promise<JsonObject> {
    const input = context.command.document;
    const startTime = H.requiredTime(input.start_time, "Shift start_time");
    const endTime = H.requiredTime(input.end_time, "Shift end_time");
    const minutes = H.timeRangeMinutes(startTime, endTime);
    const configuredMinutes = H.integer(input.working_minutes, 0);
    if (configuredMinutes <= 0 || configuredMinutes > minutes) throw errors.validation("Shift working_minutes must be positive and not exceed the shift span");
    const lateGrace = H.integer(input.late_grace_minutes, 0);
    const earlyGrace = H.integer(input.early_exit_grace_minutes, 0);
    if (lateGrace < 0 || earlyGrace < 0) throw errors.validation("Shift grace minutes cannot be negative");
    return { ...input, start_time: startTime, end_time: endTime, working_minutes: configuredMinutes, working_hours: configuredMinutes / 60, late_grace_minutes: lateGrace, early_exit_grace_minutes: earlyGrace };
  }
}
