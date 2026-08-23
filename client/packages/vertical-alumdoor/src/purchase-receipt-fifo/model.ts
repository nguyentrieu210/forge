export * from "./model-legacy.js";

import type { ReceiptLine } from "./model-legacy.js";

function visibleOverride(line: ReceiptLine, fieldname: string): boolean {
  const override = line._overrides?.[fieldname];
  return Boolean(override) && override!.hidden !== true && override!.hidden !== 1;
}

/**
 * Legacy export name kept for existing callers. It no longer inspects `inventory_mode` or the
 * literal profile name. A line is on the dual-axis purchase path only when the server runtime
 * exposes the actual-weight input (or the equivalent hidden priced-qty + piece-count contract).
 */
export function isAluminumReceiptLine(line: ReceiptLine): boolean {
  const qty = line._overrides?.qty;
  const qtyHidden = qty?.hidden === true || qty?.hidden === 1;
  const qtyReadonly = qty?.read_only === true || qty?.read_only === 1;
  return visibleOverride(line, "actual_weight_kg")
    || (visibleOverride(line, "qty_bar") && qtyHidden && qtyReadonly);
}

/** Catch-weight is an Item/server runtime fact, never a string comparison in the Receipt UI. */
export function isCatchWeightReceiptLine(line: ReceiptLine): boolean {
  return isAluminumReceiptLine(line);
}
