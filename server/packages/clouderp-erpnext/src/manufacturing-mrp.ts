import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { ProductionPlanData, ProductionPlanItem } from "./types.js";
import type { BomQuantityBasis, VersionedBomData } from "./manufacturing-lifecycle.js";

const MAX_MRP_DEPTH = 32;
const MAX_REQUIREMENT_SOURCES = 50;

interface PlanningDimensions extends JsonObject {
  width_micros?: number;
  height_micros?: number;
  leaf_count_micros?: number;
}

interface MrpSourceTrace extends JsonObject {
  root_row_id: string;
  root_item_code: string;
  parent_item_code: string;
  bom_no: string;
  bom_revision: number;
  bom_row_id: string;
  path: string[];
}

export interface MrpRequirement extends JsonObject {
  requirement_type: "Purchase" | "Manufacture";
  item_code: string;
  warehouse?: string;
  schedule_date?: string;
  gross_qty: string;
  gross_qty_micros: number;
  source_count: number;
  sources: MrpSourceTrace[];
}

export interface MrpPlannedOutput extends JsonObject {
  row_id: string;
  item_code: string;
  bom_no: string;
  bom_revision: number;
  warehouse?: string;
  schedule_date?: string;
  planned_qty: string;
  planned_qty_micros: number;
}

export interface MrpExplosionResult extends JsonObject {
  schema_version: 1;
  company: string;
  production_plan: string;
  planning_date: string;
  netting_mode: "gross_only";
  planned_outputs: MrpPlannedOutput[];
  manufacture_requirements: MrpRequirement[];
  purchase_requirements: MrpRequirement[];
  warnings: string[];
}

interface RequirementAccumulator {
  requirement_type: "Purchase" | "Manufacture";
  item_code: string;
  warehouse?: string;
  schedule_date?: string;
  gross_qty_micros: number;
  source_count: number;
  sources: MrpSourceTrace[];
}

interface RootPlanItem extends ProductionPlanItem {
  width_m?: string | number;
  height_m?: string | number;
  leaf_count?: string | number;
}

/**
 * Deterministic MRP explosion from a canonical Production Plan and submitted BOM revisions.
 *
 * Scope of this slice is GROSS requirements. Inventory/reservation/open-supply netting is
 * intentionally not guessed here; it belongs on the canonical inventory/procurement read
 * contracts. The result says `netting_mode=gross_only` so nobody can mistake it for ATP.
 */
