import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { errors } from "../../core/src/index.js";
import { AlumDoorAttendanceDayController } from "./alumdoor-attendance.js";

const INTERNAL_PAYROLL_ROLE = "AlumDoor Payroll System";
const INTERNAL_SCAN_ROLE = "AlumDoor QR System";

/**
 * AlumDoor Lite attendance authority.
 *
 * The shared three-segment controller remains available for compatibility, while Lite
 * derives attendance evidence from the actual scan intervals and the submitted Shift Type:
 * minutes inside the assigned shift are regular work (capped by `working_minutes`), and
 * minutes before/after that shift interval are raw OT candidates.
 *
 * Raw OT is stored in `raw_overtime_minutes`. It is never payable by itself. Only payroll may
 * project submitted Overtime Request approval into `overtime_minutes`, capped by the raw
 * evidence. Normal scan/correction writes always reset payable OT to zero.
 *
 * A paid-leave-only work date is materialized only by the trusted payroll bundle. It is born
 * locked, has no scan evidence, stores zero worked/OT minutes, and records its leave source
 * separately so a closed payroll never depends on an un-lockable synthetic value.
 */
export class AlumDoorLiteAttendanceDayController implements DocumentController<JsonObject> {
  readonly doctype = "AlumDoor Attendance Day";
  private readonly base = new AlumDoorAttendanceDayController();

  async buildPlan(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    if (isPaidLeaveProjectionCreate(context)) return this.buildPaidLeaveProjection(context);

    const plan = await this.base.buildPlan(context);
    const workDate = text(plan.document.data.work_date, "Attendance work_date");
    const shiftName = text(plan.document.data.shift_type, "Attendance shift_type");
    const policyName = text(plan.document.data.policy, "Attendance policy");
    const scheduledMinutes = integer(plan.document.data.scheduled_minutes, "Attendance scheduled_minutes", 1, 1_440);

    const shift = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Shift Type", shiftName);
    if (!shift || shift.docstatus === 2) throw errors.reference(`Shift Type ${shiftName} is required`);
    const policy = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "AlumDoor Attendance Policy", policyName);
    if (!policy || policy.docstatus === 2) throw errors.reference(`Attendance policy ${policyName} is required`);

    const split = splitByAssignedShift({
      workDate,
      timeZone: text(policy.data.timezone, "Attendance policy timezone"),
      shiftStart: text(shift.data.start_time, `Shift Type ${shiftName} start_time`),
      shiftEnd: text(shift.data.end_time, `Shift Type ${shiftName} end_time`),
      scheduledMinutes,
      segments: arrayObjects(plan.document.data.segments),
    });
    const leave = paidLeaveOverlay(context.command.document, scheduledMinutes, false);
    const payrollLock = isPayrollLockSave(context);
    const payableOvertimeMinutes = payrollLock
      ? integer(context.command.document.overtime_minutes ?? 0, "Approved overtime_minutes", 0, split.overtimeMinutes)
      : 0;
    const requestedRaw = optionalInteger(context.command.document.raw_overtime_minutes);
    if (payrollLock && requestedRaw !== undefined && requestedRaw !== split.overtimeMinutes) {
      throw errors.validation("PAYROLL_INPUT_CHANGED: Raw overtime evidence changed before payroll lock");
    }

    const data: JsonObject = {
      ...plan.document.data,
      regular_minutes: split.regularMinutes,
      raw_overtime_minutes: split.overtimeMinutes,
      overtime_minutes: payableOvertimeMinutes,
      payable_work_fraction_bp: split.payableWorkFractionBp,
      ...leave,
    };
    const document = { ...plan.document, data };
    const events = plan.events.map((event) => {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as JsonObject
        : {};
      return {
        ...event,
        payload: {
          ...payload,
          regular_minutes: split.regularMinutes,
          raw_overtime_minutes: split.overtimeMinutes,
          overtime_minutes: payableOvertimeMinutes,
          payable_work_fraction_bp: split.payableWorkFractionBp,
          ...leave,
        },
      };
    });
    const result = plan.result && typeof plan.result === "object" && !Array.isArray(plan.result)
      ? plan.result as JsonObject
      : {};

