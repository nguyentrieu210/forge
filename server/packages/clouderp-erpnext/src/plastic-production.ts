import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";

type PlasticRunStatus = "Planned" | "Running" | "Paused" | "Completed";
type PlasticOutputType = "Good" | "Scrap" | "Regrind" | "By-product";

interface PlasticProductionMaterial extends JsonObject {
  bom_row_id?: string;
  item_code: string;
  source_warehouse: string;
  serial_and_batch_bundle?: string;
  batch_no?: string;
  consumed_qty: string | number;
  weight_kg?: string | number;
}

interface PlasticProductionOutput extends JsonObject {
  output_type: PlasticOutputType;
  item_code: string;
  target_warehouse: string;
  serial_and_batch_bundle?: string;
  batch_no?: string;
  qty: string | number;
  weight_kg?: string | number;
}

interface PlasticProductionDowntime extends JsonObject {
  reason: string;
  started_at: string;
  ended_at: string;
  minutes: string | number;
  note?: string;
}

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
  paused_at?: string;
  ended_at?: string;
  planned_qty: string | number;
  materials?: PlasticProductionMaterial[];
  outputs?: PlasticProductionOutput[];
  good_qty?: string | number;
  scrap_qty?: string | number;
  regrind_qty?: string | number;
  byproduct_qty?: string | number;
  actual_cycle_seconds?: string | number;
  shot_count?: number;
  downtime_events?: PlasticProductionDowntime[];
  downtime_minutes?: string | number;
  manufacture_stock_entry?: string;
  output_batch?: string;
  run_status: PlasticRunStatus;
  pause_reason?: string;
  notes?: string;
}

interface ManufacturingStockRow extends StockEntryItem {
  manufacturing_kind?: "Issue" | "Consumption" | "Scrap" | "Offcut";
  bom_row_id?: string;
  physical_lot_refs?: Array<{ batch_no?: string; serial_no?: string; qty_micros?: number }>;
}

interface ManufactureStockEntryData extends StockEntryData {
  items: ManufacturingStockRow[];
  finished_good_physical_identity?: JsonObject;
}

const RUN_STATUSES = new Set<PlasticRunStatus>(["Planned", "Running", "Paused", "Completed"]);
const OUTPUT_TYPES = new Set<PlasticOutputType>(["Good", "Scrap", "Regrind", "By-product"]);

export class PlasticProductionRunController extends SuiteController<PlasticProductionRunData> {
  readonly doctype = "Plastic Production Run";

  override async buildPlan(context: ControllerContext<PlasticProductionRunData>): Promise<MutationPlan<PlasticProductionRunData>> {
    if (context.command.action === "cancel") {
      const existing = context.existing;
      if (!existing || existing.docstatus !== 1) throw errors.validation("Only a submitted Production Run can be cancelled");
      const stockEntryName = text(existing.data.manufacture_stock_entry);
      if (stockEntryName) {
        const stockEntry = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Stock Entry", stockEntryName);
        if (!stockEntry || stockEntry.docstatus !== 2) {
          throw errors.reference("Cancel/reverse the linked Manufacture Stock Entry before cancelling the Production Run");
        }
      }
    }
    return super.buildPlan(context);
  }

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
    if (Date.parse(plannedEnd) <= Date.parse(plannedStart)) throw errors.validation("planned_end must be after planned_start");
    const plannedQty = positiveMicros(input.planned_qty, "planned_qty");

    const previousStatus = context.existing?.data.run_status as PlasticRunStatus | undefined;
    assertRunTransition(context.command.action, previousStatus, input.run_status);
    if (previousStatus && previousStatus !== "Planned") assertAssignmentLocked(context.existing!, input, plannedQty, plannedStart, plannedEnd);

