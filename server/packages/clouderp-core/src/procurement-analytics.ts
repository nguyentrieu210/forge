import { errors } from "../../core/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import type { PurchaseItem, PurchaseOrderData } from "./types.js";

export interface PurchaseOrderDocument {
  name: string;
  docstatus: number;
  data: PurchaseOrderData;
}

export interface SupplierPriceObservation {
  purchase_order: string;
  row_id: string;
  company: string;
  supplier: string;
  item_code: string;
  uom: string | null;
  transaction_date: string;
  currency: string;
  currency_scale: number;
  rate_minor: number;
  rate: string;
  company_currency: string;
  company_currency_scale: number;
  base_rate_minor: number;
  base_rate: string;
}

export interface SupplierPriceSeries {
  key: string;
  company: string;
  supplier: string;
  item_code: string;
  uom: string | null;
  company_currency: string;
  company_currency_scale: number;
  observations: SupplierPriceObservation[];
  latest_base_rate_minor: number;
  previous_base_rate_minor: number | null;
  latest_change_bps: number | null;
}

export interface SupplierSpendSummary {
  company: string;
  supplier: string;
  company_currency: string;
  company_currency_scale: number;
  order_count: number;
  base_grand_total_minor: number;
  base_grand_total: string;
}

export function buildSupplierPriceHistory(orders: PurchaseOrderDocument[]): SupplierPriceSeries[] {
  const groups = new Map<string, SupplierPriceObservation[]>();
  for (const order of orders) {
    if (order.docstatus !== 1) continue;
    const data = order.data;
    const supplier = requiredText(data.supplier, `${order.name}.supplier`);
    const company = requiredText(data.company, `${order.name}.company`);
    const currency = requiredText(data.currency, `${order.name}.currency`);
    const companyCurrency = requiredText(data.company_currency ?? data.currency, `${order.name}.company_currency`);
    const transactionScale = integerScale(data.currency_scale, `${order.name}.currency_scale`, 2);
    const companyScale = integerScale(data.company_currency_scale, `${order.name}.company_currency_scale`, transactionScale);
    const conversionRate = data.conversion_rate_micros ?? 1_000_000;
    if (!Number.isSafeInteger(conversionRate) || conversionRate <= 0) {
      throw errors.validation(`${order.name}.conversion_rate_micros must be a positive safe integer`);
    }
    const date = isoDate(data.transaction_date, `${order.name}.transaction_date`);
    for (const [index, item] of data.items.entries()) {
      const rateMinor = item.rate_minor ?? toScaledInt(item.rate, transactionScale, `${order.name}.items[${index}].rate`);
      if (!Number.isSafeInteger(rateMinor) || rateMinor < 0) throw errors.validation(`${order.name} has invalid rate at row ${index + 1}`);
      const baseRateMinor = multiplyScaled(
        fromScaledInt(rateMinor, transactionScale),
        transactionScale,
        fromScaledInt(conversionRate, 6),
        6,
        companyScale,
        `${order.name}.items[${index}].base_rate`,
      );
      const rowId = requiredText(item.row_id || `ROW-${index + 1}`, `${order.name}.items[${index}].row_id`);
      const uom = lineUom(item);
      const observation: SupplierPriceObservation = {
        purchase_order: order.name,
        row_id: rowId,
        company,
        supplier,
        item_code: requiredText(item.item_code, `${order.name}.items[${index}].item_code`),
        uom,
        transaction_date: date,
        currency,
        currency_scale: transactionScale,
        rate_minor: rateMinor,
        rate: fromScaledInt(rateMinor, transactionScale),
        company_currency: companyCurrency,
        company_currency_scale: companyScale,
        base_rate_minor: baseRateMinor,
        base_rate: fromScaledInt(baseRateMinor, companyScale),
      };
      const key = priceKey(observation);
      const list = groups.get(key);
      if (list) list.push(observation);
      else groups.set(key, [observation]);
    }
  }

  return [...groups.entries()].map(([key, observations]) => {
    observations.sort(compareObservation);
    const latest = observations.at(-1)!;
    const previous = observations.length > 1 ? observations.at(-2)! : null;
    return {
      key,
      company: latest.company,
      supplier: latest.supplier,
      item_code: latest.item_code,
      uom: latest.uom,
      company_currency: latest.company_currency,
      company_currency_scale: latest.company_currency_scale,
      observations,
      latest_base_rate_minor: latest.base_rate_minor,
      previous_base_rate_minor: previous?.base_rate_minor ?? null,
      latest_change_bps: previous ? signedVarianceBps(latest.base_rate_minor, previous.base_rate_minor) : null,
    };
  }).sort((a, b) => a.key.localeCompare(b.key, "vi"));
}

