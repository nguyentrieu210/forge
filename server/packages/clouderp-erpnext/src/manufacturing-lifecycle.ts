import type {
  CanonicalDocument,
  JsonObject,
  ManufacturingEntry,
  MutationPlan,
} from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import {
  BillOfMaterialsController,
  WorkOrderController,
} from "./controllers.js";
import { PhysicalStockEntryController } from "./physical-stock-entry.js";
import type {
  BillOfMaterialsData,
  BomItem,
  WorkOrderData,
  WorkOrderRequiredItem,
} from "./types.js";

export type BomLifecycleStatus = "Draft" | "Active" | "Retired";
export type BomQuantityBasis = "Cố định" | "Theo chiều cao" | "Theo chiều rộng" | "Theo diện tích" | "Theo số lá";
export type ManufacturingRowKind = "Issue" | "Consumption" | "Scrap" | "Offcut";

interface VersionedBomItem extends BomItem {
  uom?: string;
  stock_uom?: string;
  conversion_factor?: string | number;
  conversion_factor_micros?: number;
  stock_qty?: string;
  stock_qty_micros?: number;
  qty_basis?: BomQuantityBasis;
}

export interface VersionedBomData extends BillOfMaterialsData {
  revision?: number;
  bom_status?: BomLifecycleStatus;
  effective_from?: string;
  effective_to?: string;
  output_uom?: string;
  output_stock_uom?: string;
  output_conversion_factor?: string | number;
  output_conversion_factor_micros?: number;
  output_stock_qty_micros?: number;
  snapshot_version?: number;
  bom_checksum?: string;
  items: VersionedBomItem[];
}

interface WorkOrderSnapshotRow extends JsonObject {
  bom_row_id: string;
  item_code: string;
  uom: string;
  stock_uom: string;
  conversion_factor_micros: number;
  qty_basis: BomQuantityBasis;
  bom_stock_qty_micros: number;
  required_qty_micros: number;
  source_warehouse: string;
}

interface WorkOrderSnapshot extends JsonObject {
  schema_version: number;
  bom_no: string;
  bom_revision: number;
  bom_checksum: string;
  effective_from: string;
  effective_to?: string;
  output_item: string;
  output_qty_micros: number;
  work_order_qty_micros: number;
  released_at: string;
  width_micros?: number;
  height_micros?: number;
  leaf_count_micros?: number;
  rows: WorkOrderSnapshotRow[];
}

interface SnapshotWorkOrderData extends WorkOrderData {
  width_m?: string | number;
  height_m?: string | number;
  leaf_count?: string | number;
  bom_revision?: number;
  bom_effective_from?: string;
  bom_effective_to?: string;
  bom_checksum?: string;
  released_at?: string;
  manufacturing_snapshot?: WorkOrderSnapshot;
}

interface LifecycleStockRow extends StockEntryItem {
  bom_row_id?: string;
  manufacturing_kind?: ManufacturingRowKind;
  work_order_bom_checksum?: string;
  target_warehouse_role?: string;
}

interface LifecycleStockData extends StockEntryData {
  items: LifecycleStockRow[];
}

const BOM_STATUSES = new Set<BomLifecycleStatus>(["Draft", "Active", "Retired"]);
const QTY_BASES = new Set<BomQuantityBasis>(["Cố định", "Theo chiều cao", "Theo chiều rộng", "Theo diện tích", "Theo số lá"]);
const ROW_KINDS = new Set<ManufacturingRowKind>(["Issue", "Consumption", "Scrap", "Offcut"]);

