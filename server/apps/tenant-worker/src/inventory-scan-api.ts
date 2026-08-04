import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { asCloudForgeError, errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  D1InventoryScanLookup,
  INVENTORY_SCAN_DOCTYPES,
  resolveInventoryScan,
  type InventoryScanAccessPolicy,
  type InventoryScanDoctype,
  type InventoryScanLookup,
  type InventoryScanResolution,
  type InventoryScanResolutionInput,
} from "../../../packages/clouderp-stock/src/inventory-scan-resolution.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const RESOLVE_PATH = "/api/v1/inventory/scan/resolve";
const FRAPPE_RESOLVE_PATH = "/api/method/metaforge.inventory.resolve_scan";
const MAX_BODY_BYTES = 8_192;
const ALLOWED_FIELDS = new Set(["raw", "symbology", "scanned_at", "expected_doctype", "company", "warehouse"]);

export interface InventoryScanApiContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  permissions: Pick<MetadataPermissionService, "assert">;
  traceId: string;
}

export interface InventoryScanApiDependencies {
  lookup?: InventoryScanLookup;
  access?: InventoryScanAccessPolicy;
}

export function isInventoryScanApiPath(pathname: string): boolean {
  return pathname === RESOLVE_PATH || pathname === FRAPPE_RESOLVE_PATH;
}

export function isInventoryScanFrappePath(pathname: string): boolean {
  return pathname === FRAPPE_RESOLVE_PATH;
}

/**
 * Authenticated server seam for barcode/QR/mobile scanner resolution.
 *
 * Tenant identity comes only from the trusted Worker context. The request can narrow
 * expected entity/company/warehouse but cannot select a tenant or bypass metadata
 * permission checks. Resolution is read-only and never writes Stock Ledger state.
 */
export async function routeInventoryScanApi(
  request: Request,
  url: URL,
  context: InventoryScanApiContext,
  dependencies: InventoryScanApiDependencies = {},
): Promise<Response | null> {
  if (!isInventoryScanApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Inventory scan resolution requires POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  rejectTenantSelector(raw);
  const body = isInventoryScanFrappePath(url.pathname) ? unwrapFrappeArgs(raw) : raw;
  const input = parseInventoryScanRequest(body);
  const lookup = dependencies.lookup ?? new D1InventoryScanLookup(context.db);
  const access = dependencies.access ?? new MetadataInventoryScanAccessPolicy(context.permissions);
  const resolution = await resolveInventoryScan(context.actor, context.tenantId, input, lookup, access);
  const payload = isInventoryScanFrappePath(url.pathname) ? { message: resolution } : resolution;
  return jsonResponse(payload as unknown as JsonObject, 200, {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "x-cloudforge-trace-id": context.traceId,
  });
}

export class MetadataInventoryScanAccessPolicy implements InventoryScanAccessPolicy {
  constructor(private readonly permissions: Pick<MetadataPermissionService, "assert">) {}

  async canRead(actor: Actor, tenantId: string, candidate: { doctype: InventoryScanDoctype; name: string; data: JsonObject }): Promise<boolean> {
    try {
      await this.permissions.assert({
        actor,
        tenantId,
        doctype: candidate.doctype,
        name: candidate.name,
        data: candidate.data,
        action: "read",
      });
      return true;
    } catch (error) {
      const normalized = asCloudForgeError(error);
      if (normalized.status === 403) return false;
      throw error;
    }
  }
}

function parseInventoryScanRequest(body: JsonObject): InventoryScanResolutionInput {
  rejectTenantSelector(body);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) throw errors.validation(`Unknown inventory scan field: ${key}`);
  }
  if (typeof body.raw !== "string") throw errors.validation("raw is required");
  const symbology = body.symbology;
  if (symbology !== undefined && typeof symbology !== "string") throw errors.validation("symbology must be a string");
  const scannedAt = optionalString(body.scanned_at, "scanned_at", 80);
  const expected = optionalString(body.expected_doctype, "expected_doctype", 40);
  if (expected && !(INVENTORY_SCAN_DOCTYPES as readonly string[]).includes(expected)) {
    throw errors.validation(`Unsupported inventory scan doctype ${expected}`);
  }
  const company = optionalString(body.company, "company", 240);
  const warehouse = optionalString(body.warehouse, "warehouse", 240);
  return {
    scan: {
      raw: body.raw,
      ...(symbology ? { symbology: symbology as InventoryScanResolutionInput["scan"]["symbology"] } : {}),
      ...(scannedAt ? { scanned_at: scannedAt } : {}),
    },
    ...(expected ? { expected_doctype: expected as InventoryScanDoctype } : {}),
    ...(company ? { company } : {}),
    ...(warehouse ? { warehouse } : {}),
  };
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (isObject(parsed)) {
        rejectTenantSelector(parsed);
        return parsed;
      }
    } catch {
      // Fall through to one stable validation error below.
    }
    throw errors.validation("Inventory scan Frappe args must contain a JSON object");
  }
  if (!isObject(args)) throw errors.validation("Inventory scan Frappe args must be an object");
  rejectTenantSelector(args);
  return args;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Inventory scan tenant scope is controlled by the authenticated server context");
  }
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maxLength) {
    throw errors.validation(`${field} must be non-empty and at most ${maxLength} characters`);
  }
  return normalized;
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type { InventoryScanResolution };
