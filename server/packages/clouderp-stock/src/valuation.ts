import type { StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";

export type ValuationMethod = "FIFO" | "Moving Average";

export interface ValuationResult {
  valuation_rate_minor: number;
  stock_value_difference_minor: number;
  available_qty_micros: number;
  current_stock_value_minor: number;
}

interface FifoLayer { qty_micros: number; value_minor: number }

export function normalizeValuationMethod(value: unknown): ValuationMethod {
  return String(value ?? "FIFO").toLowerCase().includes("moving") ? "Moving Average" : "FIFO";
}

export async function getItemValuationMethod(
  context: ControllerContext<JsonObject>,
  itemCode: string,
): Promise<ValuationMethod> {
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
  const company = typeof context.command.document.company === "string"
    ? await context.reader.getMasterRecordData(context.command.tenant_id, "Company", context.command.document.company)
    : null;
  return normalizeValuationMethod(item?.valuation_method ?? company?.default_valuation_method ?? "FIFO");
}

export async function deriveOutgoingValuation(
  context: ControllerContext<JsonObject>,
  input: { itemCode: string; warehouse: string; qtyMicros: number; postingAt: string; currencyScale: number },
): Promise<ValuationResult> {
  const history = await context.reader.getStockLedgerHistory(
    context.command.tenant_id, input.itemCode, input.warehouse, input.postingAt,
  );
  const method = await getItemValuationMethod(context, input.itemCode);
  return valueIssue(history, input.qtyMicros, method, input.currencyScale);
}

export function valueIssue(
  history: StockLedgerEntry[],
  qtyMicros: number,
  method: ValuationMethod,
  currencyScale = 2,
): ValuationResult {
  if (!Number.isSafeInteger(qtyMicros) || qtyMicros <= 0) throw errors.validation("Issue quantity must be a positive fixed-point integer");
  const state = replayValuation(history, method, currencyScale);
  if (state.qty_micros < qtyMicros) {
    throw errors.reference("Insufficient valuated stock", { available_qty_micros: state.qty_micros, requested_qty_micros: qtyMicros });
  }
  if (method === "Moving Average") {
    const issueValue = divideRounded(state.value_minor * qtyMicros, state.qty_micros);
    return {
      valuation_rate_minor: divideRounded(issueValue * 1_000_000, qtyMicros),
      stock_value_difference_minor: -issueValue,
      available_qty_micros: state.qty_micros,
      current_stock_value_minor: state.value_minor,
    };
  }
  const layers = state.layers.map((layer) => ({ ...layer }));
  let remaining = qtyMicros;
  let issueValue = 0;
  while (remaining > 0) {
    const layer = layers[0];
    if (!layer) throw errors.reference("FIFO valuation layers are incomplete");
    const take = Math.min(remaining, layer.qty_micros);
    const value = take === layer.qty_micros ? layer.value_minor : divideRounded(layer.value_minor * take, layer.qty_micros);
    issueValue = safeAdd(issueValue, value);
    layer.qty_micros -= take;
    layer.value_minor -= value;
    remaining -= take;
    if (layer.qty_micros === 0) layers.shift();
  }
  return {
    valuation_rate_minor: divideRounded(issueValue * 1_000_000, qtyMicros),
    stock_value_difference_minor: -issueValue,
    available_qty_micros: state.qty_micros,
    current_stock_value_minor: state.value_minor,
  };
}

export function replayValuation(
  entries: StockLedgerEntry[],
  method: ValuationMethod,
  _currencyScale = 2,
): { qty_micros: number; value_minor: number; valuation_rate_minor: number; layers: FifoLayer[] } {
  let qty = 0;
  let value = 0;
  const layers: FifoLayer[] = [];
  const sorted = [...entries].sort((a,b) => a.posting_at.localeCompare(b.posting_at));
  for (const entry of sorted) {
    const delta = entry.actual_qty_micros;
    if (delta > 0) {
      const incomingValue = entry.stock_value_difference_minor !== 0
        ? entry.stock_value_difference_minor
        : divideRounded(entry.valuation_rate_minor * delta, 1_000_000);
      qty = safeAdd(qty, delta); value = safeAdd(value, incomingValue);
      if (method === "FIFO") layers.push({ qty_micros: delta, value_minor: incomingValue });
      continue;
    }
    if (delta < 0) {
      const issueQty = -delta;
      if (issueQty > qty) throw errors.reference("Historical stock ledger contains negative stock during valuation replay");
      let issueValue = 0;
      if (method === "Moving Average") issueValue = divideRounded(value * issueQty, qty);
      else {
        let remaining = issueQty;
        while (remaining > 0) {
          const layer = layers[0];
          if (!layer) throw errors.reference("Historical FIFO layers are incomplete");
          const take = Math.min(remaining, layer.qty_micros);
          const consumed = take === layer.qty_micros ? layer.value_minor : divideRounded(layer.value_minor * take, layer.qty_micros);
          issueValue = safeAdd(issueValue, consumed);
          layer.qty_micros -= take; layer.value_minor -= consumed; remaining -= take;
          if (layer.qty_micros === 0) layers.shift();
        }
      }
      qty -= issueQty; value -= issueValue;
      continue;
    }
    // Repost/landed-cost adjustments change stock value without changing quantity.
    if (entry.stock_value_difference_minor !== 0) {
      value = safeAdd(value, entry.stock_value_difference_minor);
      if (method === "FIFO" && layers.length > 0) distributeAdjustment(layers, entry.stock_value_difference_minor);
    }
  }
  if (qty === 0 && value !== 0) throw errors.validation("Valuation replay leaves value with zero quantity", { stock_value_minor: value });
  return {
    qty_micros: qty,
    value_minor: value,
    valuation_rate_minor: qty === 0 ? 0 : divideRounded(value * 1_000_000, qty),
    layers,
  };
}

export function expectedCurrentStockValue(entries: StockLedgerEntry[], method: ValuationMethod): number {
  return replayValuation(entries, method).value_minor;
}

function distributeAdjustment(layers: FifoLayer[], adjustment: number): void {
  const totalQty = layers.reduce((sum, layer) => safeAdd(sum, layer.qty_micros), 0);
  if (totalQty <= 0) return;
  let allocated = 0;
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index]!;
    const share = index === layers.length - 1 ? adjustment - allocated : divideRounded(adjustment * layer.qty_micros, totalQty);
    layer.value_minor = safeAdd(layer.value_minor, share); allocated = safeAdd(allocated, share);
  }
}

function divideRounded(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw errors.validation("Valuation arithmetic exceeds safe integer bounds");
  }
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation("Valuation total exceeds safe integer bounds");
  return result;
}