export class VersionedBillOfMaterialsController extends BillOfMaterialsController {
  override async normalize(context: ControllerContext<BillOfMaterialsData>): Promise<BillOfMaterialsData> {
    const normalized = await super.normalize(context) as VersionedBomData;
    const input = context.command.document as VersionedBomData;
    const revision = positiveInteger(input.revision ?? 1, "revision");
    const status = resolveBomStatus(context.command.action, input.bom_status);
    const effectiveFrom = validDate(input.effective_from ?? context.now.slice(0, 10), "effective_from");
    const effectiveTo = input.effective_to ? validDate(input.effective_to, "effective_to") : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must be on or after effective_from");
    if (context.command.action === "submit" && status !== "Active") {
      throw errors.validation("Submitted BOM revision must be Active");
    }

    const finished = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", normalized.item);
    assertManufacturingItem(finished, normalized.item, true);
    const outputStockUom = text(finished?.stock_uom) || "Nos";
    const outputUom = text(input.output_uom) || outputStockUom;
    const outputConversion = conversionMicros(input.output_conversion_factor, outputUom, outputStockUom, "output_conversion_factor");
    const outputQtyMicros = normalized.quantity_micros ?? toScaledInt(normalized.quantity, 6, "quantity");
    const outputStockQtyMicros = multiplyMicros(outputQtyMicros, outputConversion);

    const rows: VersionedBomItem[] = [];
    for (const [index, baseRow] of normalized.items.entries()) {
      const rawInput = (input.items[index] ?? baseRow) as VersionedBomItem;
      if (baseRow.item_code === normalized.item) throw errors.validation(`BOM row ${index + 1} cannot consume its own output Item`);
      const material = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", baseRow.item_code);
      assertManufacturingItem(material, baseRow.item_code, false);
      const stockUom = text(material?.stock_uom) || "Nos";
      const uom = text(rawInput.uom) || stockUom;
      const factorMicros = conversionMicros(rawInput.conversion_factor, uom, stockUom, `items[${index}].conversion_factor`);
      const qtyBasis = (text(rawInput.qty_basis) || "Cố định") as BomQuantityBasis;
      if (!QTY_BASES.has(qtyBasis)) throw errors.validation(`Unsupported qty_basis at row ${index + 1}`);
      const qtyMicros = baseRow.qty_micros ?? toScaledInt(baseRow.qty, 6, `items[${index}].qty`);
      const stockQtyMicros = multiplyMicros(qtyMicros, factorMicros);
      rows.push({
        ...baseRow,
        row_id: baseRow.row_id || `ROW-${index + 1}`,
        uom,
        stock_uom: stockUom,
        conversion_factor: fromScaledInt(factorMicros, 6),
        conversion_factor_micros: factorMicros,
        stock_qty: fromScaledInt(stockQtyMicros, 6),
        stock_qty_micros: stockQtyMicros,
        qty_basis: qtyBasis,
      });
    }

    const candidate: VersionedBomData = {
      ...normalized,
      revision,
      bom_status: status,
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      output_uom: outputUom,
      output_stock_uom: outputStockUom,
      output_conversion_factor: fromScaledInt(outputConversion, 6),
      output_conversion_factor_micros: outputConversion,
      output_stock_qty_micros: outputStockQtyMicros,
      snapshot_version: 1,
      items: rows,
    };

    if (context.command.action === "submit") {
      await assertNoRevisionOverlap(context, candidate);
      await assertNoCircularBom(context, candidate);
    }
    const checksum = await sha256(canonicalize(bomChecksumPayload(candidate)));
    return { ...candidate, bom_checksum: checksum };
  }
}

