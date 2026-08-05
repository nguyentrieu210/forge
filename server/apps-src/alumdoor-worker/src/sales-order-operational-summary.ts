type Json = Record<string, unknown>;

interface Env {
  PLATFORM?: Fetcher;
}

type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

const PAGE_SIZE = 250;
const MAX_SALES_ORDERS = 10_000;
const MAX_PLANNING_ROWS = 20_000;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function platformCaller(request: Request, env: Env): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng chưa cấp địa chỉ callback để đọc trạng thái vận hành.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
    "x-cloudforge-tenant": request.headers.get("x-cloudforge-tenant") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function listPaged(
  call: PlatformCall,
  doctype: string,
  fields: string[],
  filters: unknown[],
  maxRows: number,
): Promise<Json[]> {
  const rows: Json[] = [];
  for (let start = 0; start < maxRows; start += PAGE_SIZE) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify(filters),
      limit_start: String(start),
      limit_page_length: String(PAGE_SIZE),
      order_by: "modified desc",
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
    if (!response.ok) throw new Error(`Không đọc được ${doctype} (HTTP ${response.status}).`);
    const page = ((await response.json()) as { data?: Json[] }).data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${doctype} vượt ${maxRows} bản ghi; từ chối cắt cụt trạng thái vận hành.`);
}

function latestBySource(rows: Json[], sourceField: string, allowed: Set<string>): Map<string, Json> {
  const result = new Map<string, Json>();
  for (const row of rows) {
    const source = text(row[sourceField]);
    if (!source || !allowed.has(source) || result.has(source)) continue;
    result.set(source, row);
  }
  return result;
}

function reservationState(rows: Json[]): { state: string; count: number; active: number; used: number; expired: number; released: number } {
  const counts = { active: 0, used: 0, expired: 0, released: 0 };
  for (const row of rows) {
    const state = text(row.state);
    if (state === "Đang giữ") counts.active += 1;
    else if (state === "Đã dùng") counts.used += 1;
    else if (state === "Hết hạn") counts.expired += 1;
    else if (state === "Đã nhả") counts.released += 1;
  }
  const state = counts.active ? "Đang giữ"
    : counts.used ? "Đã dùng"
      : counts.expired ? "Hết hạn"
        : counts.released ? "Đã nhả"
          : "Chưa giữ";
  return { state, count: rows.length, ...counts };
}

/**
 * Read model cho work queue bán hàng. Không ghi trạng thái riêng: Sales Order xác định scope,
 * Stock Reservation cho biết giữ vật tư, Production Request cho biết phát hành sản xuất và
 * Cut Order cho biết tiến độ cắt. Các planning docs không có Company riêng chỉ được trả về
 * nếu source Sales Order đã được chứng minh thuộc đúng Business Context company.
 */
export async function handleSalesOrderOperationalSummary(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.clone().json().catch(() => ({})) as { args?: Json };
    const company = text(body.args?.company);
    if (!company) return answer({ message: "Cần chọn Công ty trên thanh ngữ cảnh trước khi đọc trạng thái đơn hàng." }, 422);

    const call = platformCaller(request, env);
    const salesOrders = await listPaged(call, "Sales Order", ["name", "company", "docstatus", "status", "modified"], [
      ["docstatus", "=", 1],
      ["company", "=", company],
    ], MAX_SALES_ORDERS);
    const orderNames = new Set(salesOrders.map((row) => text(row.name)).filter(Boolean));
    if (!orderNames.size) return answer({ company, rows: [] });

    const [reservations, productionRequests, cutOrders] = await Promise.all([
      listPaged(call, "Stock Reservation", ["name", "source_doctype", "source_name", "state", "expires_at", "modified"], [
        ["source_doctype", "=", "Sales Order"],
      ], MAX_PLANNING_ROWS),
      listPaged(call, "Production Request", ["name", "sales_order", "request_state", "modified"], [], MAX_PLANNING_ROWS),
      listPaged(call, "Cut Order", ["name", "so_reference", "cut_state", "company", "modified"], [
        ["company", "=", company],
      ], MAX_PLANNING_ROWS),
    ]);

    const reservationsByOrder = new Map<string, Json[]>();
    for (const row of reservations) {
      const source = text(row.source_name);
      if (!orderNames.has(source)) continue;
      reservationsByOrder.set(source, [...(reservationsByOrder.get(source) ?? []), row]);
    }
    const productionByOrder = latestBySource(productionRequests, "sales_order", orderNames);
    const cutByOrder = latestBySource(cutOrders, "so_reference", orderNames);

    return answer({
      company,
      rows: [...orderNames].map((salesOrder) => {
        const hold = reservationState(reservationsByOrder.get(salesOrder) ?? []);
        const production = productionByOrder.get(salesOrder);
        const cut = cutByOrder.get(salesOrder);
        return {
          sales_order: salesOrder,
          reservation_state: hold.state,
          reservation_count: hold.count,
          active_reservations: hold.active,
          used_reservations: hold.used,
          expired_reservations: hold.expired,
          released_reservations: hold.released,
          production_request: text(production?.name) || null,
          production_state: text(production?.request_state) || null,
          cut_order: text(cut?.name) || null,
          cut_state: text(cut?.cut_state) || null,
        };
      }),
    });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không đọc được trạng thái vận hành đơn hàng." }, 422);
  }
}
