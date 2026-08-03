import type { CanonicalDocument, JsonObject, StockLedgerEntry } from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { WorkOrderData } from "./types.js";

const MAX_GENEALOGY_ENTRIES = 2_000;
const MAX_GENEALOGY_MOVEMENTS = 10_000;

export type GenealogyMovementRole =
  | "Material Transfer Out"
  | "WIP Transfer In"
  | "Consumption"
  | "Finished Good"
  | "Scrap"
  | "Offcut"
  | "Recovery";

export interface ManufacturingGenealogyMovement extends JsonObject {
  stock_entry: string;
  stock_entry_version: number;
  purpose: StockEntryData["purpose"];
  posting_at: string;
  role: GenealogyMovementRole;
  direction: "Outward" | "Inward";
  item_code: string;
  warehouse: string;
  qty: string;
  qty_micros: number;
  stock_value_difference_minor: number;
  valuation_rate_minor: number;
  batch_no?: string;
  serial_no?: string;
  bom_row_id?: string;
  manufacturing_kind?: string;
  physical_identity_key?: string;
  serial_and_batch_bundle?: string;
}

export interface ManufacturingLotIdentity extends JsonObject {
  item_code: string;
  warehouse: string;
  batch_no?: string;
  serial_no?: string;
  qty: string;
  qty_micros: number;
  source_entries: string[];
}

export interface WorkOrderGenealogy extends JsonObject {
  schema_version: 1;
  work_order: string;
  company: string;
  production_item: string;
  bom_no: string;
  bom_checksum?: string;
  target_qty: string;
  target_qty_micros: number;
  effective_stock_entry_count: number;
  cancelled_stock_entries: string[];
  material_transfers: ManufacturingGenealogyMovement[];
  consumptions: ManufacturingGenealogyMovement[];
  finished_goods: ManufacturingGenealogyMovement[];
  recoveries: ManufacturingGenealogyMovement[];
  input_lots: ManufacturingLotIdentity[];
  output_lots: ManufacturingLotIdentity[];
  trace_scope: "WORK_ORDER_GROUP";
  warnings: string[];
}

export interface GenealogyStockEntrySnapshot {
  document: CanonicalDocument<StockEntryData>;
  stock_entries: StockLedgerEntry[];
}

/**
 * Builds a read-only genealogy projection from the canonical Work Order, submitted
 * Stock Entry documents and their append-only stock ledger rows.
 *
 * The relationship is intentionally WORK_ORDER_GROUP scope: every consumed tracked
 * lot belongs to the same production execution group as every finished/recovered lot.
 * We do not invent one-to-one lot causality where the shop-floor transaction did not
 * record it. Fiction is a poor audit feature, despite its popularity in spreadsheets.
 */
