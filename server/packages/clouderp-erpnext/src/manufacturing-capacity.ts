import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";
import type { MrpExplosionResult } from "./manufacturing-mrp.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
type Weekday = typeof WEEKDAYS[number];
const DOWNTIME_CATEGORIES = new Set(["Planned", "Breakdown", "Maintenance", "Quality", "Other"]);
const MAX_SCHEDULE_DAYS = 366;

export interface ManufacturingRoutingOperation extends JsonObject {
  row_id: string;
  sequence: number;
  operation: string;
  workstation: string;
  setup_minutes?: string | number;
  run_minutes_per_unit: string | number;
}

export interface ManufacturingRoutingData extends JsonObject {
  company: string;
  routing_name: string;
  item_code: string;
  effective_from: string;
  effective_to?: string;
  is_active?: boolean | number;
  operations: ManufacturingRoutingOperation[];
}

export interface WorkstationCapacityDay extends JsonObject {
  row_id: string;
  weekday: Weekday;
  capacity_hours: string | number;
}

export interface WorkstationCapacityCalendarData extends JsonObject {
  company: string;
  workstation: string;
  effective_from: string;
  effective_to?: string;
  utilization_percent?: string | number;
  days: WorkstationCapacityDay[];
}

export interface ManufacturingDowntimeData extends JsonObject {
  company: string;
  workstation: string;
  from_time: string;
  to_time: string;
  category: "Planned" | "Breakdown" | "Maintenance" | "Quality" | "Other";
  reason: string;
  work_order?: string;
  job_card?: string;
}

export interface CapacityDemand extends JsonObject {
  item_code: string;
  qty: string;
  qty_micros: number;
  due_date: string;
  source: "Production Plan" | "MRP Manufacture";
}

export interface CapacityOperationSchedule extends JsonObject {
  item_code: string;
  routing: string;
  operation: string;
  workstation: string;
  sequence: number;
  required_minutes: string;
  required_minutes_micros: number;
  scheduled_from: string;
  scheduled_to: string;
  due_date: string;
  late: boolean;
}

export interface WorkstationCapacitySummary extends JsonObject {
  workstation: string;
  available_minutes: string;
  available_minutes_micros: number;
  downtime_minutes: string;
  downtime_minutes_micros: number;
  allocated_minutes: string;
  allocated_minutes_micros: number;
  remaining_minutes: string;
  remaining_minutes_micros: number;
  overload_minutes: string;
  overload_minutes_micros: number;
}

export interface ManufacturingCapacityPlan extends JsonObject {
  schema_version: 1;
  company: string;
  planning_date: string;
  through_date: string;
  demands: CapacityDemand[];
  operations: CapacityOperationSchedule[];
  workstation_summary: WorkstationCapacitySummary[];
  warnings: string[];
}

export class ManufacturingRoutingController extends SuiteController<ManufacturingRoutingData> {
  readonly doctype = "Manufacturing Routing";

  async normalize(context: ControllerContext<ManufacturingRoutingData>): Promise<ManufacturingRoutingData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const routingName = requiredText(input.routing_name, "routing_name");
    const itemCode = requiredText(input.item_code, "item_code");
    const effectiveFrom = validDate(input.effective_from, "effective_from");
    const effectiveTo = input.effective_to ? validDate(input.effective_to, "effective_to") : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must be on or after effective_from");
    const active = input.is_active === undefined ? true : input.is_active === true || input.is_active === 1;
    if (!Array.isArray(input.operations) || input.operations.length === 0) throw errors.validation("Manufacturing Routing requires operations");
    const seenSequence = new Set<number>();
    const operations = input.operations.map((row, index): ManufacturingRoutingOperation => {
      const sequence = positiveInteger(row.sequence, `operations[${index}].sequence`);
      if (seenSequence.has(sequence)) throw errors.validation(`Duplicate routing sequence ${sequence}`);
      seenSequence.add(sequence);
      const operation = requiredText(row.operation, `operations[${index}].operation`);
      const workstation = requiredText(row.workstation, `operations[${index}].workstation`);
      const setup = row.setup_minutes === undefined ? 0 : nonNegativeMicros(row.setup_minutes, `operations[${index}].setup_minutes`);
      const run = positiveMicros(row.run_minutes_per_unit, `operations[${index}].run_minutes_per_unit`);
      return {
        ...row,
        row_id: row.row_id || `ROW-${index + 1}`,
        sequence,
        operation,
        workstation,
        setup_minutes: fromScaledInt(setup, 6),
        run_minutes_per_unit: fromScaledInt(run, 6),
      };
    }).sort((a, b) => a.sequence - b.sequence);

