import type { JsonObject, StockBundleUsageEntry, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import type { SerialBatchBundleData, SerialBatchBundleRow } from "./types.js";

export interface TrackedStockRequest {
  itemCode: string;
  warehouse: string;
  qtyMicros: number;
  direction: "Inward" | "Outward";
  postingAt: string;
  currency: string;
  currencyScale: number;
  valuationRateMinor: number;
  stockValueMinor: number;
  lineKey: string;
  bundleName?: string;
  allowNegativeStock?: boolean;
}

export async function buildTrackedStockLines(
  context: ControllerContext<JsonObject>,
  request: TrackedStockRequest,
): Promise<{ stock: StockLedgerEntry[]; usages: StockBundleUsageEntry[]; bundle?: SerialBatchBundleData }> {
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", request.itemCode);
  const tracked = item?.has_serial_no === true || item?.has_serial_no === 1 || item?.has_batch_no === true || item?.has_batch_no === 1;
  if (!request.bundleName) {
    if (tracked && context.command.action === "submit") throw errors.reference(`Serial and Batch Bundle is required for tracked Item ${request.itemCode}`);
    return { stock: [baseLine(request)], usages: [] };
  }
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
  const total = rows.reduce((sum,row) => sum + (row.qty_micros ?? 0),0);
  if (total !== request.qtyMicros) throw errors.reference(`Serial and Batch Bundle ${request.bundleName} quantity does not match stock row`, { bundle_qty_micros: total, row_qty_micros: request.qtyMicros });
  const stock: StockLedgerEntry[] = [];
  let allocatedValue = 0;
  for (const [index,row] of rows.entries()) {
    const qty = row.qty_micros!;
    if (request.direction === "Outward") {
      if (row.batch_no) {
        const batch = await context.reader.getMasterRecordData(context.command.tenant_id,"Batch",row.batch_no);
        if (!batch) throw errors.reference(`Batch ${row.batch_no} does not exist`);
        if (typeof batch.expiry_date === "string" && request.postingAt.slice(0,10) > batch.expiry_date.slice(0,10)) throw errors.reference(`Batch ${row.batch_no} is expired`);
      }
      const available = await context.reader.getTrackedStockBalanceMicros(context.command.tenant_id,request.itemCode,request.warehouse,row.batch_no,row.serial_no);
      if (available < qty) throw errors.reference(`Insufficient tracked stock for ${request.itemCode}`, { batch_no: row.batch_no ?? null, serial_no: row.serial_no ?? null, available_qty_micros: available, requested_qty_micros: qty });
    }
    const absoluteValue = index === rows.length-1
      ? Math.abs(request.stockValueMinor)-allocatedValue
      : Math.round(Math.abs(request.stockValueMinor)*qty/request.qtyMicros);
    allocatedValue += absoluteValue;
    stock.push({
      line_key: `${request.lineKey}-${row.row_id || index+1}`,
      item_code: request.itemCode, warehouse: request.warehouse,
      actual_qty_micros: request.direction === "Inward" ? qty : -qty,
      valuation_rate_minor: request.valuationRateMinor,
      stock_value_difference_minor: request.direction === "Inward" ? absoluteValue : -absoluteValue,
      qty_scale: 6, currency_scale: request.currencyScale, currency: request.currency, posting_at: request.postingAt,
      ...(row.batch_no ? { batch_no: row.batch_no } : {}), ...(row.serial_no ? { serial_no: row.serial_no } : {}),
      allow_negative_stock: tracked ? false : Boolean(request.allowNegativeStock),
    });
  }
  return {
    stock,
    usages: [{ line_key: `BUNDLE-${request.lineKey}`, bundle_name: request.bundleName, item_code: request.itemCode, warehouse: request.warehouse, direction: request.direction, usage_delta: 1, posting_at: request.postingAt }],
    bundle,
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
    line_key: request.lineKey, item_code: request.itemCode, warehouse: request.warehouse,
    actual_qty_micros: request.direction === "Inward" ? request.qtyMicros : -request.qtyMicros,
    valuation_rate_minor: request.valuationRateMinor,
    stock_value_difference_minor: request.direction === "Inward" ? Math.abs(request.stockValueMinor) : -Math.abs(request.stockValueMinor),
    qty_scale: 6, currency_scale: request.currencyScale, currency: request.currency, posting_at: request.postingAt,
    allow_negative_stock: Boolean(request.allowNegativeStock),
  };
}
