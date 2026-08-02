import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";

export type HrmContext = ControllerContext<JsonObject>;

const HR_PRIVILEGED_ROLES = new Set([
  "HR User", "HR Manager", "Payroll User", "Payroll Manager",
  "Accounts User", "Accounts Manager", "System Manager",
]);

export async function requireRecord(context: HrmContext, doctype: string, name: string): Promise<JsonObject> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (document && document.docstatus !== 2) return document.data;
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, doctype, name);
  if (master) return master;
  throw errors.reference(`${doctype} ${name} does not exist`);
}

export async function requireSubmitted(context: HrmContext, doctype: string, name: string): Promise<JsonObject> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document.data;
}

export async function assertOwnEmployeeOrPrivileged(context: HrmContext, employeeName: string, employee: JsonObject): Promise<void> {
  if (context.command.actor.user_id === "Administrator" || context.command.actor.roles.some((role) => HR_PRIVILEGED_ROLES.has(role))) return;
  if (!context.command.actor.roles.includes("Employee")) return;
  if (text(employee.user_id) !== context.command.actor.user_id) {
    throw errors.permission(`Employee self-service may only create records for the linked Employee (${employeeName})`);
  }
}

export interface EffectiveEmployeeState extends JsonObject {
  company?: string;
  branch?: string;
  department?: string;
  cost_center?: string;
  designation?: string;
  reports_to?: string;
  separated_on?: string;
}

export async function resolveEmployeeState(
  context: HrmContext,
  employeeName: string,
  employee: JsonObject,
  asOf: string,
  excludeName?: string,
): Promise<EffectiveEmployeeState> {
  const state: EffectiveEmployeeState = { ...employee };
  const transfers = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Employee Transfer"))
    .filter((item) => item.docstatus === 1 && item.name !== excludeName
      && text(item.data.employee) === employeeName && text(item.data.effective_date) <= asOf)
    .sort((left, right) => text(left.data.effective_date).localeCompare(text(right.data.effective_date)) || left.name.localeCompare(right.name));
  for (const transfer of transfers) {
    if (text(transfer.data.to_branch)) state.branch = text(transfer.data.to_branch);
    if (text(transfer.data.to_department)) state.department = text(transfer.data.to_department);
    if (text(transfer.data.to_cost_center)) state.cost_center = text(transfer.data.to_cost_center);
    if (text(transfer.data.new_reports_to)) state.reports_to = text(transfer.data.new_reports_to);
  }
  const promotions = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Employee Promotion"))
    .filter((item) => item.docstatus === 1 && item.name !== excludeName
      && text(item.data.employee) === employeeName && text(item.data.effective_date) <= asOf)
    .sort((left, right) => text(left.data.effective_date).localeCompare(text(right.data.effective_date)) || left.name.localeCompare(right.name));
  for (const promotion of promotions) {
    if (text(promotion.data.to_designation)) state.designation = text(promotion.data.to_designation);
  }
  const separations = (await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Employee Separation"))
    .filter((item) => item.docstatus === 1 && item.name !== excludeName && text(item.data.employee) === employeeName)
    .sort((left, right) => text(left.data.last_working_day).localeCompare(text(right.data.last_working_day)));
  const separation = separations.find((item) => text(item.data.last_working_day) < asOf);
  if (separation) state.separated_on = text(separation.data.last_working_day);
  return state;
}

export function assertEmployeeActive(employee: JsonObject, employeeName: string): void {
  if (truthy(employee.has_left) || ["Nghỉ việc", "Ngừng sử dụng"].includes(text(employee.employee_status))) {
    throw errors.reference(`Employee ${employeeName} is not active`);
  }
}

export function assertEmployeeStateActive(employee: EffectiveEmployeeState, employeeName: string, asOf: string): void {
  assertEmployeeActive(employee, employeeName);
  if (text(employee.separated_on)) throw errors.reference(`Employee ${employeeName} separated before ${asOf}`);
}

export function assertEmployeeScope(employee: JsonObject, company: string, branch?: string, department?: string): void {
  if (text(employee.company) !== company) throw errors.reference("Employee belongs to another company");
  if (branch && text(employee.branch) !== branch) throw errors.reference("Employee belongs to another branch");
  if (department && text(employee.department) !== department) throw errors.reference("Employee belongs to another department");
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}

export function numeric(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const result = Number(value);
  if (!Number.isFinite(result)) throw errors.validation("Numeric value is invalid");
  return result;
}

export function positiveNumber(value: unknown, field: string): number {
  const result = numeric(value, NaN);
  if (!Number.isFinite(result) || result <= 0) throw errors.validation(`${field} must be positive`);
  return result;
}

export function integer(value: unknown, fallback = 0): number {
  const result = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(result)) throw errors.validation("Integer value is invalid");
  return result;
}

