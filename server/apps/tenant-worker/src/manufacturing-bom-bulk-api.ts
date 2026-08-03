import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  buildBulkBomDraftDocument,
  canonicalDraftMatchesBulkBomInput,
  fingerprintBulkBomDraft,
  previewBulkBomDraft,
  type BulkBomDraftInput,
} from "../../../packages/clouderp-erpnext/src/index.js";
import type { MetadataPermissionService } from "../../../packages/frappe-model/src/index.js";

const PREVIEW_PATH = "/api/method/metaforge.manufacturing.preview_bulk_bom";
const CREATE_PATH = "/api/method/metaforge.manufacturing.create_bulk_bom_draft";
const MAX_BODY_BYTES = 1_100_000;
const BOM_DOCTYPE = "Bill of Materials";
const ALLOWED_FIELDS = new Set([
  "company",
  "item",
  "quantity",
  "currency",
  "operating_cost",
  "revision",
  "effective_from",
  "effective_to",
  "output_uom",
  "output_conversion_factor",
  "rows",
  "lines",
]);

export interface ManufacturingBomBulkApiContext {
  tenantId: string;
  actor: Actor;
  permissions: Pick<MetadataPermissionService, "assert">;
  traceId: string;
  findCanonicalRevisions(document: JsonObject): Promise<JsonObject[]>;
  createCanonicalDraft(document: JsonObject): Promise<Response>;
}

export function isManufacturingBomBulkApiPath(pathname: string): boolean {
  return pathname === PREVIEW_PATH || pathname === CREATE_PATH;
}

export function isManufacturingBomBulkFrappePath(pathname: string): boolean {
  return isManufacturingBomBulkApiPath(pathname);
}

/**
 * Bounded input seam for BOM spreadsheet-style entry.
 *
 * Preview is pure. Create is Draft-only and delegates both replay reads and the actual
 * write to the ordinary Frappe BOM resource path supplied by the Worker. That keeps
 * naming, User Permission scope, controller normalization and lifecycle canonical.
 */
