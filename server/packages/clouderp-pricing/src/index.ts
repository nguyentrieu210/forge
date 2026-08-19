import type { JsonObject } from "../../contracts/src/index.js";
import { divideRoundedInt, errors } from "../../core/src/index.js";
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

/**
 * Bậc diện tích: cận trên ĐÓNG, cận dưới MỞ — `min < S ≤ max`.
 *
 * `BRD §4.11` chốt đúng chiều này, và nêu luôn hệ quả: một cửa đúng 5,0 m² ăn bậc `4-5`, không
 * phải bậc `5-6`. Đảo chiều là lệch một bậc giá trên đúng những đơn nằm ở mép.
 *
 * Thiếu cả hai cận thì bậc không ràng buộc gì — coi như không khớp, thay vì khớp mọi thứ.
 */
function areaWithinTier(tier: JsonObject, areaSqm: number): boolean {
  const min = Number(tier.min_area_sqm);
  const max = Number(tier.max_area_sqm);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return false;
  if (hasMin && !(areaSqm > min)) return false;
  if (hasMax && !(areaSqm <= max)) return false;
  return true;
}

/**
 * Dòng giá có gắn bậc chỉ khớp khi diện tích của dòng bán rơi vào đúng bậc đó.
 *
 * Fail-closed hai chiều: dòng bán không khai diện tích thì KHÔNG khớp bất kỳ dòng giá có bậc
 * nào (thà không thấy giá còn hơn lấy nhầm bậc), và bậc không đọc được thì cũng không khớp.
 */
