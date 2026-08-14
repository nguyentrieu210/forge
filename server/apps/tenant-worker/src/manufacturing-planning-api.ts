import type { Actor, CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import type { SalesOrderData } from "../../../packages/clouderp-selling/src/types.js";
import {
  buildOpenSalesProductionDemand,
  type ProductionPlanData,
  type VersionedBomData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const OPEN_DEMAND_PATH = "/api/method/metaforge.manufacturing.get_open_sales_production_demand";
const MAX_BODY_BYTES = 16_000;
const MAX_RELEVANT_DOCUMENTS = 1_000;

export interface ManufacturingPlanningApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  permissions: Pick<MetadataPermissionService, "canReadDocument">;
  listSalesOrders(): Promise<Array<CanonicalDocument<SalesOrderData>>>;
  listProductionPlans(): Promise<Array<CanonicalDocument<ProductionPlanData>>>;
  listBoms(): Promise<Array<CanonicalDocument<VersionedBomData>>>;
}

export function isManufacturingPlanningApiPath(pathname: string): boolean {
  return pathname === OPEN_DEMAND_PATH;
}

export function isManufacturingPlanningFrappePath(pathname: string): boolean {
  return isManufacturingPlanningApiPath(pathname);
}

export async function routeManufacturingPlanningApi(
  request: Request,
  url: URL,
  context: ManufacturingPlanningApiContext,
): Promise<Response | null> {
  if (!isManufacturingPlanningApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Manufacturing planning reads require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);
  const company = requiredText(body.company, "company");
  const planningDate = dateText(body.planning_date, "planning_date");

  const [salesOrders, productionPlans, boms] = await Promise.all([
    context.listSalesOrders(), context.listProductionPlans(), context.listBoms(),
  ]);
  const relevantSales = salesOrders.filter((document) => document.docstatus === 1
    && document.data.company === company && !["Closed", "Cancelled"].includes(document.status));
  const relevantPlans = productionPlans.filter((document) => document.docstatus === 1 && document.data.company === company);
  const relevantBoms = boms.filter((document) => document.docstatus === 1 && document.data.company === company);

  const evidenceCount = relevantSales.length + relevantPlans.length + relevantBoms.length;
  if (evidenceCount > MAX_RELEVANT_DOCUMENTS) {
    throw errors.lifecycle(`Manufacturing planning evidence exceeds bounded read (${MAX_RELEVANT_DOCUMENTS})`);
  }
  await assertAllReadable(context, relevantSales, "Sales Order");
  await assertAllReadable(context, relevantPlans, "Production Plan");
  await assertAllReadable(context, relevantBoms, "Bill of Materials");

  const result = buildOpenSalesProductionDemand({
    company,
    planning_date: planningDate,
    sales_orders: relevantSales,
    production_plans: relevantPlans,
    boms: relevantBoms,
  });
  return jsonResponse(
    { message: result },
    200,
    { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-cloudforge-trace-id": context.traceId },
  );
}

async function assertAllReadable<T extends JsonObject>(context: ManufacturingPlanningApiContext, documents: Array<CanonicalDocument<T>>, label: string): Promise<void> {
  for (const document of documents) {
    if (!await context.permissions.canReadDocument(context.actor, context.tenantId, document as unknown as CanonicalDocument<JsonObject>)) {
      throw errors.permission(`${label} planning evidence is outside the current read scope`);
    }
  }
}
function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("Manufacturing planning args must be an object");
  return parsed;
}
function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) throw errors.validation("Manufacturing tenant scope is controlled by the authenticated server context");
}
function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const result = String(value).normalize("NFC").trim();
  if (!result) throw errors.validation(`${field} is required`);
  return result;
}
function dateText(value: unknown, field: string): string {
  const result = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00.000Z`))) throw errors.validation(`${field} must be an ISO date`);
  return result;
}
function parseJson(value: string, field: string): unknown { try { return JSON.parse(value); } catch { throw errors.validation(`${field} must contain valid JSON`); } }
function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
