import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { WorkOrderData } from "./types.js";

interface ProgressStockRow extends StockEntryItem {
  bom_row_id?: string;
  manufacturing_kind?: "Issue" | "Consumption" | "Scrap" | "Offcut";
}

interface ProgressStockData extends StockEntryData {
  items: ProgressStockRow[];
}

export interface DimensionSafeMaterialProgressRow extends JsonObject {
  bom_row_id: string;
  item_code: string;
  source_warehouse: string;
  required_qty: string;
  required_qty_micros: number;
  issued_qty: string;
  issued_qty_micros: number;
  consumed_qty: string;
  consumed_qty_micros: number;
  remaining_to_issue: string;
  remaining_to_issue_micros: number;
  remaining_to_consume: string;
  remaining_to_consume_micros: number;
}

/**
 * Row-scoped manufacturing progress. Never aggregate quantities across BOM rows because
 * those rows may represent different Items/UOMs (kg, m, bộ, ...).
 */
export function buildDimensionSafeMaterialProgress(
  workOrder: CanonicalDocument<WorkOrderData>,
  stockEntries: Array<CanonicalDocument<ProgressStockData>>,
): DimensionSafeMaterialProgressRow[] {
  if (workOrder.docstatus !== 1) throw errors.reference(`Submitted Work Order ${workOrder.name} is required`);
  const requiredItems = workOrder.data.required_items ?? [];
  if (!requiredItems.length) return [];

  const progress = new Map<string, { issued: number; consumed: number }>();
  for (const document of stockEntries) {
    if (document.docstatus !== 1 || document.data.work_order !== workOrder.name) continue;
    if (!["Material Transfer", "Manufacture"].includes(document.data.purpose)) continue;
    for (const [index, row] of (document.data.items ?? []).entries()) {
      const rowId = text(row.bom_row_id);
      if (!rowId) continue;
      const qty = quantity(row.qty_micros, row.qty, `${document.name}.items[${index}].qty`);
      const current = progress.get(rowId) ?? { issued: 0, consumed: 0 };
      if (document.data.purpose === "Material Transfer" && (row.manufacturing_kind ?? "Issue") === "Issue") {
        current.issued = safeAdd(current.issued, qty, `${rowId}.issued`);
      }
      if (document.data.purpose === "Manufacture" && (row.manufacturing_kind ?? "Consumption") === "Consumption") {
        current.consumed = safeAdd(current.consumed, qty, `${rowId}.consumed`);
      }
      progress.set(rowId, current);
    }
  }

  return requiredItems.map((required, index) => {
    const rowId = text(required.row_id);
    if (!rowId) throw errors.reference(`Work Order ${workOrder.name} required item ${index + 1} has no stable row_id`);
    const requiredQty = quantity(required.required_qty_micros, required.required_qty, `required_items[${index}].required_qty`);
    const current = progress.get(rowId) ?? { issued: 0, consumed: 0 };
    const remainingIssue = Math.max(0, requiredQty - current.issued);
    const remainingConsume = Math.max(0, requiredQty - current.consumed);
    return {
      bom_row_id: rowId,
      item_code: required.item_code,
      source_warehouse: required.source_warehouse,
      required_qty: fromScaledInt(requiredQty, 6),
      required_qty_micros: requiredQty,
      issued_qty: fromScaledInt(current.issued, 6),
      issued_qty_micros: current.issued,
      consumed_qty: fromScaledInt(current.consumed, 6),
      consumed_qty_micros: current.consumed,
      remaining_to_issue: fromScaledInt(remainingIssue, 6),
      remaining_to_issue_micros: remainingIssue,
      remaining_to_consume: fromScaledInt(remainingConsume, 6),
      remaining_to_consume_micros: remainingConsume,
    };
  });
}

function quantity(micros: unknown, decimal: unknown, field: string): number {
  if (typeof micros === "number" && Number.isSafeInteger(micros) && micros > 0) return micros;
  if (typeof decimal !== "string" && typeof decimal !== "number") throw errors.validation(`${field} is required`);
  const result = toScaledInt(decimal, 6, field);
  if (result <= 0) throw errors.validation(`${field} must be positive`);
  return result;
}
function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
