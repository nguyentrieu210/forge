import {
  buildSalesProductionLines,
  calculateLeafPlan,
  calculateSalesProductionLine,
  createSalesProduction as createSalesProductionCore,
  previewSalesProduction,
  syncPaintJobsFromCut as syncPaintJobsFromCutCore,
  validateProductionRequest,
  type LeafPlan,
  type ProductionPlatformCall,
  type SalesProductionLine,
} from "./sales-production-core.js";

export {
  buildSalesProductionLines,
  calculateLeafPlan,
  calculateSalesProductionLine,
  previewSalesProduction,
  validateProductionRequest,
};
export type { LeafPlan, ProductionPlatformCall, SalesProductionLine };

type Json = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function refuse(message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
}

async function ensureListReadable(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 1,
): Promise<void> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) {
    throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  }
}

/**
 * Fail closed trước lần ghi đầu tiên.
 *
 * Core vẫn thực hiện truy vấn chống trùng theo khóa thật. Các probe ở đây bảo đảm lỗi quyền,
 * callback, schema filter hoặc outage của endpoint danh sách không bị core biến thành mảng
 * rỗng rồi hiểu nhầm là "chưa có chứng từ".
 */
export async function createSalesProduction(
  call: ProductionPlatformCall,
  args: Json,
): Promise<Response> {
  try {
    const order = text(args.sales_order);
    if (order) {
      await ensureListReadable(
        call,
        "Production Request",
        ["name", "sales_order", "request_state"],
        [["sales_order", "=", order]],
        10,
      );
      await ensureListReadable(
        call,
        "Work Order",
        ["name", "production_request", "production_request_line_key", "docstatus"],
        [["production_request", "=", "__PREFLIGHT__"], ["production_request_line_key", "=", "__PREFLIGHT__"]],
        1,
      );
    }
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không kiểm tra được chứng từ sản xuất hiện có.");
  }
  return createSalesProductionCore(call, args);
}

export async function syncPaintJobsFromCut(
  call: ProductionPlatformCall,
  cutOrderName: string,
  direction: 1 | -1,
) {
  const cutOrder = text(cutOrderName);
  if (cutOrder) {
    await ensureListReadable(
      call,
      "Paint Job",
      ["name", "cut_order", "work_order", "state", "modified"],
      [["cut_order", "=", cutOrder]],
      200,
    );
  }
  return syncPaintJobsFromCutCore(call, cutOrderName, direction);
}
