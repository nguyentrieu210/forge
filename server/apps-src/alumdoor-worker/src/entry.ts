import baseWorker from "./index.js";
import { validateItemCatalogInvariants } from "./item-catalog-invariants.js";
import { handlePurchaseOrderCreate } from "./purchase-order-create.js";
import { handlePurchaseFifoRequest } from "./purchase-fifo-receipt.js";
import { handleBulkPurchaseFifoRequest } from "./bulk-purchase-fifo-receipt.js";
import { handleBulkPurchaseDirectReceipt } from "./bulk-purchase-direct-receipt.js";
import { handleCompanyScopedPurchaseSupplierDashboard } from "./purchase-supplier-dashboard-company-scope.js";
import { handlePurchaseSupplierSettlement } from "./purchase-supplier-settlement.js";
import { handleCompanyScopedDeliveryBatch } from "./delivery-batch-company-scope.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];

/**
 * Entrypoint triển khai của Alumdoor.
 *
 * Item đi qua cả validator lịch sử và các invariant catalog mới. Tạo đơn mua, nhập trực tiếp,
 * nhập nhôm FIFO và Bulk Transaction đều chỉ compose chứng từ chuẩn rồi gọi ngược platform
 * dưới đúng danh tính người dùng. Dashboard giao hàng NCC và batch giao hàng đều bắt buộc
 * scope theo Company của Business Context; đối soát chỉ compose Purchase Settlement canonical,
 * không tạo ledger cạnh tranh. Mọi route khác delegate nguyên vẹn.
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/method/")) {
      const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
      if (method === "alumdoor.purchase.create_order") {
        return handlePurchaseOrderCreate(request, env);
      }
      if (method === "alumdoor.purchase.supplier_delivery_dashboard") {
        return handleCompanyScopedPurchaseSupplierDashboard(request, env);
      }
      if (method === "alumdoor.purchase.supplier_delivery_settlement") {
        return handlePurchaseSupplierSettlement(request, env);
      }
      if (method === "alumdoor.purchase.preview_bulk_direct_receipt") {
        return handleBulkPurchaseDirectReceipt(request, env, false);
      }
      if (method === "alumdoor.purchase.bulk_direct_receipt") {
        return handleBulkPurchaseDirectReceipt(request, env, true);
      }
      if (method === "alumdoor.purchase.preview_fifo_receipt") {
        return handlePurchaseFifoRequest(request, env, false);
      }
      if (method === "alumdoor.purchase.fifo_receipt") {
        return handlePurchaseFifoRequest(request, env, true);
      }
      if (method === "alumdoor.purchase.preview_bulk_fifo_receipt") {
        return handleBulkPurchaseFifoRequest(request, env, false);
      }
      if (method === "alumdoor.purchase.bulk_fifo_receipt") {
        return handleBulkPurchaseFifoRequest(request, env, true);
      }
      if (method === "alumdoor.delivery_batch.preview" || method === "alumdoor.delivery_batch.create") {
        return handleCompanyScopedDeliveryBatch(request, env, ctx);
      }
    }

    if (url.pathname !== "/hooks/validate" || request.method !== "POST") {
      return baseWorker.fetch(request, env, ctx);
    }

    const invariantRequest = request.clone();
    const body = await invariantRequest.clone().json().catch(() => null) as { doctype?: string } | null;
    if (body?.doctype !== "Item") return baseWorker.fetch(request, env, ctx);

    const [baseResponse, invariantResponse] = await Promise.all([
      baseWorker.fetch(request, env, ctx),
      validateItemCatalogInvariants(invariantRequest, env),
    ]);

    // Preserve infrastructure/auth failures from the established validator. When both
    // validators return a business validation response, the stricter catalog invariant
    // is authoritative so its field-level reason is not hidden by a broader legacy error.
    if (!baseResponse.ok && baseResponse.status !== 422) return baseResponse;
    if (!invariantResponse.ok) return invariantResponse;
    return baseResponse;
  },
};
