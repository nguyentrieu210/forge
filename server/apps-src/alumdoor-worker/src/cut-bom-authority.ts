import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";
import type { PlatformCall } from "./platform-call.js";

type Json = Record<string, unknown>;

type CutAuthorityMethod = "alumdoor.cut.draft" | "alumdoor.cut.apply";

interface BomAuthority {
  bom_no: string;
  items: Json[];
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function rows(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    : [];
}

function answer(message: string, status = 422): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((((await response.json()) as { data?: T }).data ?? {}) as T);
}

async function loadWorkOrderBom(call: PlatformCall, workOrderName: string): Promise<BomAuthority> {
  const workOrder = await readDoc<Json>(call, "Work Order", workOrderName);
  const bomNo = text(workOrder.bom_no);
  if (!bomNo) {
    throw new Error(`Work Order ${workOrderName} thiếu bom_no; không thể xác minh vật tư cắt.`);
  }

  const bom = await readDoc<Json>(call, "Bill of Materials", bomNo);
  if (Number(bom.docstatus) !== 1) {
    throw new Error(`BOM ${bomNo} chưa ghi sổ; không được dùng làm authority cắt.`);
  }

  const productionItem = text(workOrder.production_item);
  const bomItem = text(bom.item);
  if (productionItem && bomItem && productionItem !== bomItem) {
    throw new Error(`BOM ${bomNo} thuộc ${bomItem}, không khớp thành phẩm ${productionItem} của Work Order ${workOrderName}.`);
  }

  return { bom_no: bomNo, items: rows(bom.items) };
}

function assertBomMaterial(input: {
  work_order: string;
  bom_no: string;
  bom_items: Json[];
  item_code: string;
  warehouse?: string;
}): void {
  const itemCode = text(input.item_code);
  if (!itemCode) throw new Error(`Work Order ${input.work_order}: dòng cắt thiếu mã vật tư.`);

  const matches = input.bom_items.filter((row) => text(row.item_code) === itemCode);
  if (!matches.length) {
    throw new Error(`Vật tư ${itemCode} không thuộc BOM ${input.bom_no} của Work Order ${input.work_order}.`);
  }

  const warehouse = text(input.warehouse);
  const allowedWarehouses = [...new Set(matches.map((row) => text(row.source_warehouse)).filter(Boolean))];
  if (warehouse && allowedWarehouses.length && !allowedWarehouses.includes(warehouse)) {
    throw new Error(`Kho ${warehouse} không khớp kho nguồn BOM cho ${itemCode}; BOM ${input.bom_no} chỉ cho phép ${allowedWarehouses.join(", ")}.`);
  }
}

async function assertOutwardBundleLineage(call: PlatformCall, input: {
  work_order: string;
  row_id: string;
  item_code: string;
  warehouse: string;
  source_batch_no: string;
  bundle_name: string;
  sheets_cut: number;
}): Promise<void> {
  const rowLabel = input.row_id || "dòng cắt";
  if (!input.source_batch_no) {
    throw new Error(`Work Order ${input.work_order}: ${rowLabel} thiếu source_batch_no; không thể chứng minh lô đem cắt.`);
  }
  if (!input.bundle_name) {
    throw new Error(`Work Order ${input.work_order}: ${rowLabel} thiếu bundle Outward.`);
  }

  const bundle = await readDoc<Json>(call, "Serial and Batch Bundle", input.bundle_name);
  if (Number(bundle.docstatus) !== 1) {
    throw new Error(`Bundle ${input.bundle_name} chưa ghi sổ; không được dùng để submit phiếu cắt.`);
  }
  if (text(bundle.type) !== "Outward") {
    throw new Error(`Bundle ${input.bundle_name} phải là Outward, hiện là ${text(bundle.type) || "trống"}.`);
  }
  if (text(bundle.item_code) !== input.item_code) {
    throw new Error(`Bundle ${input.bundle_name} thuộc ${text(bundle.item_code) || "mã trống"}, không khớp ${input.item_code}.`);
  }
  if (text(bundle.warehouse) !== input.warehouse) {
    throw new Error(`Bundle ${input.bundle_name} thuộc kho ${text(bundle.warehouse) || "trống"}, không khớp ${input.warehouse}.`);
  }

  const entries = rows(bundle.entries);
  if (entries.length !== 1) {
    throw new Error(`Bundle ${input.bundle_name} phải chứa đúng 1 lô nguồn cho ${rowLabel}.`);
  }
  const entry = entries[0] ?? {};
  if (text(entry.batch_no) !== input.source_batch_no) {
    throw new Error(`Bundle ${input.bundle_name} dùng lô ${text(entry.batch_no) || "trống"}, không khớp source batch ${input.source_batch_no}.`);
  }
  const bundleQty = Number(entry.qty);
  if (!Number.isFinite(bundleQty) || bundleQty <= 0 || Math.abs(bundleQty - input.sheets_cut) > 1e-9) {
    throw new Error(`Bundle ${input.bundle_name} có số lá ${bundleQty}, không khớp ${input.sheets_cut} lá của ${rowLabel}.`);
  }
}

