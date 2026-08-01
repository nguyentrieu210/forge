import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";

type PlasticRunStatus = "Planned" | "Running" | "Paused" | "Completed";

interface PlasticProductionRunData extends JsonObject {
  company: string;
  branch: string;
  work_order: string;
  recipe_policy: string;
  process_profile: string;
  machine: string;
  tool?: string;
  shift_type?: string;
  operator?: string;
  planned_start: string;
  planned_end: string;
  started_at?: string;
  ended_at?: string;
  planned_qty: string | number;
  good_qty?: string | number;
  scrap_qty?: string | number;
  regrind_qty?: string | number;
  actual_cycle_seconds?: string | number;
  shot_count?: number;
  downtime_minutes?: number;
  manufacture_stock_entry?: string;
  output_batch?: string;
  run_status: PlasticRunStatus;
  pause_reason?: string;
  notes?: string;
}

const RUN_STATUSES = new Set<PlasticRunStatus>(["Planned", "Running", "Paused", "Completed"]);

export class PlasticProductionRunController extends SuiteController<PlasticProductionRunData> {
  readonly doctype = "Plastic Production Run";

  async normalize(context: ControllerContext<PlasticProductionRunData>): Promise<PlasticProductionRunData> {
    const input = context.command.document as PlasticProductionRunData;
    requireText(input.company, "company");
    requireText(input.branch, "branch");
    requireText(input.work_order, "work_order");
    requireText(input.recipe_policy, "recipe_policy");
    requireText(input.process_profile, "process_profile");
    requireText(input.machine, "machine");

    if (!RUN_STATUSES.has(input.run_status)) throw errors.validation("Unsupported plastic production run status");
    const plannedStart = validTimestamp(input.planned_start, "planned_start");
    const plannedEnd = validTimestamp(input.planned_end, "planned_end");
    if (plannedEnd <= plannedStart) throw errors.validation("planned_end must be after planned_start");

    const plannedQty = positiveMicros(input.planned_qty, "planned_qty");
    const goodQty = nonNegativeMicros(input.good_qty ?? 0, "good_qty");
    const scrapQty = nonNegativeMicros(input.scrap_qty ?? 0, "scrap_qty");
    const regrindQty = nonNegativeMicros(input.regrind_qty ?? 0, "regrind_qty");
    if (regrindQty > scrapQty) throw errors.validation("regrind_qty cannot exceed scrap_qty");
    if ((input.downtime_minutes ?? 0) < 0) throw errors.validation("downtime_minutes cannot be negative");
    if ((input.shot_count ?? 0) < 0) throw errors.validation("shot_count cannot be negative");
    if (input.actual_cycle_seconds !== undefined && Number(input.actual_cycle_seconds) <= 0) {
      throw errors.validation("actual_cycle_seconds must be positive when provided");
    }

    const previousStatus = context.existing?.data.run_status as PlasticRunStatus | undefined;
    assertRunTransition(context.command.action, previousStatus, input.run_status);

    const workOrder = await requireSubmitted(context, "Work Order", input.work_order);
    if (text(workOrder.data.company) !== input.company) throw errors.reference("Production Run company does not match Work Order");

    const recipe = await requireSubmitted(context, "Plastic Recipe Policy", input.recipe_policy);
    if (text(recipe.data.company) !== input.company) throw errors.reference("Recipe Policy belongs to another company");
    if (text(recipe.data.bom) !== text(workOrder.data.bom_no)) throw errors.reference("Recipe Policy BOM does not match Work Order snapshot");
    if (text(recipe.data.process_profile) !== input.process_profile) throw errors.reference("Recipe Policy process profile does not match Production Run");

    const process = await requireExisting(context, "Plastic Process Profile", input.process_profile);
    const machine = await requireExisting(context, "Plastic Machine", input.machine);
    if (text(machine.data.company) !== input.company) throw errors.reference("Machine belongs to another company");
    if (text(machine.data.process_profile) !== input.process_profile) throw errors.reference("Machine process profile does not match Production Run");
    if (text(machine.data.status) !== "Active") throw errors.reference(`Machine ${input.machine} is not Active`);

    const usesTool = flag(process.data.uses_tool);
    if (usesTool && !text(input.tool)) throw errors.validation("This process profile requires a tool/mold");
    if (input.tool) {
      const tool = await requireExisting(context, "Plastic Tool", input.tool);
      if (text(tool.data.company) !== input.company) throw errors.reference("Tool belongs to another company");
      if (text(tool.data.process_profile) !== input.process_profile) throw errors.reference("Tool process profile does not match Production Run");
      if (["Maintenance", "Retired"].includes(text(tool.data.status))) throw errors.reference(`Tool ${input.tool} is not available for production`);
      const compatible = arrayOfObjects(tool.data.compatible_machines);
      if (compatible.length === 0 || !compatible.some((row) => text(row.machine) === input.machine)) {
        throw errors.reference(`Tool ${input.tool} is not approved for machine ${input.machine}`);
      }
    }

    await assertNoResourceOverlap(context, input, flag(machine.data.exclusive_resource));

    let startedAt = input.started_at ? validTimestamp(input.started_at, "started_at") : undefined;
    let endedAt = input.ended_at ? validTimestamp(input.ended_at, "ended_at") : undefined;
    if (["Running", "Paused", "Completed"].includes(input.run_status) && !startedAt) {
      throw errors.validation("started_at is required once the run starts");
    }
    if (endedAt && startedAt && endedAt <= startedAt) throw errors.validation("ended_at must be after started_at");
    if (input.run_status === "Paused" && !text(input.pause_reason)) throw errors.validation("pause_reason is required when run is Paused");

    if (context.command.action === "submit") {
      if (input.run_status !== "Completed") throw errors.validation("Only a Completed Production Run can be submitted");
      if (!endedAt) throw errors.validation("ended_at is required when completing a Production Run");
      if (goodQty + scrapQty <= 0) throw errors.validation("Completed Production Run must report good or scrap quantity");
      if (!text(input.manufacture_stock_entry)) throw errors.validation("manufacture_stock_entry is required before Production Run completion");
      if (!text(input.output_batch)) throw errors.validation("output_batch is required before Production Run completion");

      const stockEntry = await requireSubmitted(context, "Stock Entry", input.manufacture_stock_entry!);
      if (text(stockEntry.data.work_order) !== input.work_order || text(stockEntry.data.purpose) !== "Manufacture") {
        throw errors.reference("Manufacture Stock Entry must be a submitted Manufacture voucher for the same Work Order");
      }

      const productionItem = text(workOrder.data.production_item);
      const manufactured = await context.reader.getManufacturedQuantityMicros(
        context.command.tenant_id,
        input.work_order,
        "Manufacture",
        productionItem || undefined,
      );
      const priorGood = await submittedGoodQuantity(context, input.work_order);
      if (priorGood + goodQty > manufactured) {
        throw errors.reference("Production Run good quantity exceeds posted manufactured quantity", {
          posted_manufactured_qty_micros: manufactured,
          prior_run_good_qty_micros: priorGood,
          requested_good_qty_micros: goodQty,
        });
      }
      const workOrderQty = workOrderQuantityMicros(workOrder);
      if (priorGood + goodQty > workOrderQty) {
        throw errors.reference("Production Run good quantity exceeds Work Order quantity", {
          work_order_qty_micros: workOrderQty,
          prior_run_good_qty_micros: priorGood,
          requested_good_qty_micros: goodQty,
        });
      }
    }

    return {
      ...input,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      ...(startedAt ? { started_at: startedAt } : {}),
      ...(endedAt ? { ended_at: endedAt } : {}),
      planned_qty: fromScaledInt(plannedQty, 6),
      good_qty: fromScaledInt(goodQty, 6),
      scrap_qty: fromScaledInt(scrapQty, 6),
      regrind_qty: fromScaledInt(regrindQty, 6),
      downtime_minutes: input.downtime_minutes ?? 0,
      shot_count: input.shot_count ?? 0,
    };
  }

