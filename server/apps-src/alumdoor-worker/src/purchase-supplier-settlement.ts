import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

interface Timeline extends Json {
  supplier_debt_reports?: Array<{ rows?: Json[] }>;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  return (path: string, init: RequestInit = {}) => env.PLATFORM
    ? env.PLATFORM.fetch(new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      }))
    : fetch(new Request(`${base}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
      }));
}

async function listSubmittedOrderNames(call: PlatformCall, supplier: string): Promise<string[]> {
  const names: string[] = [];
  for (let start = 0; start < 5_000; start += 200) {
    const query = new URLSearchParams({
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([["supplier", "=", supplier], ["docstatus", "=", 1]]),
      limit_start: String(start),
      limit_page_length: "200",
      order_by: "name asc",
    });
    const response = await call(`resource/Purchase%20Order?${query}`);
    if (!response.ok) throw new Error("Không đọc được danh sách đơn mua để đối soát.");
    const page = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? [])
      .map((row) => text(row.name)).filter(Boolean);
    names.push(...page);
    if (page.length < 200) return names;
  }
  throw new Error("Có quá nhiều đơn mua; từ chối chọn window từ dữ liệu bị cắt cụt.");
}

async function loadTimeline(call: PlatformCall, orderName: string): Promise<Timeline | null> {
  const query = new URLSearchParams({ doctype: "Purchase Order", name: orderName });
  const response = await call(`method/metaforge.api.get_purchase_allocation_timeline?${query}`);
  if (!response.ok) return null;
  return ((await response.json()) as { message?: Timeline | null }).message ?? null;
}

async function resolveWindow(
  call: PlatformCall,
  supplier: string,
  queueKey: string,
  operation: "Close" | "Reverse",
): Promise<{ window_id: string; window_sequence: number; status: string }> {
  const names = await listSubmittedOrderNames(call, supplier);
  const candidates = new Map<string, { window_id: string; window_sequence: number; status: string }>();
  for (let index = 0; index < names.length; index += 16) {
    const timelines = await Promise.all(names.slice(index, index + 16).map((name) => loadTimeline(call, name)));
    for (const timeline of timelines) {
      for (const report of timeline?.supplier_debt_reports ?? []) {
        for (const row of report.rows ?? []) {
          if (text(row.queue_key) !== queueKey) continue;
          const windowId = text(row.window_id);
          if (!windowId) continue;
          candidates.set(windowId, {
            window_id: windowId,
            window_sequence: numeric(row.window_sequence),
            status: text(row.window_status) || "Open",
          });
        }
      }
    }
  }
  const wanted = operation === "Close" ? "Open" : "Settled";
  const match = [...candidates.values()]
    .filter((row) => row.status === wanted)
    .sort((left, right) => right.window_sequence - left.window_sequence || right.window_id.localeCompare(left.window_id))[0];
  if (!match) throw new Error(operation === "Close"
    ? "Quy cách này không có kỳ giao hàng đang mở để đối soát."
    : "Quy cách này không có kỳ đã đối soát có thể đảo.");
  return match;
}

async function createAndSubmitSettlement(
  call: PlatformCall,
  operation: "Close" | "Reverse",
  queueKey: string,
  windowId: string,
  reason: string,
): Promise<Json> {
  const createdResponse = await call("resource/Purchase%20Settlement", {
    method: "POST",
    body: JSON.stringify({ operation, queue_key: queueKey, window_id: windowId, reason }),
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
  return (((await submittedResponse.json()) as { data?: Json; message?: Json }).data
    ?? ((await Promise.resolve({})) as Json));
}

export async function handlePurchaseSupplierSettlement(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const supplier = text(args.supplier);
    const queueKey = text(args.queue_key);
    const operation = text(args.operation) as "Close" | "Reverse";
    const reason = text(args.reason);
    if (!supplier) throw new Error("Cần Nhà cung cấp.");
    if (!queueKey) throw new Error("Thiếu mã luồng vật tư cần đối soát.");
    if (operation !== "Close" && operation !== "Reverse") throw new Error("Thao tác đối soát không hợp lệ.");
    if (reason.length < 3) throw new Error("Lý do đối soát phải có ít nhất 3 ký tự.");

    const call = platformCaller(request, env);
    const window = await resolveWindow(call, supplier, queueKey, operation);
    const createdResponse = await call("resource/Purchase%20Settlement", {
      method: "POST",
      body: JSON.stringify({ operation, queue_key: queueKey, window_id: window.window_id, reason }),
    });
    if (!createdResponse.ok) throw new Error(`Không tạo được chứng từ đối soát: ${(await createdResponse.text()).slice(0, 300)}`);
    const createdPayload = await createdResponse.json() as { data?: Json };
    const created = createdPayload.data;
    if (!created || !text(created.name)) throw new Error("Nền tảng không trả chứng từ đối soát vừa tạo.");
    const submittedResponse = await call("method/frappe.client.submit", {
      method: "POST",
      body: JSON.stringify({ doc: JSON.stringify(created) }),
    });
    if (!submittedResponse.ok) throw new Error(`Không ghi sổ được đối soát: ${(await submittedResponse.text()).slice(0, 300)}`);
    const submittedPayload = await submittedResponse.json() as { data?: Json; message?: Json };
    const submitted = submittedPayload.data ?? submittedPayload.message ?? created;
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
