import { allocateBarsFifo, type FifoBarAllocation, type FifoBarBalance } from "./index.js";
import {
  buildFifoDebtSummary,
  resolveSupplierReceiptTolerance,
  type PurchaseFifoEnv,
  type PurchaseFifoHistoryRow,
} from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

interface PurchaseDoc extends Json {
  name: string;
  supplier?: string;
  company?: string;
  currency?: string;
  transaction_date?: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  against_purchase_order?: string;
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

interface LinePlan {
  args: NormalizedBulkLine;
  theoreticalKgPerM: number;
  debt: ReturnType<typeof buildFifoDebtSummary>;
  allocations: FifoBarAllocation[];
  allocationRows: Json[];
  orderBalanceRows: Json[];
  history: PurchaseFifoHistoryRow[];
  items: Json[];
}

const MAX_BULK_LINES = 100;
const round = (value: number, digits = 6): number => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["có", "co", "yes", "true"].includes(text(value).toLocaleLowerCase("vi"));
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

async function listDocs(
  call: PlatformCall,
  doctype: "Purchase Order" | "Purchase Receipt",
  filters: unknown[],
): Promise<PurchaseDoc[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify(filters),
    limit_page_length: "500",
  });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype}.`);
  const names = (((await response.json()) as { data?: Array<{ name?: string }> }).data ?? [])
    .map((row) => text(row.name))
    .filter(Boolean);
  return Promise.all(names.map((name) => readDoc<PurchaseDoc>(call, doctype, name)));
}

async function listSubmitted(call: PlatformCall, doctype: "Purchase Order" | "Purchase Receipt", supplier: string): Promise<PurchaseDoc[]> {
  return listDocs(call, doctype, [["supplier", "=", supplier], ["docstatus", "=", 1]]);
}

function sameAluminiumShape(line: Json, args: NormalizedBulkLine): boolean {
  if (text(line.item_code) !== args.item_code) return false;
  if (Math.abs(Number(line.length_m) - args.length_m) > 1e-6) return false;
  if (text(line.color) !== args.color) return false;
  return checked(line.is_stamped) === checked(args.is_stamped);
}

function historyAndReceived(
  receipts: PurchaseDoc[],
  args: NormalizedBulkLine,
): { history: PurchaseFifoHistoryRow[]; receivedByOrder: Map<string, number> } {
  const history: PurchaseFifoHistoryRow[] = [];
  const receivedByOrder = new Map<string, number>();
  for (const receipt of receipts) {
    for (const line of receipt.items ?? []) {
      if (!sameAluminiumShape(line, args)) continue;
      const order = text(line.purchase_order ?? receipt.against_purchase_order);
      const bars = Number(line.qty_bar);
      if (!order || !Number.isFinite(bars) || bars <= 0) continue;
      receivedByOrder.set(order, (receivedByOrder.get(order) ?? 0) + bars);
      const kgPerM = Number(line.theoretical_kg_per_m);
      const length = Number(line.length_m);
      const barem = Number(line.theoretical_kg);
      const actual = Number(line.actual_weight_kg ?? line.qty);
      history.push({
        purchase_receipt: receipt.name,
        posting_at: text(receipt.posting_at),
        supplier_invoice_no: text(receipt.supplier_invoice_no),
        purchase_order: order,
        item_code: text(line.item_code),
        length_m: Number.isFinite(length) ? round(length) : 0,
        theoretical_kg_per_m: Number.isFinite(kgPerM) ? round(kgPerM) : 0,
        qty_bar: round(bars),
        total_length_m: round(Number(line.total_length_m ?? length * bars) || 0),
        barem_weight_kg: Number.isFinite(barem) ? round(barem) : round(length * kgPerM * bars),
        actual_weight_kg: Number.isFinite(actual) && actual > 0 ? round(actual) : null,
        color: text(line.color),
        is_stamped: checked(line.is_stamped) ? "Có" : "Không",
        note: text(line.note),
      });
    }
  }
  history.sort((left, right) => left.posting_at.localeCompare(right.posting_at)
    || left.purchase_receipt.localeCompare(right.purchase_receipt)
    || left.purchase_order.localeCompare(right.purchase_order));
  return { history, receivedByOrder };
}

function buildBalances(
  orders: PurchaseDoc[],
  receivedByOrder: Map<string, number>,
  args: NormalizedBulkLine,
  tolerancePct: number,
): FifoBarBalance[] {
  const balances: FifoBarBalance[] = [];
  for (const order of orders) {
    let pool = receivedByOrder.get(order.name) ?? 0;
    for (const line of order.items ?? []) {
      if (!sameAluminiumShape(line, args)) continue;
      const bars = Number(line.qty_bar);
      if (!Number.isFinite(bars) || bars <= 0) continue;
      const lineCapacity = bars * (1 + tolerancePct / 100);
      const received = Math.min(pool, lineCapacity);
      pool = Math.max(0, pool - received);
      balances.push({
        purchase_order: order.name,
        transaction_date: text(order.transaction_date),
        ordered_bars: bars,
        received_bars: received,
        source_line: line,
      });
    }
    if (pool > 1e-6) {
      throw new Error(`Lịch sử nhận của ${order.name} vượt các dòng đặt phù hợp; cần kiểm tra chứng từ cũ.`);
    }
  }
  return balances;
}

function kgPerMetreOf(balances: FifoBarBalance[]): number {
  const unique = [...new Set(balances
    .map((row) => Number(row.source_line.theoretical_kg_per_m))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => round(value)))];
  if (!unique.length) throw new Error("Các đơn mua chưa có trọng lượng định mức kg/m.");
  if (unique.length > 1) throw new Error(`Cùng mã/quy cách đang có nhiều trọng lượng định mức: ${unique.join(", ")} kg/m.`);
  return unique[0]!;
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

function allocationRows(
  allocations: FifoBarAllocation[],
  args: NormalizedBulkLine,
): Json[] {
  const actualPerBar = args.actual_weight_kg / args.qty_bar;
  return allocations.map((allocation) => {
    const kgPerM = Number(allocation.source_line.theoretical_kg_per_m);
    return {
      purchase_order: allocation.purchase_order,
      order_date: allocation.transaction_date,
      kind: allocation.kind,
      allocated_bars: round(allocation.allocated_bars),
      allocated_meters: round(allocation.allocated_bars * args.length_m),
      barem_weight_kg: round(allocation.allocated_bars * args.length_m * kgPerM),
      actual_weight_kg: round(allocation.allocated_bars * actualPerBar),
    };
  });
}

function orderBalanceRows(
  balances: FifoBarBalance[],
  allocations: FifoBarAllocation[],
  args: NormalizedBulkLine,
  tolerancePct: number,
): Json[] {
  return balances.map((balance) => {
    const receivedNow = allocations
      .filter((entry) => entry.purchase_order === balance.purchase_order && entry.source_line === balance.source_line)
      .reduce((sum, entry) => sum + entry.allocated_bars, 0);
    const receivedAfter = balance.received_bars + receivedNow;
    const nominalRemaining = Math.max(0, balance.ordered_bars - receivedAfter);
    return {
      purchase_order: balance.purchase_order,
      order_date: balance.transaction_date,
      ordered_bars: round(balance.ordered_bars),
      received_bars_before: round(balance.received_bars),
      allocated_bars_now: round(receivedNow),
      received_bars_after: round(receivedAfter),
      nominal_remaining_bars: round(nominalRemaining),
      nominal_remaining_meters: round(nominalRemaining * args.length_m),
      tolerance_min_total_bars: round(balance.ordered_bars * (1 - tolerancePct / 100)),
      tolerance_max_total_bars: round(balance.ordered_bars * (1 + tolerancePct / 100)),
    };
  });
}

function planLine(
  orders: PurchaseDoc[],
  receipts: PurchaseDoc[],
  supplierDoc: Json,
  supplier: string,
  args: NormalizedBulkLine,
): LinePlan {
  const tolerance = resolveSupplierReceiptTolerance(supplier, supplierDoc);
  const { history, receivedByOrder } = historyAndReceived(receipts, args);
  const balances = buildBalances(orders, receivedByOrder, args, tolerance.tolerance_pct);
  if (!balances.length) {
    throw new Error(`Không có đơn mua đã ghi sổ phù hợp cho ${args.item_code}, ${args.length_m} m, ${args.color}, ${args.is_stamped}.`);
  }
  const kgPerM = kgPerMetreOf(balances);
  const allocations = allocateBarsFifo(balances, args.qty_bar, tolerance.tolerance_pct);
  const debt = buildFifoDebtSummary(balances, args.qty_bar, tolerance.tolerance_pct, args.length_m);
  const actualPerBar = args.actual_weight_kg / args.qty_bar;
  const items = allocations.map((allocation, index) => {
    const source = allocation.source_line;
    const quantityKg = actualPerBar * allocation.allocated_bars;
    const baremKg = args.length_m * kgPerM * allocation.allocated_bars;
    return {
      row_id: `FIFO-${index + 1}`,
      item_code: args.item_code,
      item_name: source.item_name,
      inventory_mode: "Nhôm cây/lá",
      measurement_profile: source.measurement_profile ?? "Nhôm cây/lá",
      stock_uom: "Kg",
      material_specification: source.material_specification,
      theoretical_kg_per_m: kgPerM,
      theoretical_kg: round(baremKg),
      length_m: args.length_m,
      qty_bar: round(allocation.allocated_bars),
      qty_bundle: source.qty_bundle,
      total_length_m: round(args.length_m * allocation.allocated_bars),
      qty: round(quantityKg),
      actual_weight_kg: round(quantityKg),
      uom: "Kg",
      conversion_factor: 1,
      stock_qty: round(quantityKg),
      rate: args.rate,
      amount: round(quantityKg * args.rate),
      color: args.color,
      is_stamped: args.is_stamped,
      so_no: source.so_no,
      warehouse: args.warehouse,
      purchase_order: allocation.purchase_order,
      note: `FIFO ${allocation.kind.toLowerCase()} · đơn ngày ${allocation.transaction_date}`,
    };
  });
  return {
    args,
    theoreticalKgPerM: kgPerM,
    debt,
    allocations,
    allocationRows: allocationRows(allocations, args),
    orderBalanceRows: orderBalanceRows(balances, allocations, args, tolerance.tolerance_pct),
    history,
    items,
  };
}

function historyKey(row: PurchaseFifoHistoryRow): string {
  return [row.purchase_receipt, row.purchase_order, row.item_code, row.length_m, row.color, row.is_stamped, row.qty_bar].join("\u001f");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function bulkFingerprint(supplier: string, warehouse: string, supplierInvoiceNo: string, driver: string, lines: NormalizedBulkLine[]): Promise<string> {
  return sha256(JSON.stringify({ supplier, warehouse, supplier_invoice_no: supplierInvoiceNo, driver, lines }));
}

async function findExistingReceipt(
  call: PlatformCall,
  supplier: string,
  supplierInvoiceNo: string,
  marker: string,
): Promise<{ exact?: PurchaseDoc; conflict?: PurchaseDoc }> {
  const candidates = [
    ...await listDocs(call, "Purchase Receipt", [["supplier", "=", supplier], ["supplier_invoice_no", "=", supplierInvoiceNo], ["docstatus", "=", 0]]),
    ...await listDocs(call, "Purchase Receipt", [["supplier", "=", supplier], ["supplier_invoice_no", "=", supplierInvoiceNo], ["docstatus", "=", 1]]),
  ];
  const exact = candidates.find((doc) => text(doc.note).includes(marker));
  if (exact) return { exact };
  return candidates.length ? { conflict: candidates[0] } : {};
}

function answer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

export async function handleBulkPurchaseFifoRequest(
  request: Request,
  env: PurchaseFifoEnv,
  create: boolean,
): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const rawArgs = body.args ?? {};
    const supplier = text(rawArgs.supplier);
    const warehouse = text(rawArgs.warehouse);
    const supplierInvoiceNo = text(rawArgs.supplier_invoice_no);
    const driver = text(rawArgs.driver);
    if (!supplier) throw new Error("Cần chọn Nhà cung cấp.");
    if (!warehouse) throw new Error("Cần chọn Kho nhập.");
    if (!supplierInvoiceNo) throw new Error("Nhập hàng loạt bắt buộc Số phiếu giao NCC để chống tạo trùng.");
    if (!Array.isArray(rawArgs.lines) || !rawArgs.lines.length) throw new Error("Cần ít nhất một dòng nhôm nhận.");
    if (rawArgs.lines.length > MAX_BULK_LINES) throw new Error(`Mỗi lần chỉ nhận tối đa ${MAX_BULK_LINES} dòng.`);
    const lines = rawArgs.lines.map((line, index) => normalizeLine(line, index, warehouse));

    const call = platformCaller(request, env);
    const fingerprint = await bulkFingerprint(supplier, warehouse, supplierInvoiceNo, driver, lines);
    const marker = `[bulk-fifo:${fingerprint}]`;

    // Commit có idempotency key từ supplier + supplier delivery note + normalized payload.
    // Exact retry trả lại chứng từ đã tạo; cùng số phiếu nhưng payload khác fail closed.
    if (create) {
      const existing = await findExistingReceipt(call, supplier, supplierInvoiceNo, marker);
      if (existing.exact) {
        return answer({
          doctype: "Purchase Receipt",
          name: existing.exact.name,
          purchase_receipt: existing.exact.name,
          draft: Number(existing.exact.docstatus ?? 0) === 0,
          replayed: true,
          message: `Yêu cầu này đã tạo ${existing.exact.name}; không tạo phiếu trùng.`,
        });
      }
      if (existing.conflict) {
        throw new Error(`Số phiếu giao NCC ${supplierInvoiceNo} đã gắn với ${existing.conflict.name}; dữ liệu lần này khác nên hệ thống không tạo trùng.`);
      }
    }

    const [supplierDoc, orders, submittedReceipts] = await Promise.all([
      readDoc<Json>(call, "Supplier", supplier),
      listSubmitted(call, "Purchase Order", supplier),
      listSubmitted(call, "Purchase Receipt", supplier),
    ]);
    if (!orders.length) throw new Error(`Không có đơn mua đã ghi sổ của ${supplier}.`);

    const workingReceipts = [...submittedReceipts];
    const orderByName = new Map(orders.map((order) => [order.name, order]));
    const companies = new Set<string>();
    const currencies = new Set<string>();
    const allItems: Json[] = [];
    const lineSummaries: Json[] = [];
    const allAllocations: Json[] = [];
    const allBalances: Json[] = [];
    const realHistory = new Map<string, PurchaseFifoHistoryRow>();
    const now = new Date().toISOString();

    lines.forEach((line, lineIndex) => {
      const plan = planLine(orders, workingReceipts, supplierDoc, supplier, line);
      plan.allocations.forEach((allocation) => {
        const order = orderByName.get(allocation.purchase_order);
        if (text(order?.company)) companies.add(text(order?.company));
        if (text(order?.currency)) currencies.add(text(order?.currency));
      });
      if (companies.size > 1) throw new Error("Các dòng đang phân bổ vào đơn mua thuộc nhiều Công ty; phải tách thành phiếu nhập riêng.");
      if (currencies.size > 1) throw new Error("Các dòng đang phân bổ vào đơn mua dùng nhiều Tiền tệ; phải tách thành phiếu nhập riêng.");

      const items = plan.items.map((item, itemIndex) => ({ ...item, row_id: `BULK-${lineIndex + 1}-${itemIndex + 1}` }));
      allItems.push(...items);
      lineSummaries.push({
        input_row: lineIndex + 1,
        item_code: line.item_code,
        length_m: line.length_m,
        qty_bar: line.qty_bar,
        actual_weight_kg: line.actual_weight_kg,
        theoretical_kg_per_m: plan.theoreticalKgPerM,
        barem_weight_kg: round(line.length_m * line.qty_bar * plan.theoreticalKgPerM),
        nominal_remaining_bars: plan.debt.nominal_remaining_bars,
        nominal_remaining_meters: plan.debt.nominal_remaining_meters,
        minimum_additional_bars_to_settle: plan.debt.minimum_additional_bars_to_settle,
        maximum_additional_bars_allowed: plan.debt.maximum_additional_bars_allowed,
      });
      allAllocations.push(...plan.allocationRows.map((row) => ({ input_row: lineIndex + 1, item_code: line.item_code, ...row })));
      allBalances.push(...plan.orderBalanceRows.map((row) => ({ input_row: lineIndex + 1, item_code: line.item_code, ...row })));
      for (const row of plan.history) {
        if (!row.purchase_receipt.startsWith("__bulk_preview_")) realHistory.set(historyKey(row), row);
      }

      // Dòng sau phải nhìn thấy lượng đã phân bổ của dòng trước ngay trong cùng payload,
      // nếu không hai dòng cùng quy cách có thể cùng ăn lại phần còn nợ của một đơn cũ.
      workingReceipts.push({
        name: `__bulk_preview_${lineIndex + 1}`,
        supplier,
        posting_at: now,
        supplier_invoice_no: supplierInvoiceNo,
        docstatus: 1,
        items,
      });
    });

    const totalBars = round(lines.reduce((sum, line) => sum + line.qty_bar, 0));
    const totalActualKg = round(lines.reduce((sum, line) => sum + line.actual_weight_kg, 0));
    const totalBaremKg = round(lineSummaries.reduce((sum, row) => sum + Number(row.barem_weight_kg ?? 0), 0));
    const result = {
      supplier,
      warehouse,
      supplier_invoice_no: supplierInvoiceNo,
      line_count: lines.length,
      item_count: allItems.length,
      total_qty_bar: totalBars,
      total_actual_weight_kg: totalActualKg,
      total_barem_weight_kg: totalBaremKg,
      line_summaries: lineSummaries,
      order_balances: allBalances,
      allocations: allAllocations,
      receipt_history: [...realHistory.values()],
      items: allItems,
      message: `${lines.length} dòng nhận (${totalBars} cây) sẽ tạo ${allItems.length} dòng Purchase Receipt nháp; chưa tăng tồn kho cho tới khi phiếu được kiểm và submit.`,
    };
    if (!create) return answer(result);

    const company = [...companies][0];
    const currency = [...currencies][0];
    const created = await call("resource/Purchase%20Receipt", {
      method: "POST",
      body: JSON.stringify({
        supplier,
        ...(company ? { company } : {}),
        ...(currency ? { currency } : {}),
        posting_at: now,
        supplier_invoice_no: supplierInvoiceNo,
        ...(driver ? { driver } : {}),
        items: allItems,
        note: `${marker} Nhập nhôm hàng loạt FIFO: ${lines.length} dòng, ${totalBars} cây. ${result.message}`,
      }),
    });
    if (!created.ok) throw new Error(`Không tạo được phiếu nhập hàng loạt: ${(await created.text()).slice(0, 300)}`);
    const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
    if (!receipt) throw new Error("Nền tảng tạo phiếu nhập nhưng không trả mã chứng từ.");
    return answer({ ...result, doctype: "Purchase Receipt", name: receipt, purchase_receipt: receipt, draft: true, replayed: false });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không xử lý được nhập nhôm hàng loạt." }, 422);
  }
}
