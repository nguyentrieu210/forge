import { handlePurchaseFifoRequest, type PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

interface PurchaseDoc extends Json {
  name: string;
  supplier?: string;
  company?: string;
  currency?: string;
  supplier_invoice_no?: string;
  posting_at?: string;
  docstatus?: number;
  note?: string;
  items?: Json[];
}

interface NormalizedBulkLine extends Json {
  item_code: string;
  length_m: number;
  qty_bar: number;
  actual_weight_kg: number;
  rate: number;
  color: string;
  is_stamped: "Có" | "Không";
  warehouse: string;
}

interface FifoPreview extends Json {
  delivered_barem_weight_kg?: number;
  theoretical_kg_per_m?: number;
  debt?: Json;
  allocations?: Json[];
  order_balances?: Json[];
  receipt_history?: Json[];
  items?: Json[];
  message?: string;
}

const MAX_BULK_LINES = 100;
const SYNTHETIC_PREFIX = "__bulk_preview_";
const PURCHASE_RECEIPT_RESOURCE = "/resource/Purchase Receipt";

const round = (value: number, digits = 6): number => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function finitePositive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function finiteNonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function normalizePostingAt(value: unknown): string {
  const raw = text(value);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error("Ngày/giờ nhận hàng không hợp lệ.");
  return parsed.toISOString();
}

function normalizeLine(raw: unknown, rowIndex: number, warehouse: string): NormalizedBulkLine {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Dòng ${rowIndex + 1} không hợp lệ.`);
  const row = raw as Json;
  const itemCode = text(row.item_code);
  const color = text(row.color);
  const stamped = text(row.is_stamped);
  if (!itemCode) throw new Error(`Dòng ${rowIndex + 1}: cần Mã hàng.`);
  if (!color) throw new Error(`Dòng ${rowIndex + 1}: cần Màu.`);
  if (stamped !== "Có" && stamped !== "Không") throw new Error(`Dòng ${rowIndex + 1}: Dập chỉ nhận Có hoặc Không.`);
  return {
    item_code: itemCode,
    length_m: finitePositive(row.length_m, `Dòng ${rowIndex + 1}: Chiều dài cây`),
    qty_bar: finitePositive(row.qty_bar, `Dòng ${rowIndex + 1}: Số cây thực nhận`),
    actual_weight_kg: finitePositive(row.actual_weight_kg, `Dòng ${rowIndex + 1}: Kg thực cân`),
    rate: finiteNonNegative(row.rate ?? 0, `Dòng ${rowIndex + 1}: Đơn giá/kg`),
    color,
    is_stamped: stamped,
    warehouse,
  };
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

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function listReceiptDocs(call: PlatformCall, supplier: string, supplierInvoiceNo: string, docstatus: 0 | 1): Promise<PurchaseDoc[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["supplier", "=", supplier], ["supplier_invoice_no", "=", supplierInvoiceNo], ["docstatus", "=", docstatus]]),
    limit_page_length: "100",
  });
  const response = await call(`resource/Purchase%20Receipt?${query}`);
  if (!response.ok) throw new Error("Không kiểm tra được phiếu nhập trùng.");
  const names = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? []).map((row) => text(row.name)).filter(Boolean);
  return Promise.all(names.map((name) => readDoc<PurchaseDoc>(call, "Purchase Receipt", name)));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bulkFingerprint(supplier: string, warehouse: string, supplierInvoiceNo: string, driver: string, postingAt: string, lines: NormalizedBulkLine[]): Promise<string> {
  return sha256(JSON.stringify({ supplier, warehouse, supplier_invoice_no: supplierInvoiceNo, driver, posting_at: postingAt, lines }));
}

async function findExistingReceipt(call: PlatformCall, supplier: string, supplierInvoiceNo: string, marker: string): Promise<{ exact?: PurchaseDoc; conflict?: PurchaseDoc }> {
  const candidates = [...await listReceiptDocs(call, supplier, supplierInvoiceNo, 0), ...await listReceiptDocs(call, supplier, supplierInvoiceNo, 1)];
  const exact = candidates.find((doc) => text(doc.note).includes(marker));
  if (exact) return { exact };
  return candidates[0] ? { conflict: candidates[0] } : {};
}

function cloneHeaders(request: Request): Headers { const headers = new Headers(request.headers); headers.set("content-type", "application/json"); return headers; }
function responseJson(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function callbackResourcePath(pathname: string): string { const decoded = decodeURIComponent(pathname).replace(/\/+$/, ""); const resourceIndex = decoded.lastIndexOf("/resource/"); return resourceIndex >= 0 ? decoded.slice(resourceIndex) : decoded; }

function syntheticPlatform(baseEnv: PurchaseFifoEnv, syntheticReceipts: PurchaseDoc[]): Fetcher {
  return { async fetch(outbound: Request): Promise<Response> {
    const url = new URL(outbound.url); const path = callbackResourcePath(url.pathname);
    if (outbound.method === "GET" && path === PURCHASE_RECEIPT_RESOURCE) {
      const filters = JSON.parse(url.searchParams.get("filters") ?? "[]") as unknown[];
      const submitted = filters.some((entry) => Array.isArray(entry) && entry[0] === "docstatus" && Number(entry[2]) === 1);
      if (submitted) {
        const base = baseEnv.PLATFORM ? await baseEnv.PLATFORM.fetch(outbound) : await fetch(outbound);
        if (!base.ok) return base;
        const payload = await base.json() as { data?: Array<{ name?: string }> };
        return responseJson({ ...(payload as Json), data: [...(payload.data ?? []), ...syntheticReceipts.map((receipt) => ({ name: receipt.name }))] });
      }
    }
    const prefix = `${PURCHASE_RECEIPT_RESOURCE}/${SYNTHETIC_PREFIX}`;
    if (outbound.method === "GET" && path.startsWith(prefix)) {
      const receipt = syntheticReceipts.find((candidate) => candidate.name === path.slice(`${PURCHASE_RECEIPT_RESOURCE}/`.length));
      if (receipt) return responseJson({ data: receipt });
    }
    return baseEnv.PLATFORM ? baseEnv.PLATFORM.fetch(outbound) : fetch(outbound);
  } } as Fetcher;
}

async function previewLine(request: Request, env: PurchaseFifoEnv, line: NormalizedBulkLine, supplier: string, supplierInvoiceNo: string, driver: string, syntheticReceipts: PurchaseDoc[]): Promise<FifoPreview> {
  const subrequest = new Request(request.url, { method: "POST", headers: cloneHeaders(request), body: JSON.stringify({ args: { ...line, supplier, supplier_invoice_no: supplierInvoiceNo, driver } }) });
  const response = await handlePurchaseFifoRequest(subrequest, { ...env, PLATFORM: syntheticPlatform(env, syntheticReceipts) }, false);
  const payload = await response.json() as FifoPreview;
  if (!response.ok) throw new Error(text(payload.message) || `Dòng ${line.item_code} không preview được.`);
  return payload;
}

function uniqueHistory(rows: Json[]): Json[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const receipt = text(row.purchase_receipt); if (receipt.startsWith(SYNTHETIC_PREFIX)) return false;
    const key = [receipt, row.purchase_order, row.item_code, row.length_m, row.color, row.is_stamped, row.qty_bar].join("\u001f");
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}

export async function handleBulkPurchaseFifoRequest(request: Request, env: PurchaseFifoEnv, create: boolean): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return responseJson({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json }; const raw = body.args ?? {};
    const supplier = text(raw.supplier); const warehouse = text(raw.warehouse); const supplierInvoiceNo = text(raw.supplier_invoice_no); const driver = text(raw.driver); const postingAt = normalizePostingAt(raw.posting_at);
    if (!supplier) throw new Error("Cần chọn Nhà cung cấp.");
    if (!warehouse) throw new Error("Cần chọn Kho nhập.");
    if (!supplierInvoiceNo) throw new Error("Nhập hàng loạt bắt buộc Số phiếu giao NCC để chống tạo trùng.");
    if (!Array.isArray(raw.lines) || !raw.lines.length) throw new Error("Cần ít nhất một dòng nhôm nhận.");
    if (raw.lines.length > MAX_BULK_LINES) throw new Error(`Mỗi lần chỉ nhận tối đa ${MAX_BULK_LINES} dòng.`);
    const lines = raw.lines.map((line, index) => normalizeLine(line, index, warehouse));

    const call = platformCaller(request, env); const fingerprint = await bulkFingerprint(supplier, warehouse, supplierInvoiceNo, driver, postingAt, lines); const marker = `[bulk-fifo:${fingerprint}]`;
    if (create) {
      const existing = await findExistingReceipt(call, supplier, supplierInvoiceNo, marker);
      if (existing.exact) return responseJson({ doctype: "Purchase Receipt", name: existing.exact.name, purchase_receipt: existing.exact.name, draft: Number(existing.exact.docstatus ?? 0) === 0, replayed: true, message: `Yêu cầu này đã tạo ${existing.exact.name}; không tạo phiếu trùng.` });
      if (existing.conflict) throw new Error(`Số phiếu giao NCC ${supplierInvoiceNo} đã gắn với ${existing.conflict.name}; dữ liệu lần này khác nên hệ thống không tạo trùng.`);
    }

    const syntheticReceipts: PurchaseDoc[] = []; const allItems: Json[] = []; const lineSummaries: Json[] = []; const allAllocations: Json[] = []; const allBalances: Json[] = []; const allHistory: Json[] = [];
    const companyByOrder = new Map<string, string>(); const currencyByOrder = new Map<string, string>(); const companies = new Set<string>(); const currencies = new Set<string>();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]!; const preview = await previewLine(request, env, line, supplier, supplierInvoiceNo, driver, syntheticReceipts); const allocations = preview.allocations ?? [];
      for (const allocation of allocations) {
        const orderName = text(allocation.purchase_order); if (!orderName) continue;
        if (!companyByOrder.has(orderName)) { const order = await readDoc<PurchaseDoc>(call, "Purchase Order", orderName); companyByOrder.set(orderName, text(order.company)); currencyByOrder.set(orderName, text(order.currency)); }
        const company = companyByOrder.get(orderName); const currency = currencyByOrder.get(orderName); if (company) companies.add(company); if (currency) currencies.add(currency);
      }
      if (companies.size > 1) throw new Error("Các dòng đang phân bổ vào đơn mua thuộc nhiều Công ty; phải tách thành phiếu nhập riêng.");
      if (currencies.size > 1) throw new Error("Các dòng đang phân bổ vào đơn mua dùng nhiều Tiền tệ; phải tách thành phiếu nhập riêng.");

      const items = (preview.items ?? []).map((item, itemIndex) => ({ ...item, row_id: `BULK-${lineIndex + 1}-${itemIndex + 1}` })); allItems.push(...items);
      allAllocations.push(...allocations.map((row) => ({ input_row: lineIndex + 1, item_code: line.item_code, ...row })));
      allBalances.push(...(preview.order_balances ?? []).map((row) => ({ input_row: lineIndex + 1, item_code: line.item_code, ...row }))); allHistory.push(...(preview.receipt_history ?? []));
      const debt = preview.debt ?? {};
      lineSummaries.push({ input_row: lineIndex + 1, item_code: line.item_code, length_m: line.length_m, qty_bar: line.qty_bar, actual_weight_kg: line.actual_weight_kg, theoretical_kg_per_m: preview.theoretical_kg_per_m, barem_weight_kg: preview.delivered_barem_weight_kg, nominal_remaining_bars: debt.nominal_remaining_bars, nominal_remaining_meters: debt.nominal_remaining_meters, minimum_additional_bars_to_settle: debt.minimum_additional_bars_to_settle, maximum_additional_bars_allowed: debt.maximum_additional_bars_allowed });
      syntheticReceipts.push({ name: `${SYNTHETIC_PREFIX}${lineIndex + 1}`, supplier, posting_at: postingAt, supplier_invoice_no: supplierInvoiceNo, docstatus: 1, items });
    }

    const totalBars = round(lines.reduce((sum, line) => sum + line.qty_bar, 0)); const totalActualKg = round(lines.reduce((sum, line) => sum + line.actual_weight_kg, 0)); const totalBaremKg = round(lineSummaries.reduce((sum, row) => sum + Number(row.barem_weight_kg ?? 0), 0));
    const result = { supplier, warehouse, posting_at: postingAt, supplier_invoice_no: supplierInvoiceNo, line_count: lines.length, item_count: allItems.length, total_qty_bar: totalBars, total_actual_weight_kg: totalActualKg, total_barem_weight_kg: totalBaremKg, line_summaries: lineSummaries, order_balances: allBalances, allocations: allAllocations, receipt_history: uniqueHistory(allHistory), items: allItems, message: `${lines.length} dòng nhận (${totalBars} cây) sẽ tạo ${allItems.length} dòng Purchase Receipt nháp; chưa tăng tồn kho cho tới khi phiếu được kiểm và submit.` };
    if (!create) return responseJson(result);

    const company = [...companies][0]; const currency = [...currencies][0];
    const created = await call("resource/Purchase%20Receipt", { method: "POST", body: JSON.stringify({ supplier, ...(company ? { company } : {}), ...(currency ? { currency } : {}), posting_at: postingAt, supplier_invoice_no: supplierInvoiceNo, ...(driver ? { driver } : {}), items: allItems, note: `${marker} Nhập nhôm hàng loạt FIFO: ${lines.length} dòng, ${totalBars} cây. ${result.message}` }) });
    if (!created.ok) throw new Error(`Không tạo được phiếu nhập hàng loạt: ${(await created.text()).slice(0, 300)}`);
    const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? ""; if (!receipt) throw new Error("Nền tảng tạo phiếu nhập nhưng không trả mã chứng từ.");
    return responseJson({ ...result, doctype: "Purchase Receipt", name: receipt, purchase_receipt: receipt, draft: true, replayed: false });
  } catch (error) {
    return responseJson({ message: error instanceof Error ? error.message : "Không xử lý được nhập nhôm hàng loạt." }, 422);
  }
}
