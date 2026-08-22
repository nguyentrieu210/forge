import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  buildPickWaves,
  planPicking,
  planPutaway,
  validatePacking,
  type PackageInput,
  type PickCandidate,
  type PickedStockLine,
  type PutawayCandidate,
  type WaveLine,
} from "../../../packages/clouderp-stock/src/index.js";

const API_PATH = "/api/v1/inventory/wms/plan";
const FRAPPE_PATH = "/api/method/metaforge.inventory.wms_plan";
const MAX_BODY_BYTES = 2_000_000;
const MAX_ROWS = 5_000;

export interface WmsPlanningApiContext {
  traceId: string;
}

export function isWmsPlanningApiPath(pathname: string): boolean {
  return pathname === API_PATH || pathname === FRAPPE_PATH;
}

export function isWmsPlanningFrappePath(pathname: string): boolean {
  return pathname === FRAPPE_PATH;
}

/**
 * Authenticated platform boundary for the shared, side-effect-free WMS planners.
 * The Alumdoor app resolves policy and inventory candidates through callback APIs,
 * while the platform remains the only owner of the generic stock implementation.
 */
export async function routeWmsPlanningApi(
  request: Request,
  url: URL,
  context: WmsPlanningApiContext,
): Promise<Response | null> {
  if (!isWmsPlanningApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "WMS planning requires POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  rejectTenantSelector(raw);
  const body = isWmsPlanningFrappePath(url.pathname) ? unwrapFrappeArgs(raw) : raw;
  rejectUnknownFields(body, new Set(["operation", "input"]), "WMS planning");
  const operation = requiredText(body.operation, "operation");
  const input = objectValue(body.input, "input");
  rejectTenantSelector(input);

  let result: unknown;
  switch (operation) {
    case "plan_picking": {
      const candidates = arrayValue(input.candidates, "input.candidates");
      assertRowLimit(candidates, "input.candidates");
      result = planPicking(requiredSafeInteger(input.qty_micros, "input.qty_micros"), candidates as unknown as PickCandidate[]);
      break;
    }
    case "validate_packing": {
      const picked = arrayValue(input.picked, "input.picked");
      const packages = arrayValue(input.packages, "input.packages");
      assertRowLimit(picked, "input.picked");
      assertRowLimit(packages, "input.packages");
      let packageLines = 0;
      for (const [index, pkg] of packages.entries()) {
        const record = objectValue(pkg, `input.packages[${index}]`);
        const lines = arrayValue(record.lines, `input.packages[${index}].lines`);
        packageLines += lines.length;
        if (packageLines > MAX_ROWS) throw errors.validation(`input.packages lines exceed ${MAX_ROWS}`);
      }
      result = validatePacking(picked as unknown as PickedStockLine[], packages as unknown as PackageInput[]);
      break;
    }
    case "plan_putaway": {
      const candidates = arrayValue(input.candidates, "input.candidates");
      assertRowLimit(candidates, "input.candidates");
      result = planPutaway(requiredSafeInteger(input.qty_micros, "input.qty_micros"), candidates as unknown as PutawayCandidate[]);
      break;
    }
    case "build_pick_waves": {
      const lines = arrayValue(input.lines, "input.lines");
      assertRowLimit(lines, "input.lines");
      result = buildPickWaves(
        lines as unknown as WaveLine[],
        requiredSafeInteger(input.max_lines_per_wave, "input.max_lines_per_wave"),
      );
      break;
    }
    default:
      throw errors.validation(`Unsupported WMS planning operation ${operation}`);
  }

  const payload = isWmsPlanningFrappePath(url.pathname) ? { message: result } : result;
  return jsonResponse(payload as JsonObject, 200, {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-cloudforge-trace-id": context.traceId,
  });
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (isObject(parsed)) return parsed;
    } catch {
      // Emit one stable validation error below.
    }
    throw errors.validation("WMS planning Frappe args must contain a JSON object");
  }
  return objectValue(args, "args");
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("WMS planning tenant scope is controlled by the authenticated server context");
  }
}

function rejectUnknownFields(body: JsonObject, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw errors.validation(`Unknown ${label} field: ${key}`);
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > 80) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function requiredSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw errors.validation(`${field} must be a positive safe integer`);
  return Number(value);
}

function objectValue(value: unknown, field: string): JsonObject {
  if (!isObject(value)) throw errors.validation(`${field} must be an object`);
  return value;
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw errors.validation(`${field} must be an array`);
  return value;
}

function assertRowLimit(rows: unknown[], field: string): void {
  if (rows.length > MAX_ROWS) throw errors.validation(`${field} exceeds ${MAX_ROWS} rows`);
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