  override status(context: ControllerContext<PlasticProductionRunData>, data: PlasticProductionRunData): string {
    if (context.command.action === "cancel") return "Cancelled";
    if (context.command.action === "submit") return "Completed";
    return data.run_status;
  }
}

async function requireExisting(
  context: ControllerContext<PlasticProductionRunData>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<JsonObject>> {
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus === 2) throw errors.reference(`${doctype} ${name} does not exist or is cancelled`);
  return document;
}

async function requireSubmitted(
  context: ControllerContext<PlasticProductionRunData>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<JsonObject>> {
  const document = await requireExisting(context, doctype, name);
  if (document.docstatus !== 1) throw errors.reference(`${doctype} ${name} must be submitted`);
  return document;
}

async function assertNoResourceOverlap(
  context: ControllerContext<PlasticProductionRunData>,
  input: PlasticProductionRunData,
  machineExclusive: boolean,
): Promise<void> {
  const start = Date.parse(input.planned_start);
  const end = Date.parse(input.planned_end);
  const runs = await context.reader.listDocumentsByDoctype<PlasticProductionRunData>(context.command.tenant_id, "Plastic Production Run");
  for (const candidate of runs) {
    if (candidate.name === context.command.aggregate.name || candidate.docstatus === 2) continue;
    const candidateStart = Date.parse(String(candidate.data.planned_start ?? ""));
    const candidateEnd = Date.parse(String(candidate.data.planned_end ?? ""));
    if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd)) continue;
    if (!(start < candidateEnd && candidateStart < end)) continue;
    if (machineExclusive && candidate.data.machine === input.machine) {
      throw errors.reference(`Machine ${input.machine} already has an overlapping Production Run ${candidate.name}`);
    }
    if (input.tool && candidate.data.tool === input.tool) {
      throw errors.reference(`Tool ${input.tool} already has an overlapping Production Run ${candidate.name}`);
    }
  }
}

