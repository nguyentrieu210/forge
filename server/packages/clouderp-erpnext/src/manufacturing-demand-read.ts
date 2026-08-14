import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { SalesOrderData } from "../../clouderp-selling/src/types.js";
import type { VersionedBomData } from "./manufacturing-lifecycle.js";
import type { ProductionPlanData } from "./types.js";

export type ProductionDemandBomStatus = "READY" | "NO_ACTIVE_BOM" | "AMBIGUOUS_BOM";

export interface OpenSalesProductionDemandRow extends JsonObject {
  sales_order: string;
  sales_order_row_id: string;
  sales_order_document_version: number;
  transaction_date: string;
  item_code: string;
  uom: string;
  ordered_qty: string;
  ordered_qty_micros: number;
  planned_qty: string;
  planned_qty_micros: number;
  remaining_to_plan: string;
  remaining_to_plan_micros: number;
  candidate_boms: string[];
  bom_status: ProductionDemandBomStatus;
  sales_option_code?: string;
  sales_option_version?: number;
  sales_package?: string;
  sales_package_version?: number;
  sales_package_checksum?: string;
}

export interface OpenSalesProductionDemandResult extends JsonObject {
  schema_version: 1;
  company: string;
  planning_date: string;
  demand_scope: "SALES_ORDER_GROSS_REMAINING_TO_PLAN_NOT_ATP";
  rows: OpenSalesProductionDemandRow[];
  warnings: string[];
}

/**
 * Exact-row gross production demand for the Production Plan operator screen.
 *
 * This deliberately does not net stock, reservations or open supply. It answers only
 * "how much of this submitted Sales Order row has not yet been represented by a submitted
 * Production Plan?" and exposes active BOM candidates without silently choosing among
 * ambiguous alternatives.
 *
 * Sales Package SELECTABLE clusters are deliberately excluded until Selling exposes a
 * canonical physical-obligation projection. A commercial parent residual and its priced
 * child rows are not enough evidence to decide which physical item must be manufactured.
 */
export function buildOpenSalesProductionDemand(input: {
  company: string;
  planning_date: string;
  sales_orders: Array<CanonicalDocument<SalesOrderData>>;
  production_plans: Array<CanonicalDocument<ProductionPlanData>>;
  boms: Array<CanonicalDocument<VersionedBomData>>;
}): OpenSalesProductionDemandResult {
  const company = requiredText(input.company, "company");
  const planningDate = validDate(input.planning_date, "planning_date");
  const planned = plannedBySalesRow(company, input.production_plans);
  const bomIndex = activeBomIndex(company, planningDate, input.boms);
  const warnings = new Set<string>();
  const rows: OpenSalesProductionDemandRow[] = [];

  const orders = input.sales_orders
    .filter((document) => document.docstatus === 1
      && document.data.company === company
      && !["Closed", "Cancelled"].includes(document.status))
    .sort((left, right) => left.data.transaction_date.localeCompare(right.data.transaction_date)
      || left.name.localeCompare(right.name));

  for (const order of orders) {
    for (const [index, line] of order.data.items.entries()) {
      const rowId = text(line.row_id);
      if (!rowId) {
        warnings.add(`MISSING_SALES_ORDER_ROW_ID:${order.name}:${index + 1}`);
        continue;
      }

      const packageProvenance = line as unknown as JsonObject;
      const packageGroupKey = text(packageProvenance.sales_package_group_key);
      const packageParentKey = text(packageProvenance.sales_package_parent_key);
      if (packageGroupKey || packageParentKey) {
        const clusterKey = packageGroupKey || packageParentKey;
        warnings.add(`PHYSICAL_OBLIGATION_UNRESOLVED_SELECTABLE_PACKAGE:${order.name}:${rowId}:${clusterKey}`);
        continue;
      }

      const ordered = quantityMicros(line.qty_micros, line.qty, `${order.name}/${rowId}.qty`);
      const alreadyPlanned = planned.get(key(order.name, rowId)) ?? 0;
      if (alreadyPlanned > ordered) warnings.add(`OVERPLANNED:${order.name}:${rowId}`);
      const remaining = Math.max(0, ordered - alreadyPlanned);
      if (remaining === 0) continue;

      const candidates = bomIndex.get(line.item_code) ?? [];
      const bomStatus: ProductionDemandBomStatus = candidates.length === 0
        ? "NO_ACTIVE_BOM"
        : candidates.length === 1 ? "READY" : "AMBIGUOUS_BOM";
      if (bomStatus !== "READY") warnings.add(`${bomStatus}:${order.name}:${rowId}:${line.item_code}`);

      rows.push({
        sales_order: order.name,
        sales_order_row_id: rowId,
        sales_order_document_version: order.version,
        transaction_date: order.data.transaction_date,
        item_code: line.item_code,
        uom: text(line.uom),
        ordered_qty: fromScaledInt(ordered, 6),
        ordered_qty_micros: ordered,
        planned_qty: fromScaledInt(alreadyPlanned, 6),
        planned_qty_micros: alreadyPlanned,
        remaining_to_plan: fromScaledInt(remaining, 6),
        remaining_to_plan_micros: remaining,
        candidate_boms: candidates.map((document) => document.name),
        bom_status: bomStatus,
        ...(text(line.sales_option_code) ? { sales_option_code: text(line.sales_option_code) } : {}),
        ...(typeof line.sales_option_version === "number" ? { sales_option_version: line.sales_option_version } : {}),
        ...(text(line.sales_package) ? { sales_package: text(line.sales_package) } : {}),
        ...(typeof line.sales_package_version === "number" ? { sales_package_version: line.sales_package_version } : {}),
        ...(text(line.sales_package_checksum) ? { sales_package_checksum: text(line.sales_package_checksum) } : {}),
      });
    }
  }

  return {
    schema_version: 1,
    company,
    planning_date: planningDate,
    demand_scope: "SALES_ORDER_GROSS_REMAINING_TO_PLAN_NOT_ATP",
    rows,
    warnings: [...warnings].sort(),
  };
}

