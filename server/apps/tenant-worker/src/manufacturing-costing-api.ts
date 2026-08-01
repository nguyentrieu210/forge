import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  D1ManufacturingCostingService,
  type ManufacturingCostAdjustmentInput,
  type ManufacturingCostSheet,
  type ManufacturingCostSnapshotResult,
} from "../../../packages/clouderp-erpnext/src/index.js";

const MAX_BODY_BYTES = 32_000;

const ROUTES = {
  preview: [
    "/api/v1/manufacturing-costing/preview",
    "/api/method/metaforge.manufacturing.cost_preview",
  ],
  generate: [
    "/api/v1/manufacturing-costing/generate",
    "/api/method/metaforge.manufacturing.cost_generate",
  ],
  report: [
    "/api/v1/reports/manufacturing-cost-sheet",
    "/api/method/metaforge.manufacturing.cost_sheet",
  ],
  freeze: [
    "/api/v1/manufacturing-costing/freeze",
    "/api/method/metaforge.manufacturing.cost_freeze",
  ],
  adjust: [
    "/api/v1/manufacturing-costing/adjust",
    "/api/method/metaforge.manufacturing.cost_adjust",
  ],
} as const;

type ManufacturingCostingRoute = keyof typeof ROUTES;

export interface ManufacturingCostingApiService {
  preview(tenantId: string, actor: Actor, workOrder: string): Promise<ManufacturingCostSheet>;
  generate(tenantId: string, actor: Actor, workOrder: string): Promise<ManufacturingCostSnapshotResult>;
  read(tenantId: string, actor: Actor, snapshotId: string): Promise<JsonObject>;
  freeze(tenantId: string, actor: Actor, snapshotId: string, reason?: string): Promise<{ snapshot_id: string; work_order: string; existing: boolean }>;
  adjust(tenantId: string, actor: Actor, input: ManufacturingCostAdjustmentInput): Promise<{ adjustment_id: string; existing: boolean }>;
}

export interface ManufacturingCostingApiContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  traceId: string;
}

export interface ManufacturingCostingApiDependencies {
  service?: ManufacturingCostingApiService;
}

export function isManufacturingCostingApiPath(pathname: string): boolean {
  return classifyRoute(pathname) !== null;
}

export function isManufacturingCostingFrappePath(pathname: string): boolean {
  return pathname.startsWith("/api/method/metaforge.manufacturing.cost_");
}

export async function routeManufacturingCostingApi(
  request: Request,
  url: URL,
  context: ManufacturingCostingApiContext,
  dependencies: ManufacturingCostingApiDependencies = {},
): Promise<Response | null> {
  const route = classifyRoute(url.pathname);
  if (!route) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Manufacturing costing operations require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  rejectTenantSelector(raw);
  const body = isManufacturingCostingFrappePath(url.pathname) ? unwrapFrappeArgs(raw) : raw;
  rejectTenantSelector(body);
  const service = dependencies.service ?? new D1ManufacturingCostingService(context.db);

  let result: unknown;
  if (route === "preview") {
    rejectUnknown(body, new Set(["work_order"]));
    result = await service.preview(context.tenantId, context.actor, requireText(body.work_order, "work_order", 240));
  } else if (route === "generate") {
    rejectUnknown(body, new Set(["work_order"]));
    result = await service.generate(context.tenantId, context.actor, requireText(body.work_order, "work_order", 240));
  } else if (route === "report") {
    rejectUnknown(body, new Set(["snapshot_id"]));
    result = await service.read(context.tenantId, context.actor, requireText(body.snapshot_id, "snapshot_id", 240));
  } else if (route === "freeze") {
    rejectUnknown(body, new Set(["snapshot_id", "reason"]));
    result = await service.freeze(
      context.tenantId,
      context.actor,
      requireText(body.snapshot_id, "snapshot_id", 240),
      optionalText(body.reason, "reason", 1000),
    );
  } else {
    result = await service.adjust(context.tenantId, context.actor, parseAdjustment(body));
  }

  return jsonResponse(
    isManufacturingCostingFrappePath(url.pathname) ? { message: result as never } : result as never,
    200,
    {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-cloudforge-trace-id": context.traceId,
    },
  );
}

function classifyRoute(pathname: string): ManufacturingCostingRoute | null {
  for (const [route, paths] of Object.entries(ROUTES) as [ManufacturingCostingRoute, readonly string[]][]) {
    if (paths.includes(pathname)) return route;
  }
  return null;
}

function parseAdjustment(body: JsonObject): ManufacturingCostAdjustmentInput {
  const allowed = new Set(["adjustment_id", "snapshot_id", "category", "delta_amount_minor", "reason", "details"]);
  rejectUnknown(body, allowed);
  if (body.details !== undefined && !isObject(body.details)) throw errors.validation("details must be an object");
  return {
    adjustment_id: requireText(body.adjustment_id, "adjustment_id", 240),
    snapshot_id: requireText(body.snapshot_id, "snapshot_id", 240),
    category: requireText(body.category, "category", 40),
    delta_amount_minor: requireSafeInteger(body.delta_amount_minor, "delta_amount_minor"),
    reason: requireText(body.reason, "reason", 1000),
    ...(body.details === undefined ? {} : { details: body.details }),
  };
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // Stable validation error below.
    }
    throw errors.validation("Manufacturing costing Frappe args must contain a JSON object");
  }
  if (!isObject(args)) throw errors.validation("Manufacturing costing Frappe args must be an object");
  rejectTenantSelector(args);
  return args;
}

function rejectUnknown(body: JsonObject, allowed: Set<string>): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw errors.validation(`Unknown manufacturing costing field: ${key}`);
  }
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Manufacturing costing tenant scope is controlled by the authenticated server context");
  }
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${field} must be non-empty and at most ${max} characters`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  return requireText(value, field, max);
}

function requireSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return Number(value);
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
