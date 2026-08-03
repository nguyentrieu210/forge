import type { Actor, CanonicalDocument, JsonObject, StockLedgerEntry } from "../../../packages/contracts/src/index.js";
import type { StockEntryData } from "../../../packages/clouderp-core/src/types.js";
import {
  buildWorkOrderGenealogy,
  type GenealogyStockEntrySnapshot,
  type WorkOrderData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const GENEALOGY_PATH = "/api/method/metaforge.manufacturing.get_work_order_genealogy";
const MAX_BODY_BYTES = 16_000;

export interface ManufacturingGenealogyApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  permissions: Pick<MetadataPermissionService, "canReadDocument">;
  loadWorkOrder(name: string): Promise<CanonicalDocument<WorkOrderData> | null>;
  listStockEntries(): Promise<Array<CanonicalDocument<StockEntryData>>>;
  getVoucherStockEntries(voucherNo: string, voucherRevision: number): Promise<StockLedgerEntry[]>;
}

export function isManufacturingGenealogyApiPath(pathname: string): boolean {
  return pathname === GENEALOGY_PATH;
}

export function isManufacturingGenealogyFrappePath(pathname: string): boolean {
  return isManufacturingGenealogyApiPath(pathname);
}

/**
 * Permission-aware Work Order genealogy query.
 *
 * A report that silently drops one unreadable Stock Entry would be materially false,
 * so this route fails closed if any related entry is outside the actor's read scope.
 */
export async function routeManufacturingGenealogyApi(
  request: Request,
  url: URL,
  context: ManufacturingGenealogyApiContext,
): Promise<Response | null> {
  if (!isManufacturingGenealogyApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Manufacturing genealogy requires POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);
  const workOrderName = requiredText(body.work_order, "work_order");
  const workOrder = await context.loadWorkOrder(workOrderName);
  if (!workOrder || !await context.permissions.canReadDocument(
    context.actor,
    context.tenantId,
    workOrder as unknown as CanonicalDocument<JsonObject>,
  )) {
    throw errors.permission(`Work Order ${workOrderName} is not readable`);
  }

  const related = (await context.listStockEntries()).filter((document) => document.data.work_order === workOrderName);
  const effective: GenealogyStockEntrySnapshot[] = [];
  const cancelled: string[] = [];
  for (const document of related) {
    if (!await context.permissions.canReadDocument(
      context.actor,
      context.tenantId,
      document as unknown as CanonicalDocument<JsonObject>,
    )) {
      // No document name in the error: existence itself can be sensitive.
      throw errors.permission("Manufacturing genealogy contains a Stock Entry outside the current read scope");
    }
    if (document.docstatus === 2) {
      cancelled.push(document.name);
      continue;
    }
    if (document.docstatus !== 1) continue;
    effective.push({
      document,
      stock_entries: await context.getVoucherStockEntries(document.name, document.version),
    });
  }

  return jsonResponse(
    { message: buildWorkOrderGenealogy(workOrderName, workOrder, effective, cancelled) },
    200,
    {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-cloudforge-trace-id": context.traceId,
    },
  );
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("Manufacturing genealogy args must be an object");
  return parsed;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Manufacturing genealogy tenant scope is controlled by the authenticated server context");
  }
}

function parseJson(value: string, field: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw errors.validation(`${field} must contain valid JSON`); }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const normalized = String(value).trim();
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
