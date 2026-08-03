import baseWorker from "./index.js";
import { validateItemCatalogInvariants } from "./item-catalog-invariants.js";
import { handlePurchaseFifoRequest } from "./purchase-fifo-receipt.js";
import { handleBulkPurchaseFifoRequest } from "./bulk-purchase-fifo-receipt.js";
import { handlePurchaseSupplierDashboard } from "./purchase-supplier-dashboard.js";
import { handlePurchaseSupplierSettlement } from "./purchase-supplier-settlement.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];

/**
 * Entrypoint triển khai của Alumdoor.
 *
 * Item đi qua cả validator lịch sử và các invariant catalog mới. Nhập nhôm FIFO có hai
 * controller: một dòng tương thích cũ và Bulk Transaction nhiều mã tạo một chứng từ nháp.
 * Dashboard giao hàng NCC đọc allocation timeline authoritative; đối soát chỉ compose
 * Purchase Settlement canonical, không tạo ledger cạnh tranh. Mọi route khác delegate nguyên vẹn.
 */
export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/method/")) {
      const method = decodeURIComponent(url.pathname.slice("/api/method/".length));
      if (method === "alumdoor.purchase.supplier_delivery_dashboard") {
        return handlePurchaseSupplierDashboard(request, env);
      }
      if (method === "alumdoor.purchase.supplier_delivery_settlement") {
        return handlePurchaseSupplierSettlement(request, env);
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
