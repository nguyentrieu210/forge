import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;
interface Timeline extends Json { supplier_debt_reports?: Array<{ rows?: Json[] }>; }

const PAGE_SIZE = 200;
const MAX_ORDERS = 5_000;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function settlementOperation(value: unknown): "Close" | "Reverse" | null {
  const normalized = text(value).toLocaleLowerCase("vi");
  if (["close", "đối soát", "doi soat"].includes(normalized)) return "Close";
  if (["reverse", "đảo đối soát", "dao doi soat"].includes(normalized)) return "Reverse";
  return null;
}

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function listSubmittedOrderNames(call: PlatformCall, supplier?: string): Promise<string[]> {
  const names: string[] = [];
  for (let start = 0; start < MAX_ORDERS; start += PAGE_SIZE) {
    const filters: unknown[] = [["docstatus", "=", 1]];
    if (supplier) filters.unshift(["supplier", "=", supplier]);
    const query = new URLSearchParams({
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify(filters),
      limit_start: String(start),
      limit_page_length: String(PAGE_SIZE),
      order_by: "name asc",
    });
    const response = await call(`resource/Purchase%20Order?${query}`);
    if (!response.ok) throw new Error("Không đọc được danh sách đơn mua để đối soát.");
    const page = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? [])
      .map((row) => text(row.name))
      .filter(Boolean);
    names.push(...page);
    if (page.length < PAGE_SIZE) return names;
    if (start + PAGE_SIZE >= MAX_ORDERS) {
      throw new Error(`Có từ ${MAX_ORDERS} đơn mua trở lên; từ chối chọn kỳ đối soát từ dữ liệu bị cắt cụt.`);
    }
  }
  return names;
}

async function loadTimeline(call: PlatformCall, orderName: string): Promise<Timeline | null> {
  const query = new URLSearchParams({ doctype: "Purchase Order", name: orderName });
  const response = await call(`method/metaforge.api.get_purchase_allocation_timeline?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { message?: Timeline | null }).message ?? null;
}

async function resolveWindow(
  call: PlatformCall,
  requestedSupplier: string,
  queueKey: string,
  operation: "Close" | "Reverse",
): Promise<{ window_id: string; window_sequence: number; status: string; supplier: string }> {
  const names = await listSubmittedOrderNames(call, requestedSupplier || undefined);
  const candidates = new Map<string, { window_id: string; window_sequence: number; status: string; supplier: string }>();

  for (let index = 0; index < names.length; index += 16) {
    const timelines = await Promise.all(names.slice(index, index + 16).map((name) => loadTimeline(call, name)));
    for (const timeline of timelines) {
      for (const report of timeline?.supplier_debt_reports ?? []) {
        for (const row of report.rows ?? []) {
          if (text(row.queue_key) !== queueKey || !text(row.window_id)) continue;
          const supplier = text(row.supplier);
          if (requestedSupplier && supplier && supplier !== requestedSupplier) continue;
          candidates.set(text(row.window_id), {
            window_id: text(row.window_id),
            window_sequence: numeric(row.window_sequence),
            status: text(row.window_status) || "Open",
            supplier,
          });
        }
      }
    }
  }

  const wanted = operation === "Close" ? "Open" : "Settled";
  const match = [...candidates.values()]
    .filter((row) => row.status === wanted)
    .sort((a, b) => b.window_sequence - a.window_sequence || b.window_id.localeCompare(a.window_id))[0];
  if (!match) {
    throw new Error(operation === "Close"
      ? "Quy cách này không có kỳ giao hàng đang mở để đối soát."
      : "Quy cách này không có kỳ đã đối soát có thể đảo.");
  }
  return match;
}

export async function handlePurchaseSupplierSettlement(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const requestedSupplier = text(args.supplier);
    const queueKey = text(args.queue_key);
    const operation = settlementOperation(args.operation);
    const reason = text(args.reason);
    if (!queueKey) throw new Error("Thiếu mã luồng vật tư cần đối soát.");
    if (!operation) throw new Error("Thao tác đối soát không hợp lệ.");
    if (reason.length < 3) throw new Error("Lý do đối soát phải có ít nhất 3 ký tự.");

    const call = platformCaller(request, env);
    const window = await resolveWindow(call, requestedSupplier, queueKey, operation);
    const supplier = window.supplier || requestedSupplier;
    if (!supplier) throw new Error("Không xác định được nhà cung cấp của luồng vật tư.");

    const createdResponse = await call("resource/Purchase%20Settlement", {
      method: "POST",
      body: JSON.stringify({
        operation,
        queue_key: queueKey,
        window_id: window.window_id,
        reason,
      }),
    });
    if (!createdResponse.ok) {
      throw new Error(`Không tạo được chứng từ đối soát: ${(await createdResponse.text()).slice(0, 300)}`);
    }
    const created = ((await createdResponse.json()) as { data?: Json }).data;
    if (!created || !text(created.name)) throw new Error("Nền tảng không trả chứng từ đối soát vừa tạo.");

    const submittedResponse = await call("method/frappe.client.submit", {
      method: "POST",
      body: JSON.stringify({ doc: JSON.stringify(created) }),
    });
    if (!submittedResponse.ok) {
      throw new Error(`Không ghi sổ được đối soát: ${(await submittedResponse.text()).slice(0, 300)}`);
    }
    const payload = await submittedResponse.json() as { data?: Json; message?: Json };
    const submitted = payload.data ?? payload.message ?? created;
    return answer({
      ok: true,
      operation,
      supplier,
      queue_key: queueKey,
      window_id: window.window_id,
      window_sequence: window.window_sequence,
      doctype: "Purchase Settlement",
      name: text(submitted.name ?? created.name),
      settlement: submitted,
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không xử lý được đối soát giao hàng." }, 422);
  }
}