    const workOrder = await requireSubmitted(context, "Work Order", input.work_order);
    if (text(workOrder.data.company) !== input.company) throw errors.reference("Production Run company does not match Work Order");
    const workOrderQty = workOrderQuantityMicros(workOrder);
    const allocated = await otherPlannedQuantity(context, input.work_order);
    if (allocated + plannedQty > workOrderQty) {
      throw errors.reference("Production Run planned quantity exceeds Work Order quantity", {
        work_order_qty_micros: workOrderQty,
        other_planned_qty_micros: allocated,
        requested_planned_qty_micros: plannedQty,
      });
    }

    const recipe = await requireSubmitted(context, "Plastic Recipe Policy", input.recipe_policy);
    if (text(recipe.data.company) !== input.company) throw errors.reference("Recipe Policy belongs to another company");
    if (text(recipe.data.bom) !== text(workOrder.data.bom_no)) throw errors.reference("Recipe Policy BOM does not match Work Order snapshot");
    if (text(recipe.data.output_item) !== text(workOrder.data.production_item)) throw errors.reference("Recipe Policy output does not match Work Order production item");
    if (text(recipe.data.process_profile) !== input.process_profile) throw errors.reference("Recipe Policy process profile does not match Production Run");
    assertRecipeEffective(recipe, plannedStart);

    const process = await requireExisting(context, "Plastic Process Profile", input.process_profile);
    const machine = await requireExisting(context, "Plastic Machine", input.machine);
    if (text(machine.data.company) !== input.company) throw errors.reference("Machine belongs to another company");
    if (text(machine.data.branch) !== input.branch) throw errors.reference("Machine belongs to another branch/plant");
    if (text(machine.data.process_profile) !== input.process_profile) throw errors.reference("Machine process profile does not match Production Run");
    if (text(machine.data.operational_state) !== "Active") throw errors.reference(`Machine ${input.machine} is not Active`);

    const usesTool = flag(process.data.uses_tool);
    if (usesTool && !text(input.tool)) throw errors.validation("This process profile requires a tool/mold");
    if (input.tool) {
      const tool = await requireExisting(context, "Plastic Tool", input.tool);
      if (text(tool.data.company) !== input.company) throw errors.reference("Tool belongs to another company");
      if (text(tool.data.process_profile) !== input.process_profile) throw errors.reference("Tool process profile does not match Production Run");
      if (["Maintenance", "Retired"].includes(text(tool.data.operational_state))) throw errors.reference(`Tool ${input.tool} is not available for production`);
      const compatible = arrayOfObjects(tool.data.compatible_machines);
      if (compatible.length === 0 || !compatible.some((row) => text(row.machine) === input.machine)) {
        throw errors.reference(`Tool ${input.tool} is not approved for machine ${input.machine}`);
      }
    }

    if (input.operator) {
      const employee = await requireMaster(context, "Employee", input.operator);
      if (text(employee.company) && text(employee.company) !== input.company) throw errors.reference("Operator belongs to another company");
      if (text(employee.branch) && text(employee.branch) !== input.branch) throw errors.reference("Operator belongs to another branch/plant");
    }
    if (input.shift_type) await requireMaster(context, "Shift Type", input.shift_type);

    await assertNoResourceOverlap(context, input, flag(machine.data.exclusive_resource));

    const existingData = context.existing?.data;
    let startedAt = text(existingData?.started_at) || undefined;
    let pausedAt = text(existingData?.paused_at) || undefined;
    let endedAt: string | undefined;
    let pauseReason = text(input.pause_reason) || text(existingData?.pause_reason);
    const downtimeEvents = normalizeExistingDowntime(existingData?.downtime_events);