export function buildSupplierSpendSummary(orders: PurchaseOrderDocument[]): SupplierSpendSummary[] {
  const groups = new Map<string, SupplierSpendSummary>();
  for (const order of orders) {
    if (order.docstatus !== 1) continue;
    const data = order.data;
    const company = requiredText(data.company, `${order.name}.company`);
    const supplier = requiredText(data.supplier, `${order.name}.supplier`);
    const companyCurrency = requiredText(data.company_currency ?? data.currency, `${order.name}.company_currency`);
    const scale = integerScale(data.company_currency_scale, `${order.name}.company_currency_scale`, data.currency_scale ?? 2);
    const total = data.base_grand_total_minor;
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
      throw errors.validation(`${order.name}.base_grand_total_minor must be a non-negative safe integer`);
    }
    const key = `${company}\u0000${supplier}\u0000${companyCurrency}\u0000${scale}`;
    const existing = groups.get(key);
    if (existing) {
      existing.order_count += 1;
      existing.base_grand_total_minor = safeAdd(existing.base_grand_total_minor, total, "supplier spend");
      existing.base_grand_total = fromScaledInt(existing.base_grand_total_minor, scale);
    } else {
      groups.set(key, {
        company,
        supplier,
        company_currency: companyCurrency,
        company_currency_scale: scale,
        order_count: 1,
        base_grand_total_minor: total,
        base_grand_total: fromScaledInt(total, scale),
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.company.localeCompare(b.company, "vi") || a.supplier.localeCompare(b.supplier, "vi"));
}

function priceKey(observation: SupplierPriceObservation): string {
  return [
    observation.company,
    observation.supplier,
    observation.item_code,
    observation.uom ?? "",
    observation.company_currency,
    String(observation.company_currency_scale),
  ].join("\u0000");
}

function compareObservation(a: SupplierPriceObservation, b: SupplierPriceObservation): number {
  return a.transaction_date.localeCompare(b.transaction_date)
    || a.purchase_order.localeCompare(b.purchase_order)
    || a.row_id.localeCompare(b.row_id);
}

function signedVarianceBps(actual: number, baseline: number): number | null {
  if (actual === baseline) return 0;
  if (baseline === 0) return null;
  if (baseline < 0) throw errors.validation("Historical price baseline must not be negative");
  const diff = BigInt(actual) - BigInt(baseline);
  const negative = diff < 0n;
  const absolute = negative ? -diff : diff;
  const numerator = absolute * 10_000n;
  const denominator = BigInt(baseline);
  const rounded = numerator / denominator + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Price variance exceeds safe integer range");
  return result;
}

function lineUom(item: PurchaseItem): string | null {
  const uom = item.uom?.trim() || item.stock_uom?.trim() || "";
  return uom || null;
}

function integerScale(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 9) {
    throw errors.validation(`${field} must be an integer from 0 to 9`);
  }
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function isoDate(value: string, field: string): string {
  const text = requiredText(value, field).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw errors.validation(`${field} must be a valid ISO date`);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw errors.validation(`${field} must be a valid ISO date`);
  }
  return text;
}