export function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function requiredDate(value: unknown, field: string): string {
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw errors.validation(`${field} must use YYYY-MM-DD`);
  }
  return result;
}

export function optionalDate(value: unknown, field: string): string | undefined {
  const result = text(value);
  return result ? requiredDate(result, field) : undefined;
}

export function requiredDatetime(value: unknown, field: string): string {
  const result = text(value);
  if (!result || Number.isNaN(Date.parse(result))) throw errors.validation(`${field} must be a valid datetime`);
  return result;
}

export function requiredTime(value: unknown, field: string): string {
  const result = text(value);
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(result)) throw errors.validation(`${field} must use HH:MM or HH:MM:SS`);
  const [h = Number.NaN, m = Number.NaN, s = 0] = result.split(":").map(Number);
  if (h > 23 || m > 59 || s > 59) throw errors.validation(`${field} is invalid`);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function timeRangeMinutes(fromTime: string, toTime: string): number {
  let end = secondsOfDay(toTime);
  const start = secondsOfDay(fromTime);
  if (end <= start) end += 24 * 60 * 60;
  return Math.floor((end - start) / 60);
}

export function secondsOfDay(time: string): number {
  const [h = Number.NaN, m = Number.NaN, s = 0] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

export function hhmmss(datetime: string): string {
  const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(datetime);
  if (!match) throw errors.validation("Attendance datetime must include a time component");
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

export function datetimeMs(value: string, field: string): number {
  const result = Date.parse(value);
  if (Number.isNaN(result)) throw errors.validation(`${field} is invalid`);
  return result;
}


export function previousDate(value: string): string {
  const timestamp = Date.parse(`${value}T00:00:00Z`) - 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function requiredEmail(value: unknown, field: string): string {
  const result = requiredText(value, field);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw errors.validation(`${field} is invalid`);
  return result;
}

export function parseJsonArray(value: string, field: string): unknown[] {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw errors.validation(`${field} must be valid JSON`); }
  if (!Array.isArray(parsed)) throw errors.validation(`${field} must be a JSON array`);
  return parsed;
}

export function parseStringArray(value: string, field: string): string[] {
  const parsed = parseJsonArray(value, field);
  if (parsed.some((item) => typeof item !== "string" || !item.trim())) throw errors.validation(`${field} must contain non-empty strings`);
  return parsed.map((item) => String(item).trim());
}

export function boundedScore(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const result = numeric(value, NaN);
  if (!Number.isFinite(result) || result < 0 || result > 100) throw errors.validation(`${field} must be between 0 and 100`);
  return result;
}

export function rangesOverlap(startA: string, endA: string | undefined, startB: string, endB: string | undefined): boolean {
  const max = "9999-12-31";
  return startA <= (endB ?? max) && startB <= (endA ?? max);
}

export function parseWeeklyOff(value: string): Set<number> {
  const result = new Set<number>();
  for (const raw of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const day = Number(raw);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw errors.reference("Holiday List weekly_off_days must contain integers 0..6");
    result.add(day);
  }
  return result;
}

export function parseHolidayDates(value: string): Set<string> {
  if (!value) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw errors.reference("Holiday List holidays_json must be valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item))) {
    throw errors.reference("Holiday List holidays_json must be an array of YYYY-MM-DD strings");
  }
  return new Set(parsed);
}

export function workingDayCount(fromDate: string, toDate: string, weeklyOff: Set<number>, holidays: Set<string>): number {
  let count = 0;
  for (let cursor = Date.parse(`${fromDate}T00:00:00Z`), end = Date.parse(`${toDate}T00:00:00Z`); cursor <= end; cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (isWorkingDay(date, weeklyOff, holidays)) count += 1;
  }
  return count;
}

export function isWorkingDay(date: string, weeklyOff: Set<number>, holidays: Set<string>): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return !weeklyOff.has(day) && !holidays.has(date);
}