export function buildWorkOrderGenealogy(
  workOrderName: string,
  workOrder: CanonicalDocument<WorkOrderData>,
  entries: GenealogyStockEntrySnapshot[],
  cancelledStockEntries: string[] = [],
): WorkOrderGenealogy {
  if (workOrder.doctype !== "Work Order" || workOrder.name !== workOrderName) {
    throw errors.reference("Work Order genealogy source does not match the requested document");
  }
  if (entries.length > MAX_GENEALOGY_ENTRIES) {
    throw errors.validation(`Work Order genealogy supports at most ${MAX_GENEALOGY_ENTRIES} effective Stock Entries`);
  }

  const data = workOrder.data;
  const company = requiredText(data.company, "Work Order company");
  const productionItem = requiredText(data.production_item, "Work Order production_item");
  const bomNo = requiredText(data.bom_no, "Work Order bom_no");
  const targetQtyMicros = positiveScaledOrDecimal(data.qty_micros, data.qty, "Work Order quantity");
  const all: ManufacturingGenealogyMovement[] = [];
  const warnings = new Set<string>();

  for (const snapshot of entries) {
    const document = snapshot.document;
    if (document.doctype !== "Stock Entry" || document.docstatus !== 1 || document.data.work_order !== workOrderName) {
      throw errors.reference(`Stock Entry ${document.name} is not an effective entry for Work Order ${workOrderName}`);
    }
    if (document.data.company !== company) {
      throw errors.reference(`Stock Entry ${document.name} belongs to another company`);
    }
    for (const ledger of snapshot.stock_entries) {
      if (ledger.actual_qty_micros === 0) continue;
      if (all.length >= MAX_GENEALOGY_MOVEMENTS) {
        throw errors.validation(`Work Order genealogy supports at most ${MAX_GENEALOGY_MOVEMENTS} stock movements`);
      }
      const row = matchDocumentRow(document.data, ledger);
      if (!row && document.data.purpose === "Manufacture" && ledger.item_code !== document.data.finished_good_item) {
        warnings.add(`UNMATCHED_STOCK_ROW:${document.name}:${ledger.line_key}`);
      }
      all.push(toMovement(document, ledger, row));
    }
  }

  const materialTransfers = all.filter((row) => row.role === "Material Transfer Out" || row.role === "WIP Transfer In");
  const consumptions = all.filter((row) => row.role === "Consumption");
  const finishedGoods = all.filter((row) => row.role === "Finished Good");
  const recoveries = all.filter((row) => row.role === "Scrap" || row.role === "Offcut" || row.role === "Recovery");
  if (finishedGoods.length === 0 && entries.some((entry) => entry.document.data.purpose === "Manufacture")) {
    warnings.add("NO_FINISHED_GOOD_LEDGER_ROWS");
  }

  const inputLots = aggregateTrackedLots(consumptions.filter(hasTrackedIdentity));
  const outputLots = aggregateTrackedLots([...finishedGoods, ...recoveries].filter(hasTrackedIdentity));
  if (consumptions.length > 0 && inputLots.length === 0) warnings.add("UNTRACKED_INPUT_MATERIALS_PRESENT");
  if (finishedGoods.length > 0 && outputLots.length === 0) warnings.add("UNTRACKED_FINISHED_GOODS_PRESENT");

  return {
    schema_version: 1,
    work_order: workOrderName,
    company,
    production_item: productionItem,
    bom_no: bomNo,
    ...(typeof data.bom_checksum === "string" && data.bom_checksum ? { bom_checksum: data.bom_checksum } : {}),
    target_qty: fromScaledInt(targetQtyMicros, 6),
    target_qty_micros: targetQtyMicros,
    effective_stock_entry_count: entries.length,
    cancelled_stock_entries: [...new Set(cancelledStockEntries)].sort(),
    material_transfers: sortMovements(materialTransfers),
    consumptions: sortMovements(consumptions),
    finished_goods: sortMovements(finishedGoods),
    recoveries: sortMovements(recoveries),
    input_lots: inputLots,
    output_lots: outputLots,
    trace_scope: "WORK_ORDER_GROUP",
    warnings: [...warnings].sort(),
  };
}

function toMovement(
  document: CanonicalDocument<StockEntryData>,
  ledger: StockLedgerEntry,
  row: StockEntryItem | undefined,
): ManufacturingGenealogyMovement {
  const direction = ledger.actual_qty_micros < 0 ? "Outward" : "Inward";
  const qtyMicros = Math.abs(ledger.actual_qty_micros);
  return {
    stock_entry: document.name,
    stock_entry_version: document.version,
    purpose: document.data.purpose,
    posting_at: ledger.posting_at,
    role: movementRole(document.data, ledger, row),
    direction,
    item_code: ledger.item_code,
    warehouse: ledger.warehouse,
    qty: fromScaledInt(qtyMicros, 6),
    qty_micros: qtyMicros,
    stock_value_difference_minor: ledger.stock_value_difference_minor,
    valuation_rate_minor: ledger.valuation_rate_minor,
    ...(ledger.batch_no ? { batch_no: ledger.batch_no } : {}),
    ...(ledger.serial_no ? { serial_no: ledger.serial_no } : {}),
    ...(text(row?.bom_row_id) ? { bom_row_id: text(row?.bom_row_id) } : {}),
    ...(text(row?.manufacturing_kind) ? { manufacturing_kind: text(row?.manufacturing_kind) } : {}),
    ...(text(row?.physical_identity_key) ? { physical_identity_key: text(row?.physical_identity_key) } : {}),
    ...(text(row?.serial_and_batch_bundle) ? { serial_and_batch_bundle: text(row?.serial_and_batch_bundle) } : {}),
  };
}

