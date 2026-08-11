import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { PricingContext, ResolvedPrice } from "./types.js";

export type { PricingContext, ResolvedPrice } from "./types.js";

export const STANDARD_PRICE_VARIANT = "STANDARD";

function disabled(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(String(value ?? "").trim().toLocaleLowerCase("vi"));
}

function normalizedText(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

/**
 * Variant is an identifier, not a translated display label. Keeping it bounded and
 * canonical makes it safe to use in deterministic Item Price names while field lookup
 * remains the business source of truth for imported/non-canonical record names.
 */
export function normalizePriceVariant(value: unknown): string {
  const variant = normalizedText(value).toUpperCase() || STANDARD_PRICE_VARIANT;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(variant)) {
    throw errors.validation("Item Price variant must use 1-64 characters: A-Z, 0-9, _ or -");
  }
  return variant;
}

function itemPriceVariant(data: JsonObject): string {
  return normalizePriceVariant(data.price_variant);
}

function fieldMatchedPrice(
  data: JsonObject,
  priceList: string,
  itemCode: string,
  lineUom: string,
  priceVariant: string,
): boolean {
  const dataPriceList = normalizedText(data.price_list);
  const dataItemCode = normalizedText(data.item_code);
  const priceUom = normalizedText(data.uom);
  return dataPriceList === priceList
    && dataItemCode === itemCode
    && itemPriceVariant(data) === priceVariant
    && (lineUom ? priceUom === lineUom : !priceUom);
}

function preferredPriceRecordName(priceList: string, itemCode: string, uom: string, variant: string): string {
  const base = `${priceList}:${itemCode}`;
  if (variant === STANDARD_PRICE_VARIANT) return uom ? `${base}:${uom}` : base;
  return uom ? `${base}:${uom}:${variant}` : `${base}:${variant}`;
}