async function submittedGoodQuantity(
  context: ControllerContext<PlasticProductionRunData>,
  workOrder: string,
): Promise<number> {
  const runs = await context.reader.listDocumentsByDoctype<PlasticProductionRunData>(context.command.tenant_id, "Plastic Production Run");
  let total = 0;
  for (const run of runs) {
    if (run.name === context.command.aggregate.name || run.docstatus !== 1 || run.data.work_order !== workOrder) continue;
    total += nonNegativeMicros(run.data.good_qty ?? 0, `${run.name}.good_qty`);
    if (!Number.isSafeInteger(total)) throw errors.validation("Production Run quantity overflow");
  }
  return total;
}

function workOrderQuantityMicros(workOrder: CanonicalDocument<JsonObject>): number {
  if (typeof workOrder.data.qty_micros === "number" && Number.isSafeInteger(workOrder.data.qty_micros)) return workOrder.data.qty_micros;
  return positiveMicros(workOrder.data.qty ?? 0, "Work Order qty");
}

function assertRunTransition(action: string, previous: PlasticRunStatus | undefined, requested: PlasticRunStatus): void {
  if (action === "submit") {
    if (!previous || !["Running", "Paused"].includes(previous)) {
      throw errors.validation("Production Run must be Running or Paused before completion");
    }
    if (requested !== "Completed") throw errors.validation("Submit transition must end in Completed");
    return;
  }
  if (action === "create" && !previous && requested !== "Planned") {
    throw errors.validation("New Production Run must start in Planned state");
  }
  if (requested === "Completed") throw errors.validation("Use Submit to complete a Production Run");
  if (!previous) return;
  const allowed: Record<Exclude<PlasticRunStatus, "Completed">, PlasticRunStatus[]> = {
    Planned: ["Planned", "Running"],
    Running: ["Running", "Paused"],
    Paused: ["Paused", "Running"],
  };
  if (previous === "Completed" || !allowed[previous]?.includes(requested)) {
    throw errors.validation(`Invalid Production Run transition ${previous} -> ${requested}`);
  }
}

function validTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw errors.validation(`${field} must be a valid timestamp`);
  }
  return value;
}

function positiveMicros(value: unknown, field: string): number {
  const micros = toScaledInt(String(value ?? ""), 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function nonNegativeMicros(value: unknown, field: string): number {
  const micros = toScaledInt(String(value ?? 0), 6, field);
  if (micros < 0) throw errors.validation(`${field} cannot be negative`);
  return micros;
}

function requireText(value: unknown, field: string): string {
  const normalized = text(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function arrayOfObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((row): row is JsonObject => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}
