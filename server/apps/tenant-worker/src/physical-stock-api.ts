import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { asCloudForgeError, errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  D1PhysicalStockLedgerReader,
  PhysicalStockReportService,
  type PhysicalStockAccessPolicy,
  type PhysicalStockAccessScope,
  type PhysicalStockCsvExport,
  type PhysicalStockReportPage,
  type PhysicalStockReportRequest,
} from "../../../packages/clouderp-erpnext/src/index.js";
import type {
  DocumentPermissionRequest,
  MetadataPermissionService,
  ReadAccessScope,
} from "../../../packages/frappe-model/src/index.js";

const REPORT_PATH = "/api/v1/reports/physical-stock";
const EXPORT_PATH = "/api/v1/reports/physical-stock/export";
const FRAPPE_REPORT_PATH = "/api/method/metaforge.inventory.physical_stock";
const FRAPPE_EXPORT_PATH = "/api/method/metaforge.inventory.physical_stock_export";
const STOCK_PERMISSION_DOCTYPE = "Stock Entry";
const MAX_BODY_BYTES = 32_000;

const TEXT_FIELDS = [
  "company",
  "item_code",
  "warehouse",
  "warehouse_role",
  "inventory_mode",
  "measurement_profile",
  "color",
  "condition",
  "generation",
  "batch_no",
  "serial_no",
  "cursor",
] as const;

const INTEGER_FIELDS = [
  "length_micros",
  "width_micros",
  "height_micros",
  "thickness_micros",
  "limit",
] as const;

const BOOLEAN_FIELDS = ["include_zero", "include_lineage"] as const;
const ALLOWED_FIELDS = new Set<string>([...TEXT_FIELDS, ...INTEGER_FIELDS, ...BOOLEAN_FIELDS]);

export interface PhysicalStockPermissionGateway {
  getReadScope(actor: Actor, tenantId: string, doctype: string): Promise<ReadAccessScope>;
  assert(request: DocumentPermissionRequest): Promise<void>;
}

export interface PhysicalStockApiService {
  run(actor: Actor, tenantId: string, request: PhysicalStockReportRequest): Promise<PhysicalStockReportPage>;
  exportCsv(
    actor: Actor,
    tenantId: string,
    request: Omit<PhysicalStockReportRequest, "cursor" | "limit" | "include_lineage">,
  ): Promise<PhysicalStockCsvExport>;
}

export interface PhysicalStockApiContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  permissions: Pick<MetadataPermissionService, "getReadScope" | "assert">;
  traceId: string;
}

export interface PhysicalStockApiDependencies {
  service?: PhysicalStockApiService;
}

interface PhysicalStockRouteKind {
  export: boolean;
  frappe: boolean;
}

export function isPhysicalStockApiPath(pathname: string): boolean {
  return classifyRoute(pathname) !== null;
}

export function isPhysicalStockFrappePath(pathname: string): boolean {
  return pathname === FRAPPE_REPORT_PATH || pathname === FRAPPE_EXPORT_PATH;
}

/**
 * Authenticated endpoint seam for Slice D.
 *
 * Tenant scope is supplied only by the already-authenticated Worker context. Request
 * bodies containing a tenant selector are rejected instead of silently ignored, so a
 * client cannot believe it selected another tenant while the server did something else.
 * Native routes return the platform envelope directly; Frappe methods wrap JSON results
 * in `message` while CSV remains a binary download.
 */