function movementRole(
  data: StockEntryData,
  ledger: StockLedgerEntry,
  row: StockEntryItem | undefined,
): GenealogyMovementRole {
  const outward = ledger.actual_qty_micros < 0;
  if (data.purpose === "Material Transfer") return outward ? "Material Transfer Out" : "WIP Transfer In";
  if (data.purpose !== "Manufacture") return outward ? "Consumption" : "Recovery";
  const kind = text(row?.manufacturing_kind);
  if (kind === "Scrap") return "Scrap";
  if (kind === "Offcut") return "Offcut";
  if (!outward && ledger.item_code === data.finished_good_item) return "Finished Good";
  return outward ? "Consumption" : "Recovery";
}

function matchDocumentRow(data: StockEntryData, ledger: StockLedgerEntry): StockEntryItem | undefined {
  if (!Array.isArray(data.items)) return undefined;
  const candidates = data.items.filter((row) => {
    if (row.item_code !== ledger.item_code) return false;
    if (ledger.actual_qty_micros < 0) return row.source_warehouse === ledger.warehouse;
    return row.target_warehouse === ledger.warehouse;
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

function aggregateTrackedLots(movements: ManufacturingGenealogyMovement[]): ManufacturingLotIdentity[] {
  const map = new Map<string, { item_code: string; warehouse: string; batch_no?: string; serial_no?: string; qty_micros: number; source_entries: Set<string> }>();
  for (const movement of movements) {
    const key = [movement.item_code, movement.warehouse, movement.batch_no ?? "", movement.serial_no ?? ""].join("\u0000");
    const current = map.get(key) ?? {
      item_code: movement.item_code,
      warehouse: movement.warehouse,
      ...(movement.batch_no ? { batch_no: movement.batch_no } : {}),
      ...(movement.serial_no ? { serial_no: movement.serial_no } : {}),
      qty_micros: 0,
      source_entries: new Set<string>(),
    };
    current.qty_micros = safeAdd(current.qty_micros, movement.qty_micros);
    current.source_entries.add(movement.stock_entry);
    map.set(key, current);
  }
  return [...map.values()]
    .map((row) => ({
      item_code: row.item_code,
      warehouse: row.warehouse,
      ...(row.batch_no ? { batch_no: row.batch_no } : {}),
      ...(row.serial_no ? { serial_no: row.serial_no } : {}),
      qty: fromScaledInt(row.qty_micros, 6),
      qty_micros: row.qty_micros,
      source_entries: [...row.source_entries].sort(),
    }))
    .sort((a, b) => a.item_code.localeCompare(b.item_code)
      || a.warehouse.localeCompare(b.warehouse)
      || (a.batch_no ?? "").localeCompare(b.batch_no ?? "")
      || (a.serial_no ?? "").localeCompare(b.serial_no ?? ""));
}

function sortMovements(rows: ManufacturingGenealogyMovement[]): ManufacturingGenealogyMovement[] {
  return [...rows].sort((a, b) => a.posting_at.localeCompare(b.posting_at)
    || a.stock_entry.localeCompare(b.stock_entry)
    || a.item_code.localeCompare(b.item_code)
    || a.warehouse.localeCompare(b.warehouse));
}

function hasTrackedIdentity(row: ManufacturingGenealogyMovement): boolean {
  return Boolean(row.batch_no || row.serial_no);
}

function positiveScaledOrDecimal(micros: unknown, decimal: unknown, field: string): number {
  if (typeof micros === "number") {
    if (!Number.isSafeInteger(micros) || micros <= 0) throw errors.validation(`${field}_micros must be a positive safe integer`);
    return micros;
  }
  if (typeof decimal === "string" || typeof decimal === "number") {
    const scaled = toScaledInt(decimal, 6, field);
    if (scaled <= 0) throw errors.validation(`${field} must be positive`);
    return scaled;
  }
  throw errors.validation(`${field} is required`);
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Genealogy quantity exceeds safe integer range");
  return value;
}

function requiredText(value: unknown, field: string): string {
  const normalized = text(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