    if (context.command.action === "submit") {
      await assertMaster(context, "Company", company);
      await assertMaster(context, "Item", itemCode);
      for (const row of operations) {
        await assertMaster(context, "Operation", row.operation);
        await assertMaster(context, "Workstation", row.workstation);
      }
      if (active) await assertNoRoutingOverlap(context, company, itemCode, effectiveFrom, effectiveTo);
    }
    return {
      ...input,
      company,
      routing_name: routingName,
      item_code: itemCode,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      is_active: active,
      operations,
    };
  }

  status(context: ControllerContext<ManufacturingRoutingData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Active";
  }
}

export class WorkstationCapacityCalendarController extends SuiteController<WorkstationCapacityCalendarData> {
  readonly doctype = "Workstation Capacity Calendar";

  async normalize(context: ControllerContext<WorkstationCapacityCalendarData>): Promise<WorkstationCapacityCalendarData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const workstation = requiredText(input.workstation, "workstation");
    const effectiveFrom = validDate(input.effective_from, "effective_from");
    const effectiveTo = input.effective_to ? validDate(input.effective_to, "effective_to") : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must be on or after effective_from");
    const utilization = input.utilization_percent === undefined ? 100_000_000 : positiveMicros(input.utilization_percent, "utilization_percent");
    if (utilization > 100_000_000) throw errors.validation("utilization_percent cannot exceed 100");
    if (!Array.isArray(input.days) || input.days.length === 0) throw errors.validation("Capacity Calendar requires weekday rows");
    const seen = new Set<string>();
    const days = input.days.map((row, index): WorkstationCapacityDay => {
      const weekday = requiredText(row.weekday, `days[${index}].weekday`) as Weekday;
      if (!WEEKDAYS.includes(weekday)) throw errors.validation(`Invalid weekday at row ${index + 1}`);
      if (seen.has(weekday)) throw errors.validation(`Duplicate capacity weekday ${weekday}`);
      seen.add(weekday);
      const capacity = nonNegativeMicros(row.capacity_hours, `days[${index}].capacity_hours`);
      if (capacity > 24_000_000) throw errors.validation(`capacity_hours cannot exceed 24 at row ${index + 1}`);
      return { ...row, row_id: row.row_id || `ROW-${index + 1}`, weekday, capacity_hours: fromScaledInt(capacity, 6) };
    });
    if (context.command.action === "submit") {
      await assertMaster(context, "Company", company);
      await assertMaster(context, "Workstation", workstation);
      await assertNoCalendarOverlap(context, company, workstation, effectiveFrom, effectiveTo);
    }
    return {
      ...input,
      company,
      workstation,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      utilization_percent: fromScaledInt(utilization, 6),
      days,
    };
  }

  status(context: ControllerContext<WorkstationCapacityCalendarData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Active";
  }
}

export class ManufacturingDowntimeController extends SuiteController<ManufacturingDowntimeData> {
  readonly doctype = "Manufacturing Downtime";

  async normalize(context: ControllerContext<ManufacturingDowntimeData>): Promise<ManufacturingDowntimeData> {
    const input = context.command.document;
    const company = requiredText(input.company, "company");
    const workstation = requiredText(input.workstation, "workstation");
    const fromTime = validDateTime(input.from_time, "from_time");
    const toTime = validDateTime(input.to_time, "to_time");
    if (toTime <= fromTime) throw errors.validation("to_time must be after from_time");
    const category = requiredText(input.category, "category") as ManufacturingDowntimeData["category"];
    if (!DOWNTIME_CATEGORIES.has(category)) throw errors.validation("category is invalid");
    const reason = requiredText(input.reason, "reason");
    const workOrder = optionalText(input.work_order);
    const jobCard = optionalText(input.job_card);
    if (context.command.action === "submit") {
      await assertMaster(context, "Company", company);
      await assertMaster(context, "Workstation", workstation);
      if (workOrder) {
        const doc = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Work Order", workOrder);
        if (!doc || doc.docstatus === 2 || doc.data.company !== company) throw errors.reference(`Work Order ${workOrder} does not match company`);
      }
      if (jobCard) {
        const doc = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Job Card", jobCard);
        if (!doc || doc.docstatus === 2 || doc.data.company !== company || doc.data.workstation !== workstation) {
          throw errors.reference(`Job Card ${jobCard} does not match company/workstation`);
        }
        if (workOrder && doc.data.work_order !== workOrder) throw errors.reference(`Job Card ${jobCard} does not belong to Work Order ${workOrder}`);
      }
    }
    return {
      ...input,
      company,
      workstation,
      from_time: fromTime,
      to_time: toTime,
      category,
      reason,
      ...(workOrder ? { work_order: workOrder } : {}),
      ...(jobCard ? { job_card: jobCard } : {}),
    };
  }

