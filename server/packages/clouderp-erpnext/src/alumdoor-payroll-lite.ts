import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import type { SalarySlipData } from "./enterprise-types.js";
import * as H from "./hrm-shared.js";
import {
  buildAlumDoorSalarySlipInputs,
  type AlumDoorGeneratedSalaryInput,
} from "./alumdoor-payroll.js";

const ATTENDANCE_DAY = "AlumDoor Attendance Day";
const PAID_LEAVE_PROBE_PREFIX = "__ALU_PAID_LEAVE_PROBE__";

/**
 * Operational AlumDoor Lite payroll seam.
 *
 * Attendance Day stores scan-derived raw overtime separately from payable overtime. The
 * underlying AlumDoor payroll builder reads submitted Overtime Request documents and pays
 * `min(raw_overtime_minutes, approved_minutes)`; without a submitted request payable OT is 0.
 * Both regular work and approved payable OT use the fixed AlumDoor hourly rates.
 *
 * Salary Slip is output-only for Lite money. Legacy manual allowance/advance/deduction fields
 * are stripped before calculation: fixed allowance comes from Pay Profile, while bonus,
 * deduction and simple advance adjustments come from submitted Additional Salary records.
 *
 * A leave-only period has no scan-created Attendance Day yet. The legacy builder historically
 * failed before it could evaluate paid leave, so this seam injects one transient zero-work
 * probe only when a submitted, paid, working-day leave with a valid Shift Assignment exists.
 * The probe is removed from the authoritative trace/hash. Finalization materializes the real
 * paid-leave Attendance Day rows from the validated `paid_leave` trace and locks them atomically.
 */