export async function routePhysicalStockApi(
  request: Request,
  url: URL,
  context: PhysicalStockApiContext,
  dependencies: PhysicalStockApiDependencies = {},
): Promise<Response | null> {
  const route = classifyRoute(url.pathname);
  if (!route) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Physical stock reports require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  rejectTenantSelector(raw);
  const body = route.frappe ? unwrapFrappeArgs(raw) : raw;
  const input = parsePhysicalStockRequest(body);
  const service = dependencies.service ?? createPhysicalStockApiService(context.db, context.permissions);

  if (route.export) {
    if (input.cursor !== undefined || input.limit !== undefined || input.include_lineage !== undefined) {
      throw errors.validation("Physical stock export does not accept cursor, limit or include_lineage");
    }
    const exported = await service.exportCsv(context.actor, context.tenantId, input);
    return new Response(exported.content, {
      status: 200,
      headers: {
        "content-type": exported.content_type,
        "content-disposition": `attachment; filename="${exported.filename}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-cloudforge-trace-id": context.traceId,
      },
    });
  }

  const page = await service.run(context.actor, context.tenantId, input);
  return jsonResponse(route.frappe ? { message: page } : page, 200, {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-cloudforge-trace-id": context.traceId,
  });
}

export function createPhysicalStockApiService(
  db: D1Database,
  permissions: PhysicalStockPermissionGateway,
): PhysicalStockReportService {
  return new PhysicalStockReportService(
    new D1PhysicalStockLedgerReader(db),
    new MetadataPhysicalStockAccessPolicy(permissions),
  );
}

/**
 * Converts the platform's existing role and User Permission model into a bounded
 * physical-stock scope. Owner/share-only document access is rejected because ledger
 * rows do not carry document ownership and pretending otherwise would leak balances.
 */
export class MetadataPhysicalStockAccessPolicy implements PhysicalStockAccessPolicy {
  constructor(private readonly permissions: PhysicalStockPermissionGateway) {}

  async getScope(actor: Actor, tenantId: string): Promise<PhysicalStockAccessScope> {
    await this.permissions.assert({
      actor,
      tenantId,
      doctype: STOCK_PERMISSION_DOCTYPE,
      action: "report",
    });
    const readScope = await this.permissions.getReadScope(actor, tenantId, STOCK_PERMISSION_DOCTYPE);
    if (readScope.mode !== "all") {
      throw errors.permission("Physical stock report requires unrestricted Stock Entry read scope");
    }

    const companies = constraintValues(readScope, "Company");
    const warehouses = constraintValues(readScope, "Warehouse");
    const warehouseRoles = constraintValues(readScope, "Warehouse Role");

    return {
      companies: companies.length ? companies : "*",
      warehouses,
      warehouse_roles: warehouseRoles,
      max_rows: isSystemManager(actor) ? 500 : 200,
      can_view_lineage: true,
      can_export: await canExport(this.permissions, actor, tenantId),
    };
  }
}

function classifyRoute(pathname: string): PhysicalStockRouteKind | null {
  if (pathname === REPORT_PATH) return { export: false, frappe: false };
  if (pathname === EXPORT_PATH) return { export: true, frappe: false };
  if (pathname === FRAPPE_REPORT_PATH) return { export: false, frappe: true };
  if (pathname === FRAPPE_EXPORT_PATH) return { export: true, frappe: true };
  return null;
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // Fall through to one stable validation error below.
    }
    throw errors.validation("Physical stock Frappe args must contain a JSON object");
  }
  if (!isObject(args)) throw errors.validation("Physical stock Frappe args must be an object");
  rejectTenantSelector(args);
  return args;
}

function parsePhysicalStockRequest(body: JsonObject): PhysicalStockReportRequest {
  rejectTenantSelector(body);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) throw errors.validation(`Unknown physical stock report field: ${key}`);
  }

  const output: Record<string, string | number | boolean> = {};
  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
    const normalized = value.trim();
    const max = field === "cursor" ? 4_000 : 240;
    if (!normalized || normalized.length > max) {
      throw errors.validation(`${field} must be non-empty and at most ${max} characters`);
    }
    output[field] = normalized;
  }
  for (const field of INTEGER_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
    if (field === "limit" && Number(value) < 1) throw errors.validation("limit must be a positive integer");
    output[field] = Number(value);
  }
  for (const field of BOOLEAN_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") throw errors.validation(`${field} must be a boolean`);
    output[field] = value;
  }
  return output as unknown as PhysicalStockReportRequest;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Physical stock tenant scope is controlled by the authenticated server context");
  }
}

function constraintValues(scope: ReadAccessScope, doctype: string): string[] {
  const values = new Set<string>();
  for (const constraint of scope.user_permissions) {
    if (constraint.allow_doctype !== doctype) continue;
    for (const value of constraint.allowed_values) {
      const normalized = value.trim();
      if (normalized) values.add(normalized);
    }
  }
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function canExport(
  permissions: PhysicalStockPermissionGateway,
  actor: Actor,
  tenantId: string,
): Promise<boolean> {
  try {
    await permissions.assert({
      actor,
      tenantId,
      doctype: STOCK_PERMISSION_DOCTYPE,
      action: "export",
    });
    return true;
  } catch (error) {
    const normalized = asCloudForgeError(error);
    if (normalized.status === 403) return false;
    throw error;
  }
}

function isSystemManager(actor: Actor): boolean {
  return actor.user_id === "Administrator"
    || actor.roles.includes("Administrator")
    || actor.roles.includes("System Manager");
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