  status(context: ControllerContext<ManufacturingDowntimeData>): string {
    const ds = nextDocStatus(context.command.action);
    return ds === 0 ? "Draft" : ds === 2 ? "Cancelled" : "Recorded";
  }
}

/**
 * Finite day-bucket capacity planning.
 *
 * It schedules routing operations sequentially, consumes workstation/date capacity,
 * subtracts submitted downtime, and never fabricates availability when a calendar is
 * absent. Granularity is one UTC calendar day by design; detailed intra-day dispatching
 * remains Job Card/shop-floor territory.
 */
export function buildManufacturingCapacityPlan(input: {
  mrp: MrpExplosionResult;
  through_date: string;
  routings: Array<CanonicalDocument<ManufacturingRoutingData>>;
  calendars: Array<CanonicalDocument<WorkstationCapacityCalendarData>>;
  downtimes: Array<CanonicalDocument<ManufacturingDowntimeData>>;
}): ManufacturingCapacityPlan {
  const company = input.mrp.company;
  const planningDate = validDate(input.mrp.planning_date, "planning_date");
  const throughDate = validDate(input.through_date, "through_date");
  if (throughDate < planningDate) throw errors.validation("through_date cannot be before planning_date");
  const horizon = enumerateDates(planningDate, throughDate);
  if (horizon.length > MAX_SCHEDULE_DAYS) throw errors.validation(`Capacity planning horizon cannot exceed ${MAX_SCHEDULE_DAYS} days`);

  const warnings = new Set<string>();
  const demands = collectCapacityDemands(input.mrp);
  const routingByItem = selectRoutingIndex(company, input.routings);
  const calendars = input.calendars.filter((doc) => doc.docstatus === 1 && doc.data.company === company);
  const downtimes = input.downtimes.filter((doc) => doc.docstatus === 1 && doc.data.company === company);
  const capacity = buildCapacityBuckets(horizon, calendars, downtimes, warnings);
  const allocated = new Map<string, number>();
  const schedules: CapacityOperationSchedule[] = [];

  for (const demand of [...demands].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.item_code.localeCompare(b.item_code))) {
    const routing = selectEffectiveRouting(routingByItem.get(demand.item_code) ?? [], demand.due_date);
    if (!routing) {
      warnings.add(`NO_ACTIVE_ROUTING:${demand.item_code}:${demand.due_date}`);
      continue;
    }
    let cursorDate = planningDate;
    for (const operation of routing.data.operations) {
      const setupMicros = nonNegativeMicros(operation.setup_minutes ?? 0, "setup_minutes");
      const runMicros = positiveMicros(operation.run_minutes_per_unit, "run_minutes_per_unit");
      const required = safeAdd(setupMicros, multiplyMicros(runMicros, demand.qty_micros));
      const allocation = allocateFiniteDays(operation.workstation, required, cursorDate, throughDate, capacity, allocated);
      schedules.push({
        item_code: demand.item_code,
        routing: routing.name,
        operation: operation.operation,
        workstation: operation.workstation,
        sequence: operation.sequence,
        required_minutes: fromScaledInt(required, 6),
        required_minutes_micros: required,
        scheduled_from: allocation.from,
        scheduled_to: allocation.to,
        due_date: demand.due_date,
        late: allocation.to > demand.due_date || allocation.unallocated_micros > 0,
      });
      if (allocation.unallocated_micros > 0) warnings.add(`CAPACITY_SHORTAGE:${operation.workstation}:${demand.item_code}`);
      cursorDate = allocation.to;
    }
  }

  const workstations = new Set<string>();
  for (const key of capacity.keys()) workstations.add(key.split("\u0000")[0]!);
  for (const schedule of schedules) workstations.add(schedule.workstation);
  const summaries = [...workstations].sort().map((workstation): WorkstationCapacitySummary => {
    let available = 0; let downtime = 0; let used = 0;
    for (const date of horizon) {
      const key = bucketKey(workstation, date);
      const bucket = capacity.get(key);
      if (bucket) { available = safeAdd(available, bucket.available_micros); downtime = safeAdd(downtime, bucket.downtime_micros); }
      used = safeAdd(used, allocated.get(key) ?? 0);
    }
    const remaining = Math.max(0, available - used);
    const overload = Math.max(0, used - available);
    return {
      workstation,
      available_minutes: fromScaledInt(available, 6), available_minutes_micros: available,
      downtime_minutes: fromScaledInt(downtime, 6), downtime_minutes_micros: downtime,
      allocated_minutes: fromScaledInt(used, 6), allocated_minutes_micros: used,
      remaining_minutes: fromScaledInt(remaining, 6), remaining_minutes_micros: remaining,
      overload_minutes: fromScaledInt(overload, 6), overload_minutes_micros: overload,
    };
  });

  return { schema_version: 1, company, planning_date: planningDate, through_date: throughDate, demands, operations: schedules, workstation_summary: summaries, warnings: [...warnings].sort() };
}

