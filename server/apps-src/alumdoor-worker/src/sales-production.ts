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

export interface PaintSyncResult {
  cut_order: string;
  created: string[];
  existing: string[];
  cancelled: string[];
}

type Json = Record<string, unknown>;

const DUPLICATE_LIST_ENDPOINTS = [
  { prefix: "resource/Production%20Request?", doctype: "Production Request" },
  { prefix: "resource/Work%20Order?", doctype: "Work Order" },
  { prefix: "resource/Paint%20Job?", doctype: "Paint Job" },
] as const;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function refuse(message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: 422,
    headers: { "content-type": "application/json" },
  });
}

function duplicateListDoctype(path: string): string | null {
  return DUPLICATE_LIST_ENDPOINTS.find((entry) => path.startsWith(entry.prefix))?.doctype ?? null;
}

function listReadError(doctype: string, status?: number): Error {
  return new Error(`Không đọc được danh sách ${doctype}${status ? ` (HTTP ${status})` : ""}.`);
}

/**
 * Ghi nhớ lỗi ở mọi lần đọc danh sách dùng để chống trùng. Core cũ có vài nhánh tương thích
 * legacy biến lỗi list thành mảng rỗng; lớp này vẫn cho nhánh đọc kết thúc nhưng từ chối write
 * kế tiếp bằng chính lỗi đã ghi nhận. Vì vậy outage xảy ra sau preflight cũng không thể tạo trùng.
 */
export function failClosedDuplicateReads(call: ProductionPlatformCall): ProductionPlatformCall {
  let duplicateReadFailure: Error | null = null;

  const guarded = async (path: string, init?: RequestInit): Promise<Response> => {
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && duplicateReadFailure) throw duplicateReadFailure;

    const duplicateDoctype = method === "GET" ? duplicateListDoctype(path) : null;
    try {
      const response = await call(path, init);
      if (duplicateDoctype && !response.ok && !duplicateReadFailure) {
        duplicateReadFailure = listReadError(duplicateDoctype, response.status);
      }
      return response;
    } catch (error) {
      if (duplicateDoctype && !duplicateReadFailure) {
        duplicateReadFailure = error instanceof Error
          ? new Error(`Không đọc được danh sách ${duplicateDoctype}: ${error.message}`)
          : listReadError(duplicateDoctype);
      }
      throw error;
    }
  };

  return Object.assign(guarded, { via: call.via }) as ProductionPlatformCall;
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
  if (!response.ok) throw listReadError(doctype, response.status);
}

export async function createSalesProduction(
  call: ProductionPlatformCall,
  args: Json,
): Promise<Response> {
  const guardedCall = failClosedDuplicateReads(call);
  try {
    const order = text(args.sales_order);
    if (order) {
      await ensureListReadable(
        guardedCall,
        "Production Request",
        ["name", "sales_order", "request_state"],
        [["sales_order", "=", order]],
        10,
      );
      await ensureListReadable(
        guardedCall,
        "Work Order",
        ["name", "production_request", "production_request_line_key", "docstatus"],
        [["production_request", "=", "__PREFLIGHT__"], ["production_request_line_key", "=", "__PREFLIGHT__"]],
        1,
      );
    }
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không kiểm tra được chứng từ sản xuất hiện có.");
  }
  return createSalesProductionCore(guardedCall, args);
}

export async function syncPaintJobsFromCut(
  call: ProductionPlatformCall,
  cutOrderName: string,
  direction: 1 | -1,
): Promise<PaintSyncResult> {
  const guardedCall = failClosedDuplicateReads(call);
  const cutOrder = text(cutOrderName);
  if (cutOrder) {
    await ensureListReadable(
      guardedCall,
      "Paint Job",
      ["name", "cut_order", "work_order", "state", "modified"],
      [["cut_order", "=", cutOrder]],
      200,
    );
  }
  return syncPaintJobsFromCutCore(guardedCall, cutOrderName, direction);
}