    if (input.run_status === "Running") {
      if (previousStatus === "Planned") startedAt = context.now;
      if (previousStatus === "Paused") {
        if (!pausedAt || !text(existingData?.pause_reason)) throw errors.validation("Paused Production Run is missing server pause state");
        downtimeEvents.push(downtimeEvent(text(existingData?.pause_reason), pausedAt, context.now));
        pausedAt = undefined;
        pauseReason = "";
      }
    }
    if (input.run_status === "Paused") {
      if (!pauseReason) throw errors.validation("pause_reason is required when run is Paused");
      if (previousStatus === "Running") pausedAt = context.now;
      if (!startedAt) throw errors.validation("Production Run must be started before it can be paused");
    }
    if (context.command.action === "submit") {
      if (!startedAt) throw errors.validation("Production Run must be started before completion");
      endedAt = context.now;
      if (Date.parse(endedAt) <= Date.parse(startedAt)) throw errors.validation("Production Run completion time must be after start time");
      if (previousStatus === "Paused") {
        if (!pausedAt || !text(existingData?.pause_reason)) throw errors.validation("Paused Production Run is missing server pause state");
        downtimeEvents.push(downtimeEvent(text(existingData?.pause_reason), pausedAt, endedAt));
        pausedAt = undefined;
        pauseReason = "";
      }
    }

    const materials = normalizeMaterials(input.materials ?? []);
    const outputs = normalizeOutputs(input.outputs ?? []);
    const totals = outputTotals(outputs);
    const downtimeMinutesMicros = downtimeEvents.reduce((sum, row) => safeAdd(sum, toScaledInt(String(row.minutes), 6, "downtime.minutes")), 0);

    if (input.actual_cycle_seconds !== undefined && Number(input.actual_cycle_seconds) <= 0) {
      throw errors.validation("actual_cycle_seconds must be positive when provided");
    }
    if ((input.shot_count ?? 0) < 0 || !Number.isInteger(input.shot_count ?? 0)) throw errors.validation("shot_count must be a non-negative integer");

    let outputBatch = text(input.output_batch) || undefined;
    if (context.command.action === "submit") {
      if (input.run_status !== "Completed") throw errors.validation("Only a Completed Production Run can be submitted");
      const stockEntryName = requireText(input.manufacture_stock_entry, "manufacture_stock_entry");
      const stockEntry = await requireSubmitted(context, "Stock Entry", stockEntryName) as CanonicalDocument<ManufactureStockEntryData>;
      if (text(stockEntry.data.company) !== input.company) throw errors.reference("Manufacture Stock Entry belongs to another company");
      if (text(stockEntry.data.work_order) !== input.work_order || text(stockEntry.data.purpose) !== "Manufacture") {
        throw errors.reference("Manufacture Stock Entry must be a submitted Manufacture voucher for the same Work Order");
      }
      await assertStockEntryNotReused(context, stockEntryName);
      outputBatch = assertExactStockReconciliation(input, workOrder, stockEntry, materials, outputs, outputBatch);

      const productionItem = text(workOrder.data.production_item);
      const manufactured = await context.reader.getManufacturedQuantityMicros(
        context.command.tenant_id,
        input.work_order,
        "Manufacture",
        productionItem || undefined,
      );
      const priorGood = await submittedGoodQuantity(context, input.work_order);
      if (priorGood + totals.good > manufactured) {
        throw errors.reference("Production Run good quantity exceeds posted manufactured quantity", {
          posted_manufactured_qty_micros: manufactured,
          prior_run_good_qty_micros: priorGood,
          requested_good_qty_micros: totals.good,
        });
      }
      if (priorGood + totals.good > workOrderQty) {
        throw errors.reference("Production Run good quantity exceeds Work Order quantity", {
          work_order_qty_micros: workOrderQty,
          prior_run_good_qty_micros: priorGood,
          requested_good_qty_micros: totals.good,
        });
      }
    }

