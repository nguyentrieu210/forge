import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import type { PurchaseOrderData } from "../../clouderp-core/src/index.js";
import type { DomainReader } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import type { MrpProjectedAvailabilityInput } from "./manufacturing-mrp-netting.js";
import type { WorkOrderData } from "./types.js";

type ProjectedReader = Pick<
  DomainReader,
  | "getStockBalanceMicros"
  | "listDocumentsByDoctype"
  | "getProcuredQuantityMicros"
  | "getManufacturedQuantityMicros"
  | "getMasterRecordData"
>;

export interface ProjectedMrpAvailabilityResolverContext {
  tenantId: string;
  company: string;
  now: string;
  reader: ProjectedReader;
}

/**
 * Builds one cached resolver for a Production Plan request.
 *
 * The resolver does not create a second stock state. It reads:
 * - current quantity from the canonical Stock Ledger;
 * - remaining submitted Purchase Orders through the requirement date;
 * - remaining submitted Work Orders through the requirement date;
 * - active exact-warehouse Stock Reservations;
 * - explicit Item reorder safety stock for the warehouse.
 *
 * Ambiguous warehouse-less reservations fail closed because counting them nowhere could
 * overstate availability in every warehouse.
 */
export function createProjectedMrpAvailabilityResolver(
  context: ProjectedMrpAvailabilityResolverContext,
): (itemCode: string, warehouse: string, throughDate: string) => Promise<MrpProjectedAvailabilityInput> {
  const purchaseOrders = context.reader.listDocumentsByDoctype<PurchaseOrderData>(context.tenantId, "Purchase Order");
  const workOrders = context.reader.listDocumentsByDoctype<WorkOrderData>(context.tenantId, "Work Order");
  const reservations = context.reader.listDocumentsByDoctype<JsonObject>(context.tenantId, "Stock Reservation");
  const itemCache = new Map<string, Promise<JsonObject | null>>();

  return async (itemCode: string, warehouse: string, throughDate: string): Promise<MrpProjectedAvailabilityInput> => {
    const warnings = new Set<string>();
    let complete = true;

    const onHand = integer(await context.reader.getStockBalanceMicros(context.tenantId, itemCode, warehouse), "stock balance");
    let openPurchase = 0;
    for (const order of await purchaseOrders) {
      if (order.docstatus !== 1 || text(order.data.company) !== context.company) continue;
      const headerDate = dateOnly(order.data.schedule_date) || dateOnly(order.data.transaction_date);
      for (const [index, raw] of (Array.isArray(order.data.items) ? order.data.items : []).entries()) {
        const row = raw as JsonObject;
        if (text(row.item_code) !== itemCode || text(row.warehouse) !== warehouse) continue;
        const due = dateOnly(row.schedule_date) || headerDate;
        if (!due) {
          warnings.add(`UNDATED_OPEN_PURCHASE:${order.name}:${index + 1}`);
          continue;
        }
        if (due > throughDate) continue;
        const rowId = text(row.row_id);
        if (!rowId) {
          warnings.add(`UNIDENTIFIED_PURCHASE_ROW:${order.name}:${index + 1}`);
          continue;
        }
        const ordered = quantityMicros(row, `Purchase Order ${order.name} row ${rowId}`);
        const received = integer(
          await context.reader.getProcuredQuantityMicros(
            context.tenantId,
            order.name,
            "Receipt",
            itemCode,
            rowId,
          ),
          "received Purchase Order quantity",
        );
        openPurchase = add(openPurchase, Math.max(0, ordered - Math.max(0, received)), "open purchase quantity");
      }
    }

    let openManufacture = 0;
    for (const workOrder of await workOrders) {
      if (workOrder.docstatus !== 1
        || text(workOrder.data.company) !== context.company
        || text(workOrder.data.production_item) !== itemCode
        || text(workOrder.data.target_warehouse) !== warehouse) continue;
      const due = dateOnly(workOrder.data.planned_end_date);
      if (!due) {
        warnings.add(`UNDATED_OPEN_WORK_ORDER:${workOrder.name}`);
        continue;
      }
      if (due > throughDate) continue;
      const planned = quantityMicros(workOrder.data, `Work Order ${workOrder.name}`);
      const produced = integer(
        await context.reader.getManufacturedQuantityMicros(
          context.tenantId,
          workOrder.name,
          "Manufacture",
          itemCode,
        ),
        "manufactured Work Order quantity",
      );
      openManufacture = add(openManufacture, Math.max(0, planned - Math.max(0, produced)), "open manufacture quantity");
    }

    let reserved = 0;
    for (const reservation of await reservations) {
      const data = reservation.data;
      if (text(data.item_code) !== itemCode || reservation.docstatus === 2) continue;
      if ((text(data.state) || "Đang giữ") !== "Đang giữ") continue;
      const expires = text(data.expires_at);
      if (expires && expires <= context.now) continue;
      const reservationWarehouse = text(data.warehouse);
      if (!reservationWarehouse) {
        complete = false;
        warnings.add(`UNSCOPED_RESERVATION:${reservation.name}`);
        continue;
      }
      if (reservationWarehouse !== warehouse) continue;
      reserved = add(
        reserved,
        decimalMicros(data.qty_reserved, `Stock Reservation ${reservation.name} qty_reserved`),
        "reserved quantity",
      );
    }

    let itemPromise = itemCache.get(itemCode);
    if (!itemPromise) {
      itemPromise = context.reader.getMasterRecordData(context.tenantId, "Item", itemCode);
      itemCache.set(itemCode, itemPromise);
    }
    const item = await itemPromise;
    let safety = 0;
    if (item) {
      const rules = Array.isArray(item.reorder_levels)
        ? item.reorder_levels.filter((raw): raw is JsonObject => isObject(raw) && text(raw.warehouse) === warehouse)
        : [];
      if (rules.length > 1) {
        complete = false;
        warnings.add(`DUPLICATE_SAFETY_STOCK_RULE:${itemCode}:${warehouse}`);
      } else if (rules.length === 1 && rules[0]!.safety_stock !== undefined && text(rules[0]!.safety_stock) !== "") {
        safety = decimalMicros(rules[0]!.safety_stock, `Item ${itemCode} safety_stock`);
      } else if (item.safety_stock !== undefined && text(item.safety_stock) !== "") {
        safety = decimalMicros(item.safety_stock, `Item ${itemCode} safety_stock`);
      }
    }

    return {
      on_hand_qty_micros: onHand,
      open_purchase_qty_micros: openPurchase,
      open_manufacture_qty_micros: openManufacture,
      reserved_qty_micros: reserved,
      safety_stock_qty_micros: safety,
      complete,
      warnings: [...warnings].sort(),
    };
  };
}

function quantityMicros(data: JsonObject, field: string): number {
  for (const value of [data.stock_qty_micros, data.qty_micros]) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  }
  if (data.stock_qty !== undefined && text(data.stock_qty) !== "") return decimalMicros(data.stock_qty, `${field} stock_qty`);
  return decimalMicros(data.qty, `${field} qty`);
}

function decimalMicros(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} is required`);
  const parsed = toScaledInt(value, 6, field);
  if (parsed < 0) throw new Error(`${field} cannot be negative`);
  return parsed;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${field} must be a safe integer`);
  return value;
}

function add(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new Error(`${field} exceeds safe integer bounds`);
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function dateOnly(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match?.[1] ?? "";
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
