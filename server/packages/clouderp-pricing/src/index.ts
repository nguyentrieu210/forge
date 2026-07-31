import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { PricingContext, ResolvedPrice } from "./types.js";

export type { PricingContext, ResolvedPrice } from "./types.js";

export async function resolveServerPrice(
  context: ControllerContext<JsonObject>,
  input: PricingContext,
): Promise<ResolvedPrice> {
  const lineUom = typeof input.uom === "string" ? input.uom.trim() : "";
  const legacyPriceName = `${input.priceList}:${input.itemCode}`;
  const exactPriceName = lineUom ? `${legacyPriceName}:${lineUom}` : "";
  let priceName = lineUom ? exactPriceName : legacyPriceName;
  let itemPrice = lineUom
    ? await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", exactPriceName)
    : null;

  // Existing tenants can still have the pre-UOM key. A typed legacy price is accepted only
  // when its declared UOM exactly matches the sales row. The older untyped form remains
  // compatible only when the row is also untyped; once either side declares a UOM, matching
  // becomes mandatory so a price for one commercial unit cannot leak into another.
  if (!itemPrice) {
    const legacy = await context.reader.getMasterRecordData(context.command.tenant_id, "Item Price", legacyPriceName);
    const legacyUom = typeof legacy?.uom === "string" ? legacy.uom.trim() : "";
    const compatible = lineUom ? legacyUom === lineUom : !legacyUom;
    if (legacy && compatible) {
      itemPrice = legacy;
      priceName = legacyPriceName;
    } else if (legacy && !lineUom && legacyUom) {
      throw errors.validation(`Item Price ${legacyPriceName} declares UOM "${legacyUom}"; the document row must provide a matching selling UOM`);
    }
  }
  if (!itemPrice) {
    const missingName = lineUom ? exactPriceName : legacyPriceName;
    throw errors.reference(`Item Price ${missingName} does not exist`);
  }
  const currency = typeof itemPrice.currency === "string" ? itemPrice.currency : "";
  if (!currency) throw errors.reference(`Item Price ${priceName} must define currency`);
  if (currency !== input.documentCurrency) throw errors.reference(`Item Price ${priceName} currency does not match document currency`);
  const priceUom = typeof itemPrice.uom === "string" ? itemPrice.uom.trim() : "";
  if (priceUom && lineUom && priceUom !== lineUom) {
    throw errors.validation(`Item Price ${priceName} applies to UOM "${priceUom}", but the document row uses "${lineUom}"`);
  }
  const currencyMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  const scale = typeof currencyMaster?.currency_scale === "number" ? currencyMaster.currency_scale : 2;
  let rate = toScaledInt(decimal(itemPrice.rate, "item price rate"), scale, "item price rate");
  if (rate < 0) throw errors.validation("Item Price rate cannot be negative");

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
    ...(priceUom ? { uom: priceUom } : {}),
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

function divideRounded(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) throw errors.validation("Pricing arithmetic exceeds safe integer bounds");
  const sign = numerator < 0 ? -1 : 1;
  const absolute = Math.abs(numerator);
  const quotient = Math.floor(absolute / denominator);
  return sign * (quotient + ((absolute % denominator) * 2 >= denominator ? 1 : 0));
}
