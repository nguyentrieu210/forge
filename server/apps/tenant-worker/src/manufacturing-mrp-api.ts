import type { Actor, CanonicalDocument, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson, sha256Hex } from "../../../packages/core/src/index.js";
import {
  explodeProductionPlanMrp,
  materialRequestDraftsFromMrp,
  netMrpAgainstOnHand,
  type MrpExplosionResult,
  type ProductionPlanData,
  type VersionedBomData,
} from "../../../packages/clouderp-erpnext/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const PREVIEW_PATH = "/api/method/metaforge.manufacturing.preview_production_plan_mrp";
const CREATE_PATH = "/api/method/metaforge.manufacturing.create_mrp_material_request";
const MAX_BODY_BYTES = 64_000;
const PRODUCTION_PLAN = "Production Plan";
const BOM = "Bill of Materials";
const MATERIAL_REQUEST = "Material Request";
const REQUEST_TYPES = new Set(["Purchase", "Manufacture"]);

export interface ManufacturingMrpApiContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  permissions: Pick<MetadataPermissionService, "assert" | "canReadDocument">;
  loadProductionPlan(name: string): Promise<CanonicalDocument<ProductionPlanData> | null>;
  listBomDocuments(): Promise<Array<CanonicalDocument<VersionedBomData>>>;
  listMaterialRequests(): Promise<Array<CanonicalDocument<JsonObject>>>;
  getStockBalanceMicros(itemCode: string, warehouse: string): Promise<number>;
  createCanonicalMaterialRequest(document: JsonObject): Promise<Response>;
}

export function isManufacturingMrpApiPath(pathname: string): boolean {
  return pathname === PREVIEW_PATH || pathname === CREATE_PATH;
}

export function isManufacturingMrpFrappePath(pathname: string): boolean {
  return isManufacturingMrpApiPath(pathname);
}

