import { errors } from "../../core/src/index.js";
import { addMinor, fromScaledInt, multiplyScaled, percentOfMinor, toScaledInt } from "../../money/src/index.js";
import type { DiscountBasis, SalesItem, TaxChargeType, TaxRow } from "./types.js";

export interface SalesTotalsInput {
  apply_discount_on?: DiscountBasis | undefined;
  additional_discount_percentage?: string | number | undefined;
  discount_amount?: string | number | undefined;
}

export interface SalesTotals {
  items: SalesItem[];
  taxes: TaxRow[];
  net_total: string;
  net_total_minor: number;
  total_taxes_and_charges: string;
  total_taxes_and_charges_minor: number;
  grand_total: string;
  grand_total_minor: number;
  rounded_total: string;
  rounded_total_minor: number;
  rounding_adjustment: string;
  rounding_adjustment_minor: number;
  apply_discount_on?: DiscountBasis | undefined;
  additional_discount_percentage?: string;
  discount_amount: string;
  discount_amount_minor: number;
}

/**
 * Fixed-point implementation of the O2C tax subset captured by the pinned
 * ERPNext oracle: multiple percentage rows, included tax, previous-row total,
 * Actual, per-quantity, document discount and rounding adjustment.
 */
export function calculateSalesTotals(
  items: SalesItem[],
  taxes: TaxRow[] = [],
  currencyScale = 2,
  options: SalesTotalsInput = {},
): SalesTotals {
  if (items.length === 0) throw errors.validation("At least one item is required");
  assertCurrencyScale(currencyScale);
  const normalizedItems = items.map((item, index) => normalizeItem(item, index, currencyScale));
  const grossMinor = addMinor(normalizedItems.map((item) => item.amount_minor ?? 0), "gross total");
  const quantityMicros = addMinor(normalizedItems.map((item) => item.qty_micros ?? 0), "quantity total");

  const discountBasis = options.apply_discount_on ?? "Net Total";
  if (discountBasis !== "Net Total" && discountBasis !== "Grand Total") throw errors.validation("Invalid apply_discount_on value");
  const percentage = options.additional_discount_percentage === undefined
    ? 0
    : toScaledInt(options.additional_discount_percentage, 6, "additional_discount_percentage");
  if (percentage < 0 || percentage > 100_000_000) throw errors.validation("additional_discount_percentage must be from 0 to 100");
  const requestedFixedDiscount = options.discount_amount === undefined
    ? 0
    : toScaledInt(options.discount_amount, currencyScale, "discount_amount");
  if (requestedFixedDiscount < 0) throw errors.validation("discount_amount cannot be negative");

  const includedRows = taxes.filter((row) => row.included_in_print_rate === true);
  for (const row of includedRows) {
    const type = normalizeChargeType(row.charge_type);
    if (type !== "On Net Total" || row.add_deduct_tax === "Deduct") {
      throw errors.validation("Included tax currently supports additive On Net Total rows only");
    }
  }
  // A normalized percentage-discount document legitimately contains both the
  // percentage and its computed discount_amount. Percentage is authoritative
  // when non-zero, which makes GET -> save/submit idempotent.
  const fixedDiscount = percentage > 0 ? 0 : requestedFixedDiscount;
  if (includedRows.length > 0 && (percentage > 0 || fixedDiscount > 0)) {
    throw errors.validation("Included tax and document discount cannot be combined in this O2C release");
  }

  const includedRateMicros = addMinor(includedRows.map((row, index) => {
    const rate = toScaledInt(row.rate, 6, `taxes[${index}].rate`);
    if (rate < 0) throw errors.validation(`Tax rate cannot be negative at row ${index + 1}`);
    return rate;
  }), "included tax rates");
  const rateDenominator = 100_000_000; // 100 × 10^6
  let netMinor = includedRateMicros === 0
    ? grossMinor
    : divideRoundedSafe(BigInt(grossMinor) * BigInt(rateDenominator), BigInt(rateDenominator + includedRateMicros), "inclusive net total");

  let discountMinor = 0;
  let discountedGrandTarget: number | null = null;
  if (percentage > 0) {
    const netDiscount = percentOfMinor(netMinor, fromScaledInt(percentage, 6), 6, "additional_discount_percentage");
    if (discountBasis === "Grand Total") {
      const provisional = calculateTaxRows(netMinor, grossMinor, quantityMicros, taxes, currencyScale);
      const provisionalGrand = addMinor([netMinor, provisional.nonIncludedTaxMinor], "provisional grand total");
      discountMinor = percentOfMinor(provisionalGrand, fromScaledInt(percentage, 6), 6, "additional_discount_percentage");
      discountedGrandTarget = provisionalGrand - discountMinor;
    } else {
      discountMinor = netDiscount;
    }
    netMinor -= netDiscount;
  } else if (fixedDiscount > 0) {
    discountMinor = fixedDiscount;
    if (discountBasis === "Grand Total") {
      const provisional = calculateTaxRows(netMinor, grossMinor, quantityMicros, taxes, currencyScale);
      const provisionalGrand = addMinor([netMinor, provisional.nonIncludedTaxMinor], "provisional grand total");
      if (discountMinor > provisionalGrand) throw errors.validation("discount_amount cannot exceed Grand Total");
      discountedGrandTarget = provisionalGrand - discountMinor;
      netMinor = scaleByRatio(netMinor, discountedGrandTarget, provisionalGrand, "grand-total discount");
    } else {
      if (discountMinor > netMinor) throw errors.validation("discount_amount cannot exceed Net Total");
      netMinor -= discountMinor;
    }
  }

  const itemsWithNet = allocateNetAmounts(normalizedItems, netMinor, grossMinor, currencyScale);
  const taxResult = calculateTaxRows(netMinor, grossMinor, quantityMicros, taxes, currencyScale);
  const taxMinor = taxResult.totalTaxMinor;
  const computedGrand = addMinor([netMinor, taxMinor], "computed grand total");
  const targetGrand = includedRows.length > 0
    ? addMinor([grossMinor, taxResult.nonIncludedTaxMinor], "inclusive rounded total")
    : (discountedGrandTarget ?? computedGrand);
  const roundingAdjustment = targetGrand - computedGrand;

  return {
    items: itemsWithNet,
    taxes: taxResult.rows,
    net_total: fromScaledInt(netMinor, currencyScale),
    net_total_minor: netMinor,
    total_taxes_and_charges: fromScaledInt(taxMinor, currencyScale),
    total_taxes_and_charges_minor: taxMinor,
    grand_total: fromScaledInt(targetGrand, currencyScale),
    grand_total_minor: targetGrand,
    rounded_total: fromScaledInt(targetGrand, currencyScale),
    rounded_total_minor: targetGrand,
    rounding_adjustment: fromScaledInt(roundingAdjustment, currencyScale),
    rounding_adjustment_minor: roundingAdjustment,
    ...(options.apply_discount_on ? { apply_discount_on: options.apply_discount_on } : {}),
    ...(percentage > 0 ? { additional_discount_percentage: fromScaledInt(percentage, 6) } : {}),
    discount_amount: fromScaledInt(discountMinor, currencyScale),
    discount_amount_minor: discountMinor,
  };
}