export async function resolveServerPrice(
  context: ControllerContext<JsonObject>,
  input: PricingContext,
): Promise<ResolvedPrice> {
  const priceList = normalizedText(input.priceList);
  const itemCode = normalizedText(input.itemCode);
  const lineUom = normalizedText(input.uom);
  const documentCurrency = normalizedText(input.documentCurrency);
  const priceVariant = normalizePriceVariant(input.priceVariant);
  const legacyPriceName = `${priceList}:${itemCode}`;
  const preferredPriceName = preferredPriceRecordName(priceList, itemCode, lineUom, priceVariant);
  const legacy = await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", legacyPriceName);
  const preferred = preferredPriceName === legacyPriceName
    ? legacy
    : await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", preferredPriceName);
  const legacyUom = normalizedText(legacy?.uom);
  const compatibleLegacy = priceVariant === STANDARD_PRICE_VARIANT
    && legacy
    && itemPriceVariant(legacy) === STANDARD_PRICE_VARIANT
    && (lineUom ? legacyUom === lineUom : !legacyUom)
    ? legacy
    : null;
  const compatiblePreferred = preferred
    && fieldMatchedPrice(preferred, priceList, itemCode, lineUom, priceVariant)
    ? preferred
    : null;

  let priceName = preferredPriceName;
  let itemPrice: JsonObject | null = null;
  let convertedFromUom = "";
  let item: JsonObject | null = null;
  let listedPrices: Array<{ name: string; data: JsonObject }> | null = null;
  // Giá khai đúng ĐVT + biến thể của dòng là override thương mại và luôn thắng record legacy.
  // Legacy chỉ còn là đường tương thích cho dữ liệu STANDARD cũ chưa có tên ba thành phần.
  if (compatiblePreferred && !disabled(compatiblePreferred.disabled)) {
    itemPrice = compatiblePreferred;
    priceName = preferredPriceName;
  } else if (compatibleLegacy && !disabled(compatibleLegacy.disabled)) {
    itemPrice = compatibleLegacy;
    priceName = legacyPriceName;
  }

  /**
   * Record name is an optimization, not the only source of truth.
   *
   * Older app metadata named Item Price `<price_list>:<item_code>`, while the multi-UOM
   * runtime uses `<price_list>:<item_code>:<uom>`. Variant-aware data may additionally use
   * `<price_list>:<item_code>:<uom>:<variant>`. Imported or manually renamed data can carry
   * a different name. Business fields are normalized before comparison, and a missing
   * `price_variant` is exactly STANDARD for backward compatibility.
   */
  let fieldMatches: Array<{ name: string; data: JsonObject }> = [];
  if (!itemPrice) {
    listedPrices = await context.reader.listMasterRecordData(context.command.tenant_id, "Item Price");
    fieldMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, lineUom, priceVariant));
    const active = fieldMatches.filter(({ data }) => !disabled(data.disabled));
    if (active.length > 1) {
      throw errors.validation(
        `Multiple active Item Price records match ${priceList} / ${itemCode} / ${lineUom || "(no UOM)"} / ${priceVariant}`,
      );
    }
    if (active.length === 1) {
      itemPrice = active[0]!.data;
      priceName = active[0]!.name;
    }
  }

  // A selling-UOM price is optional. When it is absent, resolve from the Item's base
  // sales UOM and convert through the Item UOM factors. The requested variant is preserved:
  // WITH_RAIL never silently falls back to STANDARD just because its exact UOM is absent.
  if (!itemPrice && lineUom) {
    item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
    const baseUom = normalizedText(item?.default_sales_uom) || normalizedText(item?.stock_uom);
    if (item && baseUom && baseUom !== lineUom) {
      listedPrices ??= await context.reader.listMasterRecordData(context.command.tenant_id, "Item Price");
      const baseMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, baseUom, priceVariant));
      const activeBase = baseMatches.filter(({ data }) => !disabled(data.disabled));
      if (activeBase.length > 1) {
        throw errors.validation(`Multiple active Item Price records match ${priceList} / ${itemCode} / ${baseUom} / ${priceVariant}`);
      }
      if (activeBase.length === 1) {
        itemPrice = activeBase[0]!.data;
        priceName = activeBase[0]!.name;
        convertedFromUom = baseUom;
      }
    }
  }

  if (!itemPrice) {
    const disabledCandidate = compatiblePreferred
      ? { name: preferredPriceName, data: compatiblePreferred }
      : compatibleLegacy
        ? { name: legacyPriceName, data: compatibleLegacy }
        : fieldMatches[0];
    if (disabledCandidate) {
      itemPrice = disabledCandidate.data;
      priceName = disabledCandidate.name;
    }
  }

  if (
    !itemPrice
    && priceVariant === STANDARD_PRICE_VARIANT
    && legacy
    && itemPriceVariant(legacy) === STANDARD_PRICE_VARIANT
    && !lineUom
    && legacyUom
  ) {
    throw errors.validation(`Item Price ${legacyPriceName} declares UOM "${legacyUom}"; the document row must provide a matching selling UOM`);
  }
  if (!itemPrice) {
    throw errors.reference(`Item Price ${preferredPriceName} does not exist for variant ${priceVariant}`);
  }
  if (disabled(itemPrice.disabled)) throw errors.reference(`Item Price ${priceName} is disabled`);

  const currency = normalizedText(itemPrice.currency);
  if (!currency) throw errors.reference(`Item Price ${priceName} must define currency`);
  if (currency !== documentCurrency) throw errors.reference(`Item Price ${priceName} currency does not match document currency`);
  const priceUom = normalizedText(itemPrice.uom);
  if (priceUom && lineUom && priceUom !== lineUom && !convertedFromUom) {
    throw errors.validation(`Item Price ${priceName} applies to UOM "${priceUom}", but the document row uses "${lineUom}"`);
  }
  const currencyMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = typeof currencyMaster?.currency_scale === "number" ? currencyMaster.currency_scale : 2;
  let rate = toScaledInt(decimal(itemPrice.rate, "item price rate"), scale, "item price rate");
  if (rate < 0) throw errors.validation("Item Price rate cannot be negative");
  if (convertedFromUom) {
    item ??= await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
    if (!item) throw errors.reference(`Item ${itemCode} does not exist`);
    const sourceFactor = uomFactorMicros(item, convertedFromUom);
    const targetFactor = uomFactorMicros(item, lineUom);
    rate = multiplyDivideRounded(rate, targetFactor, sourceFactor);
  }

  const rules = await context.reader.listMasterRecordData(context.command.tenant_id, "Pricing Rule");
  const matches = rules
    .filter(({ data }) => matchesRule(data, input))
    .sort((a, b) => ruleScore(b.data) - ruleScore(a.data) || a.name.localeCompare(b.name));
  const selected = matches[0];
  let discount: string | undefined;
  if (selected) {
    const data = selected.data;
    if (data.rate !== undefined) {
      rate = toScaledInt(decimal(data.rate, "pricing rule rate"), scale, "pricing rule rate");
    } else if (data.discount_percentage !== undefined) {
      const pct = toScaledInt(decimal(data.discount_percentage, "discount percentage"), 6, "discount percentage");
      if (pct < 0 || pct > 100_000_000) throw errors.validation("Discount percentage must be between 0 and 100");
      const discountMinor = divideRounded(
        multiplyScaled(fromScaledInt(rate, scale), scale, fromScaledInt(pct, 6), 6, scale),
        100,
      );
      rate = Math.max(0, rate - discountMinor);
      discount = fromScaledInt(pct, 6);
    }
  }
  if (rate < 0) throw errors.validation("Resolved price cannot be negative");
  return {
    rate_minor: rate,
    rate: fromScaledInt(rate, scale),
    currency,
    currency_scale: scale,
    item_price: priceName,
    price_variant: priceVariant,
    ...((lineUom || priceUom) ? { uom: lineUom || priceUom } : {}),
    ...(convertedFromUom ? { source_uom: convertedFromUom } : {}),
    ...(selected ? { pricing_rule: selected.name } : {}),
    ...(discount ? { discount_percentage: discount } : {}),
  };
}

