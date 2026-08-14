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
import { guardSalesProductionPackageSemantics } from "./sales-production-package-guard.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];

const PURCHASE_VALIDATION_DOCTYPES = new Set([
  "Supplier Quotation",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
]);

async function responseMessage(response: Response): Promise<string> {
  const payload = await response.clone().json().catch(() => ({})) as { message?: unknown; error?: unknown };
  return String(payload.message ?? payload.error ?? "");
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/method/")) {
      const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
      if (method === "alumdoor.production_request.lifecycle") return handleProductionRequestLifecycle(request, env);
      if (method === "alumdoor.sales.preview_production" || method === "alumdoor.sales.create_production") {
        const blocked = await guardSalesProductionPackageSemantics(request, env);
        if (blocked) return blocked;
      }
      if (method === "alumdoor.purchase.supplier_delivery_dashboard") return handlePurchaseSupplierDashboard(request, env);
      if (method === "alumdoor.purchase.supplier_delivery_settlement") return handlePurchaseSupplierSettlement(request, env);
      if (method === "alumdoor.purchase.preview_fifo_receipt") return handleTrackedPurchaseFifoRequest(request, env, false, false);
      if (method === "alumdoor.purchase.fifo_receipt") return handleTrackedPurchaseFifoRequest(request, env, true, false);
      if (method === "alumdoor.purchase.preview_bulk_fifo_receipt") return handleTrackedPurchaseFifoRequest(request, env, false, true);
      if (method === "alumdoor.purchase.bulk_fifo_receipt") return handleTrackedPurchaseFifoRequest(request, env, true, true);
      if (method === "alumdoor.inventory.plan_sales_order") return handleAluminumSalesPlan(request, env);
      if (method === "alumdoor.inventory.reserve_sales_order") return handleReserveAluminumForSales(request, env);
      if (method === "alumdoor.inventory.material_request_from_shortage") return handleMaterialRequestFromAluminumShortage(request, env);
    }

    if (url.pathname === "/hooks/event" && request.method === "POST") {
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

    if (url.pathname !== "/hooks/validate" || request.method !== "POST") return baseWorker.fetch(request, env, ctx);

    const body = await request.clone().json().catch(() => null) as { doctype?: string } | null;
    if (body?.doctype === "Item") {
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

    if (body?.doctype && PURCHASE_VALIDATION_DOCTYPES.has(body.doctype)) {
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

    return baseWorker.fetch(request, env, ctx);
  },
};