export class SnapshotWorkOrderController extends WorkOrderController {
  override async normalize(context: ControllerContext<WorkOrderData>): Promise<WorkOrderData> {
    const requested = context.command.document as SnapshotWorkOrderData;
    const releaseAt = validTimestamp(requested.planned_start_date ?? context.now, "planned_start_date");
    const selected = await selectEffectiveBom(context, requested, releaseAt);
    const adjustedContext: ControllerContext<WorkOrderData> = {
      ...context,
      command: {
        ...context.command,
        document: { ...requested, bom_no: selected.name },
      },
    };
    const normalized = await super.normalize(adjustedContext) as SnapshotWorkOrderData;
    const bom = selected.data;
    if (!bom.bom_checksum) throw errors.reference(`BOM ${selected.name} has no immutable checksum`);

    const workQtyMicros = normalized.qty_micros ?? toScaledInt(normalized.qty, 6, "qty");
    const bomQtyMicros = bom.quantity_micros ?? toScaledInt(bom.quantity, 6, "BOM quantity");
    const widthMicros = optionalPositiveMicros(requested.width_m, "width_m");
    const heightMicros = optionalPositiveMicros(requested.height_m, "height_m");
    const leafCountMicros = optionalPositiveMicros(requested.leaf_count, "leaf_count");

    const snapshotRows: WorkOrderSnapshotRow[] = bom.items.map((row, index) => {
      const basis = row.qty_basis ?? "Cố định";
      const basisMicros = quantityBasisMicros(basis, widthMicros, heightMicros, leafCountMicros, index);
      const baseStockMicros = row.stock_qty_micros ?? row.qty_micros ?? toScaledInt(row.qty, 6, `BOM items[${index}].qty`);
      const required = multiplyRatioAndBasis(baseStockMicros, workQtyMicros, bomQtyMicros, basisMicros);
      return {
        bom_row_id: row.row_id || `ROW-${index + 1}`,
        item_code: row.item_code,
        uom: row.uom ?? row.stock_uom ?? "Nos",
        stock_uom: row.stock_uom ?? row.uom ?? "Nos",
        conversion_factor_micros: row.conversion_factor_micros ?? 1_000_000,
        qty_basis: basis,
        bom_stock_qty_micros: baseStockMicros,
        required_qty_micros: required,
        source_warehouse: row.source_warehouse ?? normalized.source_warehouse,
      };
    });

    const requiredItems: WorkOrderRequiredItem[] = snapshotRows.map((row) => ({
      row_id: row.bom_row_id,
      item_code: row.item_code,
      required_qty: fromScaledInt(row.required_qty_micros, 6),
      required_qty_micros: row.required_qty_micros,
      source_warehouse: row.source_warehouse,
    }));
    const snapshot: WorkOrderSnapshot = {
      schema_version: 1,
      bom_no: selected.name,
      bom_revision: bom.revision ?? 1,
      bom_checksum: bom.bom_checksum,
      effective_from: bom.effective_from ?? releaseAt.slice(0, 10),
      ...(bom.effective_to ? { effective_to: bom.effective_to } : {}),
      output_item: normalized.production_item,
      output_qty_micros: bom.output_stock_qty_micros ?? bomQtyMicros,
      work_order_qty_micros: workQtyMicros,
      released_at: releaseAt,
      ...(widthMicros === undefined ? {} : { width_micros: widthMicros }),
      ...(heightMicros === undefined ? {} : { height_micros: heightMicros }),
      ...(leafCountMicros === undefined ? {} : { leaf_count_micros: leafCountMicros }),
      rows: snapshotRows,
    };

    return {
      ...normalized,
      bom_no: selected.name,
      required_items: requiredItems,
      bom_revision: snapshot.bom_revision,
      bom_effective_from: snapshot.effective_from,
      ...(snapshot.effective_to ? { bom_effective_to: snapshot.effective_to } : {}),
      bom_checksum: snapshot.bom_checksum,
      released_at: releaseAt,
      manufacturing_snapshot: snapshot,
    };
  }
}