function matchesRule(rule: JsonObject, input: PricingContext): boolean {
  if (rule.disabled === true || rule.disabled === 1) return false;
  if (typeof rule.price_list === "string" && rule.price_list !== input.priceList) return false;
  if (typeof rule.item_code === "string" && rule.item_code !== input.itemCode) return false;
  if (typeof rule.party_type === "string" && rule.party_type !== input.partyType) return false;
  if (typeof rule.party === "string" && rule.party !== input.party) return false;
  if (typeof rule.customer_group === "string" && rule.customer_group !== input.customerGroup) return false;
  if (typeof rule.supplier_group === "string" && rule.supplier_group !== input.supplierGroup) return false;
  if (typeof rule.valid_from === "string" && input.postingDate.slice(0, 10) < rule.valid_from.slice(0, 10)) return false;
  if (typeof rule.valid_upto === "string" && input.postingDate.slice(0, 10) > rule.valid_upto.slice(0, 10)) return false;
  const min = rule.min_qty === undefined ? 0 : toScaledInt(decimal(rule.min_qty, "minimum quantity"), 6);
  const max = rule.max_qty === undefined ? Number.MAX_SAFE_INTEGER : toScaledInt(decimal(rule.max_qty, "maximum quantity"), 6);
  return input.qtyMicros >= min && input.qtyMicros <= max;
}

function ruleScore(rule: JsonObject): number {
  return (typeof rule.priority === "number" ? rule.priority : 0) * 100
    + (rule.party ? 20 : 0) + (rule.item_code ? 10 : 0) + (rule.customer_group || rule.supplier_group ? 5 : 0);
}

function decimal(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  return value;
}

function uomFactorMicros(item: JsonObject, uom: string): number {
  const stockUom = normalizedText(item.stock_uom);
  if (uom === stockUom) return 1_000_000;
  const rows = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
  const match = rows.find((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return normalizedText((value as JsonObject).uom) === uom;
  }) as JsonObject | undefined;
  if (!match) throw errors.validation(`UOM "${uom}" has no conversion factor on Item ${normalizedText(item.name) || normalizedText(item.item_code)}`);
  const factor = toScaledInt(decimal(match.conversion_factor, `conversion factor for ${uom}`), 6, `conversion factor for ${uom}`);
  if (factor <= 0) throw errors.validation(`Conversion factor for UOM "${uom}" must be greater than zero`);
  return factor;
}

function multiplyDivideRounded(value: number, multiplier: number, divisor: number): number {
  if (![value, multiplier, divisor].every(Number.isSafeInteger) || divisor <= 0) {
    throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  }
  const numerator = BigInt(value) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  return result;
}

function divideRounded(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  return sign * (quotient + ((absolute % denominator) * 2 >= denominator ? 1 : 0));
}