    return {
      ...plan,
      document,
      events,
      result: {
        ...result,
        regular_minutes: split.regularMinutes,
        raw_overtime_minutes: split.overtimeMinutes,
        overtime_minutes: payableOvertimeMinutes,
        payable_work_fraction_bp: split.payableWorkFractionBp,
        ...leave,
      },
    };
  }

  private async buildPaidLeaveProjection(context: ControllerContext<JsonObject>): Promise<MutationPlan<JsonObject>> {
    const input = context.command.document;
    const syntheticActor = {
      ...context.command.actor,
      roles: [...new Set([...context.command.actor.roles, INTERNAL_SCAN_ROLE])],
    };
    const syntheticContext: ControllerContext<JsonObject> = {
      ...context,
      command: {
        ...context.command,
        actor: syntheticActor,
        document: {
          ...input,
          segments: ["SHIFT1", "SHIFT2", "SHIFT3"].map((code) => ({
            row_id: code,
            segment_code: code,
            state: "complete",
          })),
        },
      },
    };
    const plan = await this.base.buildPlan(syntheticContext);
    const scheduledMinutes = integer(plan.document.data.scheduled_minutes, "Attendance scheduled_minutes", 1, 1_440);
    const leave = paidLeaveOverlay(input, scheduledMinutes, true);
    const lockedBy = text(input.locked_by_payroll, "Paid leave projection payroll");
    const expectedAssignment = optionalText(input.shift_assignment);
    const expectedShift = optionalText(input.shift_type);
    if (expectedAssignment && expectedAssignment !== plan.document.data.shift_assignment) {
      throw errors.reference("Paid leave projection Shift Assignment changed since payroll calculation");
    }
    if (expectedShift && expectedShift !== plan.document.data.shift_type) {
      throw errors.reference("Paid leave projection Shift Type changed since payroll calculation");
    }
    if (input.scheduled_minutes !== undefined
      && integer(input.scheduled_minutes, "Paid leave scheduled_minutes", 1, 1_440) !== scheduledMinutes) {
      throw errors.reference("Paid leave projection scheduled minutes changed since payroll calculation");
    }

    const { segments: _syntheticSegments, ...baseData } = plan.document.data;
    const data: JsonObject = {
      ...baseData,
      state: "locked",
      locked_by_payroll: lockedBy,
      locked_at: context.now,
      regular_minutes: 0,
      raw_overtime_minutes: 0,
      overtime_minutes: 0,
      payable_work_fraction_bp: 0,
      segments: [],
      ...leave,
    };
    const document = {
      ...plan.document,
      status: "locked",
      data,
      children: [],
    };
    const events = plan.events.map((event) => {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as JsonObject
        : {};
      return {
        ...event,
        payload: {
          ...payload,
          state: "locked",
          locked_by_payroll: lockedBy,
          regular_minutes: 0,
          raw_overtime_minutes: 0,
          overtime_minutes: 0,
          payable_work_fraction_bp: 0,
          ...leave,
        },
      };
    });

    return {
      ...plan,
      command: context.command,
      document,
      events,
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        state: "locked",
        regular_minutes: 0,
        raw_overtime_minutes: 0,
        overtime_minutes: 0,
        payable_work_fraction_bp: 0,
        ...leave,
      },
    };
  }
}

export function splitLiteAttendanceByAssignedShift(input: {
  workDate: string;
  timeZone: string;
  shiftStart: string;
  shiftEnd: string;
  scheduledMinutes: number;
  segments: JsonObject[];
}): { regularMinutes: number; overtimeMinutes: number; payableWorkFractionBp: number } {
  return splitByAssignedShift(input);
}

function isPaidLeaveProjectionCreate(context: ControllerContext<JsonObject>): boolean {
  return context.command.action === "create"
    && context.command.actor.roles.includes(INTERNAL_PAYROLL_ROLE)
    && integerOrZero(context.command.document.paid_leave_minutes) > 0
    && Boolean(optionalText(context.command.document.source_leave_application));
}

function isPayrollLockSave(context: ControllerContext<JsonObject>): boolean {
  return context.command.action === "save"
    && context.command.actor.roles.includes(INTERNAL_PAYROLL_ROLE)
    && optionalText(context.command.document.state) === "locked"
    && Boolean(optionalText(context.command.document.locked_by_payroll));
}

