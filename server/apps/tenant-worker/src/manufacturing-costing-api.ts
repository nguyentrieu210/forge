import type { Actor, CanonicalDocument, JsonObject, StockLedgerEntry } from "../../../packages/contracts/src/index.js";
import type { StockEntryData } from "../../../packages/clouderp-core/src/types.js";
import {
  buildManufacturingCostEvidence,
  buildWorkOrderGenealogy,
  type VersionedBomData,
  type WorkOrderData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { buildWorkOrderLifecycleProjection } from "../../../packages/clouderp-erpnext/src/manufacturing-work-order-lifecycle.js";
import { buildDimensionSafeMaterialProgress } from "../../../packages/clouderp-erpnext/src/manufacturing-material-progress-row.js";
import type { ManufacturingStockData } from "../../../packages/clouderp-erpnext/src/manufacturing-material-status.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const COST_PATH = "/api/method/metaforge.manufacturing.get_work_order_cost_evidence";
const LIFECYCLE_PATH = "/api/method/metaforge.manufacturing.get_work_order_lifecycle";
const MAX_BODY_BYTES = 16_000;

export interface ManufacturingCostingApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  permissions: Pick<MetadataPermissionService, "canReadDocument">;
  loadWorkOrder(name: string): Promise<CanonicalDocument<WorkOrderData> | null>;
  loadBom(name: string): Promise<CanonicalDocument<VersionedBomData> | null>;
  listStockEntries(): Promise<Array<CanonicalDocument<StockEntryData>>>;
  getVoucherStockEntries(voucherNo: string, voucherRevision: number): Promise<StockLedgerEntry[]>;
}

export function isManufacturingCostingApiPath(pathname: string): boolean {
  return pathname === COST_PATH || pathname === LIFECYCLE_PATH;
}

export function isManufacturingCostingFrappePath(pathname: string): boolean {
  return isManufacturingCostingApiPath(pathname);
}

export async function routeManufacturingCostingApi(
  request: Request,
  url: URL,
  context: ManufacturingCostingApiContext,
): Promise<Response | null> {
  if (!isManufacturingCostingApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Manufacturing Work Order reads require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }
  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);
  const name = requiredText(body.work_order, "work_order");
  const workOrder = await context.loadWorkOrder(name);
  if (!workOrder || !await readable(context, workOrder)) throw errors.permission(`Work Order ${name} is not readable`);

  const related = (await context.listStockEntries()).filter((doc) => doc.data.work_order === name);
  const effectiveDocuments: Array<CanonicalDocument<StockEntryData>> = [];
  const cancelled: string[] = [];
  for (const document of related) {
    if (!await readable(context, document)) {
      throw errors.permission("Manufacturing evidence contains a Stock Entry outside the current read scope");
    }
    if (document.docstatus === 2) { cancelled.push(document.name); continue; }
    if (document.docstatus === 1) effectiveDocuments.push(document);
  }

  if (url.pathname === LIFECYCLE_PATH) {
    const lifecycle = buildWorkOrderLifecycleProjection({
      work_order: workOrder,
      stock_entries: effectiveDocuments as Array<CanonicalDocument<ManufacturingStockData>>,
    });
    const executionDocuments = effectiveDocuments.filter((document) =>
      ["Material Transfer", "Manufacture"].includes(document.data.purpose));
    const materialRows = workOrder.docstatus === 1 && (workOrder.data.required_items?.length ?? 0) > 0
      ? buildDimensionSafeMaterialProgress(workOrder, executionDocuments as never)
      : [];
    const remaining = Number(lifecycle.remaining_qty_micros ?? 0);
    const submittedOpen = workOrder.docstatus === 1 && lifecycle.canonical_status !== "Completed";
    return jsonResponse(
      {
        message: {
          ...lifecycle,
          material_rows: materialRows,
          actions: {
            can_issue_materials: submittedOpen && materialRows.some((row) => row.remaining_to_issue_micros > 0),
            can_manufacture: submittedOpen && remaining > 0,
            can_cancel_work_order: workOrder.docstatus === 1
              && Number(lifecycle.produced_qty_micros ?? 0) === 0
              && executionDocuments.length === 0,
          },
        },
      },
      200,
      { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const bomName = requiredText(workOrder.data.bom_no, "Work Order bom_no");
  const bom = await context.loadBom(bomName);
  if (!bom || !await readable(context, bom)) throw errors.permission("Work Order BOM is outside the current read scope");
  const effectiveWithLedger = [];
  for (const document of effectiveDocuments) {
    effectiveWithLedger.push({ document, stock_entries: await context.getVoucherStockEntries(document.name, document.version) });
  }
  const genealogy = buildWorkOrderGenealogy(name, workOrder, effectiveWithLedger, cancelled);
  const evidence = buildManufacturingCostEvidence(workOrder, bom, genealogy);
  return jsonResponse(
    { message: { ...evidence, genealogy_warnings: genealogy.warnings } },
    200,
    { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-cloudforge-trace-id": context.traceId },
  );
}

async function readable<T extends JsonObject>(context: ManufacturingCostingApiContext, document: CanonicalDocument<T>): Promise<boolean> {
  return context.permissions.canReadDocument(context.actor, context.tenantId, document as unknown as CanonicalDocument<JsonObject>);
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("Manufacturing Work Order args must be an object");
  return parsed;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Manufacturing tenant scope is controlled by the authenticated server context");
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const normalized = String(value).trim();
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}
function parseJson(value: string, field: string): unknown { try { return JSON.parse(value); } catch { throw errors.validation(`${field} must contain valid JSON`); } }
function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
