/**
 * AlumDoor's three-segment daily attendance projection.
 *
 * HRM's standard Attendance document deliberately remains untouched. This projection
 * consumes the same submitted Shift Assignment/Shift Type to decide which scanned
 * minutes are regular work and which minutes are only raw OT candidates.
 */
import type { CanonicalDocument, ChildRow, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import {
  asSegmentCode,
  assertAttendanceWindows,
  AttendanceRuleError,
  calculateAttendance,
  type AttendanceSegmentCode,
  type AttendanceSegmentStatus,
  type AttendanceSegmentWindow,
  type SegmentSnapshot,
} from "../../../apps-src/alumdoor-worker/src/attendance-core.js";
import * as H from "./hrm-shared.js";

const INTERNAL_SCAN_ROLE = "AlumDoor QR System";
const INTERNAL_CORRECTION_ROLE = "AlumDoor Attendance System";
const INTERNAL_PAYROLL_ROLE = "AlumDoor Payroll System";
const DAY_DOCTYPE = "AlumDoor Attendance Day";
const SEGMENT_DOCTYPE = "AlumDoor Attendance Segment";
const DEVICE_DOCTYPE = "AlumDoor Attendance Device";
const DEVICE_SYSTEM_ROLE = "AlumDoor Device System";

type SegmentInput = SegmentSnapshot & { row_id?: string; in_checkin?: string; out_checkin?: string };

export class AlumDoorAttendanceDayController implements DocumentController<JsonObject> {
  readonly doctype = DAY_DOCTYPE;

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    const isScan = context.command.actor.roles.includes(INTERNAL_SCAN_ROLE);
    const isPayroll = !isScan && context.command.actor.roles.includes(INTERNAL_PAYROLL_ROLE);
    const isCorrection = !isScan && !isPayroll && context.command.actor.roles.includes(INTERNAL_CORRECTION_ROLE);
    if (!isScan && !isCorrection && !isPayroll) {
      throw errors.permission("AlumDoor Attendance Day chỉ được cập nhật từ giao dịch QR, phiếu sửa công đã duyệt hoặc điều phối lương nội bộ.");
    }
    if (context.command.action !== "create" && context.command.action !== "save") {
      throw errors.lifecycle("AlumDoor Attendance Day chỉ hỗ trợ tạo hoặc cập nhật nội bộ.");
    }
    if ((isCorrection || isPayroll) && context.command.action !== "save") {
      throw errors.lifecycle("Điều phối sửa công/lương chỉ được cập nhật bản ghi công đã tồn tại.");
    }
    const existingState = H.text(context.existing?.data.state);
    if (existingState === "locked" && (isScan || isCorrection)) {
      throw errors.lifecycle("LOCKED_BY_PAYROLL: Ngày công đã khóa bởi kỳ lương; hãy tạo điều chỉnh ở kỳ sau.");
    }

    const data = await normalizeAttendanceDay(context, isPayroll, isCorrection);
    const document: CanonicalDocument<JsonObject> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: String(data.state),
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: childRows(data),
    };

    const eventType = isPayroll
      ? "alumdoor_attendance_day.locked"
      : isCorrection
        ? "alumdoor_attendance_day.corrected"
        : `alumdoor_attendance_day.${context.command.action === "create" ? "created" : "updated"}`;
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          employee: data.employee,
          work_date: data.work_date,
          shift_assignment: data.shift_assignment,
          shift_type: data.shift_type,
          scheduled_minutes: data.scheduled_minutes,
          state: data.state,
          regular_minutes: data.regular_minutes,
          raw_overtime_minutes: data.raw_overtime_minutes,
          overtime_minutes: data.overtime_minutes,
          ...(data.locked_by_payroll ? { locked_by_payroll: data.locked_by_payroll } : {}),
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        state: document.status,
        regular_minutes: data.regular_minutes,
        raw_overtime_minutes: data.raw_overtime_minutes,
        overtime_minutes: data.overtime_minutes,
      },
    };
  }
}

