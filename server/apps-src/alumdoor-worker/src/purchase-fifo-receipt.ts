import {
  allocateBarsFifo,
  type FifoBarAllocation,
  type FifoBarBalance,
} from "./index.js";

export interface PurchaseFifoEnv {
  PLATFORM?: Fetcher;
}

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
  items?: Json[];
}

export interface FifoDebtSummary {
  ordered_bars: number;
  received_bars_before: number;
  delivered_bars_now: number;
  received_bars_after: number;
  tolerance_pct: number;
  tolerance_bars: number;
  nominal_remaining_bars: number;
  minimum_additional_bars_to_settle: number;
  maximum_additional_bars_allowed: number;
  nominal_remaining_meters: number;
  minimum_additional_meters_to_settle: number;
  maximum_additional_meters_allowed: number;
}

export interface PurchaseFifoHistoryRow {
  purchase_receipt: string;
  posting_at: string;
  supplier_invoice_no: string;
  purchase_order: string;
  item_code: string;
  length_m: number;
  theoretical_kg_per_m: number;
  qty_bar: number;
  total_length_m: number;
  barem_weight_kg: number;
  actual_weight_kg: number | null;
  color: string;
  is_stamped: "Có" | "Không";
  note: string;
}

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

function supplierKey(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]/g, "");
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

export function resolveSupplierReceiptTolerance(
  supplier: string,
  supplierDoc: Json | null,
): { tolerance_pct: number; source: "supplier" | "tien_dat_default" | "default_zero" } {
  const configured = supplierDoc?.receipt_tolerance_pct;
  if (configured !== undefined && configured !== null && configured !== "") {
    const tolerance = Number(configured);
    if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 50) {
      throw new Error("Dung sai giao nhận của nhà cung cấp phải từ 0 đến 50%.");
    }
    return { tolerance_pct: tolerance, source: "supplier" };
  }
  const identity = supplierKey(supplierDoc?.supplier_name ?? supplier);
  if (identity === "tiendat") return { tolerance_pct: 5, source: "tien_dat_default" };
  return { tolerance_pct: 0, source: "default_zero" };
}

export function buildFifoDebtSummary(
  balances: readonly FifoBarBalance[],
  deliveredBarsNow: number,
  tolerancePct: number,
  lengthM: number,
): FifoDebtSummary {
  const ordered = balances.reduce((sum, row) => sum + finiteNonNegative(row.ordered_bars, "Số cây đặt"), 0);
  const receivedBefore = balances.reduce((sum, row) => sum + finiteNonNegative(row.received_bars, "Số cây đã nhận"), 0);
  const delivered = finiteNonNegative(deliveredBarsNow, "Số cây nhận lần này");
  const length = finitePositive(lengthM, "Chiều dài cây");
  if (!Number.isFinite(tolerancePct) || tolerancePct < 0 || tolerancePct > 50) {
    throw new Error("Dung sai giao nhận phải từ 0 đến 50%.");
  }
  const toleranceBars = ordered * tolerancePct / 100;
  const receivedAfter = receivedBefore + delivered;
  const minimumTotal = Math.max(0, ordered - toleranceBars);
  const maximumTotal = ordered + toleranceBars;
  const nominalRemaining = Math.max(0, ordered - receivedAfter);
  const minimumAdditional = Math.max(0, minimumTotal - receivedAfter);
  const maximumAdditional = Math.max(0, maximumTotal - receivedAfter);
  return {
    ordered_bars: round(ordered),
    received_bars_before: round(receivedBefore),
    delivered_bars_now: round(delivered),
    received_bars_after: round(receivedAfter),
    tolerance_pct: round(tolerancePct),
    tolerance_bars: round(toleranceBars),
    nominal_remaining_bars: round(nominalRemaining),
    minimum_additional_bars_to_settle: round(minimumAdditional),
    maximum_additional_bars_allowed: round(maximumAdditional),
    nominal_remaining_meters: round(nominalRemaining * length),
    minimum_additional_meters_to_settle: round(minimumAdditional * length),
    maximum_additional_meters_allowed: round(maximumAdditional * length),
  };
}

