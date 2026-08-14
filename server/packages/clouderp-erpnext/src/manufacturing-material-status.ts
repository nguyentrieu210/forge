import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import type { StockEntryData, StockEntryItem } from "../../clouderp-core/src/types.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { WorkOrderData, WorkOrderRequiredItem } from "./types.js";

export interface ManufacturingStockRow extends StockEntryItem {
  bom_row_id?: string;
  manufacturing_kind?: "Issue" | "Consumption" | "Scrap" | "Offcut";
}

export interface ManufacturingStockData extends StockEntryData {
  items: ManufacturingStockRow[];
}

interface LinkedWorkOrderData extends WorkOrderData {
  production_plan?: string;
  production_plan_row_id?: string;
  sales_order?: string;
  sales_order_row_id?: string;
}

export interface WorkOrderMaterialProgressRow extends JsonObject {
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

export interface WorkOrderMaterialProgressSummary extends JsonObject {
  work_order: string;
  required_qty_micros: number;
  issued_qty_micros: number;
  consumed_qty_micros: number;
  rows: WorkOrderMaterialProgressRow[];
}

export interface WorkOrderMaterialStatusRow extends WorkOrderMaterialProgressRow {
  on_hand_qty: string;
  on_hand_qty_micros: number;
  available_to_issue: string;
  available_to_issue_micros: number;
  availability_status: "AVAILABLE" | "SHORTAGE";
}

export interface WorkOrderMaterialStatusResult extends JsonObject {
  schema_version: 1;
  evidence_scope: "CANONICAL_WORK_ORDER_AND_SUBMITTED_STOCK_ENTRIES";
  work_order: string;
  production_item: string;
  production_plan?: string;
  production_plan_row_id?: string;
  sales_order?: string;
  sales_order_row_id?: string;
  rows: WorkOrderMaterialStatusRow[];
}

/**
 * Canonical row-level material progress shared by lifecycle and operator read models.
 *
 * Material Transfer contributes Issue progress. Manufacture contributes Consumption only
 * for rows explicitly/defaulted as Consumption. Scrap and Offcut are recovery outputs and
 * must never inflate consumed raw material.
 */
export function summarizeWorkOrderMaterialProgress(
  workOrder: CanonicalDocument<LinkedWorkOrderData>,
  stockEntries: Array<CanonicalDocument<ManufacturingStockData>>,
): WorkOrderMaterialProgressSummary {
  if (workOrder.docstatus !== 1) throw errors.reference(`Submitted Work Order ${workOrder.name} is required`);
  if (!Array.isArray(workOrder.data.required_items) || workOrder.data.required_items.length === 0) {
    throw errors.reference(`Work Order ${workOrder.name} has no required material snapshot`);
  }

  const progress = progressByBomRow(workOrder.name, stockEntries);
  const rows: WorkOrderMaterialProgressRow[] = [];
  let requiredTotal = 0;
  let issuedTotal = 0;
  let consumedTotal = 0;

  for (const [index, required] of workOrder.data.required_items.entries()) {
    const rowId = text(required.row_id);
    if (!rowId) throw errors.reference(`Work Order ${workOrder.name} required item ${index + 1} has no stable row_id`);
    const requiredQty = requiredQuantity(required, index);
    const current = progress.get(rowId) ?? { issued: 0, consumed: 0 };
    const remainingIssue = Math.max(0, requiredQty - current.issued);
    const remainingConsume = Math.max(0, requiredQty - current.consumed);
    requiredTotal = safeAdd(requiredTotal, requiredQty, "required material quantity");
    issuedTotal = safeAdd(issuedTotal, current.issued, "issued material quantity");
    consumedTotal = safeAdd(consumedTotal, current.consumed, "consumed material quantity");

    rows.push({
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
    });
  }

  return {
    work_order: workOrder.name,
    required_qty_micros: requiredTotal,
    issued_qty_micros: issuedTotal,
    consumed_qty_micros: consumedTotal,
    rows,
  };
}

/**
 * Read-only material execution status for the Work Order / material issue screens.
 *
 * It derives issue/consumption progress from submitted Stock Entry documents and current
 * on-hand from the canonical stock balance callback. No WIP/material quantity is persisted
 * here, so the Stock Ledger/manufacturing progress path remains the only authority.
 */
export async function buildWorkOrderMaterialStatus(input: {
  work_order: CanonicalDocument<LinkedWorkOrderData>;
  stock_entries: Array<CanonicalDocument<ManufacturingStockData>>;
  get_stock_balance_micros: (itemCode: string, warehouse: string) => Promise<number>;
}): Promise<WorkOrderMaterialStatusResult> {
  const workOrder = input.work_order;
  const progress = summarizeWorkOrderMaterialProgress(workOrder, input.stock_entries);
  const rows: WorkOrderMaterialStatusRow[] = [];

  for (const row of progress.rows) {
    const onHandRaw = await input.get_stock_balance_micros(row.item_code, row.source_warehouse);
    if (!Number.isSafeInteger(onHandRaw)) throw errors.validation(`Stock balance for ${row.item_code} must be a safe integer`);
    const available = Math.max(0, onHandRaw);
    const canIssue = Math.min(available, row.remaining_to_issue_micros);
    rows.push({
      ...row,
      on_hand_qty: fromScaledInt(onHandRaw, 6),
      on_hand_qty_micros: onHandRaw,
      available_to_issue: fromScaledInt(canIssue, 6),
      available_to_issue_micros: canIssue,
      availability_status: available >= row.remaining_to_issue_micros ? "AVAILABLE" : "SHORTAGE",
    });
  }

  return {
    schema_version: 1,
    evidence_scope: "CANONICAL_WORK_ORDER_AND_SUBMITTED_STOCK_ENTRIES",
    work_order: workOrder.name,
    production_item: workOrder.data.production_item,
    ...(text(workOrder.data.production_plan) ? { production_plan: text(workOrder.data.production_plan) } : {}),
    ...(text(workOrder.data.production_plan_row_id) ? { production_plan_row_id: text(workOrder.data.production_plan_row_id) } : {}),
    ...(text(workOrder.data.sales_order) ? { sales_order: text(workOrder.data.sales_order) } : {}),
    ...(text(workOrder.data.sales_order_row_id) ? { sales_order_row_id: text(workOrder.data.sales_order_row_id) } : {}),
    rows,
  };
}

function progressByBomRow(
  workOrder: string,
  documents: Array<CanonicalDocument<ManufacturingStockData>>,
): Map<string, { issued: number; consumed: number }> {
  const result = new Map<string, { issued: number; consumed: number }>();
  for (const document of documents) {
    if (document.docstatus !== 1 || text(document.data.work_order) !== workOrder) continue;
    if (!["Material Transfer", "Manufacture"].includes(document.data.purpose)) continue;
    for (const [index, row] of (document.data.items ?? []).entries()) {
      const rowId = text(row.bom_row_id);
      if (!rowId) continue;
      const qty = stockRowQuantity(row, document.name, index);
      const current = result.get(rowId) ?? { issued: 0, consumed: 0 };
      if (document.data.purpose === "Material Transfer") {
        if ((row.manufacturing_kind ?? "Issue") === "Issue") {
          current.issued = safeAdd(current.issued, qty, `issued quantity for ${rowId}`);
        }
      } else if ((row.manufacturing_kind ?? "Consumption") === "Consumption") {
        current.consumed = safeAdd(current.consumed, qty, `consumed quantity for ${rowId}`);
      }
      result.set(rowId, current);
    }
  }
  return result;
}

function requiredQuantity(row: WorkOrderRequiredItem, index: number): number {
  const value = typeof row.required_qty_micros === "number"
    ? row.required_qty_micros
    : toScaledInt(row.required_qty, 6, `required_items[${index}].required_qty`);
  if (!Number.isSafeInteger(value) || value <= 0) throw errors.validation(`required_items[${index}].required_qty must be positive`);
  return value;
}

function stockRowQuantity(row: ManufacturingStockRow, document: string, index: number): number {
  const value = typeof row.qty_micros === "number"
    ? row.qty_micros
    : toScaledInt(row.qty, 6, `${document}.items[${index}].qty`);
  if (!Number.isSafeInteger(value) || value <= 0) throw errors.validation(`${document}.items[${index}].qty must be positive`);
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : "";
}