/** Registered attendance credentials. Plaintext credentials never cross this controller. */
export class AlumDoorAttendanceDeviceController implements DocumentController<JsonObject> {
  readonly doctype = DEVICE_DOCTYPE;

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    if (!["create", "save"].includes(context.command.action)) throw errors.lifecycle("Thiết bị chấm công chỉ hỗ trợ tạo, cập nhật hoặc thu hồi.");
    const internal = context.command.actor.roles.includes(DEVICE_SYSTEM_ROLE);
    const manager = context.command.actor.user_id === "Administrator"
      || context.command.actor.roles.some((role) => ["Administrator", "System Manager", "HR Manager", "AlumDoor Attendance Manager"].includes(role));
    if (!internal && !manager) throw errors.permission("Chỉ hệ thống chấm công hoặc quản lý được cập nhật thiết bị.");
    if (context.command.action === "create" && !internal) throw errors.permission("Thiết bị chỉ được tạo qua luồng đăng ký an toàn.");

    const input = context.command.document;
    const deviceId = H.requiredText(input.device_id, "Attendance device id");
    if (deviceId !== context.command.aggregate.name || !/^[A-Za-z0-9_-]{16,128}$/u.test(deviceId)) throw errors.validation("Attendance device id is invalid");
    const employee = H.requiredText(input.employee, "Attendance device employee");
    const credentialHash = H.requiredText(input.credential_hash, "Attendance credential hash").toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(credentialHash)) throw errors.validation("Attendance credential hash is invalid");
    await H.requireRecord(context as H.HrmContext, "Employee", employee);
    if (context.existing) {
      if (H.text(context.existing.data.employee) !== employee || H.text(context.existing.data.credential_hash) !== credentialHash) {
        throw errors.lifecycle("Employee và credential của thiết bị là bất biến; hãy thu hồi và đăng ký thiết bị mới.");
      }
    }
    const status = H.text(input.status) || "Active";
    if (!(["Active", "Revoked"] as const).includes(status as "Active" | "Revoked")) throw errors.validation("Attendance device status is invalid");
    if (!internal && status !== "Revoked") throw errors.lifecycle("Quản lý chỉ có thể thu hồi thiết bị; thiết bị đã thu hồi phải đăng ký lại bằng credential mới.");
    const data: JsonObject = {
      ...input,
      device_id: deviceId,
      device_label: H.requiredText(input.device_label, "Attendance device label"),
      employee,
      credential_hash: credentialHash,
      status,
      registered_at: context.existing ? H.requiredDatetime(context.existing.data.registered_at, "Attendance device registered_at") : context.now,
      last_seen_at: H.text(input.last_seen_at) ? H.requiredDatetime(input.last_seen_at, "Attendance device last_seen_at") : context.now,
      ...(status === "Revoked" ? { revoked_at: H.text(input.revoked_at) || context.now } : {}),
    };
    const document: CanonicalDocument<JsonObject> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: deviceId,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };
    return {
      command: context.command,
      document,
      gl_entries: [], stock_entries: [], payment_entries: [], fulfillment_entries: [],
      events: [domainEvent({
        type: status === "Revoked" ? "alumdoor_attendance_device.revoked" : context.command.action === "create" ? "alumdoor_attendance_device.registered" : "alumdoor_attendance_device.seen",
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { employee, status },
      })],
      result: { doctype: this.doctype, name: deviceId, version: context.nextVersion, status },
    };
  }
}

