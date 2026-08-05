import { handlePurchaseSupplierDashboard } from "./purchase-supplier-dashboard.js";
import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;

const SCOPED_PURCHASE_RESOURCES = new Set([
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resourceDoctype(url: URL): string {
  const decoded = decodeURIComponent(url.pathname);
  const marker = "/resource/";
  const index = decoded.indexOf(marker);
  if (index < 0) return "";
  const tail = decoded.slice(index + marker.length);
  return tail.includes("/") ? "" : tail;
}

function scopedResourceFilters(url: URL, company: string): void {
  const doctype = resourceDoctype(url);
  if (!SCOPED_PURCHASE_RESOURCES.has(doctype)) return;

  const raw = url.searchParams.get("filters");
  const filters = raw ? JSON.parse(raw) as unknown : [];
  if (!Array.isArray(filters)) throw new Error(`${doctype}: filters không phải mảng.`);

  const companyFilters = filters.filter((entry): entry is unknown[] => Array.isArray(entry) && entry[0] === "company");
  for (const entry of companyFilters) {
    if (entry[1] !== "=" || text(entry[2]) !== company) {
      throw new Error(`${doctype}: truy vấn cố dùng Công ty khác Business Context.`);
    }
  }
  if (!companyFilters.length) filters.push(["company", "=", company]);
  url.searchParams.set("filters", JSON.stringify(filters));
}

function scopedDebtSummary(url: URL, company: string): void {
  const decoded = decodeURIComponent(url.pathname);
  if (!decoded.endsWith("/method/frappe.desk.query_report.run")) return;
  if (url.searchParams.get("report_name") !== "Debt Summary") return;

  const raw = url.searchParams.get("filters");
  const filters = (raw ? JSON.parse(raw) : {}) as Json;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    throw new Error("Debt Summary: filters không phải object.");
  }
  if (text(filters.company) && text(filters.company) !== company) {
    throw new Error("Debt Summary: truy vấn cố dùng Công ty khác Business Context.");
  }
  filters.company = company;
  url.searchParams.set("filters", JSON.stringify(filters));
}

function scopedPlatform(upstream: Fetcher | undefined, company: string): Fetcher {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      scopedResourceFilters(url, company);
      scopedDebtSummary(url, company);
      const scoped = new Request(url.toString(), request);
      return upstream ? upstream.fetch(scoped) : globalThis.fetch(scoped);
    },
  } as Fetcher;
}

/**
 * Supplier delivery/payable dashboard is a multi-document read model. Supplier alone is not
 * a sufficient scope in a multi-company tenant: the same supplier can trade with more than
 * one company. This wrapper makes the Business Context company mandatory and injects it into
 * every canonical Purchase Order / Receipt / Invoice list query and Payment Ledger Debt
 * Summary query before delegating to the established dashboard implementation.
 */
export async function handleCompanyScopedPurchaseSupplierDashboard(
  request: Request,
  env: PurchaseFifoEnv,
): Promise<Response> {
  const body = await request.clone().json().catch(() => ({})) as { args?: Json };
  const company = text(body.args?.company);
  if (!company) return json({ message: "Cần chọn Công ty trên thanh ngữ cảnh trước khi xem báo cáo mua hàng." }, 422);

  return handlePurchaseSupplierDashboard(request, {
    ...env,
    PLATFORM: scopedPlatform(env.PLATFORM, company),
  });
}