export async function buildAlumDoorLiteSalarySlipInputs(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<AlumDoorGeneratedSalaryInput | null> {
  const baseReader = context.reader;
  let paidLeaveProbe: CanonicalDocument<JsonObject> | null | undefined;
  const reader = new Proxy(baseReader, {
    get(target, property, receiver) {
      if (property === "listDocumentsByDoctype") {
        return async (tenantId: string, doctype: string) => {
          const documents = await target.listDocumentsByDoctype<JsonObject>(tenantId, doctype);
          if (doctype !== ATTENDANCE_DAY) return documents;
          const hasPeriodAttendance = documents.some((entry) => H.text(entry.data.employee) === input.employee
            && H.text(entry.data.work_date) >= input.start_date
            && H.text(entry.data.work_date) <= input.end_date);
          if (hasPeriodAttendance) return documents;
          if (paidLeaveProbe === undefined) paidLeaveProbe = await findPaidLeaveProbe(context, input);
          return paidLeaveProbe ? [...documents, paidLeaveProbe] : documents;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const {
    alu_allowance_vnd: _legacyManualAllowance,
    alu_advance_vnd: _legacyManualAdvance,
    alu_manual_deduction_vnd: _legacyManualDeduction,
    alu_adjustment_reason: _legacyManualReason,
    ...automaticSource
  } = input;
  const liteInput = {
    ...automaticSource,
    alu_advance_vnd: 0,
    alu_manual_deduction_vnd: 0,
  } as SalarySlipData;

  const generated = await buildAlumDoorSalarySlipInputs({ ...context, reader }, liteInput);
  if (!generated) return null;

  const sourceTrace = parseTrace(generated.alu_formula_trace_json);
  const attendance = arrayObjects(sourceTrace.attendance)
    .filter((row) => !H.text(row.name).startsWith(PAID_LEAVE_PROBE_PREFIX));
  const liteTrace = {
    ...sourceTrace,
    reconciliation_version: 6,
    overtime_authority: "AlumDoor Attendance Day.raw_overtime_minutes + submitted Overtime Request; payable=min(raw, approved)",
    paid_leave_authority: "validated Leave Application -> canonical AlumDoor Attendance Day projection on finalize",
    salary_override_authority: "Pay Profile + Additional Salary only",
    attendance,
  };
  const traceJson = JSON.stringify(liteTrace);
  return {
    ...generated,
    rule_trace_json: traceJson,
    alu_formula_trace_json: traceJson,
    alu_advance_vnd: 0,
    alu_manual_deduction_vnd: 0,
  };
}

async function findPaidLeaveProbe(
  context: ControllerContext<SalarySlipData>,
  input: SalarySlipData,
): Promise<CanonicalDocument<JsonObject> | null> {
  const tenantId = context.command.tenant_id;
  const employee = await context.reader.getDocument<JsonObject>(tenantId, "Employee", input.employee);
  if (!employee || employee.docstatus === 2) return null;
  H.assertEmployeeActive(employee.data, input.employee);

  const assignments = (await context.reader.listDocumentsByDoctype<JsonObject>(tenantId, "Shift Assignment"))
    .filter((entry) => entry.docstatus === 1 && H.text(entry.data.employee) === input.employee)
    .sort((left, right) => H.text(left.data.start_date).localeCompare(H.text(right.data.start_date)) || left.name.localeCompare(right.name));
  const leaves = (await context.reader.listDocumentsByDoctype<JsonObject>(tenantId, "Leave Application"))
    .filter((entry) => entry.docstatus === 1
      && H.text(entry.data.employee) === input.employee
      && H.text(entry.data.company) === input.company
      && H.text(entry.data.from_date) <= input.end_date
      && H.text(entry.data.to_date) >= input.start_date)
    .sort((left, right) => H.text(left.data.from_date).localeCompare(H.text(right.data.from_date)) || left.name.localeCompare(right.name));

  for (const leave of leaves) {
    const allocationName = H.text(leave.data.leave_allocation);
    if (!allocationName) continue;
    const allocation = await context.reader.getDocument<JsonObject>(tenantId, "Leave Allocation", allocationName);
    if (!allocation || allocation.docstatus !== 1) continue;
    if (H.text(allocation.data.employee) !== input.employee || H.text(allocation.data.company) !== input.company) continue;
    if (H.text(allocation.data.leave_type) !== H.text(leave.data.leave_type)) continue;

    const policyName = H.text(allocation.data.leave_policy);
    if (!policyName) continue;
    const leavePolicy = await context.reader.getDocument<JsonObject>(tenantId, "Leave Policy", policyName);
    if (!leavePolicy || leavePolicy.docstatus !== 1 || !H.truthy(leavePolicy.data.is_paid)) continue;
    if (H.text(leavePolicy.data.company) !== input.company || H.text(leavePolicy.data.leave_type) !== H.text(leave.data.leave_type)) continue;

    const holidayListName = H.text(leave.data.holiday_list) || H.text(allocation.data.holiday_list);
    if (!holidayListName) continue;
    const holidayList = await context.reader.getDocument<JsonObject>(tenantId, "Holiday List", holidayListName);
    if (!holidayList || holidayList.docstatus !== 1 || H.text(holidayList.data.company) !== input.company) continue;
    const weeklyOff = H.parseWeeklyOff(H.text(holidayList.data.weekly_off_days));
    const holidays = H.parseHolidayDates(H.text(holidayList.data.holidays_json));
    const fromDate = maxDate(H.text(leave.data.from_date), input.start_date);
    const toDate = minDate(H.text(leave.data.to_date), input.end_date);

    for (const workDate of enumerateDates(fromDate, toDate)) {
      if (!H.isWorkingDay(workDate, weeklyOff, holidays)) continue;
      const matchingAssignments = assignments.filter((entry) => H.text(entry.data.start_date) <= workDate
        && (!H.text(entry.data.end_date) || H.text(entry.data.end_date) >= workDate));
      if (matchingAssignments.length !== 1) continue;
      const assignment = matchingAssignments[0]!;
      const shiftName = H.text(assignment.data.shift_type);
      if (!shiftName) continue;
      const shift = await context.reader.getDocument<JsonObject>(tenantId, "Shift Type", shiftName);
      if (!shift || shift.docstatus !== 1) continue;
      const scheduledMinutes = integer(shift.data.working_minutes, `Shift Type ${shiftName} working_minutes`, 1, 1_440);
      return {
        tenant_id: tenantId,
        doctype: ATTENDANCE_DAY,
        name: `${PAID_LEAVE_PROBE_PREFIX}:${input.employee}:${workDate}`,
        owner: "AlumDoor Payroll System",
        docstatus: 0,
        status: "complete",
        version: 0,
        created_at: context.now,
        modified_at: context.now,
        data: {
          employee: input.employee,
          company: input.company,
          work_date: workDate,
          shift_assignment: assignment.name,
          shift_type: shiftName,
          scheduled_minutes: scheduledMinutes,
          state: "complete",
          regular_minutes: 0,
          raw_overtime_minutes: 0,
          overtime_minutes: 0,
          payable_work_fraction_bp: 0,
        },
        children: [],
      };
    }
  }
  return null;
}

function parseTrace(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw errors.validation("AlumDoor payroll trace is invalid JSON");
  }
}

function arrayObjects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function integer(value: unknown, field: string, min: number, max: number): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw errors.validation(`${field} must be an integer between ${min} and ${max}`);
  }
  return result;
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  for (let current = fromDate; current <= toDate; current = addDays(current, 1)) dates.push(current);
  return dates;
}

function addDays(value: string, days: number): string {
  const timestamp = Date.parse(`${value}T00:00:00Z`) + days * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function maxDate(left: string, right: string): string { return left > right ? left : right; }
function minDate(left: string, right: string): string { return left < right ? left : right; }