export async function routeManufacturingMrpApi(
  request: Request,
  url: URL,
  context: ManufacturingMrpApiContext,
): Promise<Response | null> {
  if (!isManufacturingMrpApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "MRP methods require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const body = unwrapArgs(raw);
  rejectTenantSelector(body);
  const productionPlanName = requiredText(body.production_plan, "production_plan");
  const planningDate = optionalText(body.planning_date);
  const plan = await context.loadProductionPlan(productionPlanName);
  if (!plan || !await context.permissions.canReadDocument(
    context.actor,
    context.tenantId,
    plan as unknown as CanonicalDocument<JsonObject>,
  )) {
    throw errors.permission(`Production Plan ${productionPlanName} is not readable`);
  }
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: BOM, action: "read" });

  const boms = await context.listBomDocuments();
  const result = explodeProductionPlanMrp(productionPlanName, plan.data, boms, planningDate);
  await assertUsedBomsReadable(result, boms, context);

  if (url.pathname === PREVIEW_PATH) {
    const useOnHand = body.net_on_hand === true || body.net_on_hand === 1 || body.net_on_hand === "1";
    const onHandNetting = useOnHand
      ? await netMrpAgainstOnHand(result, context.getStockBalanceMicros)
      : undefined;
    return jsonResponse(
      { message: onHandNetting ? { ...result, on_hand_netting: onHandNetting } : result },
      200,
      { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  if (plan.docstatus !== 1) {
    throw errors.lifecycle("Production Plan must be submitted before creating MRP Material Requests");
  }
  const requestType = requiredText(body.material_request_type, "material_request_type");
  if (!REQUEST_TYPES.has(requestType)) throw errors.validation("material_request_type must be Purchase or Manufacture");
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: MATERIAL_REQUEST, action: "create" });
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: MATERIAL_REQUEST, action: "read" });

  // Conversion deliberately stays GROSS until WS04 exposes a reservation/open-supply
  // projected-availability contract. The optional on-hand preview above is not ATP and
  // therefore must never silently reduce a purchasing or manufacturing commitment.
  const drafts = materialRequestDraftsFromMrp(result, context.actor.user_id);
  const draft = drafts.find((candidate) => candidate.material_request_type === requestType);
  if (!draft) {
    return jsonResponse(
      { message: { schema_version: 1, production_plan: productionPlanName, material_request_type: requestType, created: false, replayed: false, reason: "NO_REQUIREMENTS" } },
      200,
      { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const fingerprint = await mrpRequestFingerprint(result, requestType);
  draft.mrp_fingerprint = fingerprint;
  const prior = (await context.listMaterialRequests()).filter((document) =>
    document.data.mrp_source_doctype === PRODUCTION_PLAN
    && document.data.mrp_source_name === productionPlanName
    && document.data.material_request_type === requestType
    && document.docstatus !== 2,
  );
  const readablePrior: Array<CanonicalDocument<JsonObject>> = [];
  for (const document of prior) {
    if (await context.permissions.canReadDocument(context.actor, context.tenantId, document)) readablePrior.push(document);
  }
  if (prior.length !== readablePrior.length) {
    throw errors.permission("An existing MRP Material Request is outside the current read scope");
  }
  if (readablePrior.length > 1) {
    throw errors.exists(`Multiple active MRP ${requestType} requests already exist for ${productionPlanName}`);
  }
  if (readablePrior.length === 1) {
    const existing = readablePrior[0]!;
    if (existing.data.mrp_fingerprint === fingerprint) {
      return jsonResponse(
        { message: requestResult(existing.name, requestType, fingerprint, true, false, existing.docstatus) },
        200,
        { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
      );
    }
    throw errors.exists(`MRP ${requestType} request already exists for ${productionPlanName} with a different planning fingerprint`);
  }

  const createdResponse = await context.createCanonicalMaterialRequest(draft);
  if (!createdResponse.ok) return createdResponse;
  const payload = await responseJson(createdResponse);
  const created = isObject(payload.data) ? payload.data : payload;
  const name = requiredText(created.name, "created Material Request name");
  const docstatus = safeInteger(created.docstatus);
  const bookmark = createdResponse.headers.get("x-d1-bookmark");
  return jsonResponse(
    { message: requestResult(name, requestType, fingerprint, false, true, docstatus) },
    200,
    {
      "cache-control": "private, no-store",
      "x-cloudforge-trace-id": context.traceId,
      ...(bookmark ? { "x-d1-bookmark": bookmark } : {}),
    },
  );
}

async function assertUsedBomsReadable(
  result: MrpExplosionResult,
  allBoms: Array<CanonicalDocument<VersionedBomData>>,
  context: ManufacturingMrpApiContext,
): Promise<void> {
  const used = new Set<string>();
  for (const output of result.planned_outputs) used.add(output.bom_no);
  for (const requirement of [...result.purchase_requirements, ...result.manufacture_requirements]) {
    for (const source of requirement.sources) used.add(String(source.bom_no));
  }
  const byName = new Map(allBoms.map((document) => [document.name, document]));
  for (const name of used) {
    const document = byName.get(name);
    if (!document) throw errors.reference(`MRP used BOM ${name} that is no longer available`);
    if (!await context.permissions.canReadDocument(
      context.actor,
      context.tenantId,
      document as unknown as CanonicalDocument<JsonObject>,
    )) throw errors.permission("MRP requires a BOM outside the current read scope");
  }
}

async function mrpRequestFingerprint(result: MrpExplosionResult, type: string): Promise<string> {
  const rows = (type === "Purchase" ? result.purchase_requirements : result.manufacture_requirements).map((row) => ({
    item_code: row.item_code,
    warehouse: row.warehouse ?? "",
    schedule_date: row.schedule_date ?? "",
    gross_qty_micros: row.gross_qty_micros,
  }));
  return sha256Hex(JSON.stringify({
    schema_version: 1,
    company: result.company,
    production_plan: result.production_plan,
    planning_date: result.planning_date,
    material_request_type: type,
    netting_mode: result.netting_mode,
    rows,
  }));
}

function requestResult(name: string, type: string, fingerprint: string, replayed: boolean, created: boolean, docstatus: number): JsonObject {
  return { schema_version: 1, doctype: MATERIAL_REQUEST, name, material_request_type: type, fingerprint, replayed, created, docstatus, draft: docstatus === 0 };
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("MRP args must be an object");
  return parsed;
}
function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) throw errors.validation("MRP tenant scope is controlled by the authenticated server context");
}
function parseJson(value: string, field: string): unknown { try { return JSON.parse(value) as unknown; } catch { throw errors.validation(`${field} must contain valid JSON`); } }
async function responseJson(response: Response): Promise<JsonObject> {
  try { const payload = await response.json() as unknown; if (isObject(payload)) return payload; } catch { /* stable error below */ }
  throw errors.database("Canonical Material Request create returned an invalid response");
}
function requiredText(value: unknown, field: string): string { const normalized = optionalText(value); if (!normalized) throw errors.validation(`${field} is required`); return normalized; }
function optionalText(value: unknown): string | undefined { if (typeof value !== "string" && typeof value !== "number") return undefined; const normalized = String(value).trim(); return normalized || undefined; }
function safeInteger(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }
function isObject(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
