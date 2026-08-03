import type { Actor, CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import {
  buildManufacturingCapacityPlan,
  explodeProductionPlanMrp,
  type ManufacturingDowntimeData,
  type ManufacturingRoutingData,
  type ProductionPlanData,
  type VersionedBomData,
  type WorkstationCapacityCalendarData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const CAPACITY_PATH = "/api/method/metaforge.manufacturing.preview_capacity_plan";
const MAX_BODY_BYTES = 32_000;

export interface ManufacturingCapacityApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  permissions: Pick<MetadataPermissionService, "assert" | "canReadDocument">;
  loadProductionPlan(name: string): Promise<CanonicalDocument<ProductionPlanData> | null>;
  listBomDocuments(): Promise<Array<CanonicalDocument<VersionedBomData>>>;
  listRoutings(): Promise<Array<CanonicalDocument<ManufacturingRoutingData>>>;
  listCalendars(): Promise<Array<CanonicalDocument<WorkstationCapacityCalendarData>>>;
  listDowntimes(): Promise<Array<CanonicalDocument<ManufacturingDowntimeData>>>;
}

export function isManufacturingCapacityApiPath(pathname: string): boolean {
  return pathname === CAPACITY_PATH;
}

export function isManufacturingCapacityFrappePath(pathname: string): boolean {
  return isManufacturingCapacityApiPath(pathname);
}

export async function routeManufacturingCapacityApi(
  request: Request,
  url: URL,
  context: ManufacturingCapacityApiContext,
): Promise<Response | null> {
  if (!isManufacturingCapacityApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Capacity planning requires POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }
  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);
  const productionPlanName = requiredText(body.production_plan, "production_plan");
  const throughDate = requiredText(body.through_date, "through_date");
  const planningDate = optionalText(body.planning_date);
  const plan = await context.loadProductionPlan(productionPlanName);
  if (!plan || !await readable(context, plan)) throw errors.permission(`Production Plan ${productionPlanName} is not readable`);

  for (const doctype of ["Bill of Materials", "Manufacturing Routing", "Workstation Capacity Calendar", "Manufacturing Downtime"]) {
    await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype, action: "read" });
  }

  const allBoms = await context.listBomDocuments();
  const mrp = explodeProductionPlanMrp(productionPlanName, plan.data, allBoms, planningDate);
  const usedBomNames = new Set<string>();
  for (const output of mrp.planned_outputs) usedBomNames.add(output.bom_no);
  for (const requirement of [...mrp.purchase_requirements, ...mrp.manufacture_requirements]) {
    for (const source of requirement.sources) usedBomNames.add(source.bom_no);
  }
  for (const bom of allBoms.filter((doc) => usedBomNames.has(doc.name))) {
    if (!await readable(context, bom)) throw errors.permission("Capacity planning requires a BOM outside the current read scope");
  }

  const demandItems = new Set([
    ...mrp.planned_outputs.map((row) => row.item_code),
    ...mrp.manufacture_requirements.map((row) => row.item_code),
  ]);
  const allRoutings = await context.listRoutings();
  const relevantRoutings = allRoutings.filter((doc) => doc.data.company === mrp.company && demandItems.has(doc.data.item_code));
  for (const routing of relevantRoutings) {
    if (!await readable(context, routing)) throw errors.permission("A relevant Manufacturing Routing is outside the current read scope");
  }
  const workstations = new Set(relevantRoutings.flatMap((doc) => doc.data.operations.map((row) => row.workstation)));

  const allCalendars = await context.listCalendars();
  const relevantCalendars = allCalendars.filter((doc) => doc.data.company === mrp.company && workstations.has(doc.data.workstation));
  for (const calendar of relevantCalendars) {
    if (!await readable(context, calendar)) throw errors.permission("A relevant capacity calendar is outside the current read scope");
  }

  const allDowntimes = await context.listDowntimes();
  const relevantDowntimes = allDowntimes.filter((doc) => doc.data.company === mrp.company && workstations.has(doc.data.workstation));
  for (const downtime of relevantDowntimes) {
    if (!await readable(context, downtime)) throw errors.permission("Relevant workstation downtime is outside the current read scope");
  }

  return jsonResponse(
    { message: buildManufacturingCapacityPlan({
      mrp,
      through_date: throughDate,
      routings: relevantRoutings,
      calendars: relevantCalendars,
      downtimes: relevantDowntimes,
    }) },
    200,
    { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-cloudforge-trace-id": context.traceId },
  );
}

async function readable<T extends JsonObject>(context: ManufacturingCapacityApiContext, document: CanonicalDocument<T>): Promise<boolean> {
  return context.permissions.canReadDocument(context.actor, context.tenantId, document as unknown as CanonicalDocument<JsonObject>);
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("Capacity planning args must be an object");
  return parsed;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Capacity planning tenant scope is controlled by the authenticated server context");
  }
}

function requiredText(value: unknown, field: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw errors.validation(`${field} is required`);
  return normalized;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function parseJson(value: string, field: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw errors.validation(`${field} must contain valid JSON`); }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