function paidLeaveOverlay(input: JsonObject, scheduledMinutes: number, required: boolean): JsonObject {
  const paidLeaveMinutes = integerOrZero(input.paid_leave_minutes);
  const sourceLeaveApplication = optionalText(input.source_leave_application);
  const sourceLeaveVersion = integerOrZero(input.source_leave_version);
  if (!paidLeaveMinutes && !sourceLeaveApplication && !sourceLeaveVersion) {
    if (required) throw errors.validation("Paid leave projection source is required");
    return {};
  }
  if (!paidLeaveMinutes || paidLeaveMinutes > scheduledMinutes) {
    throw errors.validation("Paid leave minutes must be positive and cannot exceed scheduled minutes");
  }
  if (!sourceLeaveApplication || sourceLeaveVersion < 1) {
    throw errors.validation("Paid leave projection requires Leave Application name and source version");
  }
  return {
    paid_leave_minutes: paidLeaveMinutes,
    source_leave_application: sourceLeaveApplication,
    source_leave_version: sourceLeaveVersion,
  };
}

function splitByAssignedShift(input: {
  workDate: string;
  timeZone: string;
  shiftStart: string;
  shiftEnd: string;
  scheduledMinutes: number;
  segments: JsonObject[];
}): { regularMinutes: number; overtimeMinutes: number; payableWorkFractionBp: number } {
  const startSeconds = parseTimeSeconds(input.shiftStart, "Shift start_time");
  let endSeconds = parseTimeSeconds(input.shiftEnd, "Shift end_time");
  if (endSeconds <= startSeconds) endSeconds += 86_400;

  const intervals = mergeIntervals(input.segments.flatMap((segment) => {
    const actualIn = typeof segment.actual_in === "string" ? segment.actual_in.trim() : "";
    const actualOut = typeof segment.actual_out === "string" ? segment.actual_out.trim() : "";
    if (!actualIn || !actualOut) return [];
    const from = logicalSeconds(actualIn, input.workDate, input.timeZone);
    const to = logicalSeconds(actualOut, input.workDate, input.timeZone);
    if (to < from) throw errors.validation("Attendance OUT cannot precede IN");
    return [{ from, to }];
  }));

  let insideSeconds = 0;
  let outsideSeconds = 0;
  for (const interval of intervals) {
    const inside = Math.max(0, Math.min(interval.to, endSeconds) - Math.max(interval.from, startSeconds));
    insideSeconds += inside;
    outsideSeconds += Math.max(0, interval.to - interval.from - inside);
  }

  const workedInsideMinutes = Math.floor(insideSeconds / 60);
  const regularMinutes = Math.min(input.scheduledMinutes, workedInsideMinutes);
  const overtimeMinutes = Math.floor(outsideSeconds / 60);
  const payableWorkFractionBp = Math.min(10_000, roundHalfUp(regularMinutes * 10_000, input.scheduledMinutes));
  return { regularMinutes, overtimeMinutes, payableWorkFractionBp };
}

function logicalSeconds(value: string, workDate: string, timeZone: string): number {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw errors.validation("Attendance timestamp is invalid");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value;
    const parsed = Number(found);
    if (!Number.isInteger(parsed)) throw errors.validation("Attendance timestamp cannot be resolved in policy timezone");
    return parsed;
  };
  const localDate = `${String(read("year")).padStart(4, "0")}-${String(read("month")).padStart(2, "0")}-${String(read("day")).padStart(2, "0")}`;
  const seconds = read("hour") * 3_600 + read("minute") * 60 + read("second");
  if (localDate === workDate) return seconds;
  if (localDate === addDays(workDate, 1)) return seconds + 86_400;
  throw errors.validation("Attendance evidence is outside the assigned logical work date");
}

function parseTimeSeconds(value: string, field: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw errors.validation(`${field} must use HH:mm or HH:mm:ss`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(second) || second < 0 || second > 59) {
    throw errors.validation(`${field} is invalid`);
  }
  return hour * 3_600 + minute * 60 + second;
}

function mergeIntervals(intervals: Array<{ from: number; to: number }>): Array<{ from: number; to: number }> {
  const sorted = intervals.filter((interval) => interval.to > interval.from).sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: Array<{ from: number; to: number }> = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (!last || interval.from > last.to) {
      merged.push({ ...interval });
    } else if (interval.to > last.to) {
      last.to = interval.to;
    }
  }
  return merged;
}

function arrayObjects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function text(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}

function optionalText(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

function integer(value: unknown, field: string, min: number, max: number): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw errors.validation(`${field} must be an integer between ${min} and ${max}`);
  return result;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw errors.validation("Attendance integer is invalid");
  return result;
}

function integerOrZero(value: unknown): number {
  return optionalInteger(value) ?? 0;
}

function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator <= 0) {
    throw errors.validation("Attendance ratio is invalid");
  }
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

function addDays(value: string, days: number): string {
  const timestamp = Date.parse(`${value}T00:00:00Z`) + days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}
