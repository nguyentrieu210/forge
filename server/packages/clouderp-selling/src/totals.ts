import type { SalesItem, TaxRow } from "./types.js";
import {
  assertCurrencyScale,
  calculateSalesTotals as calculateCoreSalesTotals,
  type SalesTotals,
  type SalesTotalsInput,
} from "./totals-core.js";

export { assertCurrencyScale };
export type { SalesTotals, SalesTotalsInput };

/**
 * Commercial documents may carry tax amounts before an accounting module is enabled.
 * The pinned O2C arithmetic engine historically required a ledger account on every tax row;
 * keep its arithmetic unchanged and inject a non-persistent sentinel only for calculation.
 *
 * Sales Invoice posting remains account-gated in controllers-core.ts. Sales Order is the only
 * document whose Alumdoor submit path accepts account-less commercial VAT.
 */
export function calculateSalesTotals(
  items: SalesItem[],
  taxes: TaxRow[] = [],
  currencyScale = 2,
  options: SalesTotalsInput = {},
): SalesTotals {
  const accounts = taxes.map((tax) => String((tax as TaxRow & { account?: unknown }).account ?? "").trim());
  const safeTaxes = taxes.map((tax, index) => ({
    ...tax,
    account: accounts[index] || `__COMMERCIAL_TAX_${index + 1}__`,
  }));
  const result = calculateCoreSalesTotals(items, safeTaxes, currencyScale, options);
  return {
    ...result,
    taxes: result.taxes.map((row, index) => accounts[index]
      ? row
      : ({ ...row, account: "" } as TaxRow)),
  };
}