function sameAluminiumShape(line: Json, args: Json): boolean {
  if (text(line.item_code) !== text(args.item_code)) return false;
  const length = Number(args.length_m);
  if (!Number.isFinite(length) || Math.abs(Number(line.length_m) - length) > 1e-6) return false;
  if (text(line.color) !== text(args.color)) return false;
  return checked(line.is_stamped) === checked(args.is_stamped);
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

async function listSubmitted(
  call: PlatformCall,
  doctype: "Purchase Order" | "Purchase Receipt",
  supplier: string,
): Promise<PurchaseDoc[]> {
  const query = new URLSearchParams({
    fields: JSON.stringify(["name"]),
    filters: JSON.stringify([["supplier", "=", supplier], ["docstatus", "=", 1]]),
    limit_page_length: "500",
  });
  const listed = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!listed.ok) throw new Error(`Không đọc được danh sách ${doctype} đã ghi sổ của ${supplier}.`);
  const names = (((await listed.json()) as { data?: Array<{ name?: string }> }).data ?? [])
    .map((row) => text(row.name))
    .filter(Boolean);
  return Promise.all(names.map((name) => readDoc<PurchaseDoc>(call, doctype, name)));
}

function historyAndReceived(
  receipts: PurchaseDoc[],
  args: Json,
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
  args: Json,
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
  const values = balances
    .map((row) => Number(row.source_line.theoretical_kg_per_m))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => round(value));
  const unique = [...new Set(values)];
  if (!unique.length) throw new Error("Các đơn mua chưa có trọng lượng định mức kg/m.");
  if (unique.length > 1) {
    throw new Error(`Cùng mã/quy cách đang có nhiều trọng lượng định mức: ${unique.join(", ")} kg/m.`);
  }
  return unique[0]!;
}

function allocationRows(
  allocations: FifoBarAllocation[],
  lengthM: number,
  actualKg: number,
  deliveredBars: number,
): Array<Record<string, unknown>> {
  const actualPerBar = actualKg / deliveredBars;
  return allocations.map((allocation) => {
    const kgPerM = Number(allocation.source_line.theoretical_kg_per_m);
    return {
      purchase_order: allocation.purchase_order,
      order_date: allocation.transaction_date,
      kind: allocation.kind,
      allocated_bars: round(allocation.allocated_bars),
      allocated_meters: round(allocation.allocated_bars * lengthM),
      barem_weight_kg: round(allocation.allocated_bars * lengthM * kgPerM),
      actual_weight_kg: round(allocation.allocated_bars * actualPerBar),
    };
  });
}

function orderBalanceRows(
  balances: FifoBarBalance[],
  allocations: FifoBarAllocation[],
  lengthM: number,
  tolerancePct: number,
): Array<Record<string, unknown>> {
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
      nominal_remaining_meters: round(nominalRemaining * lengthM),
      tolerance_min_total_bars: round(balance.ordered_bars * (1 - tolerancePct / 100)),
      tolerance_max_total_bars: round(balance.ordered_bars * (1 + tolerancePct / 100)),
    };
  });
}

