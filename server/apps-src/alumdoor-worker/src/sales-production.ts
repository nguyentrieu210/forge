import {
  buildSalesProductionLines,
  calculateLeafPlan,
  calculateSalesProductionLine,
  createSalesProduction as createSalesProductionCore,
  previewSalesProduction,
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

interface ExistingPaintJob extends Json {
  name?: string;
  batch_no?: string;
  state?: string;
  modified?: string;
}

const DUPLICATE_LIST_ENDPOINTS = [
  { prefix: "resource/Production%20Request?", doctype: "Production Request" },
  { prefix: "resource/Work%20Order?", doctype: "Work Order" },
  { prefix: "resource/Paint%20Job?", doctype: "Paint Job" },
] as const;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function normalized(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
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

async function readDoc<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  name: string,
): Promise<T & { modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T & { modified?: string } }).data ?? {}) as T & { modified?: string };
}

async function listDocs<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[] = [],
  limit = 500,
): Promise<T[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: String(limit),
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw listReadError(doctype, response.status);
  return (((await response.json()) as { data?: T[] }).data ?? []);
}

async function createDoc<T extends Json>(
  call: ProductionPlatformCall,
  doctype: string,
  document: T,
): Promise<T & { name: string; modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không tạo được ${doctype}: ${(await response.text()).slice(0, 220)}`);
  const data = ((await response.json()) as { data?: T & { name?: string; modified?: string } }).data;
  if (!data?.name) throw new Error(`${doctype} đã tạo nhưng không trả về số chứng từ.`);
  return { ...data, name: data.name };
}

async function updateDoc(
  call: ProductionPlatformCall,
  doctype: string,
  name: string,
  document: Json,
): Promise<void> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không cập nhật được ${doctype} ${name}: ${(await response.text()).slice(0, 180)}`);
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
  if (!cutOrder) throw new Error("Thiếu số phiếu cắt để đồng bộ sơn.");

  await ensureListReadable(
    guardedCall,
    "Paint Job",
    ["name", "cut_order", "work_order", "batch_no", "state", "modified"],
    [["cut_order", "=", cutOrder]],
    200,
  );
  const existingRows = await listDocs<ExistingPaintJob>(
    guardedCall,
    "Paint Job",
    ["name", "cut_order", "work_order", "batch_no", "state", "modified"],
    [["cut_order", "=", cutOrder]],
    200,
  );

  if (direction === -1) {
    const cancelled: string[] = [];
    for (const row of existingRows) {
      const name = text(row.name);
      if (!name || row.state === "Đã huỷ") continue;
      await updateDoc(guardedCall, "Paint Job", name, { state: "Đã huỷ", modified: row.modified });
      cancelled.push(name);
    }
    return { cut_order: cutOrder, created: [], existing: [], cancelled };
  }

  const cut = await readDoc<Json>(guardedCall, "Cut Order", cutOrder);
  const workOrder = text(cut.work_order);
  if (!workOrder) return { cut_order: cutOrder, created: [], existing: [], cancelled: [] };
  const work = await readDoc<Json>(guardedCall, "Work Order", workOrder);
  const targetColor = text(cut.target_color ?? work.color);
  if (!targetColor) return { cut_order: cutOrder, created: [], existing: [], cancelled: [] };

  const activeByBatch = new Map<string, string>();
  for (const row of existingRows) {
    if (row.state === "Đã huỷ") continue;
    const name = text(row.name);
    const batchNo = text(row.batch_no);
    if (!name) continue;
    if (!batchNo) {
      throw new Error(`Paint Job ${name} thiếu lô nhôm; không thể chống trùng an toàn.`);
    }
    const prior = activeByBatch.get(batchNo);
    if (prior && prior !== name) {
      throw new Error(`Lô ${batchNo} có nhiều Paint Job đang hoạt động: ${prior}, ${name}.`);
    }
    activeByBatch.set(batchNo, name);
  }

  const targets = new Map<string, { item_code: string; source_color: string; qty: number }>();
  const batchCache = new Map<string, Json>();
  const rows = Array.isArray(cut.items)
    ? cut.items.filter((row): row is Json => Boolean(row) && typeof row === "object")
    : [];

  for (const [index, row] of rows.entries()) {
    const bundleName = text(row.serial_and_batch_bundle);
    if (!bundleName) continue;
    const bundle = await readDoc<Json>(guardedCall, "Serial and Batch Bundle", bundleName);
    const entries = Array.isArray(bundle.entries)
      ? bundle.entries.filter((entry): entry is Json => Boolean(entry) && typeof entry === "object")
      : [];
    for (const entry of entries) {
      const batchNo = text(entry.batch_no);
      if (!batchNo) continue;
      let batch = batchCache.get(batchNo);
      if (!batch) {
        batch = await readDoc<Json>(guardedCall, "Batch", batchNo);
        batchCache.set(batchNo, batch);
      }
      if (!["thô", "tho"].includes(normalized(batch.condition))) continue;
      const rawQty = entry.qty ?? (entries.length === 1 ? row.sheets_cut : undefined);
      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(`Dòng cắt ${index + 1}, lô ${batchNo}: số lượng sơn phải lớn hơn 0.`);
      }
      const itemCode = text(row.item_code ?? batch.item_code);
      const sourceColor = text(batch.color);
      const prior = targets.get(batchNo);
      if (prior && prior.item_code && itemCode && prior.item_code !== itemCode) {
        throw new Error(`Lô ${batchNo} xuất hiện với hai mã vật tư khác nhau.`);
      }
      targets.set(batchNo, {
        item_code: prior?.item_code || itemCode,
        source_color: prior?.source_color || sourceColor,
        qty: Number(((prior?.qty ?? 0) + qty).toFixed(6)),
      });
    }
  }

  const created: string[] = [];
  const existing: string[] = [];
  for (const [batchNo, target] of targets) {
    const prior = activeByBatch.get(batchNo);
    if (prior) {
      existing.push(prior);
      continue;
    }
    const job = await createDoc(guardedCall, "Paint Job", {
      work_order: workOrder,
      production_request: work.production_request,
      production_request_line_key: work.production_request_line_key,
      cut_order: cutOrder,
      batch_no: batchNo,
      item_code: target.item_code,
      source_color: target.source_color,
      target_color: targetColor,
      qty: target.qty,
      state: "Chờ sơn",
      planned_on: new Date().toISOString(),
      note: `Tự sinh từ ${cutOrder}; lô ${batchNo} đang ở tình trạng THÔ.`,
    });
    created.push(job.name);
  }

  return { cut_order: cutOrder, created, existing, cancelled: [] };
}