async function normalizeAttendanceDay(context: ControllerContext<JsonObject>, payrollLock: boolean, correction: boolean): Promise<JsonObject> {
  const input = context.command.document;
  const employeeName = H.requiredText(input.employee, "Employee");
  const workDate = H.requiredDate(input.work_date, "Work date");
  const employee = await H.requireRecord(context as H.HrmContext, "Employee", employeeName);
  H.assertEmployeeActive(employee, employeeName);
  const employeeState = await H.resolveEmployeeState(context as H.HrmContext, employeeName, employee, workDate);
  H.assertEmployeeStateActive(employeeState, employeeName, workDate);
  const company = H.requiredText(employeeState.company, "Employee company");
  const branch = H.requiredText(employeeState.branch, "Employee branch");
  const department = H.text(employeeState.department);

  const policyName = H.requiredText(input.policy, "Attendance policy");
  const policy = await H.requireRecord(context as H.HrmContext, "AlumDoor Attendance Policy", policyName);
  if (H.text(policy.policy_status) !== "approved") throw errors.reference(`Attendance policy ${policyName} is not approved`);
  if (H.text(policy.company) !== company) throw errors.reference(`Attendance policy ${policyName} belongs to another company`);
  if (H.text(policy.branch) && H.text(policy.branch) !== branch) throw errors.reference(`Attendance policy ${policyName} belongs to another branch`);
  const timezone = H.requiredText(policy.timezone, "Attendance policy timezone");
  const windows = policyWindows(policy);
  try { assertAttendanceWindows(windows); } catch (error) {
    if (error instanceof AttendanceRuleError) throw errors.validation(error.message, { code: error.code });
    throw error;
  }

  const assignedShift = await resolveAssignedShift(context, employeeName, workDate, company, branch, windows);
  const existingShiftAssignment = H.text(context.existing?.data.shift_assignment);
  if (existingShiftAssignment && existingShiftAssignment !== assignedShift.assignmentName) {
    throw errors.lifecycle(`Attendance Day is already bound to Shift Assignment ${existingShiftAssignment}`);
  }

  const segments = segmentSnapshots(input.segments);
  let calculated;
  try {
    calculated = calculateAttendance({
      workDate,
      segments,
      timeZone: timezone,
      windows,
      regularDailyCapMinutes: assignedShift.scheduledMinutes,
      regularSegmentCodes: assignedShift.regularSegmentCodes,
    });
  } catch (error) {
    if (error instanceof AttendanceRuleError) throw errors.validation(error.message, { code: error.code });
    throw error;
  }

  if (payrollLock && !["complete", "approved", "locked"].includes(calculated.state)) {
    throw errors.validation(`PAYROLL_BLOCKED: Không thể khóa ngày công ${workDate} ở trạng thái ${calculated.state}.`);
  }
  if (correction && calculated.state !== "complete") {
    throw errors.validation(`ATTENDANCE_CORRECTION_INCOMPLETE: Phiếu sửa phải tạo ra ngày công hoàn chỉnh; trạng thái hiện tại ${calculated.state}.`);
  }
  const requestedPayroll = H.text(input.locked_by_payroll);
  const existingPayroll = H.text(context.existing?.data.locked_by_payroll);
  if (payrollLock && !requestedPayroll) throw errors.validation("Payroll lock requires locked_by_payroll");
  if (existingPayroll && requestedPayroll && existingPayroll !== requestedPayroll) {
    throw errors.lifecycle(`Attendance Day is already locked by Payroll Entry ${existingPayroll}`);
  }
  // Raw outside-shift minutes come only from attendance evidence. The canonical
  // `overtime_minutes` field is zero during scan/correction and is populated only by the
  // trusted payroll bundle after reconciling a submitted Overtime Request.
  const approvedOvertimeMinutes = payrollLock ? H.integer(input.overtime_minutes, 0) : 0;
  if (approvedOvertimeMinutes < 0 || approvedOvertimeMinutes > calculated.overtimeMinutes) {
    throw errors.validation(`Approved overtime ${approvedOvertimeMinutes} exceeds raw outside-shift evidence ${calculated.overtimeMinutes} on ${workDate}`);
  }

  const existingByCode = new Map(
    Array.isArray(input.segments)
      ? input.segments.filter((value): value is JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value)).map((value) => [String(value.segment_code ?? ""), value])
      : [],
  );
  const normalizedSegments = calculated.segments.map((segment) => {
    const prior = existingByCode.get(segment.code);
    return {
      row_id: typeof prior?.row_id === "string" && prior.row_id ? prior.row_id : segment.code,
      segment_code: segment.code,
      ...(typeof prior?.in_checkin === "string" && prior.in_checkin ? { in_checkin: prior.in_checkin } : {}),
      ...(typeof prior?.out_checkin === "string" && prior.out_checkin ? { out_checkin: prior.out_checkin } : {}),
      ...(segment.actualIn ? { actual_in: segment.actualIn } : {}),
      ...(segment.actualOut ? { actual_out: segment.actualOut } : {}),
      actual_minutes: segment.actualMinutes,
      regular_minutes: segment.regularMinutes,
      overtime_minutes: segment.overtimeMinutes,
      state: correction && segment.code === H.text(input.corrected_segment_code) ? "corrected" : segment.status,
      calculation_version: context.nextVersion,
    };
  });

  return {
    employee: employeeName,
    company,
    branch,
    ...(department ? { department } : {}),
    work_date: workDate,
    policy: policyName,
    shift_assignment: assignedShift.assignmentName,
    shift_type: assignedShift.shiftName,
    scheduled_minutes: assignedShift.scheduledMinutes,
    state: payrollLock ? "locked" : correction ? "approved" : calculated.state,
    ...(calculated.exceptionCode ? { exception_code: calculated.exceptionCode } : {}),
    ...(payrollLock ? { locked_by_payroll: requestedPayroll, locked_at: context.now } : {}),
    regular_minutes: calculated.regularMinutes,
    raw_overtime_minutes: calculated.overtimeMinutes,
    overtime_minutes: approvedOvertimeMinutes,
    payable_work_fraction_bp: calculated.payableWorkFractionBp,
    calculated_at: context.now,
    segments: normalizedSegments,
  };
}