export function explodeProductionPlanMrp(
  productionPlanName: string,
  plan: ProductionPlanData,
  bomDocuments: Array<CanonicalDocument<VersionedBomData>>,
  planningDateInput?: string,
): MrpExplosionResult {
  const company = requiredText(plan.company, "Production Plan company");
  const planningDate = validDate(planningDateInput ?? plan.posting_at, "planning_date");
  if (!Array.isArray(plan.items) || plan.items.length === 0) {
    throw errors.validation("Production Plan requires at least one item for MRP");
  }

  const active = bomDocuments.filter((document) => document.docstatus === 1
    && document.data.company === company
    && isEffective(document.data, planningDate));
  const byName = new Map(active.map((document) => [document.name, document]));
  const byItem = new Map<string, Array<CanonicalDocument<VersionedBomData>>>();
  for (const document of active) {
    const list = byItem.get(document.data.item) ?? [];
    list.push(document);
    byItem.set(document.data.item, list);
  }
  for (const list of byItem.values()) list.sort((a, b) => (b.data.revision ?? 1) - (a.data.revision ?? 1) || b.modified_at.localeCompare(a.modified_at));

  const requirements = new Map<string, RequirementAccumulator>();
  const outputs: MrpPlannedOutput[] = [];
  const warnings = new Set<string>();

  for (const [index, raw] of plan.items.entries()) {
    const row = raw as RootPlanItem;
    const rowId = requiredText(row.row_id || `ROW-${index + 1}`, `items[${index}].row_id`);
    const itemCode = requiredText(row.item_code, `items[${index}].item_code`);
    const qtyMicros = positiveMicros(row.planned_qty_micros ?? row.planned_qty, `items[${index}].planned_qty`);
    const scheduleDate = row.schedule_date ? validDate(row.schedule_date, `items[${index}].schedule_date`) : undefined;
    const warehouse = optionalText(row.warehouse);
    const dimensions = rootDimensions(row, index);
    const selected = selectRootBom(row.bom_no, itemCode, company, planningDate, byName, byItem);
    outputs.push({
      row_id: rowId,
      item_code: itemCode,
      bom_no: selected.name,
      bom_revision: selected.data.revision ?? 1,
      ...(warehouse ? { warehouse } : {}),
      ...(scheduleDate ? { schedule_date: scheduleDate } : {}),
      planned_qty: fromScaledInt(qtyMicros, 6),
      planned_qty_micros: qtyMicros,
    });
    explodeBom({
      rootRowId: rowId,
      rootItemCode: itemCode,
      parentQtyMicros: qtyMicros,
      parentWarehouse: warehouse,
      scheduleDate,
      dimensions,
      selected,
      byItem,
      path: [itemCode],
      requirements,
      warnings,
      depth: 0,
    });
  }

  const sorted = [...requirements.values()]
    .map(toRequirement)
    .sort((a, b) => a.requirement_type.localeCompare(b.requirement_type)
      || a.item_code.localeCompare(b.item_code)
      || (a.warehouse ?? "").localeCompare(b.warehouse ?? "")
      || (a.schedule_date ?? "").localeCompare(b.schedule_date ?? ""));

  return {
    schema_version: 1,
    company,
    production_plan: productionPlanName,
    planning_date: planningDate,
    netting_mode: "gross_only",
    planned_outputs: outputs,
    manufacture_requirements: sorted.filter((row) => row.requirement_type === "Manufacture"),
    purchase_requirements: sorted.filter((row) => row.requirement_type === "Purchase"),
    warnings: [...warnings].sort(),
  };
}

export function materialRequestDraftsFromMrp(
  result: MrpExplosionResult,
  requestedBy?: string,
): JsonObject[] {
  const drafts: JsonObject[] = [];
  for (const [type, rows] of [
    ["Purchase", result.purchase_requirements],
    ["Manufacture", result.manufacture_requirements],
  ] as const) {
    if (rows.length === 0) continue;
    drafts.push({
      company: result.company,
      material_request_type: type,
      transaction_date: result.planning_date,
      ...(requestedBy ? { requested_by: requestedBy } : {}),
      mrp_source_doctype: "Production Plan",
      mrp_source_name: result.production_plan,
      mrp_schema_version: 1,
      mrp_netting_mode: result.netting_mode,
      note: `MRP ${type} requirement generated from Production Plan ${result.production_plan}; gross requirements only`,
      items: rows.map((row, index) => ({
        row_id: `MRP-${type.toUpperCase()}-${index + 1}`,
        item_code: row.item_code,
        qty: row.gross_qty,
        ...(row.warehouse ? { warehouse: row.warehouse } : {}),
        ...(row.schedule_date ? { schedule_date: row.schedule_date } : {}),
        note: `${row.source_count} MRP source path${row.source_count === 1 ? "" : "s"}`,
      })),
    });
  }
  return drafts;
}