interface CapacityBucket { available_micros: number; downtime_micros: number }

function collectCapacityDemands(mrp: MrpExplosionResult): CapacityDemand[] {
  const demands: CapacityDemand[] = mrp.planned_outputs.map((row) => ({
    item_code: row.item_code,
    qty: row.planned_qty,
    qty_micros: row.planned_qty_micros,
    due_date: row.schedule_date ?? mrp.planning_date,
    source: "Production Plan",
  }));
  for (const row of mrp.manufacture_requirements) demands.push({
    item_code: row.item_code,
    qty: row.gross_qty,
    qty_micros: row.gross_qty_micros,
    due_date: row.schedule_date ?? mrp.planning_date,
    source: "MRP Manufacture",
  });
  return demands;
}

function selectRoutingIndex(company: string, documents: Array<CanonicalDocument<ManufacturingRoutingData>>): Map<string, Array<CanonicalDocument<ManufacturingRoutingData>>> {
  const map = new Map<string, Array<CanonicalDocument<ManufacturingRoutingData>>>();
  for (const doc of documents) {
    if (doc.docstatus !== 1 || doc.data.company !== company || doc.data.is_active === false || doc.data.is_active === 0) continue;
    const rows = map.get(doc.data.item_code) ?? [];
    rows.push(doc); map.set(doc.data.item_code, rows);
  }
  return map;
}

function selectEffectiveRouting(rows: Array<CanonicalDocument<ManufacturingRoutingData>>, date: string): CanonicalDocument<ManufacturingRoutingData> | undefined {
  const matches = rows.filter((doc) => doc.data.effective_from <= date && (!doc.data.effective_to || doc.data.effective_to >= date));
  if (matches.length > 1) throw errors.reference(`More than one active Manufacturing Routing is effective on ${date}`);
  return matches[0];
}

function buildCapacityBuckets(
  horizon: string[],
  calendars: Array<CanonicalDocument<WorkstationCapacityCalendarData>>,
  downtimes: Array<CanonicalDocument<ManufacturingDowntimeData>>,
  warnings: Set<string>,
): Map<string, CapacityBucket> {
  const map = new Map<string, CapacityBucket>();
  const workstations = [...new Set(calendars.map((doc) => doc.data.workstation))];
  for (const workstation of workstations) {
    for (const date of horizon) {
      const active = calendars.filter((doc) => doc.data.workstation === workstation && doc.data.effective_from <= date && (!doc.data.effective_to || doc.data.effective_to >= date));
      if (active.length > 1) throw errors.reference(`More than one capacity calendar is effective for ${workstation} on ${date}`);
      if (active.length === 0) continue;
      const calendar = active[0]!.data;
      const weekday = WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!;
      const day = calendar.days.find((row) => row.weekday === weekday);
      const hours = day ? nonNegativeMicros(day.capacity_hours, "capacity_hours") : 0;
      const utilization = calendar.utilization_percent === undefined ? 100_000_000 : positiveMicros(calendar.utilization_percent, "utilization_percent");
      const grossMinutes = multiplyMicros(hours, 60_000_000);
      const effectiveMinutes = safeNumber(divideRounded(BigInt(grossMinutes) * BigInt(utilization), 100_000_000n));
      const downtime = downtimeMicrosForDay(workstation, date, downtimes);
      map.set(bucketKey(workstation, date), { available_micros: Math.max(0, effectiveMinutes - downtime), downtime_micros: downtime });
    }
  }
  for (const doc of downtimes) if (!workstations.includes(doc.data.workstation)) warnings.add(`DOWNTIME_WITHOUT_CAPACITY_CALENDAR:${doc.data.workstation}`);
  return map;
}