async function resolveAssignedShift(
  context: ControllerContext<JsonObject>,
  employeeName: string,
  workDate: string,
  company: string,
  branch: string,
  windows: readonly AttendanceSegmentWindow[],
): Promise<{ assignmentName: string; shiftName: string; scheduledMinutes: number; regularSegmentCodes: AttendanceSegmentCode[] }> {
  const assignments = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Shift Assignment"))
    .filter((assignment) => assignment.docstatus === 1
      && H.text(assignment.data.employee) === employeeName
      && H.text(assignment.data.start_date) <= workDate
      && (!H.text(assignment.data.end_date) || H.text(assignment.data.end_date) >= workDate));
  if (assignments.length !== 1) {
    throw errors.reference(`Exactly one submitted Shift Assignment is required for ${employeeName} on ${workDate}`);
  }
  const assignment = assignments[0]!;
  if (H.text(assignment.data.company) && H.text(assignment.data.company) !== company) {
    throw errors.reference(`Shift Assignment ${assignment.name} belongs to another company`);
  }
  if (H.text(assignment.data.branch) && H.text(assignment.data.branch) !== branch) {
    throw errors.reference(`Shift Assignment ${assignment.name} belongs to another branch`);
  }
  const shiftName = H.requiredText(assignment.data.shift_type, `Shift Assignment ${assignment.name} shift_type`);
  const shift = await H.requireRecord(context as H.HrmContext, "Shift Type", shiftName);
  if (H.truthy(shift.disabled)) throw errors.reference(`Shift Type ${shiftName} is disabled`);
  const scheduledMinutes = H.integer(shift.working_minutes, 0);
  if (scheduledMinutes <= 0 || scheduledMinutes > 24 * 60) {
    throw errors.reference(`Shift Type ${shiftName} has invalid working_minutes`);
  }

  const shiftStart = timeMinute(H.requiredTime(shift.start_time, `Shift Type ${shiftName} start_time`));
  const rawShiftEnd = timeMinute(H.requiredTime(shift.end_time, `Shift Type ${shiftName} end_time`));
  const shiftEnd = rawShiftEnd <= shiftStart ? rawShiftEnd + 24 * 60 : rawShiftEnd;
  const regularSegmentCodes = windows
    .filter((window) => {
      const segmentStart = window.workStartMinute;
      const segmentEnd = window.workEndMinute <= segmentStart ? window.workEndMinute + 24 * 60 : window.workEndMinute;
      return Math.max(shiftStart, segmentStart) < Math.min(shiftEnd, segmentEnd);
    })
    .map((window) => window.code);
  if (regularSegmentCodes.length === 0) {
    throw errors.reference(`Shift Type ${shiftName} does not overlap any AlumDoor attendance segment`);
  }
  return { assignmentName: assignment.name, shiftName, scheduledMinutes, regularSegmentCodes };
}