    return {
      ...input,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      planned_qty: fromScaledInt(plannedQty, 6),
      materials,
      outputs,
      good_qty: fromScaledInt(totals.good, 6),
      scrap_qty: fromScaledInt(totals.scrap, 6),
      regrind_qty: fromScaledInt(totals.regrind, 6),
      byproduct_qty: fromScaledInt(totals.byproduct, 6),
      downtime_events: downtimeEvents,
      downtime_minutes: fromScaledInt(downtimeMinutesMicros, 6),
      ...(startedAt ? { started_at: startedAt } : { started_at: undefined }),
      ...(pausedAt ? { paused_at: pausedAt } : { paused_at: undefined }),
      ...(endedAt ? { ended_at: endedAt } : { ended_at: undefined }),
      ...(pauseReason ? { pause_reason: pauseReason } : { pause_reason: undefined }),
      ...(outputBatch ? { output_batch: outputBatch } : { output_batch: undefined }),
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

async function requireMaster(context: ControllerContext<PlasticProductionRunData>, recordType: string, name: string): Promise<JsonObject> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, recordType, name);
  if (!data) throw errors.reference(`${recordType} ${name} does not exist`);
  return data;
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
    if (!Number.isFinite(candidateStart) || !Number.isFinite(candidateEnd) || !(start < candidateEnd && candidateStart < end)) continue;
    if (machineExclusive && candidate.data.machine === input.machine) {
      throw errors.reference(`Machine ${input.machine} already has an overlapping Production Run ${candidate.name}`);
    }
    if (input.tool && candidate.data.tool === input.tool) {
      throw errors.reference(`Tool ${input.tool} already has an overlapping Production Run ${candidate.name}`);
    }
  }
}

async function otherPlannedQuantity(context: ControllerContext<PlasticProductionRunData>, workOrder: string): Promise<number> {
  const runs = await context.reader.listDocumentsByDoctype<PlasticProductionRunData>(context.command.tenant_id, "Plastic Production Run");
  let total = 0;
  for (const run of runs) {
    if (run.name === context.command.aggregate.name || run.docstatus === 2 || run.data.work_order !== workOrder) continue;
    total = safeAdd(total, positiveMicros(run.data.planned_qty, `${run.name}.planned_qty`));
  }
  return total;
}

async function submittedGoodQuantity(context: ControllerContext<PlasticProductionRunData>, workOrder: string): Promise<number> {
  const runs = await context.reader.listDocumentsByDoctype<PlasticProductionRunData>(context.command.tenant_id, "Plastic Production Run");
  let total = 0;
  for (const run of runs) {
    if (run.name === context.command.aggregate.name || run.docstatus !== 1 || run.data.work_order !== workOrder) continue;
    total = safeAdd(total, nonNegativeMicros(run.data.good_qty ?? 0, `${run.name}.good_qty`));
  }
  return total;
}

async function assertStockEntryNotReused(context: ControllerContext<PlasticProductionRunData>, stockEntryName: string): Promise<void> {
  const runs = await context.reader.listDocumentsByDoctype<PlasticProductionRunData>(context.command.tenant_id, "Plastic Production Run");
  const duplicate = runs.find((run) => run.name !== context.command.aggregate.name && run.docstatus !== 2 && text(run.data.manufacture_stock_entry) === stockEntryName);
  if (duplicate) throw errors.reference(`Manufacture Stock Entry ${stockEntryName} is already linked to Production Run ${duplicate.name}`);
}

