type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

export interface PurchaseItemPriceHistoryEnv {
  PLATFORM?: Fetcher;
}

interface PurchaseLine extends Json {
  name?: string;
  parent?: string;
  item_code?: string;
  rate?: number | string;
  purchase_order?: string;
  modified?: string;
}

interface PurchaseParent extends Json {
  name?: string;
  supplier?: string;
  company?: string;
  transaction_date?: string;
  posting_at?: string;
  docstatus?: number | string;
}

export interface PurchasePriceHistoryRow {
  date: string;
  supplier: string;
  rate: number;
}

const PAGE_SIZE = 200;
const MAX_LINE_SCAN = 2_000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function numeric(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function platformCaller(request: Request, env: PurchaseItemPriceHistoryEnv): PlatformCall {
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
      headers: {
        "content-type": "application/json",
        ...forwarded,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function listItemLines(
  call: PlatformCall,
  doctype: "Purchase Order Item" | "Purchase Receipt Item",
  itemCode: string,
): Promise<PurchaseLine[]> {
  const output: PurchaseLine[] = [];
  const fields = doctype === "Purchase Receipt Item"
    ? ["name", "parent", "item_code", "rate", "purchase_order", "modified"]
    : ["name", "parent", "item_code", "rate", "modified"];

  for (let start = 0; start < MAX_LINE_SCAN; start += PAGE_SIZE) {
    const query = new URLSearchParams({
      fields: JSON.stringify(fields),
      filters: JSON.stringify([["item_code", "=", itemCode]]),
      order_by: "modified desc",
      limit_start: String(start),
      limit_page_length: String(PAGE_SIZE),
    });
    const response = await call(`resource/${encodeURIComponent(doctype)}?${query.toString()}`);
    if (!response.ok) throw new Error(`Không đọc được lịch sử ${doctype} (HTTP ${response.status}).`);
    const body = await response.json() as { data?: PurchaseLine[] };
    const page = Array.isArray(body.data) ? body.data : [];
    output.push(...page);
    if (page.length < PAGE_SIZE) return output;
  }
  throw new Error(`${doctype}: lịch sử của ${itemCode} vượt ${MAX_LINE_SCAN} dòng; từ chối cắt cụt dữ liệu.`);
}

async function readParent(call: PlatformCall, doctype: string, name: string): Promise<PurchaseParent | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: PurchaseParent }).data ?? null;
}

async function readParents(
  call: PlatformCall,
  doctype: string,
  names: string[],
): Promise<Map<string, PurchaseParent>> {
  const output = new Map<string, PurchaseParent>();
  for (let start = 0; start < names.length; start += 20) {
    const batch = await Promise.all(names.slice(start, start + 20).map(async (name) => [name, await readParent(call, doctype, name)] as const));
    for (const [name, parent] of batch) if (parent) output.set(name, parent);
  }
  return output;
}

function parentDate(doctype: string, parent: PurchaseParent): string {
  const raw = doctype === "Purchase Order" ? parent.transaction_date : parent.posting_at;
  return text(raw).slice(0, 10);
}

function normalizeRows(
  doctype: "Purchase Order" | "Purchase Receipt",
  lines: PurchaseLine[],
  parents: Map<string, PurchaseParent>,
  company: string,
  supplier: string,
): PurchasePriceHistoryRow[] {
  const rows: PurchasePriceHistoryRow[] = [];
  for (const line of lines) {
    // A Purchase Receipt linked to a Purchase Order is the same commercial purchase.
    // Keep the PO price once; only direct receipts supplement PO history.
    if (doctype === "Purchase Receipt" && text(line.purchase_order)) continue;
    const parentName = text(line.parent);
    const parent = parents.get(parentName);
    if (!parent || Number(parent.docstatus) !== 1 || text(parent.company) !== company) continue;
    const parentSupplier = text(parent.supplier);
    if (!parentSupplier || (supplier && parentSupplier !== supplier)) continue;
    const rate = numeric(line.rate);
    const date = parentDate(doctype, parent);
    if (rate === undefined || !date) continue;
    rows.push({ date, supplier: parentSupplier, rate });
  }
  return rows;
}

export async function buildPurchaseItemPriceHistory(
  call: PlatformCall,
  args: Json,
): Promise<{ rows: PurchasePriceHistoryRow[]; latest: PurchasePriceHistoryRow | null }> {
  const itemCode = text(args.item_code);
  const company = text(args.company);
  const supplier = text(args.supplier);
  if (!itemCode) throw new Error("Cần chọn Mặt hàng.");
  if (!company) throw new Error("Cần chọn Công ty trong ngữ cảnh làm việc.");
  const requestedLimit = Number(args.limit ?? DEFAULT_LIMIT);
  const limit = Number.isInteger(requestedLimit) ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit)) : DEFAULT_LIMIT;

  const [orderLines, receiptLines] = await Promise.all([
    listItemLines(call, "Purchase Order Item", itemCode),
    listItemLines(call, "Purchase Receipt Item", itemCode),
  ]);
  const orderNames = [...new Set(orderLines.map((row) => text(row.parent)).filter(Boolean))];
  const directReceiptLines = receiptLines.filter((row) => !text(row.purchase_order));
  const receiptNames = [...new Set(directReceiptLines.map((row) => text(row.parent)).filter(Boolean))];
  const [orders, receipts] = await Promise.all([
    readParents(call, "Purchase Order", orderNames),
    readParents(call, "Purchase Receipt", receiptNames),
  ]);

  const rows = [
    ...normalizeRows("Purchase Order", orderLines, orders, company, supplier),
    ...normalizeRows("Purchase Receipt", directReceiptLines, receipts, company, supplier),
  ]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit);
  return { rows, latest: rows[0] ?? null };
}

export async function handlePurchaseItemPriceHistory(
  request: Request,
  env: PurchaseItemPriceHistoryEnv,
): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return json({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const call = platformCaller(request, env);
    return json(await buildPurchaseItemPriceHistory(call, body.args ?? {}));
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "Không đọc được lịch sử giá mua." }, 422);
  }
}
