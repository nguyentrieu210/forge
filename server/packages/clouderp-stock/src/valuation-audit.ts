import type { StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ValuationMethod } from "./valuation.js";
import { valueIssue } from "./valuation.js";

export interface ValuationMismatch {
  line_key: string;
  posting_at: string;
  item_code: string;
  warehouse: string;
  batch_no?: string;
  actual_qty_micros: number;
  recorded_stock_value_difference_minor: number;
  expected_stock_value_difference_minor: number;
  delta_minor: number;
}

export interface ValuationAuditResult {
  checked_issue_lines: number;
  mismatch_count: number;
  mismatches: ValuationMismatch[];
}

function sameStockStream(left: StockLedgerEntry, right: StockLedgerEntry): boolean {
  return left.item_code === right.item_code
    && left.warehouse === right.warehouse
    && String(left.batch_no ?? "") === String(right.batch_no ?? "")
    && left.currency === right.currency
    && left.currency_scale === right.currency_scale;
}

/**
 * Replays outgoing valuation against the history that existed immediately before
 * each issue line and reports stale recorded values. This is intentionally an audit
 * primitive only: it does not mutate Stock Ledger or GL. A repost orchestrator can
 * use the mismatch list as deterministic evidence after a backdated receipt/adjustment.
 *
 * The caller supplies one logical item/warehouse[/batch]/currency stream. Mixing
 * streams fails closed because otherwise a seemingly helpful audit would manufacture
 * nonsense valuation layers, a hobby ERP systems have already explored enough.
 */
export function auditOutgoingValuation(
  entries: StockLedgerEntry[],
  method: ValuationMethod,
): ValuationAuditResult {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { checked_issue_lines: 0, mismatch_count: 0, mismatches: [] };
  }

  const indexed = entries.map((entry, index) => ({ entry, index }));
  indexed.sort((left, right) => {
    const byTime = left.entry.posting_at.localeCompare(right.entry.posting_at);
    return byTime || left.index - right.index;
  });

  const first = indexed[0]!.entry;
  for (const { entry } of indexed) {
    if (!sameStockStream(first, entry)) {
      throw errors.validation("Valuation audit requires one item/warehouse/batch/currency stream");
    }
    if (!Number.isSafeInteger(entry.actual_qty_micros)
      || !Number.isSafeInteger(entry.stock_value_difference_minor)) {
      throw errors.validation("Valuation audit requires fixed-point safe-integer ledger values");
    }
  }

  const history: StockLedgerEntry[] = [];
  const mismatches: ValuationMismatch[] = [];
  let checked = 0;

  for (const { entry } of indexed) {
    if (entry.actual_qty_micros < 0) {
      checked += 1;
      const expected = valueIssue(
        history,
        -entry.actual_qty_micros,
        method,
        entry.currency_scale,
      ).stock_value_difference_minor;
      if (expected !== entry.stock_value_difference_minor) {
        const delta = expected - entry.stock_value_difference_minor;
        if (!Number.isSafeInteger(delta)) throw errors.validation("Valuation mismatch delta exceeds safe integer bounds");
        mismatches.push({
          line_key: entry.line_key,
          posting_at: entry.posting_at,
          item_code: entry.item_code,
          warehouse: entry.warehouse,
          ...(entry.batch_no ? { batch_no: entry.batch_no } : {}),
          actual_qty_micros: entry.actual_qty_micros,
          recorded_stock_value_difference_minor: entry.stock_value_difference_minor,
          expected_stock_value_difference_minor: expected,
          delta_minor: delta,
        });
      }
    }
    history.push(entry);
  }

  return {
    checked_issue_lines: checked,
    mismatch_count: mismatches.length,
    mismatches,
  };
}
