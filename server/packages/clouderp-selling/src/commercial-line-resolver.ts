import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { normalizePriceVariant, resolveServerPrice } from "../../clouderp-pricing/src/index.js";
import {
  resolveCommercialPricingPolicy,
  type AppliedPricingAdjustment,
  type PricingRuleSnapshot,
} from "../../clouderp-pricing/src/commercial-policy.js";
import { resolveSalesOption } from "./sales-option-resolver.js";

const QTY_SCALE = 6;
const ONE_QTY = 1_000_000;

export interface ResolveCommercialLineInput {
  itemCode: string;
  priceList: string;
  documentCurrency: string;
  postingDate: string;
  uom?: string;
  /** Optional technical overrides used by migration/tests; normal operator flow uses sales_option. */
  priceVariant?: string;
  discountBasisVariant?: string;
  pricedQty: number;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
  facts: Record<string, unknown>;
  areaSqm?: number;
  lengthM?: number;
  setCount?: number;
  sellingRateOverride?: string | number;
  discountPercentageOverride?: string | number;
}

export interface ResolvedCommercialLine extends JsonObject {
  sales_option?: string;
  sales_option_code?: string;
  sales_option_label?: string;
  sales_option_version?: number;
  sales_mode?: string;
  sales_package?: string;
  item_price: string;
  price_variant: string;
  base_rate: string;
  base_rate_minor: number;
  selling_rate: string;
  selling_rate_minor: number;
  priced_qty: string;
  priced_qty_micros: number;
  gross_amount: string;
  gross_amount_minor: number;
  discount_basis_item_price: string;
  discount_basis_variant: string;
  discount_basis_rate: string;
  discount_basis_rate_minor: number;
  discount_basis_amount: string;
  discount_basis_amount_minor: number;
  discount_percentage: string;
  discount_amount: string;
  discount_amount_minor: number;
  adjustment_amount: string;
  adjustment_amount_minor: number;
  taxable_adjustment_amount: string;
  taxable_adjustment_amount_minor: number;
  net_before_tax: string;
  net_before_tax_minor: number;
  pricing_as_of: string;
  pricing_rule_snapshots: PricingRuleSnapshot[];
  applied_adjustments: AppliedPricingAdjustment[];
}