function assertExactStockReconciliation(
  input: PlasticProductionRunData,
  workOrder: CanonicalDocument<JsonObject>,
  stockEntry: CanonicalDocument<ManufactureStockEntryData>,
  materials: PlasticProductionMaterial[],
  outputs: PlasticProductionOutput[],
  requestedOutputBatch: string | undefined,
): string | undefined {
  const stock = stockEntry.data;
  const productionItem = text(workOrder.data.production_item);
  if (text(stock.finished_good_item) !== productionItem) throw errors.reference("Manufacture Stock Entry finished item does not match Work Order");

  const goodOutputs = outputs.filter((row) => row.output_type === "Good");
  if (goodOutputs.length !== 1) throw errors.validation("Completed Production Run requires exactly one Good output row");
  const good = goodOutputs[0]!;
  const stockGoodQty = stock.finished_good_qty_micros ?? positiveMicros(stock.finished_good_qty, "Stock Entry finished_good_qty");
  const goodQty = positiveMicros(good.qty, "Good output qty");
  if (good.item_code !== productionItem || goodQty !== stockGoodQty || good.target_warehouse !== text(stock.target_warehouse)) {
    throw errors.reference("Good output does not exactly match Manufacture Stock Entry finished good");
  }
  if (text(good.serial_and_batch_bundle) !== text(stock.finished_good_bundle)) {
    throw errors.reference("Good output bundle does not match Manufacture Stock Entry finished-good bundle");
  }

  const stockBatch = finishedGoodBatch(stock);
  if (good.batch_no && stockBatch && good.batch_no !== stockBatch) throw errors.reference("Good output batch does not match Manufacture Stock Entry physical lot");
  if (requestedOutputBatch && stockBatch && requestedOutputBatch !== stockBatch) throw errors.reference("output_batch does not match Manufacture Stock Entry physical lot");
  const outputBatch = requestedOutputBatch || text(good.batch_no) || stockBatch || undefined;

  const materialMap = aggregateMaterialRows(materials);
  const stockConsumptionMap = aggregateStockRows(stock.items.filter((row) => (row.manufacturing_kind ?? "Consumption") === "Consumption"), "source");
  assertQuantityMapsEqual(materialMap, stockConsumptionMap, "Production Run material lots do not exactly match Manufacture Stock Entry consumption");

  const recoveryOutputs = outputs.filter((row) => row.output_type !== "Good");
  const recoveryMap = aggregateOutputRows(recoveryOutputs);
  const stockRecoveryMap = aggregateStockRows(stock.items.filter((row) => row.manufacturing_kind === "Scrap" || row.manufacturing_kind === "Offcut"), "target");
  assertQuantityMapsEqual(recoveryMap, stockRecoveryMap, "Production Run recovery outputs do not exactly match Manufacture Stock Entry recovery rows");

  if (input.manufacture_stock_entry !== stockEntry.name) throw errors.reference("Manufacture Stock Entry identity changed during reconciliation");
  return outputBatch;
}

function normalizeMaterials(rows: PlasticProductionMaterial[]): PlasticProductionMaterial[] {
  return rows.map((row, index) => {
    requireText(row.item_code, `materials[${index}].item_code`);
    requireText(row.source_warehouse, `materials[${index}].source_warehouse`);
    const qty = positiveMicros(row.consumed_qty, `materials[${index}].consumed_qty`);
    const weight = optionalNonNegativeMicros(row.weight_kg, `materials[${index}].weight_kg`);
    return {
      ...row,
      consumed_qty: fromScaledInt(qty, 6),
      ...(weight === undefined ? {} : { weight_kg: fromScaledInt(weight, 6) }),
    };
  });
}

function normalizeOutputs(rows: PlasticProductionOutput[]): PlasticProductionOutput[] {
  return rows.map((row, index) => {
    if (!OUTPUT_TYPES.has(row.output_type)) throw errors.validation(`Unsupported output_type at outputs[${index}]`);
    requireText(row.item_code, `outputs[${index}].item_code`);
    requireText(row.target_warehouse, `outputs[${index}].target_warehouse`);
    const qty = positiveMicros(row.qty, `outputs[${index}].qty`);
    const weight = optionalNonNegativeMicros(row.weight_kg, `outputs[${index}].weight_kg`);
    return {
      ...row,
      qty: fromScaledInt(qty, 6),
      ...(weight === undefined ? {} : { weight_kg: fromScaledInt(weight, 6) }),
    };
  });
}

