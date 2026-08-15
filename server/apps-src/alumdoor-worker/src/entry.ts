import baseWorker from "./index.js";
import {
  validateCanonicalAluminumItem,
  validateItemCatalogInvariants,
} from "./item-catalog-invariants.js";
import {
  handleTrackedPurchaseFifoRequest,
  validateAluminumPurchaseHook,
} from "./aluminum-purchase-closure.js";
import { buildResidualPurchaseValidationRequest } from "./aluminum-validation-bridge.js";
import {
  handleAluminumSalesPlan,
  handleMaterialRequestFromAluminumShortage,
  handleReserveAluminumForSales,
} from "./aluminum-supply-demand.js";
import { handlePurchaseSupplierDashboard } from "./purchase-supplier-dashboard.js";
import { handlePurchaseSupplierSettlement } from "./purchase-supplier-settlement.js";
import { handleProductionRequestLifecycle } from "./production-request-lifecycle-route.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];
type MethodOverride = (request: Request, env: WorkerEnv) => Promise<Response>;

const PURCHASE_VALIDATION_DOCTYPES = new Set([
  "Supplier Quotation",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
]);

const METHOD_OVERRIDES: Record<string, MethodOverride> = {
  "alumdoor.production_request.lifecycle": (request, env) => handleProductionRequestLifecycle(request, env),
  "alumdoor.purchase.supplier_delivery_dashboard": (request, env) => handlePurchaseSupplierDashboard(request, env),
  "alumdoor.purchase.supplier_delivery_settlement": (request, env) => handlePurchaseSupplierSettlement(request, env),
  "alumdoor.purchase.preview_fifo_receipt": (request, env) => handleTrackedPurchaseFifoRequest(request, env, false, false),
  "alumdoor.purchase.fifo_receipt": (request, env) => handleTrackedPurchaseFifoRequest(request, env, true, false),
  "alumdoor.purchase.preview_bulk_fifo_receipt": (request, env) => handleTrackedPurchaseFifoRequest(request, env, false, true),
  "alumdoor.purchase.bulk_fifo_receipt": (request, env) => handleTrackedPurchaseFifoRequest(request, env, true, true),
  "alumdoor.inventory.plan_sales_order": (request, env) => handleAluminumSalesPlan(request, env),
  "alumdoor.inventory.reserve_sales_order": (request, env) => handleReserveAluminumForSales(request, env),
  "alumdoor.inventory.material_request_from_shortage": (request, env) => handleMaterialRequestFromAluminumShortage(request, env),
};

async function responseMessage(response: Response): Promise<string> {
  const payload = await response.clone().json().catch(() => ({})) as { message?: unknown; error?: unknown };
  return String(payload.message ?? payload.error ?? "");
}

async function handleMethodOverride(request: Request, env: WorkerEnv, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/api/method/")) return null;
  const method = decodeURIComponent(pathname.slice("/api/method/".length));
  const handler = METHOD_OVERRIDES[method];
  return handler ? handler(request, env) : null;
}

async function handleEventOverride(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/hooks/event" || request.method !== "POST") return null;
  const event = await request.clone().json().catch(() => null) as { event_type?: string } | null;
  const type = String(event?.event_type ?? "");
  if (type.startsWith("purchase_receipt.")) {
    return Response.json({
      ok: true,
      skipped_legacy_aluminium_lot_sync: true,
      authority: "Batch + Stock Ledger",
      event_type: type,
    });
  }
  return baseWorker.fetch(request, env, ctx);
}

async function validateItemRequest(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
  const invariantResponse = await validateItemCatalogInvariants(request.clone(), env);
  if (!invariantResponse.ok) return invariantResponse;

  const baseResponse = await baseWorker.fetch(request.clone(), env, ctx);
  if (!baseResponse.ok) {
    if (baseResponse.status !== 422) return baseResponse;
    const message = await responseMessage(baseResponse);
    if (!/chưa có hệ số quy đổi/i.test(message)) return baseResponse;
    const strict = await validateCanonicalAluminumItem(request.clone(), env);
    return strict ?? baseResponse;
  }

  const strict = await validateCanonicalAluminumItem(request.clone(), env);
  return strict ?? invariantResponse;
}

async function validatePurchaseRequest(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
  const baseResponse = await baseWorker.fetch(request.clone(), env, ctx);
  if (baseResponse.ok) {
    const aluminum = await validateAluminumPurchaseHook(request.clone(), env);
    return aluminum ?? baseResponse;
  }
  if (baseResponse.status !== 422) return baseResponse;
  const baseMessage = await responseMessage(baseResponse);
  if (!/chưa có hệ số quy đổi/i.test(baseMessage)) return baseResponse;

  const aluminum = await validateAluminumPurchaseHook(request.clone(), env);
  if (!aluminum || !aluminum.ok) return aluminum ?? baseResponse;
  const residualRequest = await buildResidualPurchaseValidationRequest(request.clone(), env);
  if (residualRequest) {
    const residual = await baseWorker.fetch(residualRequest, env, ctx);
    if (!residual.ok) return residual;
  }
  return aluminum;
}

async function handleValidationOverride(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/hooks/validate" || request.method !== "POST") return null;
  const body = await request.clone().json().catch(() => null) as { doctype?: string } | null;
  if (body?.doctype === "Item") return validateItemRequest(request, env, ctx);
  if (body?.doctype && PURCHASE_VALIDATION_DOCTYPES.has(body.doctype)) return validatePurchaseRequest(request, env, ctx);
  return baseWorker.fetch(request, env, ctx);
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;

    const methodResponse = await handleMethodOverride(request, env, pathname);
    if (methodResponse) return methodResponse;

    const eventResponse = await handleEventOverride(request, env, ctx, pathname);
    if (eventResponse) return eventResponse;

    const validationResponse = await handleValidationOverride(request, env, ctx, pathname);
    if (validationResponse) return validationResponse;

    return baseWorker.fetch(request, env, ctx);
  },
};