export async function resolveCommercialLine(
  context: ControllerContext<JsonObject>,
  input: ResolveCommercialLineInput,
): Promise<ResolvedCommercialLine> {
  const pricedQtyMicros = quantityMicros(input.pricedQty, "pricedQty");
  const optionFacts: Record<string, unknown> = {
    ...input.facts,
    ...(input.areaSqm === undefined ? {} : {
      billable_area_sqm: input.areaSqm,
      area_sqm: input.areaSqm,
      sqm2: input.areaSqm,
    }),
  };
  const resolvedOption = await resolveSalesOption(context, {
    itemCode: input.itemCode,
    itemMaster: { item_group: optionFacts.item_group },
    facts: optionFacts,
    ...(text(optionFacts.sales_option) ? { requestedOption: text(optionFacts.sales_option) } : {}),
    ...(text(optionFacts.sales_mode) ? { legacySalesMode: text(optionFacts.sales_mode) } : {}),
    // If this Item has no configured options the resolver itself returns STANDARD. If options
    // exist but selection is ambiguous it fails closed; this flag only protects legacy rows.
    allowLegacyUnselected: Boolean(optionFacts.legacy_unselected_sales_option),
  });

  const requestedVariant = normalizePriceVariant(input.priceVariant ?? resolvedOption.price_variant);
  const requestedBasisVariant = normalizePriceVariant(
    input.discountBasisVariant ?? resolvedOption.discount_basis_variant ?? requestedVariant,
  );
  const sharedPriceContext = {
    itemCode: input.itemCode,
    qtyMicros: pricedQtyMicros,
    postingDate: input.postingDate,
    priceList: input.priceList,
    documentCurrency: input.documentCurrency,
    ...(input.uom ? { uom: input.uom } : {}),
    applyPricingRules: false as const,
    ...(input.partyType ? { partyType: input.partyType } : {}),
    ...(input.party ? { party: input.party } : {}),
    ...(input.customerGroup ? { customerGroup: input.customerGroup } : {}),
    ...(input.supplierGroup ? { supplierGroup: input.supplierGroup } : {}),
  };
  const rawPrice = await resolveServerPrice(context, { ...sharedPriceContext, priceVariant: requestedVariant });
  const discountBasisPrice = requestedBasisVariant === rawPrice.price_variant
    ? rawPrice
    : await resolveServerPrice(context, { ...sharedPriceContext, priceVariant: requestedBasisVariant });
  if (discountBasisPrice.currency !== rawPrice.currency || discountBasisPrice.currency_scale !== rawPrice.currency_scale) {
    throw errors.validation("Selling price and discount-basis price must use the same currency and scale");
  }

  const facts = {
    ...optionFacts,
    ...(resolvedOption.sales_option ? { sales_option: resolvedOption.sales_option } : {}),
    ...(resolvedOption.sales_option_code ? { sales_option_code: resolvedOption.sales_option_code } : {}),
    ...(resolvedOption.sales_mode ? { sales_mode: resolvedOption.sales_mode } : {}),
    price_variant: rawPrice.price_variant,
    discount_basis_variant: discountBasisPrice.price_variant,
  };
  const policy = await resolveCommercialPricingPolicy(context, {
    itemCode: input.itemCode,
    priceList: input.priceList,
    postingDate: input.postingDate,
    currency: rawPrice.currency,
    currencyScale: rawPrice.currency_scale,
    qtyMicros: pricedQtyMicros,
    pricedQtyMicros,
    ...(input.partyType ? { partyType: input.partyType } : {}),
    ...(input.party ? { party: input.party } : {}),
    ...(input.customerGroup ? { customerGroup: input.customerGroup } : {}),
    ...(input.supplierGroup ? { supplierGroup: input.supplierGroup } : {}),
    facts,
    ...(input.areaSqm === undefined ? {} : { areaSqm: input.areaSqm }),
    ...(input.lengthM === undefined ? {} : { lengthM: input.lengthM }),
    ...(input.setCount === undefined ? {} : { setCount: input.setCount }),
  });

  const scale = rawPrice.currency_scale;
  const canonicalSellingRateMinor = policy.rate_override_minor ?? rawPrice.rate_minor;
  const sellingRateMinor = input.sellingRateOverride === undefined
    ? canonicalSellingRateMinor
    : nonNegativeMoneyMinor(input.sellingRateOverride, scale, "sellingRateOverride");
  const grossMinor = multiplyMinorByQuantity(sellingRateMinor, pricedQtyMicros, "selling rate");

  // Discount basis is deliberately independent of the selected selling rate. This handles
  // selling one configured option while discounting against another declared base variant.
  const discountBasisRateMinor = discountBasisPrice.rate_minor;
  const discountBasisAmountMinor = multiplyMinorByQuantity(discountBasisRateMinor, pricedQtyMicros, "discount basis");
  const discountPercentageMicros = input.discountPercentageOverride === undefined
    ? (policy.discount_percentage_micros ?? 0)
    : percentageMicros(input.discountPercentageOverride, "discountPercentageOverride");
  const percentageDiscountMinor = percentOfMinor(discountBasisAmountMinor, discountPercentageMicros);
  const fixedDiscountMinor = policy.discount_amount_minor ?? 0;
  if (percentageDiscountMinor > 0 && fixedDiscountMinor > 0) {
    throw errors.validation("Pricing Rule cannot apply percentage and fixed discount to the same line");
  }
  const discountMinor = percentageDiscountMinor || fixedDiscountMinor;
  if (discountMinor > grossMinor) throw errors.validation("Line discount cannot exceed gross amount");

  const adjustmentMinor = sumSafe(policy.adjustments.map((row) => row.amount_minor), "line adjustments");
  const taxableAdjustmentMinor = sumSafe(
    policy.adjustments.filter((row) => row.taxable).map((row) => row.amount_minor),
    "taxable line adjustments",
  );
  const netBeforeTaxMinor = sumSafe([grossMinor, -discountMinor, adjustmentMinor], "line net before tax");
  if (netBeforeTaxMinor < 0) throw errors.validation("Line net before tax cannot be negative");

  return {
    ...(resolvedOption.sales_option ? { sales_option: resolvedOption.sales_option } : {}),
    ...(resolvedOption.sales_option_code ? { sales_option_code: resolvedOption.sales_option_code } : {}),
    ...(resolvedOption.sales_option_label ? { sales_option_label: resolvedOption.sales_option_label } : {}),
    ...(resolvedOption.option_version ? { sales_option_version: resolvedOption.option_version } : {}),
    ...(resolvedOption.sales_mode ? { sales_mode: resolvedOption.sales_mode } : {}),
    ...(resolvedOption.sales_package ? { sales_package: resolvedOption.sales_package } : {}),
    item_price: rawPrice.item_price,
    price_variant: rawPrice.price_variant,
    base_rate: rawPrice.rate,
    base_rate_minor: rawPrice.rate_minor,
    selling_rate: fromScaledInt(sellingRateMinor, scale),
    selling_rate_minor: sellingRateMinor,
    priced_qty: fromScaledInt(pricedQtyMicros, QTY_SCALE),
    priced_qty_micros: pricedQtyMicros,
    gross_amount: fromScaledInt(grossMinor, scale),
    gross_amount_minor: grossMinor,
    discount_basis_item_price: discountBasisPrice.item_price,
    discount_basis_variant: discountBasisPrice.price_variant,
    discount_basis_rate: fromScaledInt(discountBasisRateMinor, scale),
    discount_basis_rate_minor: discountBasisRateMinor,
    discount_basis_amount: fromScaledInt(discountBasisAmountMinor, scale),
    discount_basis_amount_minor: discountBasisAmountMinor,
    discount_percentage: fromScaledInt(discountPercentageMicros, 6),
    discount_amount: fromScaledInt(discountMinor, scale),
    discount_amount_minor: discountMinor,
    adjustment_amount: fromScaledInt(adjustmentMinor, scale),
    adjustment_amount_minor: adjustmentMinor,
    taxable_adjustment_amount: fromScaledInt(taxableAdjustmentMinor, scale),
    taxable_adjustment_amount_minor: taxableAdjustmentMinor,
    net_before_tax: fromScaledInt(netBeforeTaxMinor, scale),
    net_before_tax_minor: netBeforeTaxMinor,
    pricing_as_of: input.postingDate,
    pricing_rule_snapshots: policy.snapshots,
    applied_adjustments: policy.adjustments,
  };
}

