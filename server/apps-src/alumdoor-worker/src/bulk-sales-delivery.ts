import { roundTo } from "./numeric.js";
type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

interface SalesOrderDoc extends Json {
  name: string;
  modified?: string;
  docstatus?: number;
  customer?: string;
  company?: string;
  currency?: string;
  transaction_date?: string;
  delivery_date?: string;
  install_address?: string;
  items?: Json[];
}

interface DeliveryDoc extends Json {
  name: string;
  docstatus?: number;
  against_sales_order?: string;
  items?: Json[];
}

const MAX_SOURCE_ORDERS = 50;
const MAX_DELIVERY_LINES = 200;

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function refuse(message: string, status = 422): Response { return responseJson({ message }, status); }

function callbackPath(request: Request): string {
  const raw = request.headers.get("x-cloudforge-callback") || "";
  if (!raw) throw new Error("missing x-cloudforge-callback");
  const url = new URL(raw);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}/`;
}

function platformCaller(request: Request, platform?: Fetcher): PlatformCall {
  const base = callbackPath(request);
  return async (path, init = {}) => {
    const headers = new Headers(init.headers);
    for (const name of ["authorization", "x-cloudforge-tenant", "x-cloudforge-app", "x-cloudforge-identity", "x-cloudforge-identity-signature"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const outbound = new Request(new URL(path.replace(/^\//, ""), base), { ...init, headers });
    return platform ? platform.fetch(outbound) : fetch(outbound);
  };
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function listDocs<T extends Json>(call: PlatformCall, doctype: string, fields: string[], filters: unknown[], limit = 500): Promise<T[]> {
  const query = new URLSearchParams({ fields: JSON.stringify(fields), filters: JSON.stringify(filters), limit_page_length: String(limit) });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T[] }).data ?? []);
}

async function selectedOrders(call: PlatformCall, customer: string, requested: string[]): Promise<SalesOrderDoc[]> {
  const listed = await listDocs<{ name?: string }>(call, "Sales Order", ["name"], [["customer", "=", customer], ["docstatus", "=", 1]], MAX_SOURCE_ORDERS);
  const names = listed.map((row) => text(row.name)).filter(Boolean);
  const unique = [...new Set(names.map(text).filter(Boolean))];
  if (unique.length > MAX_SOURCE_ORDERS) throw new Error(`Mỗi phiếu chỉ được chọn tối đa ${MAX_SOURCE_ORDERS} Đơn bán.`);
  const missing = requested.filter((name) => !unique.includes(name));
  if (missing.length) throw new Error(`Đơn bán không còn hợp lệ cho khách hàng này: ${missing.join(", ")}.`);
  return Promise.all(unique.map((name) => readDoc<SalesOrderDoc>(call, "Sales Order", name)));
}

async function deliveredQuantities(call: PlatformCall, customer: string, selected: Set<string>): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const listed = await listDocs<{ name?: string }>(call, "Delivery Note", ["name"], [["customer", "=", customer], ["docstatus", "=", 1]], 500);
  const notes = await Promise.all(listed.map((row) => text(row.name)).filter(Boolean).map((name) => readDoc<DeliveryDoc>(call, "Delivery Note", name)));
  for (const note of notes) {
    for (const line of note.items ?? []) {
      const order = text(line.sales_order ?? note.against_sales_order);
      if (!selected.has(order)) continue;
      const sourceRow = text(line.sales_order_row_id);
      if (!sourceRow) continue;
      const key = `${order}\u0000${sourceRow}`;
      result.set(key, roundTo((result.get(key) ?? 0) + number(line.qty)));
    }
  }
  return result;
}

function sourceRowId(line: Json, index: number): string { return text(line.row_id ?? line.name) || `ROW-${index + 1}`; }

function copyDeliveryLine(order: SalesOrderDoc, line: Json, index: number, outstanding: number, warehouse: string): Json {
  const ordered = number(line.qty);
  const orderedStock = number(line.stock_qty ?? line.qty);
  const stockQty = ordered > 0 ? roundTo(orderedStock * outstanding / ordered) : outstanding;
  const sourceRow = sourceRowId(line, index);
  const targetWarehouse = warehouse || text(line.warehouse);
  if (!targetWarehouse) throw new Error(`${order.name} dòng ${sourceRow} chưa có Kho xuất.`);
  return {
    ...line,
    row_id: `DN-${order.name}-${sourceRow}`.slice(0, 140),
    sales_order: order.name,
    sales_order_row_id: sourceRow,
    sales_order_item: sourceRow,
    delivery_request: text(line.delivery_request),
    ordered_qty: ordered,
    delivered_qty_before: roundTo(Math.max(0, ordered - outstanding)),
    outstanding_qty: outstanding,
    delivery_qty: outstanding,
    delivery_stock_qty: stockQty,
    qty: outstanding,
    stock_qty: stockQty,
    warehouse: targetWarehouse,
    stock_consumption_basis: "Sales Order physical line only",
  };
}

async function buildPlan(call: PlatformCall, args: Json): Promise<Json> {
  const customer = text(args.customer);
  const warehouse = text(args.warehouse);
  const postingAt = text(args.posting_at) || new Date().toISOString();
  if (!customer) throw new Error("Cần chọn Khách hàng.");
  if (Number.isNaN(Date.parse(postingAt))) throw new Error("Ngày/giờ giao hàng không hợp lệ.");

  const requested = Array.isArray(args.sales_orders) ? args.sales_orders.map(text).filter(Boolean) : [];
  const orders = await selectedOrders(call, customer, requested);
  const selected = new Set(requested);
  const candidateNames = new Set(orders.map((order) => order.name));
  const delivered = await deliveredQuantities(call, customer, candidateNames);
  const companies = new Set<string>();
  const currencies = new Set<string>();
  const deliveryAddresses = new Set<string>();
  const candidates: Json[] = [];
  const items: Json[] = [];
  const postingDate = postingAt.slice(0, 10);

  const chosenOrders = orders.filter((order) => selected.has(order.name));
  for (const order of chosenOrders) {
    if (Number(order.docstatus ?? 0) !== 1) throw new Error(`Đơn bán ${order.name} chưa ghi sổ.`);
    if (text(order.customer) !== customer) throw new Error(`Đơn bán ${order.name} không thuộc khách hàng ${customer}.`);
    if (text(order.transaction_date).slice(0, 10) > postingDate) throw new Error(`Đơn bán ${order.name} có ngày sau ngày Phiếu giao.`);
    if (text(order.company)) companies.add(text(order.company));
    if (text(order.currency)) currencies.add(text(order.currency));
    if (text(order.install_address)) deliveryAddresses.add(text(order.install_address));
    if (companies.size > 1) throw new Error("Các Đơn bán thuộc nhiều Công ty; phải tách Phiếu giao.");
    if (currencies.size > 1) throw new Error("Các Đơn bán dùng nhiều Tiền tệ; phải tách Phiếu giao.");
    if (deliveryAddresses.size > 1) throw new Error("Các Đơn bán có nhiều địa chỉ giao/lắp đặt; mặc định phải tách Phiếu giao.");
  }
  const selectedCompany = [...companies][0] ?? "";
  const selectedCurrency = [...currencies][0] ?? "";
  const selectedAddress = [...deliveryAddresses][0] ?? "";

  for (const order of orders.sort((left, right) => text(left.transaction_date).localeCompare(text(right.transaction_date)) || left.name.localeCompare(right.name))) {
    for (const [index, line] of (order.items ?? []).entries()) {
      const sourceRow = sourceRowId(line, index);
      const ordered = number(line.qty);
      const already = delivered.get(`${order.name}\u0000${sourceRow}`) ?? 0;
      const outstanding = roundTo(Math.max(0, ordered - already));
      if (outstanding <= 0) continue;
      const candidate = {
        selected: requested.includes(order.name), sales_order: order.name, sales_order_row_id: sourceRow,
        transaction_date: order.transaction_date, delivery_date: order.delivery_date, modified: order.modified,
        item_code: line.item_code, item_name: line.item_name, color: line.color,
        material_specification: line.material_specification, warehouse: warehouse || line.warehouse,
        uom: line.uom, stock_uom: line.stock_uom, ordered_qty: ordered, delivered_qty: already,
        outstanding_qty: outstanding, delivery_qty: outstanding,
        delivery_stock_qty: ordered > 0 ? roundTo(number(line.stock_qty ?? line.qty) * outstanding / ordered) : outstanding,
        conversion_factor: line.conversion_factor, rate: line.rate,
      };
      candidates.push(candidate);
      if (selected.has(order.name)) items.push(copyDeliveryLine(order, line, index, outstanding, warehouse));
    }
  }
  if (items.length > MAX_DELIVERY_LINES) throw new Error(`Phiếu giao vượt ${MAX_DELIVERY_LINES} dòng; phải tách phiếu.`);
  return {
    customer, company: selectedCompany, currency: selectedCurrency, posting_at: postingAt,
    sales_orders: requested,
    source_documents: orders.map((order) => {
      const outstandingLines = candidates.filter((line) => line.sales_order === order.name).length;
      const disabled_reason = !outstandingLines ? "Đã giao đủ"
        : text(order.transaction_date).slice(0, 10) > postingDate ? "Ngày đơn sau ngày giao"
        : selectedCompany && text(order.company) !== selectedCompany ? "Khác công ty với đơn đã chọn"
        : selectedCurrency && text(order.currency) !== selectedCurrency ? "Khác tiền tệ với đơn đã chọn"
        : selectedAddress && text(order.install_address) !== selectedAddress ? "Khác địa chỉ giao với đơn đã chọn"
        : "";
      return {
        selected: requested.includes(order.name), sales_order: order.name, transaction_date: order.transaction_date,
        delivery_date: order.delivery_date, company: order.company, currency: order.currency, modified: order.modified,
        outstanding_lines: outstandingLines, disabled_reason,
      };
    }),
    source_lines: candidates, items,
    install_address: text(args.install_address) || text(chosenOrders[0]?.install_address) || text(orders[0]?.install_address),
  };
}

async function previewStock(call: PlatformCall, plan: Json): Promise<unknown> {
  if (!Array.isArray(plan.items) || !plan.items.length) return null;
  const response = await call("method/metaforge.api.preview_delivery_document", {
    method: "POST",
    body: JSON.stringify({ document: {
      issue_purpose: "Bán hàng", customer: plan.customer, company: plan.company, currency: plan.currency,
      posting_at: plan.posting_at, items: plan.items,
    } }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: unknown; exception?: unknown };
    const detail = text(payload.message ?? payload.exception);
    throw new Error(`Không xem trước được FIFO kho (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return ((await response.json()) as { message?: unknown }).message ?? null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function existingDelivery(call: PlatformCall, key: string): Promise<DeliveryDoc | undefined> {
  const rows = await listDocs<{ name?: string }>(call, "Delivery Note", ["name"], [["delivery_batch_key", "=", key]], 2);
  const name = text(rows[0]?.name);
  return name ? readDoc<DeliveryDoc>(call, "Delivery Note", name) : undefined;
}

export async function handleBulkSalesDelivery(request: Request, platform: Fetcher | undefined, create: boolean): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return refuse("not a platform call", 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const call = platformCaller(request, platform);
    const plan = await buildPlan(call, args);
    const selected = new Set(Array.isArray(args.sales_orders) ? args.sales_orders.map(text).filter(Boolean) : []);
    if (!selected.size) return responseJson({ ...plan, items: [], inventory_preview: null,
      message: "Chọn một hoặc nhiều Đơn bán còn hàng để xem phân bổ." });
    if (!Array.isArray(plan.items) || !plan.items.length) throw new Error("Các Đơn bán đã chọn không còn số lượng phải giao.");
    const inventoryPreview = await previewStock(call, plan);
    const fingerprint = await sha256(JSON.stringify({ customer: plan.customer, company: plan.company, currency: plan.currency,
      posting_at: plan.posting_at, sales_orders: [...selected].sort(), items: plan.items }));
    const deliveryKey = `multi-so:${fingerprint}`;
    const result = { ...plan, inventory_preview: inventoryPreview, delivery_batch_key: deliveryKey,
      line_count: plan.items.length, message: `${selected.size} Đơn bán sẽ tạo một Phiếu giao nháp; FIFO được tính lại khi submit.` };
    if (!create) return responseJson(result);
    const existing = await existingDelivery(call, deliveryKey);
    if (existing) return responseJson({ ...result, doctype: "Delivery Note", name: existing.name,
      delivery_note: existing.name, draft: Number(existing.docstatus ?? 0) === 0, replayed: true });
    const response = await call("resource/Delivery%20Note", { method: "POST", body: JSON.stringify({
      issue_purpose: "Bán hàng", customer: plan.customer, company: plan.company, currency: plan.currency,
      posting_at: plan.posting_at, install_address: plan.install_address, delivery_batch_key: deliveryKey,
      source_sales_orders: [...selected].sort(), items: plan.items,
      note: `[multi-so:${fingerprint}] Một phiếu giao từ ${selected.size} Đơn bán. Không bung BOM.`,
    }) });
    if (!response.ok) throw new Error(`Không tạo được Phiếu giao (HTTP ${response.status}).`);
    const delivery = ((await response.json()) as { data?: { name?: string } }).data?.name;
    if (!delivery) throw new Error("Nền tảng tạo Phiếu giao nhưng không trả mã chứng từ.");
    return responseJson({ ...result, doctype: "Delivery Note", name: delivery, delivery_note: delivery, draft: true, replayed: false });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không xử lý được Phiếu giao nhiều Đơn bán.");
  }
}