async function priceTierMatches(
  context: ControllerContext<JsonObject>,
  data: JsonObject,
  areaSqm: number | undefined,
): Promise<boolean> {
  const tierName = normalizedText(data.area_tier);
  if (!tierName) return true;
  if (!Number.isFinite(areaSqm) || !((areaSqm as number) > 0)) return false;
  const tier = await context.reader.getMasterRecordData(context.command.tenant_id, "Bậc diện tích", tierName);
  if (!tier || disabled(tier.disabled)) return false;
  return areaWithinTier(tier, areaSqm as number);
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

function namedPriceCompatible(
  data: JsonObject,
  priceList: string,
  itemCode: string,
  lineUom: string,
  priceVariant: string,
): boolean {
  const dataPriceList = normalizedText(data.price_list);
  const dataItemCode = normalizedText(data.item_code);
  const priceUom = normalizedText(data.uom);
  if (dataPriceList && dataPriceList !== priceList) return false;
  if (dataItemCode && dataItemCode !== itemCode) return false;
  return itemPriceVariant(data) === priceVariant
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
    && namedPriceCompatible(legacy, priceList, itemCode, lineUom, STANDARD_PRICE_VARIANT)
    ? legacy
    : null;
  const compatiblePreferred = preferred
    && namedPriceCompatible(preferred, priceList, itemCode, lineUom, priceVariant)
    ? preferred
    : null;

  let priceName = preferredPriceName;
  let itemPrice: JsonObject | null = null;
  let convertedFromUom = "";
  let item: JsonObject | null = null;
  const areaSqm = Number.isFinite(Number(input.billableAreaSqm)) ? Number(input.billableAreaSqm) : undefined;
  /**
   * Lọc theo bậc diện tích TRƯỚC khi đếm ứng viên.
   *
   * Một mặt hàng bán theo thang giá có tám dòng `Item Price` cùng bảng giá / cùng ĐVT, chỉ khác
   * `area_tier`. Không lọc bậc trước thì tám dòng đó cùng lọt vào `exactCandidates` và hàm ném
   * "Multiple active Item Price records match" — tức thang giá vừa dựng lại làm chết chính nó.
   */
  const keepByTier = async (rows: Array<{ name: string; data: JsonObject }>) => {
    const kept: Array<{ name: string; data: JsonObject }> = [];
    for (const row of rows) if (await priceTierMatches(context, row.data, areaSqm)) kept.push(row);
    return kept;
  };
  const listedPrices = await context.reader.listMasterRecordData(context.command.tenant_id, "Item Price");
  const fieldMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, lineUom, priceVariant));
  const activeFieldMatches = await keepByTier(fieldMatches.filter(({ data }) => !disabled(data.disabled)));
  const exactCandidates = new Map<string, JsonObject>();
  if (
    compatiblePreferred
    && !disabled(compatiblePreferred.disabled)
    && await priceTierMatches(context, compatiblePreferred, areaSqm)
  ) {
    exactCandidates.set(preferredPriceName, compatiblePreferred);
  }
  for (const candidate of activeFieldMatches) {
    if (candidate.name === legacyPriceName && preferredPriceName !== legacyPriceName) continue;
    exactCandidates.set(candidate.name, candidate.data);
  }
  if (exactCandidates.size > 1) {
    throw errors.validation(
      `Multiple active Item Price records match ${priceList} / ${itemCode} / ${lineUom || "(no UOM)"} / ${priceVariant}: ${[...exactCandidates.keys()].sort().join(", ")}`,
    );
  }
  if (exactCandidates.size === 1) {
    const [candidateName, candidateData] = [...exactCandidates.entries()][0]!;
    itemPrice = candidateData;
    priceName = candidateName;
  } else if (
    compatibleLegacy
    && !disabled(compatibleLegacy.disabled)
    && await priceTierMatches(context, compatibleLegacy, areaSqm)
  ) {
    itemPrice = compatibleLegacy;
    priceName = legacyPriceName;
  }

  if (!itemPrice && lineUom) {
    item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
    const transactionDefaultUom = input.partyType === "Supplier"
      ? normalizedText(item?.default_purchase_uom)
      : normalizedText(item?.default_sales_uom);
    const baseUom = transactionDefaultUom || normalizedText(item?.stock_uom);
    if (item && baseUom && baseUom !== lineUom) {
      const baseMatches = listedPrices.filter(({ data }) => fieldMatchedPrice(data, priceList, itemCode, baseUom, priceVariant));
      // Đường lùi về ĐVT gốc cũng phải lọc bậc, không thì nó thành cửa sau bỏ qua thang giá.
      const activeBase = await keepByTier(baseMatches.filter(({ data }) => !disabled(data.disabled)));
      if (activeBase.length > 1) {
        throw errors.validation(`Multiple active Item Price records match ${priceList} / ${itemCode} / ${baseUom} / ${priceVariant}: ${activeBase.map(({ name }) => name).sort().join(", ")}`);
      }
      if (activeBase.length === 1) {
        itemPrice = activeBase[0]!.data;
        priceName = activeBase[0]!.name;
        convertedFromUom = baseUom;
      }
    }
  }

  /**
   * Đường này tồn tại để báo lỗi TỬ TẾ khi dòng giá duy nhất khớp lại đang ngừng dùng: chọn nó
   * rồi để kiểm tra ngay dưới ném "Item Price … is disabled", thay vì "does not exist".
   *
   * Vì thế nó chỉ được nhận ứng viên ĐANG NGỪNG DÙNG. Bản cũ lấy `fieldMatches[0]` — cả dòng
   * đang bật — điều mà trước khi có bậc thì không bao giờ xảy ra (một dòng bật đã được chọn ở
   * trên, nhiều dòng bật thì đã ném). Có bậc rồi thì xảy ra thật: một dòng giá BỊ BẬC LOẠI vẫn
   * đang bật, và nó lọt qua đây thành giá được dùng. Đơn không khai diện tích sẽ lặng lẽ ăn giá
   * của bậc đầu tiên trong danh sách.
   */
  if (!itemPrice) {
    const disabledCandidate = compatiblePreferred && disabled(compatiblePreferred.disabled)
      ? { name: preferredPriceName, data: compatiblePreferred }
      : compatibleLegacy && disabled(compatibleLegacy.disabled)
        ? { name: legacyPriceName, data: compatibleLegacy }
        : fieldMatches.find(({ data }) => disabled(data.disabled));
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
    throw errors.validation(`Item Price ${legacyPriceName} declares UOM "${legacyUom}"; the document row must provide a matching transaction UOM`);
  }
  if (!itemPrice) throw errors.reference(`Item Price ${preferredPriceName} does not exist for variant ${priceVariant}`);
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

  let selected: { name: string; data: JsonObject } | undefined;
  let discount: string | undefined;
  if (input.applyPricingRules !== false) {
    const rules = await context.reader.listMasterRecordData(context.command.tenant_id, "Pricing Rule");
    const matches = rules
      .filter(({ data }) => matchesRule(data, input))
      .sort((a, b) => ruleScore(b.data) - ruleScore(a.data) || a.name.localeCompare(b.name));
    if (matches.length > 1) {
      const topScore = ruleScore(matches[0]!.data);
      const tied = matches.filter(({ data }) => ruleScore(data) === topScore);
      if (tied.length > 1) {
        throw errors.validation(`Ambiguous Pricing Rule match: ${tied.map(({ name }) => name).sort().join(", ")}`);
      }
    }
    selected = matches[0];
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
  if (![value, multiplier, divisor].every(Number.isSafeInteger) || divisor <= 0) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  const numerator = BigInt(value) * BigInt(multiplier);
  const denominator = BigInt(divisor);
  const rounded = (numerator + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  return result;
}

function divideRounded(numerator: number, denominator: number): number {
  return divideRoundedInt(numerator, denominator, "Pricing arithmetic exceeds safe integer bounds");
}