function allocateFiniteDays(
  workstation: string,
  requiredMicros: number,
  fromDate: string,
  throughDate: string,
  capacity: Map<string, CapacityBucket>,
  allocated: Map<string, number>,
): { from: string; to: string; unallocated_micros: number } {
  let remaining = requiredMicros;
  let first: string | undefined;
  let last = fromDate;
  for (const date of enumerateDates(fromDate, throughDate)) {
    const key = bucketKey(workstation, date);
    const available = capacity.get(key)?.available_micros ?? 0;
    const used = allocated.get(key) ?? 0;
    const free = Math.max(0, available - used);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    allocated.set(key, safeAdd(used, take));
    if (!first) first = date;
    last = date;
    remaining -= take;
    if (remaining === 0) break;
  }
  return { from: first ?? fromDate, to: last, unallocated_micros: remaining };
}

function downtimeMicrosForDay(workstation: string, date: string, documents: Array<CanonicalDocument<ManufacturingDowntimeData>>): number {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  const end = start + 86_400_000;
  let totalMs = 0;
  for (const doc of documents) {
    if (doc.data.workstation !== workstation) continue;
    const from = Math.max(start, Date.parse(doc.data.from_time));
    const to = Math.min(end, Date.parse(doc.data.to_time));
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) totalMs += to - from;
  }
  return safeNumber(divideRounded(BigInt(Math.round(totalMs)) * 60_000_000n, 3_600_000n));
}

async function assertNoRoutingOverlap(context: ControllerContext<ManufacturingRoutingData>, company: string, item: string, from: string, to?: string): Promise<void> {
  const docs = await context.reader.listDocumentsByDoctype<ManufacturingRoutingData>(context.command.tenant_id, "Manufacturing Routing");
  for (const doc of docs) {
    if (doc.name === context.command.aggregate.name || doc.docstatus !== 1 || doc.data.is_active === false || doc.data.is_active === 0) continue;
    if (doc.data.company === company && doc.data.item_code === item && intervalsOverlap(doc.data.effective_from, doc.data.effective_to, from, to)) {
      throw errors.reference("Manufacturing Routing overlaps another active routing", { conflicting_routing: doc.name });
    }
  }
}

async function assertNoCalendarOverlap(context: ControllerContext<WorkstationCapacityCalendarData>, company: string, workstation: string, from: string, to?: string): Promise<void> {
  const docs = await context.reader.listDocumentsByDoctype<WorkstationCapacityCalendarData>(context.command.tenant_id, "Workstation Capacity Calendar");
  for (const doc of docs) {
    if (doc.name === context.command.aggregate.name || doc.docstatus !== 1) continue;
    if (doc.data.company === company && doc.data.workstation === workstation && intervalsOverlap(doc.data.effective_from, doc.data.effective_to, from, to)) {
      throw errors.reference("Workstation Capacity Calendar overlaps another active calendar", { conflicting_calendar: doc.name });
    }
  }
}

async function assertMaster<T extends JsonObject>(context: ControllerContext<T>, doctype: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
}

function intervalsOverlap(aFrom: string, aTo: string | undefined, bFrom: string, bTo: string | undefined): boolean {
  return (!aTo || bFrom <= aTo) && (!bTo || aFrom <= bTo);
}

function enumerateDates(from: string, to: string): string[] {
  const output: string[] = [];
  let current = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  while (current <= end) {
    output.push(new Date(current).toISOString().slice(0, 10));
    current += 86_400_000;
  }
  return output;
}

function bucketKey(workstation: string, date: string): string { return `${workstation}\u0000${date}`; }

function multiplyMicros(left: number, right: number): number {
  return safeNumber(divideRounded(BigInt(left) * BigInt(right), 1_000_000n));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw errors.validation("Capacity divisor must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Capacity arithmetic exceeds safe integer range");
  return number;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Capacity arithmetic exceeds safe integer range");
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw errors.validation(`${field} must be a positive integer`);
  return parsed;
}

function positiveMicros(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const micros = toScaledInt(value, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function nonNegativeMicros(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const micros = toScaledInt(value, 6, field);
  if (micros < 0) throw errors.validation(`${field} cannot be negative`);
  return micros;
}

function validDate(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) throw errors.validation(`${field} must be a valid calendar date`);
  return normalized;
}

function validDateTime(value: unknown, field: string): string {
  const normalized = requiredText(value, field);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) throw errors.validation(`${field} must be a valid date-time`);
  return parsed.toISOString();
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