function normalizeItem(item: SalesItem, index: number, currencyScale: number): SalesItem {
  if (!item.item_code) throw errors.validation(`Item code is required at row ${index + 1}`);
  const qtyMicros = toScaledInt(item.qty, 6, `items[${index}].qty`);
  if (qtyMicros <= 0) throw errors.validation(`Quantity must be greater than zero at row ${index + 1}`);
  // ERPNext rounds the rate at currency precision before multiplying quantity.
  const rateMinor = toScaledInt(item.rate, currencyScale, `items[${index}].rate`);
  if (rateMinor < 0) throw errors.validation(`Rate cannot be negative at row ${index + 1}`);
  const roundedRate = fromScaledInt(rateMinor, currencyScale);
  const amountMinor = multiplyScaled(item.qty, 6, roundedRate, currencyScale, currencyScale, `items[${index}].amount`);
  return {
    ...item,
    qty: fromScaledInt(qtyMicros, 6),
    rate: roundedRate,
    qty_micros: qtyMicros,
    rate_minor: rateMinor,
    amount_minor: amountMinor,
    amount: fromScaledInt(amountMinor, currencyScale),
  };
}

function calculateTaxRows(
  netMinor: number,
  grossMinor: number,
  quantityMicros: number,
  taxes: TaxRow[],
  currencyScale: number,
): { rows: TaxRow[]; totalTaxMinor: number; nonIncludedTaxMinor: number } {
  let runningTotal = netMinor;
  const rows: TaxRow[] = [];
  let nonIncludedTaxMinor = 0;
  for (const [index, tax] of taxes.entries()) {
    if (!tax.account) throw errors.validation(`Tax account is required at row ${index + 1}`);
    const chargeType = normalizeChargeType(tax.charge_type);
    const rateMicros = toScaledInt(tax.rate, 6, `taxes[${index}].rate`);
    if (rateMicros < 0) throw errors.validation(`Tax rate cannot be negative at row ${index + 1}`);
    let amount: number;
    if (chargeType === "Actual") {
      const actualInput = tax.actual_tax_amount ?? tax.tax_amount;
      if (actualInput === undefined) throw errors.validation(`Actual tax amount is required at row ${index + 1}`);
      amount = toScaledInt(actualInput, currencyScale, `taxes[${index}].actual_tax_amount`);
    } else if (chargeType === "On Item Quantity") {
      amount = multiplyScaled(fromScaledInt(quantityMicros, 6), 6, tax.rate, 6, currencyScale, `taxes[${index}].quantity_charge`);
    } else {
      const base = chargeType === "On Previous Row Total" ? runningTotal : netMinor;
      amount = percentOfMinor(base, tax.rate, 6, `taxes[${index}].rate`);
    }
    if (amount < 0) throw errors.validation(`Tax amount cannot be negative at row ${index + 1}`);
    const signedAmount = tax.add_deduct_tax === "Deduct" ? -amount : amount;
    runningTotal = addMinor([runningTotal, signedAmount], "tax running total");
    if (tax.included_in_print_rate !== true) nonIncludedTaxMinor = addMinor([nonIncludedTaxMinor, signedAmount], "non-included tax total");
    rows.push({
      ...tax,
      charge_type: chargeType,
      add_deduct_tax: tax.add_deduct_tax ?? "Add",
      rate: fromScaledInt(rateMicros, 6),
      ...(chargeType === "Actual" ? { actual_tax_amount: fromScaledInt(amount, currencyScale) } : {}),
      tax_amount_minor: signedAmount,
      tax_amount: fromScaledInt(signedAmount, currencyScale),
      total_minor: runningTotal,
      total: fromScaledInt(runningTotal, currencyScale),
    });
  }
  return {
    rows,
    totalTaxMinor: addMinor(rows.map((row) => row.tax_amount_minor ?? 0), "tax total"),
    nonIncludedTaxMinor,
  };
}