function plannedBySalesRow(company: string, documents: Array<CanonicalDocument<ProductionPlanData>>): Map<string, number> {
  const result = new Map<string, number>();
  for (const document of documents) {
    if (document.docstatus !== 1 || document.data.company !== company) continue;
    for (const row of document.data.items ?? []) {
      const salesOrder = text(row.sales_order);
      const salesOrderRowId = text(row.sales_order_row_id);
      if (!salesOrder || !salesOrderRowId) continue;
      const quantity = quantityMicros(row.planned_qty_micros, row.planned_qty, `${document.name}/${row.row_id}.planned_qty`);
      const demandKey = key(salesOrder, salesOrderRowId);
      result.set(demandKey, safeAdd(result.get(demandKey) ?? 0, quantity, "planned sales demand"));
    }
  }
  return result;
}

function activeBomIndex(company: string, planningDate: string, documents: Array<CanonicalDocument<VersionedBomData>>): Map<string, Array<CanonicalDocument<VersionedBomData>>> {
  const result = new Map<string, Array<CanonicalDocument<VersionedBomData>>>();
  for (const document of documents) {
    if (document.docstatus !== 1 || document.data.company !== company) continue;
    if ((document.data.bom_status ?? "Active") !== "Active") continue;
    const effectiveFrom = document.data.effective_from ?? "0000-01-01";
    if (effectiveFrom > planningDate || (document.data.effective_to && document.data.effective_to < planningDate)) continue;
    const list = result.get(document.data.item) ?? [];
    list.push(document);
    result.set(document.data.item, list);
  }
  for (const list of result.values()) {
    list.sort((left, right) => (right.data.revision ?? 1) - (left.data.revision ?? 1) || right.modified_at.localeCompare(left.modified_at));
  }
  return result;
}

function key(salesOrder: string, rowId: string): string { return `${salesOrder}\u0000${rowId}`; }
function quantityMicros(micros: unknown, decimal: unknown, field: string): number {
  if (typeof micros === "number" && Number.isSafeInteger(micros)) {
    if (micros < 0) throw errors.validation(`${field} cannot be negative`);
    return micros;
  }
  if (typeof decimal !== "string" && typeof decimal !== "number") throw errors.validation(`${field} is required`);
  const result = toScaledInt(decimal, 6, field);
  if (result < 0) throw errors.validation(`${field} cannot be negative`);
  return result;
}
function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}
function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}
function validDate(value: string, field: string): string {
  const result = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) throw errors.validation(`${field} must be an ISO date`);
  return result;
}
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
