import type { JsonObject, StockBundleUsageEntry, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { SerialBatchBundleData, SerialBatchBundleRow } from "./types.js";
import { deriveOutgoingValuation, type FifoAllocation } from "./valuation.js";

export interface TrackedStockRequest {
  itemCode: string;
  warehouse: string;
  qtyMicros: number;
  /**
   * Cân thật của cả dòng, khi mặt hàng cân theo kiện. Luôn ghi TRỊ TUYỆT ĐỐI — chiều do
   * `direction` quyết định, giống `stockValueMinor`.
   *
   * Bỏ trống = không cân theo kiện. Không mặc định 0: xem `StockLedgerEntry.actual_weight_micros`.
   */
  weightMicros?: number;
  direction: "Inward" | "Outward";
  postingAt: string;
  currency: string;
  currencyScale: number;
  valuationRateMinor: number;
  stockValueMinor: number;
  lineKey: string;
  /** Stable child-row identity from the source business document. */
  sourceRowId?: string;
  bundleName?: string;
  automaticFifoAllocations?: FifoAllocation[];
  allowNegativeStock?: boolean;
}

export interface TrackedStockResult {
  stock: StockLedgerEntry[];
  usages: StockBundleUsageEntry[];
  bundle?: SerialBatchBundleData;
  /**
   * Giá trị THẬT đã ghi vào sổ, trị tuyệt đối.
   *
   * Người gọi PHẢI dùng con số này cho bút toán giá vốn, không được dùng lại con số họ tự
   * tính trước khi gọi. Khi định giá theo từng lô, tổng của các lô KHÔNG bằng con số tính
   * theo cả dòng — và nếu sổ cái vẫn ghi con số cũ thì kho và sổ cái lệch nhau im lặng.
   */
  stockValueMinor: number;
}

interface ValidatedBundle {
  bundle: SerialBatchBundleData;
  rows: SerialBatchBundleRow[];
}

interface RowValuation {
  absoluteValue: number;
  rowRateMinor: number;
}

export async function buildTrackedStockLines(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest,
): Promise<TrackedStockResult> {
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", request.itemCode);
  const tracked = isTrackedItem(item);
  if (!request.bundleName) {
    if (tracked && context.command.action === "submit") {
      if (request.direction === "Outward" && request.automaticFifoAllocations?.length) {
        return automaticTrackedFifo(context, request, item ?? null);
      }
      throw errors.reference(`Serial and Batch Bundle is required for tracked Item ${request.itemCode}`);
    }
    return { stock: [baseLine(request)], usages: [], stockValueMinor: Math.abs(request.stockValueMinor) };
  }

  const bundleRequest = { ...request, bundleName: request.bundleName };
  const { bundle, rows } = await loadValidatedBundle(context, bundleRequest);
  const stock: StockLedgerEntry[] = [];
  let allocatedValue = 0;
  // Cân chia theo cùng KIỂU với tiền — tỉ lệ theo qty, dòng CUỐI nhận phần dư — chứ không
  // chia đều rồi làm tròn từng dòng. Chia đều thì tổng các dòng lệch tổng đã cân vài micro,
  // và sổ kg trôi dần mà sổ cây vẫn cân, không ai nhìn ra.
  //
  // Đây là con số ƯỚC theo tỉ lệ, không phải cân từng lô. Nhôm cân cả chuyến rồi mới chia
  // vào các lô, nên đúng bản chất là ước. Muốn số cân thật từng lô thì phải cân từng lô và
  // truyền `weight_micros` xuống từng dòng bundle — chưa cần cho nhánh nhập ở đợt này.
  const totalWeight = request.weightMicros == null ? null : Math.abs(request.weightMicros);
  let allocatedWeight = 0;

  for (const [index, row] of rows.entries()) {
    const qty = row.qty_micros!;
    await assertOutgoingRowAvailable(context, request, row, qty);
    const valuation = await resolveRowValuation(context, request, row, qty, index, rows.length, allocatedValue);
    allocatedValue += valuation.absoluteValue;
    const absoluteWeight = allocateRowWeight(totalWeight, allocatedWeight, qty, request.qtyMicros, index === rows.length - 1);
    if (absoluteWeight != null) allocatedWeight += absoluteWeight;
    stock.push(buildBundleStockLine(request, row, index, qty, tracked, valuation, absoluteWeight));
  }

  return {
    stock,
    stockValueMinor: allocatedValue,
    usages: [{ line_key: `BUNDLE-${request.lineKey}`, bundle_name: request.bundleName, item_code: request.itemCode, warehouse: request.warehouse, direction: request.direction, usage_delta: 1, posting_at: request.postingAt }],
    bundle,
  };
}

async function automaticTrackedFifo(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest,
  item: JsonObject | null,
): Promise<TrackedStockResult> {
  const allocations = request.automaticFifoAllocations ?? [];
  const hasBatch = item?.has_batch_no === true || item?.has_batch_no === 1;
  const hasSerial = item?.has_serial_no === true || item?.has_serial_no === 1;
  const total = allocations.reduce((sum, allocation) => sum + allocation.qty_micros, 0);
  if (total !== request.qtyMicros) throw errors.reference("Automatic FIFO allocation quantity does not match stock row");
  const stock: StockLedgerEntry[] = [];
  let stockValueMinor = 0;
  for (const [index, allocation] of allocations.entries()) {
    if (hasBatch && !allocation.batch_no) throw errors.reference(`FIFO layer ${allocation.source_line_key} has no Batch`);
    if (hasSerial && !allocation.serial_no) throw errors.reference(`FIFO layer ${allocation.source_line_key} has no Serial No`);
    if (hasSerial && allocation.qty_micros !== 1_000_000) throw errors.reference(`FIFO serial layer ${allocation.source_line_key} must equal one`);
    const row: SerialBatchBundleRow = {
      row_id: `AUTO-${index + 1}`,
      qty: fromScaledInt(allocation.qty_micros, 6),
      qty_micros: allocation.qty_micros,
      ...(allocation.batch_no ? { batch_no: allocation.batch_no } : {}),
      ...(allocation.serial_no ? { serial_no: allocation.serial_no } : {}),
    };
    await assertOutgoingRowAvailable(context, request, row, allocation.qty_micros);
    const absoluteValue = Math.abs(allocation.value_minor);
    stockValueMinor += absoluteValue;
    stock.push(buildBundleStockLine(request, row, index, allocation.qty_micros, true, {
      absoluteValue,
      rowRateMinor: allocation.valuation_rate_minor,
    }, null));
  }
  return { stock, usages: [], stockValueMinor };
}

function isTrackedItem(item: JsonObject | null | undefined): boolean {
  return item?.has_serial_no === true || item?.has_serial_no === 1 || item?.has_batch_no === true || item?.has_batch_no === 1;
}

async function loadValidatedBundle(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest & { bundleName: string },
): Promise<ValidatedBundle> {
  if (context.command.action === "submit" && await context.reader.isStockBundleUsed(context.command.tenant_id, request.bundleName)) {
    throw errors.reference(`Serial and Batch Bundle ${request.bundleName} is already used`);
  }
  const document = await context.reader.getDocument<SerialBatchBundleData>(context.command.tenant_id, "Serial and Batch Bundle", request.bundleName);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted Serial and Batch Bundle ${request.bundleName} is required`);
  const bundle = document.data;
  if (bundle.item_code !== request.itemCode || bundle.warehouse !== request.warehouse || bundle.type !== request.direction) {
    throw errors.reference(`Serial and Batch Bundle ${request.bundleName} does not match item, warehouse or direction`);
  }
  const rows = normalizeBundleRows(bundle.entries);
  const total = rows.reduce((sum, row) => sum + (row.qty_micros ?? 0), 0);
  if (total !== request.qtyMicros) {
    throw errors.reference(`Serial and Batch Bundle ${request.bundleName} quantity does not match stock row`, {
      bundle_qty_micros: total,
      row_qty_micros: request.qtyMicros,
    });
  }
  return { bundle, rows };
}

async function assertOutgoingRowAvailable(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest,
  row: SerialBatchBundleRow,
  qty: number,
): Promise<void> {
  if (request.direction !== "Outward") return;
  if (row.batch_no) {
    const batch = await context.reader.getMasterRecordData(context.command.tenant_id, "Batch", row.batch_no);
    if (!batch) throw errors.reference(`Batch ${row.batch_no} does not exist`);
    if (typeof batch.expiry_date === "string" && request.postingAt.slice(0, 10) > batch.expiry_date.slice(0, 10)) {
      throw errors.reference(`Batch ${row.batch_no} is expired`);
    }
  }
  const available = await context.reader.getTrackedStockBalanceMicros(
    context.command.tenant_id,
    request.itemCode,
    request.warehouse,
    row.batch_no,
    row.serial_no,
  );
  if (available < qty) {
    throw errors.reference(`Insufficient tracked stock for ${request.itemCode}`, {
      batch_no: row.batch_no ?? null,
      serial_no: row.serial_no ?? null,
      available_qty_micros: available,
      requested_qty_micros: qty,
    });
  }
}

/**
 * ĐỊNH GIÁ TỪNG LÔ ngay tại chỗ đã nạp bundle. Chỉ áp cho chiều XUẤT và dòng CÓ lô;
 * nhập giữ giá từ chứng từ mua. Dòng cuối nhận phần dư để tổng luôn khớp giá trị cả dòng.
 */
async function resolveRowValuation(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest,
  row: SerialBatchBundleRow,
  qty: number,
  index: number,
  rowCount: number,
  allocatedValue: number,
): Promise<RowValuation> {
  if (request.direction === "Outward" && row.batch_no) {
    const perBatch = await deriveOutgoingValuation(context, {
      itemCode: request.itemCode,
      warehouse: request.warehouse,
      qtyMicros: qty,
      postingAt: request.postingAt,
      currencyScale: request.currencyScale,
      batchNo: row.batch_no,
    });
    return {
      absoluteValue: Math.abs(perBatch.stock_value_difference_minor),
      rowRateMinor: perBatch.valuation_rate_minor,
    };
  }
  return {
    absoluteValue: index === rowCount - 1
      ? Math.abs(request.stockValueMinor) - allocatedValue
      : Math.round(Math.abs(request.stockValueMinor) * qty / request.qtyMicros),
    rowRateMinor: request.valuationRateMinor,
  };
}

function allocateRowWeight(
  totalWeight: number | null,
  allocatedWeight: number,
  qty: number,
  requestQtyMicros: number,
  isLast: boolean,
): number | null {
  if (totalWeight == null) return null;
  return isLast
    ? totalWeight - allocatedWeight
    : Math.round(totalWeight * qty / requestQtyMicros);
}

function buildBundleStockLine(
  request: TrackedStockRequest,
  row: SerialBatchBundleRow,
  index: number,
  qty: number,
  tracked: boolean,
  valuation: RowValuation,
  absoluteWeight: number | null,
): StockLedgerEntry {
  return {
    line_key: `${request.lineKey}-${row.row_id || index + 1}`,
    ...(request.sourceRowId ? { source_row_id: request.sourceRowId } : {}),
    item_code: request.itemCode,
    warehouse: request.warehouse,
    actual_qty_micros: request.direction === "Inward" ? qty : -qty,
    ...(absoluteWeight != null ? { actual_weight_micros: request.direction === "Inward" ? absoluteWeight : -absoluteWeight } : {}),
    valuation_rate_minor: valuation.rowRateMinor,
    stock_value_difference_minor: request.direction === "Inward" ? valuation.absoluteValue : -valuation.absoluteValue,
    qty_scale: 6,
    currency_scale: request.currencyScale,
    currency: request.currency,
    posting_at: request.postingAt,
    ...(row.batch_no ? { batch_no: row.batch_no } : {}),
    ...(row.serial_no ? { serial_no: row.serial_no } : {}),
    allow_negative_stock: tracked ? false : Boolean(request.allowNegativeStock),
  };
}

export function normalizeBundleRows(entries: SerialBatchBundleRow[]): SerialBatchBundleRow[] {
  if (!Array.isArray(entries) || entries.length === 0) throw errors.validation("Serial and Batch Bundle requires entries");
  const serials = new Set<string>();
  return entries.map((entry,index) => {
    const qty = toScaledInt(entry.qty,6,`entries[${index}].qty`);
    if (qty <= 0) throw errors.validation(`Bundle quantity must be positive at row ${index+1}`);
    if (!entry.serial_no && !entry.batch_no) throw errors.validation(`Serial or batch is required at row ${index+1}`);
    if (entry.serial_no) {
      if (qty !== 1_000_000) throw errors.validation(`Serial quantity must equal one at row ${index+1}`);
      if (serials.has(entry.serial_no)) throw errors.validation(`Duplicate serial ${entry.serial_no}`);
      serials.add(entry.serial_no);
    }
    return { ...entry, row_id: entry.row_id || `ROW-${index+1}`, qty: fromScaledInt(qty,6), qty_micros: qty };
  });
}

function baseLine(request: TrackedStockRequest): StockLedgerEntry {
  return {
    line_key: request.lineKey, ...(request.sourceRowId ? { source_row_id: request.sourceRowId } : {}), item_code: request.itemCode, warehouse: request.warehouse,
    actual_qty_micros: request.direction === "Inward" ? request.qtyMicros : -request.qtyMicros,
    ...(request.weightMicros == null
      ? {}
      : { actual_weight_micros: request.direction === "Inward" ? Math.abs(request.weightMicros) : -Math.abs(request.weightMicros) }),
    valuation_rate_minor: request.valuationRateMinor,
    stock_value_difference_minor: request.direction === "Inward" ? Math.abs(request.stockValueMinor) : -Math.abs(request.stockValueMinor),
    qty_scale: 6, currency_scale: request.currencyScale, currency: request.currency, posting_at: request.postingAt,
    allow_negative_stock: Boolean(request.allowNegativeStock),
  };
}
