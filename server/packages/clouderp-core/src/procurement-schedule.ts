import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { PurchaseOrderData } from "./types.js";

export interface PurchaseDeliveryScheduleLine {
  row_id: string;
  item_code: string;
  schedule_date: string | null;
  source: "line" | "header" | "unscheduled";
}

/**
 * Resolves delivery schedule without requiring a specific child metadata implementation.
 * A line-level `schedule_date` overrides the PO header. Both are accepted only when they are
 * real ISO dates on/after the order date. The effective schedule is returned for reports/UI.
 */
export function resolvePurchaseDeliverySchedule(order: PurchaseOrderData): PurchaseDeliveryScheduleLine[] {
  const transactionDate = isoDate(order.transaction_date, "transaction_date");
  const headerDate = optionalDate(order.schedule_date, "schedule_date");
  if (headerDate && headerDate < transactionDate) {
    throw errors.validation("Purchase Order schedule_date cannot be before transaction_date");
  }
  return order.items.map((item, index) => {
    const raw = item as JsonObject;
    const lineDate = optionalDate(raw.schedule_date, `items[${index}].schedule_date`);
    if (lineDate && lineDate < transactionDate) {
      throw errors.validation(`Purchase Order row ${index + 1} schedule date cannot be before transaction_date`);
    }
    const effective = lineDate ?? headerDate;
    return {
      row_id: item.row_id || `ROW-${index + 1}`,
      item_code: item.item_code,
      schedule_date: effective,
      source: lineDate ? "line" : headerDate ? "header" : "unscheduled",
    };
  });
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw errors.validation(`${field} must be a valid ISO date`);
  return isoDate(value, field);
}

function isoDate(value: string, field: string): string {
  const text = typeof value === "string" ? value.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be a valid ISO date`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw errors.validation(`${field} must be a valid ISO date`);
  }
  return text;
}