function outputTotals(rows: PlasticProductionOutput[]): { good: number; scrap: number; regrind: number; byproduct: number } {
  const totals = { good: 0, scrap: 0, regrind: 0, byproduct: 0 };
  for (const row of rows) {
    const qty = positiveMicros(row.qty, "output qty");
    if (row.output_type === "Good") totals.good = safeAdd(totals.good, qty);
    if (row.output_type === "Scrap") totals.scrap = safeAdd(totals.scrap, qty);
    if (row.output_type === "Regrind") totals.regrind = safeAdd(totals.regrind, qty);
    if (row.output_type === "By-product") totals.byproduct = safeAdd(totals.byproduct, qty);
  }
  return totals;
}

function aggregateMaterialRows(rows: PlasticProductionMaterial[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) addQuantity(map, physicalKey(row.item_code, row.source_warehouse, row.serial_and_batch_bundle, row.batch_no), positiveMicros(row.consumed_qty, "material qty"));
  return map;
}

function aggregateOutputRows(rows: PlasticProductionOutput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) addQuantity(map, physicalKey(row.item_code, row.target_warehouse, row.serial_and_batch_bundle, row.batch_no), positiveMicros(row.qty, "output qty"));
  return map;
}

function aggregateStockRows(rows: ManufacturingStockRow[], direction: "source" | "target"): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const warehouse = direction === "source" ? text(row.source_warehouse) : text(row.target_warehouse);
    if (!warehouse) throw errors.reference(`Manufacture Stock Entry row ${row.row_id} is missing ${direction} warehouse`);
    const qty = row.qty_micros ?? positiveMicros(row.qty, `Stock Entry row ${row.row_id} qty`);
    addQuantity(map, physicalKey(row.item_code, warehouse, row.serial_and_batch_bundle, row.batch_no || singleBatch(row.physical_lot_refs)), qty);
  }
  return map;
}

function assertQuantityMapsEqual(actual: Map<string, number>, posted: Map<string, number>, message: string): void {
  if (actual.size !== posted.size) throw errors.reference(message, { actual_rows: actual.size, posted_rows: posted.size });
  for (const [key, postedQty] of posted) {
    if (actual.get(key) !== postedQty) throw errors.reference(message, { physical_key: key, actual_qty_micros: actual.get(key) ?? 0, posted_qty_micros: postedQty });
  }
}

function addQuantity(map: Map<string, number>, key: string, qty: number): void {
  map.set(key, safeAdd(map.get(key) ?? 0, qty));
}

function physicalKey(item: unknown, warehouse: unknown, bundle: unknown, batch: unknown): string {
  return [text(item), text(warehouse), text(bundle), text(batch)].join("|");
}

function singleBatch(refs: unknown): string {
  if (!Array.isArray(refs)) return "";
  const batches = [...new Set(refs.map((row) => text((row as JsonObject)?.batch_no)).filter(Boolean))];
  return batches.length === 1 ? batches[0]! : "";
}

function finishedGoodBatch(stock: ManufactureStockEntryData): string {
  const identity = stock.finished_good_physical_identity;
  return singleBatch(identity && typeof identity === "object" && !Array.isArray(identity) ? identity.physical_lot_refs : undefined);
}

function normalizeExistingDowntime(value: unknown): PlasticProductionDowntime[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`Invalid downtime row ${index + 1}`);
    const row = raw as PlasticProductionDowntime;
    const reason = requireText(row.reason, `downtime_events[${index}].reason`);
    const startedAt = validTimestamp(row.started_at, `downtime_events[${index}].started_at`);
    const endedAt = validTimestamp(row.ended_at, `downtime_events[${index}].ended_at`);
    const minutes = durationMinutesMicros(startedAt, endedAt);
    return { ...row, reason, started_at: startedAt, ended_at: endedAt, minutes: fromScaledInt(minutes, 6) };
  });
}

function downtimeEvent(reason: string, start: string, end: string): PlasticProductionDowntime {
  const startedAt = validTimestamp(start, "paused_at");
  const endedAt = validTimestamp(end, "resume/completion time");
  return { reason, started_at: startedAt, ended_at: endedAt, minutes: fromScaledInt(durationMinutesMicros(startedAt, endedAt), 6) };
}