async function assertOffcutBundleLineage(call: PlatformCall, input: {
  row_id: string;
  item_code: string;
  source_batch_no: string;
  bundle_name: string;
  sheets_cut: number;
}): Promise<void> {
  if (!input.bundle_name) return;
  const rowLabel = input.row_id || "dòng cắt";
  const bundle = await readDoc<Json>(call, "Serial and Batch Bundle", input.bundle_name);
  if (Number(bundle.docstatus) !== 1) {
    throw new Error(`Bundle đầu thừa ${input.bundle_name} chưa ghi sổ.`);
  }
  if (text(bundle.type) !== "Inward") {
    throw new Error(`Bundle đầu thừa ${input.bundle_name} phải là Inward, hiện là ${text(bundle.type) || "trống"}.`);
  }
  if (text(bundle.item_code) !== input.item_code) {
    throw new Error(`Bundle đầu thừa ${input.bundle_name} thuộc ${text(bundle.item_code) || "mã trống"}, không khớp ${input.item_code}.`);
  }

  const entries = rows(bundle.entries);
  if (entries.length !== 1) {
    throw new Error(`Bundle đầu thừa ${input.bundle_name} phải chứa đúng 1 lô con cho ${rowLabel}.`);
  }
  const entry = entries[0] ?? {};
  const offcutBatchNo = text(entry.batch_no);
  if (!offcutBatchNo) throw new Error(`Bundle đầu thừa ${input.bundle_name} thiếu batch_no.`);
  const bundleQty = Number(entry.qty);
  if (!Number.isFinite(bundleQty) || bundleQty <= 0 || Math.abs(bundleQty - input.sheets_cut) > 1e-9) {
    throw new Error(`Bundle đầu thừa ${input.bundle_name} có số lá ${bundleQty}, không khớp ${input.sheets_cut} lá của ${rowLabel}.`);
  }

  const offcutBatch = await readDoc<Json>(call, "Batch", offcutBatchNo);
  if (text(offcutBatch.item_code) !== input.item_code) {
    throw new Error(`Lô đầu thừa ${offcutBatchNo} thuộc ${text(offcutBatch.item_code) || "mã trống"}, không khớp ${input.item_code}.`);
  }
  if (text(offcutBatch.parent_batch) !== input.source_batch_no) {
    throw new Error(`Lô đầu thừa ${offcutBatchNo} có lô mẹ ${text(offcutBatch.parent_batch) || "trống"}, không khớp source batch ${input.source_batch_no}.`);
  }
  if (Number(offcutBatch.is_offcut) !== 1) {
    throw new Error(`Lô ${offcutBatchNo} không được đánh dấu là đầu thừa.`);
  }
  const bundleWarehouse = text(bundle.warehouse);
  const receivedWarehouse = text(offcutBatch.received_warehouse);
  if (!bundleWarehouse || receivedWarehouse !== bundleWarehouse) {
    throw new Error(`Lô đầu thừa ${offcutBatchNo} nhận tại ${receivedWarehouse || "kho trống"}, không khớp bundle ${bundleWarehouse || "kho trống"}.`);
  }
}

export async function validateCutDraftBomAuthority(call: PlatformCall, args: Json): Promise<void> {
  const workOrderName = text(args.work_order);
  if (!workOrderName) return;

  const authority = await loadWorkOrderBom(call, workOrderName);
  assertBomMaterial({
    work_order: workOrderName,
    bom_no: authority.bom_no,
    bom_items: authority.items,
    item_code: text(args.item_code),
    warehouse: text(args.warehouse),
  });
}

export async function validateCutApplyBomAuthority(call: PlatformCall, args: Json): Promise<void> {
  const cutOrderName = text(args.cut_order);
  if (!cutOrderName) return;

  const cutOrder = await readDoc<Json>(call, "Cut Order", cutOrderName);
  const workOrderName = text(cutOrder.work_order);
  if (!workOrderName) return;

  const authority = await loadWorkOrderBom(call, workOrderName);
  for (const row of rows(cutOrder.items)) {
    const itemCode = text(row.item_code);
    const warehouse = text(row.source_warehouse) || text(cutOrder.source_warehouse);
    const sourceBatchNo = text(row.source_batch_no);
    const sheetsCut = Number(row.sheets_cut);
    assertBomMaterial({
      work_order: workOrderName,
      bom_no: authority.bom_no,
      bom_items: authority.items,
      item_code: itemCode,
      warehouse,
    });
    await assertOutwardBundleLineage(call, {
      work_order: workOrderName,
      row_id: text(row.row_id),
      item_code: itemCode,
      warehouse,
      source_batch_no: sourceBatchNo,
      bundle_name: text(row.serial_and_batch_bundle),
      sheets_cut: sheetsCut,
    });
    await assertOffcutBundleLineage(call, {
      row_id: text(row.row_id),
      item_code: itemCode,
      source_batch_no: sourceBatchNo,
      bundle_name: text(row.offcut_bundle),
      sheets_cut: sheetsCut,
    });
  }
}

export async function guardCutBomAuthorityRequest(
  request: Request,
  env: PurchaseFifoEnv,
  method: CutAuthorityMethod,
): Promise<Response | null> {
  // Preserve the base worker's authentication/error behavior for non-platform traffic.
  if (!request.headers.get("x-cloudforge-tenant")) return null;

  try {
    const body = await request.clone().json().catch(() => ({})) as { args?: Json };
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    const call = platformCaller(request, env);
    if (method === "alumdoor.cut.draft") await validateCutDraftBomAuthority(call, args);
    else await validateCutApplyBomAuthority(call, args);
    return null;
  } catch (error) {
    return answer(error instanceof Error ? error.message : "Không xác minh được BOM authority cho phiếu cắt.");
  }
}

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược để xác minh BOM cắt.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  const call = (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
  return Object.assign(call, { via: env.PLATFORM ? "binding" : "fetch" });
}