function explodeBom(input: {
  rootRowId: string;
  rootItemCode: string;
  parentQtyMicros: number;
  parentWarehouse?: string;
  scheduleDate?: string;
  dimensions?: PlanningDimensions;
  selected: CanonicalDocument<VersionedBomData>;
  byItem: Map<string, Array<CanonicalDocument<VersionedBomData>>>;
  path: string[];
  requirements: Map<string, RequirementAccumulator>;
  warnings: Set<string>;
  depth: number;
}): void {
  if (input.depth >= MAX_MRP_DEPTH) throw errors.validation(`MRP explosion exceeds maximum depth ${MAX_MRP_DEPTH}`);
  const bom = input.selected.data;
  const outputQtyMicros = positiveMicros(
    bom.output_stock_qty_micros ?? bom.quantity_micros ?? bom.quantity,
    `BOM ${input.selected.name} output quantity`,
  );

  for (const [index, row] of bom.items.entries()) {
    const rowId = row.row_id || `ROW-${index + 1}`;
    const baseStockMicros = positiveMicros(
      row.stock_qty_micros ?? row.qty_micros ?? row.qty,
      `BOM ${input.selected.name} row ${rowId} quantity`,
    );
    const basis = row.qty_basis ?? "Cố định";
    const basisMicros = quantityBasisMicros(basis, input.dimensions, input.selected.name, rowId);
    const requiredMicros = multiplyRatioAndBasis(baseStockMicros, input.parentQtyMicros, outputQtyMicros, basisMicros);
    const warehouse = optionalText(row.source_warehouse) ?? input.parentWarehouse;
    if (!warehouse) input.warnings.add(`UNALLOCATED_WAREHOUSE:${row.item_code}`);

    const childBoms = input.byItem.get(row.item_code) ?? [];
    if (childBoms.length > 1) {
      throw errors.reference(`More than one Active BOM is effective for ${row.item_code} during MRP`);
    }
    const trace: MrpSourceTrace = {
      root_row_id: input.rootRowId,
      root_item_code: input.rootItemCode,
      parent_item_code: bom.item,
      bom_no: input.selected.name,
      bom_revision: bom.revision ?? 1,
      bom_row_id: rowId,
      path: [...input.path, row.item_code],
    };

    if (childBoms.length === 1) {
      addRequirement(input.requirements, {
        requirement_type: "Manufacture",
        item_code: row.item_code,
        ...(warehouse ? { warehouse } : {}),
        ...(input.scheduleDate ? { schedule_date: input.scheduleDate } : {}),
        gross_qty_micros: requiredMicros,
        source_count: 1,
        sources: [trace],
      });
      if (input.path.includes(row.item_code)) {
        throw errors.reference(`MRP detected circular BOM path ${[...input.path, row.item_code].join(" -> ")}`);
      }
      explodeBom({
        ...input,
        parentQtyMicros: requiredMicros,
        parentWarehouse: warehouse,
        // A subassembly may have its own dimensional semantics. Inheriting the finished
        // product dimensions would be guesswork, so only fixed rows are allowed below root
        // until an explicit dimension mapping contract exists.
        dimensions: undefined,
        selected: childBoms[0]!,
        path: [...input.path, row.item_code],
        depth: input.depth + 1,
      });
    } else {
      addRequirement(input.requirements, {
        requirement_type: "Purchase",
        item_code: row.item_code,
        ...(warehouse ? { warehouse } : {}),
        ...(input.scheduleDate ? { schedule_date: input.scheduleDate } : {}),
        gross_qty_micros: requiredMicros,
        source_count: 1,
        sources: [trace],
      });
    }
  }
}

function selectRootBom(
  requestedName: string | undefined,
  itemCode: string,
  company: string,
  planningDate: string,
  byName: Map<string, CanonicalDocument<VersionedBomData>>,
  byItem: Map<string, Array<CanonicalDocument<VersionedBomData>>>,
): CanonicalDocument<VersionedBomData> {
  if (requestedName) {
    const document = byName.get(requestedName);
    if (!document) throw errors.reference(`BOM ${requestedName} is not submitted/Active/effective at ${planningDate}`);
    if (document.data.company !== company || document.data.item !== itemCode) {
      throw errors.reference(`BOM ${requestedName} does not match Production Plan item/company`);
    }
    return document;
  }
  const matches = byItem.get(itemCode) ?? [];
  if (matches.length === 0) throw errors.reference(`No Active BOM is effective for planned output ${itemCode} at ${planningDate}`);
  if (matches.length > 1) throw errors.reference(`More than one Active BOM is effective for planned output ${itemCode} at ${planningDate}`);
  return matches[0]!;
}

