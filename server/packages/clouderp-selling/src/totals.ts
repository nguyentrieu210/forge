import type { SalesItem, TaxRow } from "./types.js";
import {
  assertCurrencyScale,
  calculateSalesTotals as calculateCoreSalesTotals,
  type SalesTotals,
  type SalesTotalsInput,
} from "./totals-core.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, percentOfMinor, toScaledInt } from "../../money/src/index.js";

export { assertCurrencyScale };
export type { SalesTotals, SalesTotalsInput };

/**
 * Explicit operator line discount is commercial data, not a fake second stock row.
 *
 * `resolveServerPrice` has already replaced the client rate with the authoritative Item Price.
 * If a Pricing Rule was selected, its percentage was already folded into `rate`; do not apply it
 * again. Otherwise an explicit `discount_percentage` on a server-priced row reduces the rate once
 * using fixed-point arithmetic. The core totals engine then remains the single authority for
 * amount/net/tax/document discount allocation.
 */
function applyExplicitLineDiscounts(items: SalesItem[], currencyScale: number): SalesItem[] {
  return items.map((item, index) => {
    const raw = item.discount_percentage;
    if (raw === undefined || raw === null || String(raw).trim() === "") return item;
    const pctMicros = toScaledInt(raw, 6, `items[${index}].discount_percentage`);
    if (pctMicros < 0 || pctMicros > 100_000_000) {
      throw errors.validation(`Discount percentage must be from 0 to 100 at row ${index + 1}`);
    }
    // Pricing Rule percentage/rate is already reflected in the resolved rate.
    if (item.pricing_rule || !item.item_price || pctMicros === 0) {
      return { ...item, discount_percentage: fromScaledInt(pctMicros, 6) };
    }

    const listRateMinor = toScaledInt(item.rate, currencyScale, `items[${index}].rate`);
    if (listRateMinor < 0) throw errors.validation(`Rate cannot be negative at row ${index + 1}`);
    const lineDiscountRateMinor = percentOfMinor(
      listRateMinor,
      fromScaledInt(pctMicros, 6),
      6,
      `items[${index}].discount_percentage`,
    );
    const effectiveRateMinor = Math.max(0, listRateMinor - lineDiscountRateMinor);
    return {
      ...item,
      list_rate: fromScaledInt(listRateMinor, currencyScale),
      rate: fromScaledInt(effectiveRateMinor, currencyScale),
      discount_percentage: fromScaledInt(pctMicros, 6),
    } as SalesItem;
  });
}

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
  assertCurrencyScale(currencyScale);
  const discountedItems = applyExplicitLineDiscounts(items, currencyScale);
  const accounts = taxes.map((tax) => String((tax as TaxRow & { account?: unknown }).account ?? "").trim());
  const safeTaxes = taxes.map((tax, index) => ({
    ...tax,
    account: accounts[index] || `__COMMERCIAL_TAX_${index + 1}__`,
  }));
  const result = calculateCoreSalesTotals(discountedItems, safeTaxes, currencyScale, options);
  return {
    ...result,
    taxes: result.taxes.map((row, index) => accounts[index]
      ? row
      : ({ ...row, account: "" } as TaxRow)),
  };
}