export class ManufacturingStockEntryController extends PhysicalStockEntryController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const normalized = await super.normalize(context) as LifecycleStockData;
    if (!normalized.work_order || !["Material Transfer", "Manufacture"].includes(normalized.purpose)) return normalized;
    const workOrder = await requireSubmittedSnapshot(context, normalized.work_order);
    const snapshot = workOrder.data.manufacturing_snapshot;
    const priorDocuments = await context.reader.listDocumentsByDoctype<LifecycleStockData>(context.command.tenant_id, "Stock Entry");
    const rows: LifecycleStockRow[] = [];

    for (const [index, row] of normalized.items.entries()) {
      const candidates = snapshot.rows.filter((required) => required.item_code === row.item_code);
      const explicit = text(row.bom_row_id);
      const required = explicit
        ? snapshot.rows.find((candidate) => candidate.bom_row_id === explicit && candidate.item_code === row.item_code)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (!required) {
        throw errors.reference(`Dòng ${index + 1} không xác định được BOM row; phải khai bom_row_id khi một Item xuất hiện nhiều lần`);
      }
      const kind = resolveManufacturingKind(normalized.purpose, row.manufacturing_kind);
      if ((kind === "Scrap" || kind === "Offcut") && row.target_warehouse_role !== "SCRAP_OFFCUT") {
        throw errors.validation(`${kind} phải chuyển vào kho có vai trò SCRAP_OFFCUT`);
      }
      const qtyMicros = row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`);
      const consumed = sumPriorProgress(priorDocuments, normalized.work_order, required.bom_row_id, kindBucket(kind), context.command.aggregate.name);
      if (context.command.action === "submit" && consumed + qtyMicros > required.required_qty_micros) {
        throw errors.reference(`Dòng ${required.bom_row_id} vượt định mức Work Order`, {
          required_qty_micros: required.required_qty_micros,
          prior_qty_micros: consumed,
          requested_qty_micros: qtyMicros,
        });
      }
      rows.push({
        ...row,
        bom_row_id: required.bom_row_id,
        manufacturing_kind: kind,
        work_order_bom_checksum: snapshot.bom_checksum,
      });
    }
    return { ...normalized, items: rows };
  }

  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    const plan = await super.buildPlan(context);
    if (context.command.action !== "submit") return plan;
    const data = plan.document.data as LifecycleStockData;
    if (!data.work_order || !["Material Transfer", "Manufacture"].includes(data.purpose)) return plan;

    if (data.purpose === "Material Transfer") {
      const issues: ManufacturingEntry[] = data.items.map((row, index) => ({
        line_key: `ISSUE-${row.bom_row_id ?? row.row_id ?? index + 1}`,
        work_order: data.work_order!,
        kind: "Material Transfer",
        item_code: row.item_code,
        qty_micros: row.qty_micros ?? toScaledInt(row.qty, 6, `items[${index}].qty`),
        posting_at: data.posting_at,
      }));
      return { ...plan, manufacturing_entries: [...(plan.manufacturing_entries ?? []), ...issues] };
    }

    const byRow = new Map(data.items.map((row) => [row.row_id, row]));
    const manufacturing = (plan.manufacturing_entries ?? []).map((entry) => {
      if (entry.kind !== "Consumption" || !entry.line_key.startsWith("CONSUME-")) return entry;
      const rowId = entry.line_key.slice("CONSUME-".length);
      const row = byRow.get(rowId);
      const prefix = (row?.manufacturing_kind ?? "Consumption").toUpperCase();
      return { ...entry, line_key: `${prefix}-${row?.bom_row_id ?? rowId}-${rowId}` };
    });
    return { ...plan, manufacturing_entries: manufacturing };
  }
}

async function assertNoRevisionOverlap(
  context: ControllerContext<BillOfMaterialsData>,
  candidate: VersionedBomData,
): Promise<void> {
  const documents = await context.reader.listDocumentsByDoctype<VersionedBomData>(context.command.tenant_id, "Bill of Materials");
  for (const document of documents) {
    if (document.name === context.command.aggregate.name || document.docstatus !== 1) continue;
    const existing = document.data;
    if (existing.company !== candidate.company || existing.item !== candidate.item || existing.bom_status === "Retired") continue;
    if ((existing.revision ?? 1) === candidate.revision) throw errors.reference(`BOM revision ${candidate.revision} already exists for ${candidate.item}`);
    if (intervalsOverlap(
      existing.effective_from ?? document.created_at.slice(0, 10),
      existing.effective_to,
      candidate.effective_from!,
      candidate.effective_to,
    )) {
      throw errors.reference(`Active BOM ${document.name} overlaps the effective interval for ${candidate.item}`);
    }
  }
}

async function assertNoCircularBom(
  context: ControllerContext<BillOfMaterialsData>,
  candidate: VersionedBomData,
): Promise<void> {
  const documents = await context.reader.listDocumentsByDoctype<VersionedBomData>(context.command.tenant_id, "Bill of Materials");
  const graph = new Map<string, Set<string>>();
  for (const document of documents) {
    if (document.docstatus !== 1 || document.name === context.command.aggregate.name || document.data.bom_status === "Retired") continue;
    graph.set(document.data.item, new Set(document.data.items.map((row) => row.item_code)));
  }
  graph.set(candidate.item, new Set(candidate.items.map((row) => row.item_code)));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (item: string): boolean => {
    if (visiting.has(item)) return true;
    if (visited.has(item)) return false;
    visiting.add(item);
    for (const child of graph.get(item) ?? []) if (graph.has(child) && visit(child)) return true;
    visiting.delete(item);
    visited.add(item);
    return false;
  };
  if (visit(candidate.item)) throw errors.reference(`BOM ${context.command.aggregate.name} creates a circular manufacturing dependency`);
}

async function selectEffectiveBom(
  context: ControllerContext<WorkOrderData>,
  input: SnapshotWorkOrderData,
  releaseAt: string,
): Promise<CanonicalDocument<VersionedBomData>> {
  const date = releaseAt.slice(0, 10);
  if (input.bom_no) {
    const document = await context.reader.getDocument<VersionedBomData>(context.command.tenant_id, "Bill of Materials", input.bom_no);
    if (!document || document.docstatus !== 1) throw errors.reference(`Bill of Materials ${input.bom_no} must be submitted`);
    assertBomEffective(document, input, date);
    return document;
  }
  const documents = await context.reader.listDocumentsByDoctype<VersionedBomData>(context.command.tenant_id, "Bill of Materials");
  const matches = documents.filter((document) => document.docstatus === 1
    && document.data.company === input.company
    && document.data.item === input.production_item
    && isBomEffective(document.data, date));
  matches.sort((a, b) => (b.data.revision ?? 1) - (a.data.revision ?? 1) || b.modified_at.localeCompare(a.modified_at));
  if (matches.length === 0) throw errors.reference(`No Active BOM is effective for ${input.production_item} at ${date}`);
  if (matches.length > 1) throw errors.reference(`More than one Active BOM is effective for ${input.production_item} at ${date}`);
  return matches[0]!;
}

function assertBomEffective(document: CanonicalDocument<VersionedBomData>, input: SnapshotWorkOrderData, date: string): void {
  if (document.data.company !== input.company || document.data.item !== input.production_item) {
    throw errors.reference("Work Order does not match BOM");
  }
  if (!isBomEffective(document.data, date)) throw errors.reference(`BOM ${document.name} is not Active at ${date}`);
}

function isBomEffective(bom: VersionedBomData, date: string): boolean {
  if ((bom.bom_status ?? "Active") !== "Active") return false;
  const from = bom.effective_from ?? "0000-01-01";
  return from <= date && (!bom.effective_to || bom.effective_to >= date);
}

async function requireSubmittedSnapshot(
  context: ControllerContext<StockEntryData>,
  workOrderName: string,
): Promise<CanonicalDocument<SnapshotWorkOrderData & { manufacturing_snapshot: WorkOrderSnapshot }>> {
  const document = await context.reader.getDocument<SnapshotWorkOrderData>(context.command.tenant_id, "Work Order", workOrderName);
  if (!document || document.docstatus !== 1) throw errors.reference(`Work Order ${workOrderName} must be submitted`);
  if (!document.data.manufacturing_snapshot || !document.data.bom_checksum) {
    throw errors.reference(`Work Order ${workOrderName} does not contain an immutable BOM snapshot`);
  }
  return document as CanonicalDocument<SnapshotWorkOrderData & { manufacturing_snapshot: WorkOrderSnapshot }>;
}

function sumPriorProgress(
  documents: Array<CanonicalDocument<LifecycleStockData>>,
  workOrder: string,
  bomRowId: string,
  bucket: "Issue" | "Consumption",
  excludeName: string,
): number {
  let total = 0;
  for (const document of documents) {
    if (document.name === excludeName || document.docstatus !== 1 || document.data.work_order !== workOrder) continue;
    for (const row of document.data.items ?? []) {
      if (row.bom_row_id !== bomRowId || kindBucket(row.manufacturing_kind ?? (document.data.purpose === "Material Transfer" ? "Issue" : "Consumption")) !== bucket) continue;
      total += row.qty_micros ?? toScaledInt(row.qty, 6, "prior manufacturing quantity");
    }
  }
  return total;
}

function resolveManufacturingKind(purpose: StockEntryData["purpose"], value: unknown): ManufacturingRowKind {
  const fallback: ManufacturingRowKind = purpose === "Material Transfer" ? "Issue" : "Consumption";
  const kind = (text(value) || fallback) as ManufacturingRowKind;
  if (!ROW_KINDS.has(kind)) throw errors.validation(`Unsupported manufacturing_kind ${kind}`);
  if (purpose === "Material Transfer" && kind !== "Issue") throw errors.validation("Material Transfer progress must use manufacturing_kind Issue");
  if (purpose === "Manufacture" && kind === "Issue") throw errors.validation("Manufacture progress cannot use manufacturing_kind Issue");
  return kind;
}

function kindBucket(kind: ManufacturingRowKind): "Issue" | "Consumption" {
  return kind === "Issue" ? "Issue" : "Consumption";
}

function quantityBasisMicros(
  basis: BomQuantityBasis,
  widthMicros: number | undefined,
  heightMicros: number | undefined,
  leafCountMicros: number | undefined,
  index: number,
): number {
  if (basis === "Cố định") return 1_000_000;
  if (basis === "Theo chiều rộng") return requiredDimension(widthMicros, "width_m", index);
  if (basis === "Theo chiều cao") return requiredDimension(heightMicros, "height_m", index);
  if (basis === "Theo số lá") return requiredDimension(leafCountMicros, "leaf_count", index);
  const width = requiredDimension(widthMicros, "width_m", index);
  const height = requiredDimension(heightMicros, "height_m", index);
  return multiplyMicros(width, height);
}

function requiredDimension(value: number | undefined, field: string, index: number): number {
  if (value === undefined) throw errors.validation(`Work Order requires ${field} for BOM row ${index + 1}`);
  return value;
}

function assertManufacturingItem(master: JsonObject | null, itemCode: string, output: boolean): void {
  if (!master) return;
  if (text(master.item_nature) === "Dịch vụ") throw errors.reference(`Service Item ${itemCode} cannot be used in a BOM`);
  if (Object.prototype.hasOwnProperty.call(master, "is_stock_item") && !checked(master.is_stock_item)) {
    throw errors.reference(`Item ${itemCode} must manage stock for manufacturing`);
  }
  if (output && Object.prototype.hasOwnProperty.call(master, "include_item_in_manufacturing") && !checked(master.include_item_in_manufacturing)) {
    throw errors.reference(`Finished Item ${itemCode} is not enabled for manufacturing`);
  }
}

function resolveBomStatus(action: string, value: unknown): BomLifecycleStatus {
  const fallback: BomLifecycleStatus = action === "submit" ? "Active" : "Draft";
  const status = (text(value) || fallback) as BomLifecycleStatus;
  if (!BOM_STATUSES.has(status)) throw errors.validation(`Unsupported BOM status ${status}`);
  return status;
}

function conversionMicros(value: unknown, uom: string, stockUom: string, field: string): number {
  if (uom === stockUom && (value === undefined || value === null || value === "")) return 1_000_000;
  const micros = toScaledInt(value as string | number, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function multiplyMicros(left: number, right: number): number {
  return safeNumber(divideRounded(BigInt(left) * BigInt(right), 1_000_000n));
}

function multiplyRatioAndBasis(base: number, numerator: number, denominator: number, basisMicros: number): number {
  if (denominator <= 0) throw errors.validation("BOM output quantity must be positive");
  return safeNumber(divideRounded(BigInt(base) * BigInt(numerator) * BigInt(basisMicros), BigInt(denominator) * 1_000_000n));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  return (numerator + denominator / 2n) / denominator;
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing quantity exceeds safe integer range");
  return number;
}

function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw errors.validation(`${field} must be a positive integer`);
  return number;
}

function optionalPositiveMicros(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const micros = toScaledInt(value as string | number, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function validDate(value: string, field: string): string {
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) {
    throw errors.validation(`${field} must be an ISO date`);
  }
  return normalized;
}

function validTimestamp(value: string, field: string): string {
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  if (Number.isNaN(Date.parse(timestamp))) throw errors.validation(`${field} must be an ISO date or timestamp`);
  return new Date(timestamp).toISOString();
}

function intervalsOverlap(fromA: string, toA: string | undefined, fromB: string, toB: string | undefined): boolean {
  const endA = toA ?? "9999-12-31";
  const endB = toB ?? "9999-12-31";
  return fromA <= endB && fromB <= endA;
}

function bomChecksumPayload(bom: VersionedBomData): JsonObject {
  return {
    schema_version: 1,
    company: bom.company,
    item: bom.item,
    revision: bom.revision ?? 1,
    bom_status: bom.bom_status ?? "Draft",
    effective_from: bom.effective_from ?? "",
    effective_to: bom.effective_to ?? "",
    output_uom: bom.output_uom ?? "",
    output_stock_uom: bom.output_stock_uom ?? "",
    output_conversion_factor_micros: bom.output_conversion_factor_micros ?? 1_000_000,
    output_stock_qty_micros: bom.output_stock_qty_micros ?? bom.quantity_micros ?? 0,
    items: [...bom.items]
      .sort((a, b) => a.row_id.localeCompare(b.row_id))
      .map((row) => ({
        row_id: row.row_id,
        item_code: row.item_code,
        qty_micros: row.qty_micros ?? 0,
        uom: row.uom ?? "",
        stock_uom: row.stock_uom ?? "",
        conversion_factor_micros: row.conversion_factor_micros ?? 1_000_000,
        stock_qty_micros: row.stock_qty_micros ?? row.qty_micros ?? 0,
        qty_basis: row.qty_basis ?? "Cố định",
        source_warehouse: row.source_warehouse ?? "",
      })),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  const normalized = text(value).toLocaleLowerCase("vi");
  return normalized === "có" || normalized === "co" || normalized === "yes" || normalized === "true";
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
