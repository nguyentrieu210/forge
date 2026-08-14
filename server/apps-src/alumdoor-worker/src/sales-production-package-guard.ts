import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;

/**
 * #866 SELECTABLE Sales Package rows are commercial parent/child rows. Until Selling exposes
 * one canonical physical-obligation projection, neither the parent residual nor its priced
 * children may be interpreted as independent AlumDoor production demand.
 */
export async function guardSalesProductionPackageSemantics(
  request: Request,
  env: PurchaseFifoEnv,
): Promise<Response | null> {
  try {
    const body = await request.clone().json().catch(() => ({})) as { args?: Json };
    const order = text(body.args?.sales_order);
    if (!order) return null;
    const declared = request.headers.get("x-cloudforge-callback");
    if (!declared) return refuse("Nền tảng không cấp địa chỉ gọi ngược để kiểm tra Đơn hàng.");
    const base = declared.replace(/\/$/, "");
    const response = await (env.PLATFORM ? env.PLATFORM.fetch.bind(env.PLATFORM) : fetch)(new Request(
      `${base}/resource/Sales%20Order/${encodeURIComponent(order)}`,
      {
        headers: {
          authorization: request.headers.get("authorization") ?? "",
          "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
          "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
          "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
        },
      },
    ));
    if (!response.ok) return refuse(`Không đọc được Sales Order ${order} để xác định nghĩa vụ vật lý (HTTP ${response.status}).`);
    const sales = ((await response.json()) as { data?: Json }).data ?? {};
    const blocked = selectablePackageRows(sales.items);
    if (blocked.length === 0) return null;
    return refuse(
      `Đơn hàng ${order} có ${blocked.length} dòng Tách món SELECTABLE chưa được resolve nghĩa vụ vật lý. `
      + `Từ chối tạo/preview sản xuất để tránh phát lệnh trùng hoặc sai hàng.`,
      "PHYSICAL_OBLIGATION_UNRESOLVED_SELECTABLE_PACKAGE",
    );
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không kiểm tra được nghĩa vụ vật lý của Đơn hàng.");
  }
}

export function selectablePackageRows(value: unknown): Json[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Json => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const record = row as Json;
    return Boolean(text(record.sales_package_group_key) || text(record.sales_package_parent_key));
  });
}

function refuse(message: string, code?: string): Response {
  return new Response(JSON.stringify({ message, ...(code ? { code } : {}) }), {
    status: 422,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : "";
}
