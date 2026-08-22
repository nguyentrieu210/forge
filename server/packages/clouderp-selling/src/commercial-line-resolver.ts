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

const QTY_SCALE = 6;
const ONE_QTY = 1_000_000;

export interface ResolveCommercialLineInput {
  itemCode: string;
  priceList: string;
  documentCurrency: string;
  postingDate: string;
  uom?: string;
  priceVariant?: string;
  discountBasisVariant?: string;
  pricedQty: number;
  partyType?: "Customer" | "Supplier";
  party?: string;
  customerGroup?: string;
  supplierGroup?: string;
  facts: Record<string, unknown>;
  /** Diện tích CẢ DÒNG (đã nhân số bộ). Dùng cho fact và cho Pricing Rule tính theo m². */
  areaSqm?: number;
  /** Diện tích MỘT BỘ. Chỉ số này mới tra được bậc — xem `areaTierBasisSqm`. */
  areaPerSetSqm?: number;
  lengthM?: number;
  setCount?: number;
  sellingRateOverride?: string | number;
  discountPercentageOverride?: string | number;
}

export interface ResolvedCommercialLine extends JsonObject {
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

  // Cách bán/gói bán đã bị loại bỏ khỏi nền tảng: mọi dòng bán theo thẳng giá STANDARD.
  const requestedVariant = normalizePriceVariant(input.priceVariant);
  const requestedBasisVariant = normalizePriceVariant(input.discountBasisVariant ?? requestedVariant);
  const sharedPriceContext = {
    itemCode: input.itemCode,
    qtyMicros: pricedQtyMicros,
    postingDate: input.postingDate,
    priceList: input.priceList,
    documentCurrency: input.documentCurrency,
    ...(input.uom ? { uom: input.uom } : {}),
    /**
     * Diện tích phải đi CÙNG yêu cầu tra giá, không chỉ vào `facts` của Pricing Rule.
     *
     * Trước khi vá, `resolveServerPrice` nhận `billableAreaSqm` = undefined nên
     * `priceTierMatches` loại SẠCH mọi dòng giá có bậc. Hệ quả là `area_tier` có thể khai được
     * mà không bao giờ khớp — đúng trạng thái đo được: 0/558 dòng giá trên D1 mang bậc.
     *
     * Dùng `areaPerSetSqm`, KHÔNG dùng `areaSqm`: cận bậc là diện tích một bộ, còn `areaSqm` là
     * diện tích cả dòng (= một bộ × số bộ). Lấy nhầm số thì mọi dòng nhiều bộ ăn bậc rẻ hơn —
     * đo được 2 bộ × 4,5 m² tra ra bậc 8-9 @580.000 thay vì bậc 4-5 @640.000, hụt
     * 540.000đ/dòng. Chi tiết ở `clouderp-pricing/src/index.ts` → `areaTierBasisSqm`.
     *
     * Chỉ truyền khi có: bỏ trống thì thang bậc bị loại một cách CÓ Ý (fail-closed), còn hơn
     * truyền 0 rồi rơi vào bậc nào đó.
     */
    ...(input.areaPerSetSqm === undefined ? {} : { billableAreaSqm: input.areaPerSetSqm }),
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

  const baseAmountMinor = multiplyMinorByQuantity(rawPrice.rate_minor, pricedQtyMicros, "pricing facts base amount");
  const facts = {
    ...optionFacts,
    base_rate: Number(rawPrice.rate),
    base_amount: Number(fromScaledInt(baseAmountMinor, rawPrice.currency_scale)),
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

  /**
   * ── CHỐT CHẶN TRÙNG CHIẾT KHẤU (P0-1) ────────────────────────────────────────────────
   *
   * Một chính sách "giảm X" có thể được biểu diễn hai cách trong hệ này: `discount_percentage`
   * (trừ ở vế `− discountMinor`) và Pricing Rule `ADJUSTMENT` rate ÂM (cộng ở vế
   * `+ adjustmentMinor`). Cả hai cùng chảy vào `net = gross − discount + adjustment`, nên khi
   * cùng một chính sách đi cả hai đường thì khách được trừ HAI LẦN — không ai ở tầng dưới
   * phát hiện được, vì mỗi vế xét riêng đều hợp lệ.
   *
   * Chặn CỨNG chứ không chỉ cảnh báo: đây là phép tính TIỀN, và một cảnh báo chỉ có tác dụng
   * nếu người bán chịu đọc. Dấu hiệu nhận biết chọn hẹp và chính xác — tổng khoản ADJUSTMENT
   * ÂM có trị tuyệt đối BẰNG đúng khoản chiết khấu (sai số ≤ 1 đơn vị tiền do làm tròn). Đó
   * đúng là chữ ký của lỗi đã đo: 1.850.850 / −1.850.850 ở đường xem trước, và
   * 59.129.704.350 / −59.129.704.350 trên đơn `DH-2026-0068` đã lưu.
   *
   * Hẹp như vậy để KHÔNG chặn nhầm những khoản giảm hợp lệ khác cùng dòng — ví dụ luật
   * "Giảm giá hàng thô không sơn — cửa Lưới" (−70.000 đ/m²), là khoản giảm riêng, không phải
   * bản sao của chiết khấu đại lý, nên số tiền của nó gần như không bao giờ trùng khít.
   */
  const negativeAdjustmentMinor = sumSafe(
    policy.adjustments.filter((row) => row.amount_minor < 0).map((row) => row.amount_minor),
    "line negative adjustments",
  );
  if (discountMinor > 0 && Math.abs(Math.abs(negativeAdjustmentMinor) - discountMinor) <= 1) {
    const duplicated = policy.adjustments
      .filter((row) => row.amount_minor < 0)
      .map((row) => row.rule_name)
      .join(", ");
    throw errors.validation(
      `Dòng ${input.itemCode}: chiết khấu bị trừ hai lần cho cùng một chính sách — `
      + `mức chiết khấu ${fromScaledInt(discountMinor, scale)} trùng khít với luật giá giảm `
      + `"${duplicated}". Bỏ mức chiết khấu nhập tay, hoặc tắt luật giá; không được để cả hai.`,
    );
  }
  const taxableAdjustmentMinor = sumSafe(
    policy.adjustments.filter((row) => row.taxable).map((row) => row.amount_minor),
    "taxable line adjustments",
  );
  const netBeforeTaxMinor = sumSafe([grossMinor, -discountMinor, adjustmentMinor], "line net before tax");
  if (netBeforeTaxMinor < 0) throw errors.validation("Line net before tax cannot be negative");

  return {
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