function addRequirement(map: Map<string, RequirementAccumulator>, incoming: RequirementAccumulator): void {
  const key = [incoming.requirement_type, incoming.item_code, incoming.warehouse ?? "", incoming.schedule_date ?? ""].join("\u0000");
  const current = map.get(key);
  if (!current) {
    map.set(key, incoming);
    return;
  }
  current.gross_qty_micros = safeAdd(current.gross_qty_micros, incoming.gross_qty_micros);
  current.source_count = safeAdd(current.source_count, incoming.source_count);
  if (current.sources.length < MAX_REQUIREMENT_SOURCES) {
    current.sources.push(...incoming.sources.slice(0, MAX_REQUIREMENT_SOURCES - current.sources.length));
  }
}

function toRequirement(value: RequirementAccumulator): MrpRequirement {
  return {
    requirement_type: value.requirement_type,
    item_code: value.item_code,
    ...(value.warehouse ? { warehouse: value.warehouse } : {}),
    ...(value.schedule_date ? { schedule_date: value.schedule_date } : {}),
    gross_qty: fromScaledInt(value.gross_qty_micros, 6),
    gross_qty_micros: value.gross_qty_micros,
    source_count: value.source_count,
    sources: value.sources,
  };
}

function rootDimensions(row: RootPlanItem, index: number): PlanningDimensions | undefined {
  const width = optionalPositiveMicros(row.width_m, `items[${index}].width_m`);
  const height = optionalPositiveMicros(row.height_m, `items[${index}].height_m`);
  const leaves = optionalPositiveMicros(row.leaf_count, `items[${index}].leaf_count`);
  if (width === undefined && height === undefined && leaves === undefined) return undefined;
  return {
    ...(width === undefined ? {} : { width_micros: width }),
    ...(height === undefined ? {} : { height_micros: height }),
    ...(leaves === undefined ? {} : { leaf_count_micros: leaves }),
  };
}

function quantityBasisMicros(
  basis: BomQuantityBasis,
  dimensions: PlanningDimensions | undefined,
  bomName: string,
  rowId: string,
): number {
  if (basis === "Cố định") return 1_000_000;
  if (!dimensions) {
    throw errors.validation(`MRP requires explicit dimensions for non-fixed BOM ${bomName} row ${rowId}`);
  }
  if (basis === "Theo chiều rộng") return requiredDimension(dimensions.width_micros, "width_m", bomName, rowId);
  if (basis === "Theo chiều cao") return requiredDimension(dimensions.height_micros, "height_m", bomName, rowId);
  if (basis === "Theo số lá") return requiredDimension(dimensions.leaf_count_micros, "leaf_count", bomName, rowId);
  if (basis === "Theo diện tích") {
    const width = requiredDimension(dimensions.width_micros, "width_m", bomName, rowId);
    const height = requiredDimension(dimensions.height_micros, "height_m", bomName, rowId);
    return multiplyMicros(width, height);
  }
  throw errors.validation(`Unsupported BOM quantity basis ${String(basis)}`);
}

function requiredDimension(value: number | undefined, field: string, bomName: string, rowId: string): number {
  if (value === undefined) throw errors.validation(`MRP requires ${field} for BOM ${bomName} row ${rowId}`);
  return value;
}

function isEffective(bom: VersionedBomData, date: string): boolean {
  if ((bom.bom_status ?? "Active") !== "Active") return false;
  const from = bom.effective_from ?? "0000-01-01";
  return from <= date && (!bom.effective_to || bom.effective_to >= date);
}

function multiplyRatioAndBasis(base: number, numerator: number, denominator: number, basisMicros: number): number {
  if (denominator <= 0) throw errors.validation("BOM output quantity must be positive");
  return safeNumber(divideRounded(BigInt(base) * BigInt(numerator) * BigInt(basisMicros), BigInt(denominator) * 1_000_000n));
}

function multiplyMicros(left: number, right: number): number {
  return safeNumber(divideRounded(BigInt(left) * BigInt(right), 1_000_000n));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw errors.validation("MRP divisor must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("MRP quantity exceeds safe integer range");
  return number;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("MRP arithmetic exceeds safe integer range");
  return value;
}

function positiveMicros(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const micros = toScaledInt(value, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function optionalPositiveMicros(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return positiveMicros(value, field);
}

function validDate(value: unknown, field: string): string {
  const text = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) throw errors.validation(`${field} must be a valid calendar date`);
  return text;
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
