/**
 * Gộp kết quả FIFO của hai route server về MỘT hình dạng để bảng trên màn chỉ có một đường đọc.
 *
 * Đây là chỗ trả lời yêu cầu "đừng để luật ngủ": `allocateBarsFifo` đã chạy đúng ở server và
 * trả về đủ lớp phân bổ, nhưng nếu màn không in ra thì người dùng không giải trình được giá vốn.
 *
 * KHÔNG tính lại phân bổ. Chỉ ghép hai mảng server trả về:
 *  - `allocations[i]` — lớp FIFO thứ i (đơn mua nào, ngày nào, mấy cây, bao nhiêu kg);
 *  - `items[i]`       — chính dòng `Purchase Receipt Item` mà server dựng CHO lớp đó.
 * Hai mảng đồng chỉ số vì `items = allocations.map(...)` (`purchase-fifo-receipt.ts`), và route
 * hàng loạt nối thêm theo cùng thứ tự cho từng dòng nhập (`bulk-purchase-fifo-receipt.ts`).
 * Nhờ đó ĐƠN GIÁ/THÀNH TIỀN của từng lớp là số server ghi, không phải số màn nhân ra.
 */
import { numberValue, text, type Json } from "./model.js";
import type { FifoInsight } from "./model.js";
import type {
  BulkFifoLineSummary,
  BulkFifoReceiptResult,
  FifoAllocationRow,
  FifoOrderBalanceRow,
  FifoReceiptResult,
  PurchaseFifoHistoryRow,
} from "./server-contract.js";

export interface FifoLayerRow {
  index: number;
  purchase_order: string;
  order_date: string;
  kind: string;
  item_code: string;
  inputRow?: number;
  allocated_bars?: number;
  allocated_meters?: number;
  barem_weight_kg?: number;
  actual_weight_kg?: number;
  /** Đơn giá server ghi cho lớp này (theo Kg với nhôm cân thực). */
  rate?: number;
  rate_uom: string;
  amount?: number;
  /** Số CÒN LẠI của chính đơn mua đó sau lần nhận này, lấy từ `order_balances`. */
  remaining_bars_after?: number;
  remaining_meters_after?: number;
  ordered_bars?: number;
  received_bars_before?: number;
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((row): row is T => Boolean(row) && typeof row === "object") : [];
}

function balanceKey(order: string, itemCode: string, inputRow: number | undefined): string {
  return `${order}${itemCode}${inputRow ?? ""}`;
}

/**
 * Dựng bảng LỚP FIFO để in ra: thứ tự nhập (đơn cũ nhất trước), đơn giá, số còn lại.
 * Mọi con số đều copy nguyên từ payload; không phép tính nào ở đây.
 */
export function fifoLayers(insight: FifoInsight): FifoLayerRow[] {
  const balances = new Map<string, FifoOrderBalanceRow>();
  for (const balance of insight.orderBalances) {
    balances.set(balanceKey(text(balance.purchase_order), text(balance.item_code), balance.input_row), balance);
  }
  return insight.allocations.map((allocation, index) => {
    const item = (insight.items[index] ?? {}) as Json;
    const itemCode = text(allocation.item_code) || text(item.item_code);
    const order = text(allocation.purchase_order);
    const balance = balances.get(balanceKey(order, itemCode, allocation.input_row))
      ?? balances.get(balanceKey(order, "", allocation.input_row))
      ?? insight.orderBalances.find((row) => text(row.purchase_order) === order);
    const row: FifoLayerRow = {
      index: index + 1,
      purchase_order: order,
      order_date: text(allocation.order_date),
      kind: text(allocation.kind),
      item_code: itemCode,
      rate_uom: text(item.rate_uom) || text(item.uom) || "Kg",
    };
    if (allocation.input_row !== undefined) row.inputRow = allocation.input_row;
    const assign = <K extends keyof FifoLayerRow>(key: K, value: number | undefined) => {
      if (value !== undefined) row[key] = value as FifoLayerRow[K];
    };
    assign("allocated_bars", numberValue(allocation.allocated_bars));
    assign("allocated_meters", numberValue(allocation.allocated_meters));
    assign("barem_weight_kg", numberValue(allocation.barem_weight_kg));
    assign("actual_weight_kg", numberValue(allocation.actual_weight_kg));
    assign("rate", numberValue(item.rate));
    assign("amount", numberValue(item.amount));
    assign("remaining_bars_after", numberValue(balance?.nominal_remaining_bars));
    assign("remaining_meters_after", numberValue(balance?.nominal_remaining_meters));
    assign("ordered_bars", numberValue(balance?.ordered_bars));
    assign("received_bars_before", numberValue(balance?.received_bars_before));
    return row;
  });
}

export function insightFromSingle(result: FifoReceiptResult, created: boolean): FifoInsight {
  const insight: FifoInsight = {
    route: "single",
    allocations: asRows<FifoAllocationRow>(result.allocations),
    orderBalances: asRows<FifoOrderBalanceRow>(result.order_balances),
    history: asRows<PurchaseFifoHistoryRow>(result.receipt_history),
    items: asRows<Json>(result.items),
    lineSummaries: [],
    message: text(result.message),
    totals: {
      bars: numberValue(result.delivered_bars),
      actualKg: numberValue(result.actual_weight_kg),
      baremKg: numberValue(result.delivered_barem_weight_kg),
      lineCount: 1,
      itemCount: asRows<Json>(result.items).length,
    },
  };
  if (result.debt) insight.debt = result.debt;
  const tolerance = numberValue(result.tolerance_pct);
  if (tolerance !== undefined) insight.tolerancePct = tolerance;
  if (text(result.tolerance_source)) insight.toleranceSource = text(result.tolerance_source);
  const receipt = text(result.purchase_receipt) || text(result.name);
  if (created && receipt) insight.createdReceipt = receipt;
  if (result.replayed !== undefined) insight.replayed = Boolean(result.replayed);
  return insight;
}

export function insightFromBulk(result: BulkFifoReceiptResult, created: boolean): FifoInsight {
  const insight: FifoInsight = {
    route: "bulk",
    allocations: asRows<FifoAllocationRow>(result.allocations),
    orderBalances: asRows<FifoOrderBalanceRow>(result.order_balances),
    history: asRows<PurchaseFifoHistoryRow>(result.receipt_history),
    items: asRows<Json>(result.items),
    lineSummaries: asRows<BulkFifoLineSummary>(result.line_summaries),
    message: text(result.message),
    totals: {
      bars: numberValue(result.total_qty_bar),
      actualKg: numberValue(result.total_actual_weight_kg),
      baremKg: numberValue(result.total_barem_weight_kg),
      lineCount: numberValue(result.line_count),
      itemCount: numberValue(result.item_count),
    },
  };
  const receipt = text(result.purchase_receipt) || text(result.name);
  if (created && receipt) insight.createdReceipt = receipt;
  if (result.replayed !== undefined) insight.replayed = Boolean(result.replayed);
  return insight;
}
