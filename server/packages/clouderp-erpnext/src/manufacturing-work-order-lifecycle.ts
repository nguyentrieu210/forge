import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import {
  summarizeWorkOrderMaterialProgress,
  type ManufacturingStockData,
  type WorkOrderMaterialProgressRow,
} from "./manufacturing-material-status.js";
import type { WorkOrderData } from "./types.js";

export type ManufacturingReleaseAuthority = "PRODUCTION_REQUEST" | "PRODUCTION_PLAN" | "LEGACY_SALES_ORDER" | "STANDALONE";
export type WorkOrderLifecycleStage = "DRAFT" | "RELEASED" | "MATERIAL_ISSUED" | "MANUFACTURING" | "PARTIAL_FINISHED_GOODS" | "FINISHED_GOODS_COMPLETE" | "CANCELLED";

interface LifecycleWorkOrderData extends WorkOrderData {
  production_request?: string;
  production_request_line_key?: string;
  production_plan?: string;
  production_plan_row_id?: string;
  against_sales_order?: string;
  sales_order?: string;
  sales_order_row_id?: string;
}

export interface WorkOrderLifecycleProjection extends JsonObject {
  schema_version: 1;
  evidence_scope: "HYDRATED_WORK_ORDER_AND_CANONICAL_STOCK_EXECUTION";
  work_order: string;
  docstatus: 0 | 1 | 2;
  canonical_status: string;
  stage: WorkOrderLifecycleStage;
  release_authority: ManufacturingReleaseAuthority;
  production_item: string;
  target_qty: string;
  target_qty_micros: number;
  produced_qty: string;
  produced_qty_micros: number;
  remaining_qty: string;
  remaining_qty_micros: number;
  material_rows: WorkOrderMaterialProgressRow[];
  actions: JsonObject;
  warnings: string[];
}

/** Read-only operator projection. Canonical Work Order status stays owned by D1 hydration. */
export function buildWorkOrderLifecycleProjection(input: {
  work_order: CanonicalDocument<LifecycleWorkOrderData>;
  stock_entries: Array<CanonicalDocument<ManufacturingStockData>>;
}): WorkOrderLifecycleProjection {
  const workOrder = input.work_order;
  const target = positiveQty(workOrder.data.qty_micros, workOrder.data.qty, "Work Order qty");
  const produced = nonNegativeQty(workOrder.data.produced_qty_micros, workOrder.data.produced_qty);
  const remaining = Math.max(0, target - produced);
  const warnings: string[] = [];
  if (produced > target) warnings.push("PRODUCED_QTY_EXCEEDS_WORK_ORDER_TARGET");

  let materialRows: WorkOrderMaterialProgressRow[] = [];
  if (workOrder.docstatus === 1 && Array.isArray(workOrder.data.required_items) && workOrder.data.required_items.length > 0) {
    materialRows = summarizeWorkOrderMaterialProgress(workOrder, input.stock_entries).rows;
  } else if (workOrder.docstatus === 1) {
    warnings.push("LEGACY_WORK_ORDER_NO_REQUIRED_MATERIAL_SNAPSHOT");
  }

  const anyIssued = materialRows.some((row) => row.issued_qty_micros > 0);
  const anyConsumed = materialRows.some((row) => row.consumed_qty_micros > 0);
  const canonicalStatus = canonicalStatusFor(workOrder, produced, target);
  const releaseAuthority = resolveReleaseAuthority(workOrder.data, warnings);
  const submittedOpen = workOrder.docstatus === 1 && canonicalStatus !== "Completed";

  return {
    schema_version: 1,
    evidence_scope: "HYDRATED_WORK_ORDER_AND_CANONICAL_STOCK_EXECUTION",
    work_order: workOrder.name,
    docstatus: workOrder.docstatus,
    canonical_status: canonicalStatus,
    stage: lifecycleStage(workOrder.docstatus, canonicalStatus, produced, anyIssued, anyConsumed),
    release_authority: releaseAuthority,
    production_item: workOrder.data.production_item,
    target_qty: fromScaledInt(target, 6),
    target_qty_micros: target,
    produced_qty: fromScaledInt(produced, 6),
    produced_qty_micros: produced,
    remaining_qty: fromScaledInt(remaining, 6),
    remaining_qty_micros: remaining,
    material_rows: materialRows,
    actions: {
      can_issue_materials: submittedOpen && materialRows.some((row) => row.remaining_to_issue_micros > 0),
      can_manufacture: submittedOpen && remaining > 0,
      can_cancel_work_order: workOrder.docstatus === 1 && produced === 0 && !anyIssued && !anyConsumed,
    },
    warnings,
    ...lineage(workOrder.data),
  };
}

function resolveReleaseAuthority(data: LifecycleWorkOrderData, warnings: string[]): ManufacturingReleaseAuthority {
  const request = text(data.production_request) || text(data.production_request_line_key);
  const plan = text(data.production_plan) || text(data.production_plan_row_id);
  if (request && plan) warnings.push("MIXED_PRODUCTION_REQUEST_AND_PRODUCTION_PLAN_AUTHORITY");
  if (request) return "PRODUCTION_REQUEST";
  if (plan) return "PRODUCTION_PLAN";
  if (text(data.against_sales_order ?? data.sales_order)) return "LEGACY_SALES_ORDER";
  return "STANDALONE";
}

function lineage(data: LifecycleWorkOrderData): JsonObject {
  const result: JsonObject = {};
  for (const [key, value] of Object.entries({
    production_request: data.production_request,
    production_request_line_key: data.production_request_line_key,
    production_plan: data.production_plan,
    production_plan_row_id: data.production_plan_row_id,
    sales_order: data.sales_order ?? data.against_sales_order,
    sales_order_row_id: data.sales_order_row_id,
  })) if (text(value)) result[key] = text(value);
  return result;
}

function canonicalStatusFor(workOrder: CanonicalDocument<LifecycleWorkOrderData>, produced: number, target: number): string {
  if (workOrder.docstatus === 0) return "Draft";
  if (workOrder.docstatus === 2) return "Cancelled";
  if (["Not Started", "In Process", "Completed"].includes(workOrder.status)) return workOrder.status;
  return produced <= 0 ? "Not Started" : produced >= target ? "Completed" : "In Process";
}

function lifecycleStage(docstatus: 0 | 1 | 2, status: string, produced: number, issued: boolean, consumed: boolean): WorkOrderLifecycleStage {
  if (docstatus === 0) return "DRAFT";
  if (docstatus === 2) return "CANCELLED";
  if (status === "Completed") return "FINISHED_GOODS_COMPLETE";
  if (produced > 0) return "PARTIAL_FINISHED_GOODS";
  if (consumed) return "MANUFACTURING";
  if (issued) return "MATERIAL_ISSUED";
  return "RELEASED";
}

function positiveQty(micros: unknown, decimal: unknown, field: string): number {
  const value = nonNegativeQty(micros, decimal);
  if (value <= 0) throw errors.validation(`${field} must be positive`);
  return value;
}
function nonNegativeQty(micros: unknown, decimal: unknown): number {
  if (typeof micros === "number" && Number.isSafeInteger(micros) && micros >= 0) return micros;
  if (typeof decimal !== "string" && typeof decimal !== "number") return 0;
  const value = toScaledInt(decimal, 6);
  return Math.max(0, value);
}
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