function quantityMicros(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) throw errors.validation(`${field} must be greater than zero`);
  const micros = Math.round(value * ONE_QTY);
  if (!Number.isSafeInteger(micros)) throw errors.validation(`${field} exceeds safe integer range`);
  return micros;
}

function nonNegativeMoneyMinor(value: string | number, scale: number, field: string): number {
  const minor = toScaledInt(value, scale, field);
  if (minor < 0) throw errors.validation(`${field} cannot be negative`);
  return minor;
}

function percentageMicros(value: string | number, field: string): number {
  const micros = toScaledInt(value, 6, field);
  if (micros < 0 || micros > 100_000_000) throw errors.validation(`${field} must be from 0 to 100`);
  return micros;
}

function multiplyMinorByQuantity(rateMinor: number, qtyMicros: number, field: string): number {
  if (!Number.isSafeInteger(rateMinor) || rateMinor < 0 || !Number.isSafeInteger(qtyMicros) || qtyMicros < 0) {
    throw errors.validation(`${field} exceeds safe integer bounds`);
  }
  const result = Number((BigInt(rateMinor) * BigInt(qtyMicros) + 500_000n) / 1_000_000n);
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function percentOfMinor(amountMinor: number, pctMicros: number): number {
  const result = Number((BigInt(amountMinor) * BigInt(pctMicros) + 50_000_000n) / 100_000_000n);
  if (!Number.isSafeInteger(result)) throw errors.validation("Discount amount exceeds safe integer range");
  return result;
}

function sumSafe(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw errors.validation(`${field} contains an unsafe integer`);
    total += value;
    if (!Number.isSafeInteger(total)) throw errors.validation(`${field} exceeds safe integer range`);
  }
  return total;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}
