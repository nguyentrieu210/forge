import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import { createO2CControllerRegistry } from "../../../packages/clouderp-selling/src/index.js";
import { registerErpCoreControllers } from "../../../packages/clouderp-core/src/index.js";
import { registerStockControllers } from "../../../packages/clouderp-stock/src/index.js";
import { registerErpNextCoreControllers } from "../../../packages/clouderp-erpnext/src/index.js";
import { D1RolloutPurchaseAllocationDomainStore, DocumentKernel } from "../../../packages/document-kernel/src/index.js";
import {
  assertModifiedMatches,
  buildCommand,
  stripServerOwnedFields,
} from "../../../packages/frappe-api/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  GenericMetadataController,
  MetadataPermissionService,
} from "../../../packages/frappe-model/src/index.js";
import { D1OrganizationSecurityGuard } from "../../../packages/organization-security/src/index.js";

export const STOCK_RECONCILIATION_PREVIEW_PATH = "/api/v1/inventory/stock-reconciliation/preview";

export interface StockReconciliationPreviewContext {
  db: D1Database;
  tenantId: string;
  actor: Actor;
  traceId: string;
}

export function isStockReconciliationPreviewApiPath(pathname: string): boolean {
  return pathname === STOCK_RECONCILIATION_PREVIEW_PATH;
}

export async function routeStockReconciliationPreviewApi(
  request: Request,
  url: URL,
  context: StockReconciliationPreviewContext,
): Promise<Response | null> {
  if (!isStockReconciliationPreviewApiPath(url.pathname)) return null;
  if (request.method !== "POST") {
    return jsonResponse({ code: "METHOD_NOT_ALLOWED", message: "POST required" }, 405, {
      allow: "POST",
      "x-cloudforge-trace-id": context.traceId,
    });
  }

  const body = await readJson<JsonObject>(request, 2_000_000);
  const name = text(body.name);
  const document = object(body.document, "document");
  if (!name) throw errors.validation("Stock Reconciliation name is required");

  const metadata = new D1MetadataStore(context.db);
  const store = new D1RolloutPurchaseAllocationDomainStore(context.db);
  const existing = await store.getDocument<JsonObject>(context.tenantId, "Stock Reconciliation", name);
  if (!existing) throw errors.reference(`Stock Reconciliation ${name} does not exist`);
  if (existing.docstatus !== 0) throw errors.lifecycle("Only draft Stock Reconciliation can be previewed");

  assertModifiedMatches(existing, body.modified ?? document.modified);
  const cleanDocument = stripServerOwnedFields(document);
  const command = await buildCommand({
    tenantId: context.tenantId,
    actor: context.actor,
    doctype: "Stock Reconciliation",
    name,
    action: "save",
    expectedVersion: existing.version,
    document: cleanDocument,
  });

  await new D1OrganizationSecurityGuard(context.db, metadata).assertMutation(
    context.tenantId,
    context.actor,
    command,
  );
  const registry = registerErpNextCoreControllers(
    registerStockControllers(registerErpCoreControllers(createO2CControllerRegistry())),
  ).setFallback(new GenericMetadataController(metadata));
  const permissions = new MetadataPermissionService(
    metadata,
    undefined,
    new D1DocumentAccessStore(context.db),
  );
  const kernel = new DocumentKernel(registry, store, permissions);
  const plan = await kernel.preview(command);

  return jsonResponse({
    doctype: plan.document.doctype,
    name: plan.document.name,
    expected_version: existing.version,
    planned_version: plan.document.version,
    document: plan.document.data,
    side_effects: {
      gl_entries: plan.gl_entries.length,
      stock_entries: plan.stock_entries.length,
      payment_entries: plan.payment_entries.length,
      fulfillment_entries: plan.fulfillment_entries.length,
      stock_bundle_usages: plan.stock_bundle_usages?.length ?? 0,
    },
  }, 200, { "x-cloudforge-trace-id": context.traceId });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.validation(`${field} must be an object`);
  }
  return value as JsonObject;
}