function timeMinute(value: string): number {
  // H.requiredTime already validates HH:MM. Slice parsing avoids noUncheckedIndexedAccess
  // ambiguity from tuple destructuring while keeping this helper branch-free and deterministic.
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw errors.validation("Shift time is invalid");
  return hour * 60 + minute;
}

function segmentSnapshots(value: unknown): SegmentInput[] {
  if (!Array.isArray(value)) throw errors.validation("Attendance day requires three segment rows.");
  const seen = new Set<string>();
  const segments: SegmentInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation("Attendance segment is invalid.");
    const row = raw as JsonObject;
    const code = asSegmentCode(row.segment_code);
    if (seen.has(code)) throw errors.validation(`Attendance day has duplicate segment ${code}.`);
    seen.add(code);
    const actualIn = optionalDatetime(row.actual_in, "Segment actual_in");
    const actualOut = optionalDatetime(row.actual_out, "Segment actual_out");
    const status = normalizedSegmentStatus(row.state ?? row.status, actualIn, actualOut);
    segments.push({ code, status, ...(actualIn ? { actualIn } : {}), ...(actualOut ? { actualOut } : {}), ...(typeof row.row_id === "string" ? { row_id: row.row_id } : {}), ...(typeof row.in_checkin === "string" ? { in_checkin: row.in_checkin } : {}), ...(typeof row.out_checkin === "string" ? { out_checkin: row.out_checkin } : {}) });
  }
  if (seen.size !== 3) throw errors.validation("Attendance day requires exactly SHIFT1, SHIFT2 and SHIFT3.");
  return segments;
}

function normalizedSegmentStatus(value: unknown, actualIn: string | undefined, actualOut: string | undefined): AttendanceSegmentStatus {
  if (!actualIn && !actualOut) return "empty";
  if (actualIn && !actualOut) return "open";
  if (!actualIn || !actualOut) throw errors.validation("Attendance segment must not contain an OUT without an IN.");
  return value === "corrected" ? "corrected" : "complete";
}
function optionalDatetime(value: unknown, field: string): string | undefined { const text = H.text(value); return text ? H.requiredDatetime(text, field) : undefined; }
function policyWindows(policy: JsonObject): AttendanceSegmentWindow[] {
  const shift1Start = H.integer(policy.shift1_start_minute, 420); const shift1End = H.integer(policy.shift1_end_minute, 690);
  const shift2Start = H.integer(policy.shift2_start_minute, 780); const shift2End = H.integer(policy.shift2_end_minute, 1020);
  const shift3Start = H.integer(policy.shift3_start_minute, 1050); const shift3End = H.integer(policy.shift3_latest_out_minute, 1439) + 1;
  return [
    { code: "SHIFT1", scanStartMinute: shift1Start - 90, scanEndMinute: shift1End + 59, workStartMinute: shift1Start, workEndMinute: shift1End },
    { code: "SHIFT2", scanStartMinute: shift2Start - 30, scanEndMinute: shift2End + 29, workStartMinute: shift2Start, workEndMinute: shift2End },
    { code: "SHIFT3", scanStartMinute: shift3Start, scanEndMinute: shift3End - 1, workStartMinute: shift3Start, workEndMinute: shift3End },
  ];
}
function childRows(data: JsonObject): ChildRow[] {
  const segments = Array.isArray(data.segments) ? data.segments : [];
  return segments.map((segment, index) => { const row = segment as JsonObject; return { fieldname: "segments", child_doctype: SEGMENT_DOCTYPE, row_id: String(row.row_id ?? `SEGMENT-${index + 1}`), idx: index + 1, data: structuredClone(row) }; });
}
