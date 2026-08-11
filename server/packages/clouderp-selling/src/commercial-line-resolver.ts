import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt } from "../../money/src/index.js";
import {
  normalizePriceVariant,
  resolveServerPrice,
  type ResolvedPrice,
} from "../../clouderp-pricing/src/index.js";
import {
  calculateCommercialLine,
  type CommercialLineTotals,
} from "./adjustment-policy.js";
import {
  resolveSalesAdjustments,
  type ResolvedSalesAdjustment,
} from "./adjustment-resolver.js";
import type { SalesAdjustmentSnapshot } from "./types.js";

export interface ResolveCommercialLineInput {
  itemCode: string;
  priceList: string;
  documentCurrency: string;
  postingDate: string;
  uom?: string;
  /** Commercial selling variant selected by the document line. */
  priceVariant?: string;
  /**
   * Optional independent price variant used only as the discount basis. When omitted,
   * discount is based on the selected selling variant. This lets a policy discount the
   * STANDARD price while a different configured variant remains the actual selling rate.
   */
  discountBasisVariant?: string;
  pricedQty: number;
  /** Discount policy is supplied independently and applied exactly once in this resolver. */
  discountPercentage?: number;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
  facts: Record<string, unknown>;
  area_sqm?: number;
  length_m?: number;
  set_count?: number;
}

export interface ResolvedCommercialLine {
  selling_price: ResolvedPrice;
  discount_basis_price: ResolvedPrice;
  discount_basis_variant: string;
  totals: CommercialLineTotals;
  discount_amount: string;
  adjustment_amount: string;
  net_before_tax: string;
  applied_adjustments: SalesAdjustmentSnapshot[];
  unresolved_adjustment_rules: string[];
}

function pricingRequest(input: ResolveCommercialLineInput, priceVariant: string) {
  return {
    itemCode: input.itemCode,
    qtyMicros: Math.round(input.pricedQty * 1_000_000),
    postingDate: input.postingDate,
    priceList: input.priceList,
    documentCurrency: input.documentCurrency,
    ...(input.uom ? { uom: input.uom } : {}),
    priceVariant,
    // CommercialLine owns discount composition. Resolve raw Item Price variants here so
    // a legacy Pricing Rule percentage cannot reduce the rate and then be applied again.
    applyPricingRules: false,
    ...(input.partyType ? { partyType: input.partyType } : {}),
    ...(input.party ? { party: input.party } : {}),
    ...(input.customerGroup ? { customerGroup: input.customerGroup } : {}),
    ...(input.supplierGroup ? { supplierGroup: input.supplierGroup } : {}),
  };
}

function assertPricedQty(value: number): void {
  const micros = Math.round(value * 1_000_000);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(micros)) {
    throw errors.validation("pricedQty must be a positive quantity within safe integer range");
  }
}

function toAdjustmentSnapshot(adjustment: ResolvedSalesAdjustment): SalesAdjustmentSnapshot {
  return {
    rule_code: adjustment.rule_code,
    rule_name: adjustment.rule_name,
    rule_version: adjustment.rule_version,
    description: adjustment.description,
    basis: adjustment.basis,
    basis_qty: adjustment.basis_qty,
    basis_qty_micros: adjustment.basis_qty_micros,
    rate_minor: adjustment.rate_minor,
    amount_minor: adjustment.amount_minor,
    scope: "LINE",
    ...(adjustment.exclusive_group ? { exclusive_group: adjustment.exclusive_group } : {}),
    taxable: adjustment.taxable,
    discountable: adjustment.discountable,
  };
}

/**
 * Resolves one commercial sales line from server authorities only:
 *
 *   raw selling Item Price variant
 * - discount calculated on an independently configured raw basis variant when requested
 * + persisted adjustment rules matched from trusted commercial facts
 * = net before tax
 *
 * It does not know any AlumDoor product, finish, rail or surcharge values. The result is
 * snapshot-ready so the transaction remains explainable after future master-data changes.
 */
export async function resolveCommercialLine(
  context: ControllerContext<JsonObject>,
  input: ResolveCommercialLineInput,
): Promise<ResolvedCommercialLine> {
  assertPricedQty(input.pricedQty);
  const sellingVariant = normalizePriceVariant(input.priceVariant);
  const discountBasisVariant = input.discountBasisVariant === undefined
    ? sellingVariant
    : normalizePriceVariant(input.discountBasisVariant);

  const sellingPrice = await resolveServerPrice(context, pricingRequest(input, sellingVariant));
  const discountBasisPrice = discountBasisVariant === sellingVariant
    ? sellingPrice
    : await resolveServerPrice(context, pricingRequest(input, discountBasisVariant));

  if (sellingPrice.currency_scale !== discountBasisPrice.currency_scale) {
    throw errors.validation("Selling price and discount-basis price must use the same currency scale");
  }

  const adjustments = await resolveSalesAdjustments(context, {
    postingDate: input.postingDate,
    currency: sellingPrice.currency,
    currencyScale: sellingPrice.currency_scale,
    facts: input.facts,
    ...(input.area_sqm === undefined ? {} : { area_sqm: input.area_sqm }),
    ...(input.length_m === undefined ? {} : { length_m: input.length_m }),
    ...(input.set_count === undefined ? {} : { set_count: input.set_count }),
  });

  const totals = calculateCommercialLine({
    priced_qty: input.pricedQty,
    selling_rate_minor: sellingPrice.rate_minor,
    ...(input.discountPercentage === undefined ? {} : { discount_percentage: input.discountPercentage }),
    discount_basis_qty: input.pricedQty,
    discount_basis_rate_minor: discountBasisPrice.rate_minor,
    adjustments: adjustments.applied,
  });
  const scale = sellingPrice.currency_scale;

  return {
    selling_price: sellingPrice,
    discount_basis_price: discountBasisPrice,
    discount_basis_variant: discountBasisVariant,
    totals,
    discount_amount: fromScaledInt(totals.discount_amount_minor, scale),
    adjustment_amount: fromScaledInt(totals.surcharge_amount_minor, scale),
    net_before_tax: fromScaledInt(totals.net_before_tax_minor, scale),
    applied_adjustments: adjustments.applied.map(toAdjustmentSnapshot),
    unresolved_adjustment_rules: adjustments.unresolved_rules,
  };
}