export async function routeManufacturingBomBulkApi(
  request: Request,
  url: URL,
  context: ManufacturingBomBulkApiContext,
): Promise<Response | null> {
  if (!isManufacturingBomBulkApiPath(url.pathname)) return null;
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Bulk BOM methods require POST" } },
      405,
      { allow: "POST", "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const raw = await readJson<JsonObject>(request, MAX_BODY_BYTES);
  const input = parseBulkBomInput(unwrapFrappeArgs(raw));
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: BOM_DOCTYPE, action: "create" });
  await context.permissions.assert({ actor: context.actor, tenantId: context.tenantId, doctype: BOM_DOCTYPE, action: "read" });

  if (url.pathname === PREVIEW_PATH) {
    return jsonResponse(
      { message: await previewBulkBomDraft(input) },
      200,
      { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const document = buildBulkBomDraftDocument(input);
  const fingerprint = await fingerprintBulkBomDraft(input);
  const existing = await context.findCanonicalRevisions(document);
  if (existing.length > 1) {
    throw errors.exists(`Multiple BOM documents already use ${document.item} revision ${document.revision}`);
  }
  if (existing.length === 1) {
    const current = existing[0]!;
    const docstatus = integer(current.docstatus);
    if (docstatus === 0 && canonicalDraftMatchesBulkBomInput(input, current)) {
      return jsonResponse(
        { message: resultShape(text(current.name), docstatus, fingerprint, document.items.length, true) },
        200,
        { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
      );
    }
    throw errors.exists(`BOM ${document.item} revision ${document.revision} already exists with a different payload or lifecycle state`);
  }

  const createdResponse = await context.createCanonicalDraft(document);
  if (!createdResponse.ok) return createdResponse;
  const createdPayload = await readResponseJson(createdResponse);
  const created = unwrapResource(createdPayload);
  const name = text(created.name);
  if (!name) throw errors.database("Canonical BOM create returned no document name");
  const docstatus = integer(created.docstatus);
  const bookmark = createdResponse.headers.get("x-d1-bookmark");

  return jsonResponse(
    { message: resultShape(name, docstatus, fingerprint, document.items.length, false) },
    200,
    {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-cloudforge-trace-id": context.traceId,
      ...(bookmark ? { "x-d1-bookmark": bookmark } : {}),
    },
  );
}

function resultShape(name: string, docstatus: number, fingerprint: string, rowCount: number, replayed: boolean): JsonObject {
  return {
    schema_version: 1,
    doctype: BOM_DOCTYPE,
    name,
    docstatus,
    draft: docstatus === 0,
    replayed,
    fingerprint,
    row_count: rowCount,
  };
}

function parseBulkBomInput(body: JsonObject): BulkBomDraftInput {
  rejectTenantSelector(body);
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) throw errors.validation(`Unknown bulk BOM field: ${key}`);
  }
  if (body.rows !== undefined && body.lines !== undefined) {
    throw errors.validation("Use rows or lines for bulk BOM components, not both");
  }
  const rows = parseRows(body.rows ?? body.lines);
  return {
    company: scalar(body.company),
    item: scalar(body.item),
    ...(body.quantity !== undefined ? { quantity: decimal(body.quantity, "quantity") } : {}),
    ...(body.currency !== undefined ? { currency: scalar(body.currency) } : {}),
    ...(body.operating_cost !== undefined ? { operating_cost: decimal(body.operating_cost, "operating_cost") } : {}),
    ...(body.revision !== undefined ? { revision: integer(body.revision) } : {}),
    effective_from: scalar(body.effective_from),
    ...(body.effective_to !== undefined ? { effective_to: scalar(body.effective_to) } : {}),
    ...(body.output_uom !== undefined ? { output_uom: scalar(body.output_uom) } : {}),
    ...(body.output_conversion_factor !== undefined
      ? { output_conversion_factor: decimal(body.output_conversion_factor, "output_conversion_factor") }
      : {}),
    rows,
  };
}

function parseRows(value: unknown): BulkBomDraftInput["rows"] {
  const parsed = typeof value === "string" ? parseJson(value, "rows") : value;
  if (!Array.isArray(parsed)) throw errors.validation("Bulk BOM rows must be an array");
  return parsed.map((row, index) => {
    if (!isObject(row)) throw errors.validation(`Bulk BOM row ${index + 1} must be an object`);
    rejectTenantSelector(row);
    return {
      item_code: scalar(row.item_code),
      qty: decimal(row.qty, `rows[${index}].qty`),
      ...(row.source_warehouse !== undefined ? { source_warehouse: scalar(row.source_warehouse) } : {}),
      ...(row.uom !== undefined ? { uom: scalar(row.uom) } : {}),
      ...(row.conversion_factor !== undefined
        ? { conversion_factor: decimal(row.conversion_factor, `rows[${index}].conversion_factor`) }
        : {}),
      ...(row.qty_basis !== undefined ? { qty_basis: scalar(row.qty_basis) as BulkBomDraftInput["rows"][number]["qty_basis"] } : {}),
    };
  });
}

function unwrapFrappeArgs(body: JsonObject): JsonObject {
  const args = body.args;
  if (args === undefined) return body;
  const parsed = typeof args === "string" ? parseJson(args, "args") : args;
  if (!isObject(parsed)) throw errors.validation("Bulk BOM Frappe args must be an object");
  rejectTenantSelector(parsed);
  return parsed;
}

function rejectTenantSelector(body: JsonObject): void {
  if (Object.hasOwn(body, "tenant_id") || Object.hasOwn(body, "tenantId")) {
    throw errors.validation("Bulk BOM tenant scope is controlled by the authenticated server context");
  }
}

function parseJson(value: string, field: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw errors.validation(`${field} must contain valid JSON`);
  }
}

function scalar(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim();
}

function decimal(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw errors.validation(`${field} must be a decimal value`);
  }
  return value;
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readResponseJson(response: Response): Promise<JsonObject> {
  try {
    const payload = await response.json() as unknown;
    if (isObject(payload)) return payload;
  } catch {
    // Converted to one stable platform error below.
  }
  throw errors.database("Canonical BOM create returned an invalid response");
}

function unwrapResource(payload: JsonObject): JsonObject {
  const data = payload.data;
  return isObject(data) ? data : payload;
}