async function handleFifo(
  request: Request,
  env: PurchaseFifoEnv,
  create: boolean,
): Promise<Response> {
  const answer = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return answer({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const args = body.args ?? {};
    const supplier = text(args.supplier);
    const itemCode = text(args.item_code);
    const deliveredBars = finitePositive(args.qty_bar, "Số cây thực nhận");
    const lengthM = finitePositive(args.length_m, "Chiều dài cây");
    const actualKg = finitePositive(args.actual_weight_kg, "Tổng kg thực cân");
    const rate = finiteNonNegative(args.rate ?? 0, "Đơn giá theo Kg");
    const color = text(args.color);
    const stamped = text(args.is_stamped);
    const warehouse = text(args.warehouse);
    if (!supplier || !itemCode) throw new Error("Cần chọn Nhà cung cấp và Mã hàng.");
    if (!color) throw new Error("Cần chọn Màu.");
    if (stamped !== "Có" && stamped !== "Không") throw new Error("Cần chọn Dập là Có hoặc Không.");
    if (!warehouse) throw new Error("Cần chọn Kho nhập.");

    const call = platformCaller(request, env);
    const [supplierDoc, orders, receipts] = await Promise.all([
      readDoc<Json>(call, "Supplier", supplier),
      listSubmitted(call, "Purchase Order", supplier),
      listSubmitted(call, "Purchase Receipt", supplier),
    ]);
    const tolerance = resolveSupplierReceiptTolerance(supplier, supplierDoc);
    const { history, receivedByOrder } = historyAndReceived(receipts, args);
    const balances = buildBalances(orders, receivedByOrder, args, tolerance.tolerance_pct);
    if (!balances.length) throw new Error(`Không có đơn mua đã ghi sổ phù hợp cho ${itemCode}, ${lengthM} m, ${color}, ${stamped}.`);
    const kgPerM = kgPerMetreOf(balances);
    const allocations = allocateBarsFifo(balances, deliveredBars, tolerance.tolerance_pct);
    const debt = buildFifoDebtSummary(balances, deliveredBars, tolerance.tolerance_pct, lengthM);
    const plannedAllocations = allocationRows(allocations, lengthM, actualKg, deliveredBars);
    const orderBalances = orderBalanceRows(balances, allocations, lengthM, tolerance.tolerance_pct);
    const actualPerBar = actualKg / deliveredBars;
    const items = allocations.map((allocation, index) => {
      const source = allocation.source_line;
      const quantityKg = actualPerBar * allocation.allocated_bars;
      const baremKg = lengthM * kgPerM * allocation.allocated_bars;
      return {
        row_id: `FIFO-${index + 1}`,
        item_code: itemCode,
        item_name: source.item_name,
        inventory_mode: "Nhôm cây/lá",
        measurement_profile: source.measurement_profile ?? "Nhôm cây/lá",
        stock_uom: "Kg",
        material_specification: source.material_specification,
        theoretical_kg_per_m: kgPerM,
        theoretical_kg: round(baremKg),
        length_m: lengthM,
        qty_bar: round(allocation.allocated_bars),
        qty_bundle: source.qty_bundle,
        total_length_m: round(lengthM * allocation.allocated_bars),
        qty: round(quantityKg),
        actual_weight_kg: round(quantityKg),
        uom: "Kg",
        conversion_factor: 1,
        stock_qty: round(quantityKg),
        rate,
        amount: round(quantityKg * rate),
        color,
        is_stamped: stamped,
        so_no: source.so_no,
        warehouse,
        purchase_order: allocation.purchase_order,
        note: `FIFO ${allocation.kind.toLowerCase()} · đơn ngày ${allocation.transaction_date}`,
      };
    });
    const message = `Sau lần nhận này, nợ danh nghĩa còn ${debt.nominal_remaining_bars} cây (${debt.nominal_remaining_meters} m); khoảng giao thêm hợp lệ là ${debt.minimum_additional_bars_to_settle}–${debt.maximum_additional_bars_allowed} cây.`;
    const result = {
      supplier,
      item_code: itemCode,
      length_m: lengthM,
      theoretical_kg_per_m: kgPerM,
      delivered_bars: deliveredBars,
      delivered_meters: round(deliveredBars * lengthM),
      delivered_barem_weight_kg: round(deliveredBars * lengthM * kgPerM),
      actual_weight_kg: actualKg,
      tolerance_pct: tolerance.tolerance_pct,
      tolerance_source: tolerance.source,
      debt,
      allocations: plannedAllocations,
      order_balances: orderBalances,
      receipt_history: history,
      items,
      message,
    };
    if (!create) return answer(result);

    const firstOrder = orders.find((order) => order.name === allocations[0]?.purchase_order);
    const created = await call("resource/Purchase%20Receipt", {
      method: "POST",
      body: JSON.stringify({
        supplier,
        company: firstOrder?.company,
        currency: firstOrder?.currency,
        posting_at: new Date().toISOString(),
        ...(args.supplier_invoice_no ? { supplier_invoice_no: text(args.supplier_invoice_no) } : {}),
        ...(args.driver ? { driver: text(args.driver) } : {}),
        items,
        note: `Phân bổ FIFO ${deliveredBars} cây ${itemCode}; ${message}`,
      }),
    });
    if (!created.ok) throw new Error(`Không tạo được phiếu nhập FIFO: ${(await created.text()).slice(0, 200)}`);
    const receipt = ((await created.json()) as { data?: { name?: string } }).data?.name ?? "";
    return answer({ ...result, purchase_receipt: receipt, draft: true });
  } catch (error) {
    return answer({ message: error instanceof Error ? error.message : "Không xử lý được nhập nhôm FIFO." }, 422);
  }
}

export async function handlePurchaseFifoRequest(
  request: Request,
  env: PurchaseFifoEnv,
  create: boolean,
): Promise<Response> {
  return handleFifo(request, env, create);
}