function durationMinutesMicros(start: string, end: string): number {
  const delta = Date.parse(end) - Date.parse(start);
  if (delta <= 0) throw errors.validation("Downtime end must be after downtime start");
  return safeNumber((BigInt(delta) * 1_000_000n + 30_000n) / 60_000n);
}

function assertAssignmentLocked(existing: CanonicalDocument<PlasticProductionRunData>, input: PlasticProductionRunData, plannedQty: number, plannedStart: string, plannedEnd: string): void {
  const locked: Array<[string, unknown, unknown]> = [
    ["company", existing.data.company, input.company],
    ["branch", existing.data.branch, input.branch],
    ["work_order", existing.data.work_order, input.work_order],
    ["recipe_policy", existing.data.recipe_policy, input.recipe_policy],
    ["process_profile", existing.data.process_profile, input.process_profile],
    ["machine", existing.data.machine, input.machine],
    ["tool", existing.data.tool, input.tool],
    ["shift_type", existing.data.shift_type, input.shift_type],
    ["operator", existing.data.operator, input.operator],
    ["planned_start", existing.data.planned_start, plannedStart],
    ["planned_end", existing.data.planned_end, plannedEnd],
  ];
  for (const [field, before, after] of locked) if (text(before) !== text(after)) throw errors.validation(`${field} cannot change after Production Run starts`);
  const existingQty = positiveMicros(existing.data.planned_qty, "existing planned_qty");
  if (existingQty !== plannedQty) throw errors.validation("planned_qty cannot change after Production Run starts");
}

function assertRecipeEffective(recipe: CanonicalDocument<JsonObject>, plannedStart: string): void {
  const day = new Date(plannedStart).toISOString().slice(0, 10);
  const from = text(recipe.data.effective_from);
  const to = text(recipe.data.effective_to);
  if (from && day < from) throw errors.reference("Recipe Policy is not effective at planned start");
  if (to && day > to) throw errors.reference("Recipe Policy is expired at planned start");
}

function workOrderQuantityMicros(workOrder: CanonicalDocument<JsonObject>): number {
  if (typeof workOrder.data.qty_micros === "number" && Number.isSafeInteger(workOrder.data.qty_micros)) return workOrder.data.qty_micros;
  return positiveMicros(workOrder.data.qty ?? 0, "Work Order qty");
}

function assertRunTransition(action: string, previous: PlasticRunStatus | undefined, requested: PlasticRunStatus): void {
  if (action === "submit") {
    if (!previous || !["Running", "Paused"].includes(previous)) throw errors.validation("Production Run must be Running or Paused before completion");
    if (requested !== "Completed") throw errors.validation("Submit transition must end in Completed");
    return;
  }
  if (action === "create" && !previous && requested !== "Planned") throw errors.validation("New Production Run must start in Planned state");
  if (requested === "Completed") throw errors.validation("Use Submit to complete a Production Run");
  if (!previous) return;
  if (previous === "Completed") throw errors.validation("Completed Production Run is immutable; use cancel/amend semantics");
  const allowed: Record<Exclude<PlasticRunStatus, "Completed">, PlasticRunStatus[]> = {
    Planned: ["Planned", "Running"],
    Running: ["Running", "Paused"],
    Paused: ["Paused", "Running"],
  };
  if (!allowed[previous].includes(requested)) throw errors.validation(`Invalid Production Run transition ${previous} -> ${requested}`);
}

function validTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) throw errors.validation(`${field} must be a valid timestamp`);
  return new Date(value).toISOString();
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

function optionalNonNegativeMicros(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return nonNegativeMicros(value, field);
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

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Production Run quantity exceeds safe integer range");
  return value;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Production Run numeric value exceeds safe integer range");
  return number;
}