function allocateNetAmounts(items: SalesItem[], netMinor: number, grossMinor: number, scale: number): SalesItem[] {
  let allocated = 0;
  return items.map((item, index) => {
    const amountMinor = item.amount_minor ?? 0;
    const netAmount = index === items.length - 1
      ? netMinor - allocated
      : (grossMinor === 0 ? 0 : scaleByRatio(amountMinor, netMinor, grossMinor, `items[${index}].net_amount`));
    allocated += netAmount;
    return { ...item, net_amount_minor: netAmount, net_amount: fromScaledInt(netAmount, scale) };
  });
}

function normalizeChargeType(value: TaxChargeType | undefined): TaxChargeType {
  return value ?? "On Net Total";
}

function scaleByRatio(value: number, numerator: number, denominator: number, field: string): number {
  if (denominator === 0) return 0;
  return divideRoundedSafe(BigInt(value) * BigInt(numerator), BigInt(denominator), field);
}

function divideRoundedSafe(numerator: bigint, denominator: bigint, field: string): number {
  if (denominator <= 0n) throw errors.validation(`${field} divisor must be positive`);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const result = (remainder * 2n >= denominator ? quotient + 1n : quotient) * (negative ? -1n : 1n);
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) throw errors.validation(`${field} exceeds safe integer range`);
  return asNumber;
}

export function assertCurrencyScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6) throw errors.validation("currency_scale must be an integer from 0 to 6");
}
