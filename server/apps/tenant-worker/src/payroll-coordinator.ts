import type { Actor, JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";
import { commandPayloadHash, errors, sha256Hex } from "../../../packages/core/src/index.js";
import type { DocumentKernel, MutationStore } from "../../../packages/document-kernel/src/index.js";

const PAYROLL_ENTRY = "Payroll Entry";
const SALARY_SLIP = "Salary Slip";
const ATTENDANCE_DAY = "AlumDoor Attendance Day";
const ATTENDANCE_POLICY = "AlumDoor Attendance Policy";
const INTERNAL_PAYROLL_ROLE = "AlumDoor Payroll System";

export interface AlumDoorPayrollApprovalInput { tenantId: string; actor: Actor; payrollEntry: string; }
export interface AlumDoorPayrollCoordinatorServices { kernel: DocumentKernel; store: MutationStore; now?: () => string; }

export interface AlumDoorPaidLeaveProjection {
  employee: string;
  workDate: string;
  shiftAssignment: string;
  shiftType: string;
  scheduledMinutes: number;
  paidLeaveMinutes: number;
  sourceLeaveApplication: string;
  sourceLeaveVersion: number;
}

export async function approveAlumDoorPayroll(input: AlumDoorPayrollApprovalInput, services: AlumDoorPayrollCoordinatorServices): Promise<JsonObject> {
  assertApprover(input.actor);
  const payrollName = requiredText(input.payrollEntry, "Payroll Entry");
  const payroll = await services.store.getDocument<JsonObject>(input.tenantId, PAYROLL_ENTRY, payrollName);
  if (!payroll || payroll.docstatus === 2) throw errors.reference(`Payroll Entry ${payrollName} does not exist`);
  if (payroll.docstatus === 1 && text(payroll.data.alu_state) === "approved") {
    return { replayed: true, payroll_entry: payrollName, state: "approved", employee_count: payroll.data.employee_count ?? 0 };
  }
  if (!["calculated", "pending_approval"].includes(text(payroll.data.alu_state))) throw errors.lifecycle("Payroll Entry must be calculated or pending approval before approval");
  const now = services.now?.() ?? new Date().toISOString();
  const startDate = requiredDate(payroll.data.start_date, "Payroll start_date");
  const endDate = requiredDate(payroll.data.end_date, "Payroll end_date");
  const company = requiredText(payroll.data.company, "Payroll company");
  const rows = arrayObjects(payroll.data.salary_slips);
  if (rows.length === 0) throw errors.validation("Payroll Entry has no Salary Slips to approve");

  const systemActor: Actor = { ...input.actor, roles: [...new Set([...input.actor.roles, INTERNAL_PAYROLL_ROLE, "Payroll Manager", "HR Manager", "Accounts Manager"])] };
  const commands: MutationCommand[] = [];
  const employees = new Set<string>();
  const slipHashes: Array<{ name: string; input_hash: string }> = [];
  const paidLeaveByKey = new Map<string, AlumDoorPaidLeaveProjection>();

  for (const [index, row] of rows.entries()) {
    const slipName = requiredText(row.salary_slip, `Salary Slip row ${index + 1}`);
    const slip = await services.store.getDocument<JsonObject>(input.tenantId, SALARY_SLIP, slipName);
    if (!slip || slip.docstatus === 2) throw errors.reference(`Salary Slip ${slipName} does not exist`);
    if (text(slip.data.company) !== company || text(slip.data.start_date) !== startDate || text(slip.data.end_date) !== endDate) throw errors.reference(`Salary Slip ${slipName} does not belong to Payroll Entry ${payrollName}`);
    if (text(slip.data.alu_payroll_entry) !== payrollName) throw errors.reference(`Salary Slip ${slipName} is not bound to Payroll Entry ${payrollName}`);
    const employee = requiredText(slip.data.employee, `Salary Slip ${slipName} employee`);
    if (employees.has(employee)) throw errors.validation(`Payroll Entry contains duplicate employee ${employee}`);
    employees.add(employee);
    const oldHash = requiredText(slip.data.alu_input_hash, `Salary Slip ${slipName} input hash`);
    slipHashes.push({ name: slipName, input_hash: oldHash });

    for (const projection of paidLeaveProjectionsFromTrace(slip.data.alu_formula_trace_json, employee)) {
      if (projection.workDate < startDate || projection.workDate > endDate) throw errors.validation(`Paid leave projection ${projection.workDate} is outside Payroll Entry ${payrollName}`);
      const key = attendanceKey(employee, projection.workDate);
      if (paidLeaveByKey.has(key)) throw errors.validation(`Duplicate paid leave projection for ${employee} / ${projection.workDate}`);
      paidLeaveByKey.set(key, projection);
    }

    if (slip.docstatus === 0) commands.push(await command({ tenantId: input.tenantId, actor: systemActor, doctype: SALARY_SLIP, name: slipName, action: "submit", expectedVersion: slip.version, document: { ...slip.data, alu_state: "pending_approval" }, submittedAt: now, commandId: `alu-payroll:${payrollName}:slip:${slipName}:submit` }));
  }

  const attendance = (await services.store.listDocumentsByDoctype<JsonObject>(input.tenantId, ATTENDANCE_DAY))
    .filter((entry) => employees.has(text(entry.data.employee)) && text(entry.data.work_date) >= startDate && text(entry.data.work_date) <= endDate)
    .sort((left, right) => text(left.data.employee).localeCompare(text(right.data.employee)) || text(left.data.work_date).localeCompare(text(right.data.work_date)));
  const coveredKeys = new Set<string>();

  for (const day of attendance) {
    const employee = requiredText(day.data.employee, `Attendance Day ${day.name} employee`);
    const workDate = requiredDate(day.data.work_date, `Attendance Day ${day.name} work_date`);
    const key = attendanceKey(employee, workDate);
    if (coveredKeys.has(key)) throw errors.validation(`PAYROLL_BLOCKED: duplicate Attendance Day for ${employee} / ${workDate}`);
    coveredKeys.add(key);
    const state = text(day.data.state); const lockedBy = text(day.data.locked_by_payroll);
    if (state === "locked" && lockedBy === payrollName) continue;
    if (!["complete", "approved"].includes(state)) throw errors.validation(`PAYROLL_BLOCKED: Attendance Day ${day.name} is ${state || "invalid"}`);
    const overtimeMinutes = integer(day.data.overtime_minutes ?? 0, `Attendance Day ${day.name} overtime_minutes`, 0, 1_440);
    const leave = paidLeaveByKey.get(key);
    commands.push(await command({
      tenantId: input.tenantId,
      actor: systemActor,
      doctype: ATTENDANCE_DAY,
      name: day.name,
      action: "save",
      expectedVersion: day.version,
      document: {
        ...day.data,
        overtime_minutes: overtimeMinutes,
        ...(leave ? paidLeaveDocumentFields(leave) : {}),
        state: "locked",
        locked_by_payroll: payrollName,
      },
      submittedAt: now,
      commandId: `alu-payroll:${payrollName}:lock:${day.name}`,
    }));
  }

  for (const [key, projection] of [...paidLeaveByKey.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (coveredKeys.has(key)) continue;
    const policy = await resolveAttendancePolicy(services.store, input.tenantId, company, projection.workDate);
    const dayName = await attendanceDayName(projection.employee, projection.workDate);
    const collision = await services.store.getDocument<JsonObject>(input.tenantId, ATTENDANCE_DAY, dayName);
    if (collision) throw errors.validation(`PAYROLL_BLOCKED: Attendance Day ${dayName} exists but was not resolved as the canonical ${projection.employee} / ${projection.workDate} source`);
    commands.push(await command({
      tenantId: input.tenantId,
      actor: systemActor,
      doctype: ATTENDANCE_DAY,
      name: dayName,
      action: "create",
      expectedVersion: null,
      document: {
        employee: projection.employee,
        company,
        work_date: projection.workDate,
        policy,
        shift_assignment: projection.shiftAssignment,
        shift_type: projection.shiftType,
        scheduled_minutes: projection.scheduledMinutes,
        state: "locked",
        regular_minutes: 0,
        overtime_minutes: 0,
        payable_work_fraction_bp: 0,
        ...paidLeaveDocumentFields(projection),
        locked_by_payroll: payrollName,
        segments: [],
      },
      submittedAt: now,
      commandId: `alu-payroll:${payrollName}:paid-leave:${dayName}:create-lock`,
    }));
    coveredKeys.add(key);
  }

  for (const employee of employees) {
    if (![...coveredKeys].some((key) => key.startsWith(`${employee}\u0000`))) {
      throw errors.validation(`PAYROLL_BLOCKED: ${employee} has neither Attendance Day nor validated paid-leave source rows in this period`);
    }
  }

  const aggregateHash = await sha256Hex({ payroll_entry: payrollName, slips: slipHashes.sort((a, b) => a.name.localeCompare(b.name)) });
  commands.push(await command({ tenantId: input.tenantId, actor: systemActor, doctype: PAYROLL_ENTRY, name: payrollName, action: "submit", expectedVersion: payroll.version, document: { ...payroll.data, alu_state: "pending_approval", alu_input_hash: aggregateHash, alu_approved_by: input.actor.user_id, alu_approved_at: now }, submittedAt: now, commandId: `alu-payroll:${payrollName}:approve` }));

  const receipts = await services.kernel.executeBundle({ commands });
  const payrollReceipt = receipts.at(-1);
  return { replayed: false, payroll_entry: payrollName, state: "approved", employee_count: employees.size, attendance_locked: coveredKeys.size, input_hash: aggregateHash, version: payrollReceipt?.aggregate_version ?? payroll.version + 1 };
}

export function paidLeaveProjectionsFromTrace(traceValue: unknown, employee: string): AlumDoorPaidLeaveProjection[] {
  const trace = parseTrace(traceValue);
  const projections: AlumDoorPaidLeaveProjection[] = [];
  const seen = new Set<string>();
  for (const leave of arrayObjects(trace.paid_leave)) {
    const source = object(leave.leave_application);
    const sourceLeaveApplication = requiredText(source.name, "Paid leave trace Leave Application");
    const sourceLeaveVersion = integer(source.version, `Leave Application ${sourceLeaveApplication} version`, 1, Number.MAX_SAFE_INTEGER);
    for (const paidDate of arrayObjects(leave.paid_dates)) {
      const workDate = requiredDate(paidDate.work_date, "Paid leave work_date");
      if (seen.has(workDate)) throw errors.validation(`Duplicate paid leave trace date ${employee} / ${workDate}`);
      seen.add(workDate);
      const scheduledMinutes = integer(paidDate.scheduled_minutes, `Paid leave ${workDate} scheduled_minutes`, 1, 1_440);
      const fractionBp = integer(paidDate.payable_work_fraction_bp, `Paid leave ${workDate} fraction`, 1, 10_000);
      const paidLeaveMinutes = roundHalfUpRatio(scheduledMinutes, fractionBp);
      projections.push({
        employee,
        workDate,
        shiftAssignment: requiredText(paidDate.shift_assignment, `Paid leave ${workDate} Shift Assignment`),
        shiftType: requiredText(paidDate.shift_type, `Paid leave ${workDate} Shift Type`),
        scheduledMinutes,
        paidLeaveMinutes,
        sourceLeaveApplication,
        sourceLeaveVersion,
      });
    }
  }
  return projections;
}

async function resolveAttendancePolicy(store: MutationStore, tenantId: string, company: string, workDate: string): Promise<string> {
  const policies = (await store.listDocumentsByDoctype<JsonObject>(tenantId, ATTENDANCE_POLICY))
    .filter((entry) => entry.docstatus === 1
      && text(entry.data.company) === company
      && text(entry.data.policy_status) === "approved"
      && text(entry.data.effective_from) <= workDate
      && (!text(entry.data.effective_to) || text(entry.data.effective_to) >= workDate))
    .sort((left, right) => text(right.data.effective_from).localeCompare(text(left.data.effective_from)) || left.name.localeCompare(right.name));
  if (policies.length !== 1) throw errors.reference(`Exactly one approved AlumDoor Attendance Policy is required for ${company} / ${workDate}`);
  return policies[0]!.name;
}

async function attendanceDayName(employee: string, workDate: string): Promise<string> {
  const employeeDigest = (await sha256Hex(employee)).slice(0, 20).toUpperCase();
  return `AAD-${workDate.replaceAll("-", "")}-${employeeDigest}`;
}

function paidLeaveDocumentFields(projection: AlumDoorPaidLeaveProjection): JsonObject {
  return {
    paid_leave_minutes: projection.paidLeaveMinutes,
    source_leave_application: projection.sourceLeaveApplication,
    source_leave_version: projection.sourceLeaveVersion,
  };
}

function roundHalfUpRatio(scheduledMinutes: number, fractionBp: number): number {
  return Number((BigInt(scheduledMinutes) * BigInt(fractionBp) + 5_000n) / 10_000n);
}

function attendanceKey(employee: string, workDate: string): string { return `${employee}\u0000${workDate}`; }
function integer(value: unknown, field: string, min: number, max: number): number { const result = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(result) || result < min || result > max) throw errors.validation(`${field} must be an integer between ${min} and ${max}`); return result; }
function assertApprover(actor: Actor): void { const allowed = new Set(["AlumDoor Payroll Approver", "HR Manager", "System Manager", "Administrator"]); if (!actor.roles.some((role) => allowed.has(role)) && actor.user_id !== "Administrator") throw errors.permission("AlumDoor Payroll Approver is required to approve payroll"); }
async function command(input: { commandId: string; tenantId: string; actor: Actor; doctype: string; name: string; action: MutationCommand["action"]; expectedVersion: number | null; document: JsonObject; submittedAt: string; }): Promise<MutationCommand> { const draft: MutationCommand = { schema_version: 1, command_id: input.commandId, tenant_id: input.tenantId, actor: input.actor, aggregate: { doctype: input.doctype, name: input.name }, action: input.action, expected_version: input.expectedVersion, payload_hash: "", document: input.document, submitted_at: input.submittedAt }; draft.payload_hash = await commandPayloadHash(draft as unknown as Record<string, unknown>); return draft; }
function arrayObjects(value: unknown): JsonObject[] { return Array.isArray(value) ? value.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function parseTrace(value: unknown): JsonObject { if (typeof value !== "string") throw errors.validation("AlumDoor Salary Slip payroll trace is required"); try { const parsed = JSON.parse(value) as unknown; return object(parsed); } catch { throw errors.validation("AlumDoor Salary Slip payroll trace is invalid JSON"); } }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function requiredText(value: unknown, field: string): string { const result = text(value); if (!result) throw errors.validation(`${field} is required`); return result; }
function requiredDate(value: unknown, field: string): string { const result = requiredText(value, field); if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) throw errors.validation(`${field} must use YYYY-MM-DD`); return result; }
