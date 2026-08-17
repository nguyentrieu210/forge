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
    assertBomMaterial({
      work_order: workOrderName,
      bom_no: authority.bom_no,
      bom_items: authority.items,
      item_code: text(row.item_code),
      warehouse: text(row.source_warehouse) || text(cutOrder.source_warehouse),
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
