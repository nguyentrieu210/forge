import type { CanonicalDocument, FulfillmentEntry, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { pricedQtyMicros } from "../../clouderp-core/src/uom.js";
import type { SalesItem, SalesOrderData } from "./types.js";

export async function assertSalesOrderDeliveryLines(
  context: ControllerContext<JsonObject>,
  salesOrder: CanonicalDocument<SalesOrderData>,
  items: SalesItem[],
): Promise<void> {
  const source = sourceLines(salesOrder);
  const pending = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const resolved = resolveSourceLine(source, item, `Delivery row ${index + 1}`, salesOrder.name);
    const rowKey = resolved.rowKey;
    const sourceLine = resolved.line;
    item.sales_order_row_id = rowKey;
    item.sales_order = salesOrder.name;

    if (sourceLine.item_code !== item.item_code) throw errors.reference(`Delivery item ${item.item_code} does not match Sales Order row ${rowKey}`);
    if (text(item.uom) !== text(sourceLine.uom)) throw errors.validation(`Delivery row ${index + 1} must preserve Sales Order UOM ${sourceLine.uom}`);
    const requested = toScaledInt(item.qty, 6, `Delivery row ${index + 1}.qty`);
    const ordered = toScaledInt(sourceLine.qty, 6, `Sales Order row ${rowKey}.qty`);
    const prior = await context.reader.getFulfilledLineQuantityMicros(
      context.command.tenant_id, salesOrder.name, "Delivery", rowKey, "",
    );
    const inDocument = pending.get(rowKey) ?? 0;
    if (prior + inDocument + requested > ordered) {
      throw errors.reference(`Delivery quantity exceeds Sales Order row ${rowKey}`, {
        sales_order: salesOrder.name,
        sales_order_row_id: rowKey,
        ordered_qty_micros: ordered,
        already_delivered_qty_micros: prior,
        requested_qty_micros: inDocument + requested,
      });
    }
    pending.set(rowKey, inDocument + requested);
    item.rate = sourceLine.rate;
    if (sourceLine.rate_minor !== undefined) item.rate_minor = sourceLine.rate_minor;
    copyCommercialSnapshot(sourceLine, item);
  }
}

function copyCommercialSnapshot(source: SalesItem, target: SalesItem): void {
  const fields: Array<keyof SalesItem> = [
    "item_price", "price_variant", "base_rate", "base_rate_minor", "standard_rate",
    "pricing_rule", "pricing_as_of", "pricing_rule_snapshots", "discount_percentage",
    "discount_basis_item_price", "discount_basis_variant", "discount_basis_rate",
    "discount_basis_rate_minor", "sales_option", "sales_option_code", "sales_option_label",
    "sales_option_version", "sales_mode", "sales_package", "sales_package_version",
    "sales_package_checksum", "sales_package_snapshot", "sales_package_component_key",
    "sales_package_group_key", "sales_package_parent_key",
  ];
  const sourceRecord = source as unknown as Record<string, unknown>;
  const targetRecord = target as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = sourceRecord[field];
    if (value !== undefined) targetRecord[field] = typeof value === "object" && value !== null
      ? structuredClone(value)
      : value;
  }
}

export interface FreezeSalesOrderBillingOptions {
  /** Draft/save may preview an over-billed request; cumulative progress is enforced on submit. */
  enforceRemaining?: boolean;
}

export async function freezeSalesOrderBillingLines(
  context: ControllerContext<JsonObject>,
  salesOrder: CanonicalDocument<SalesOrderData>,
  requestedItems: SalesItem[],
  currencyScale: number,
  options: FreezeSalesOrderBillingOptions = {},
): Promise<SalesItem[]> {
  const source = sourceLines(salesOrder);
  const result: SalesItem[] = [];
  const enforceRemaining = options.enforceRemaining !== false;
  for (const [index, item] of requestedItems.entries()) {
    const resolved = resolveSourceLine(source, item, `Sales Invoice row ${index + 1}`, salesOrder.name);
    const rowKey = resolved.rowKey;
    const sourceLine = resolved.line;
    if (sourceLine.item_code !== item.item_code) throw errors.reference(`Sales Invoice item ${item.item_code} does not match Sales Order row ${rowKey}`);
    if (text(item.uom) !== text(sourceLine.uom)) throw errors.validation(`Sales Invoice row ${index + 1} must preserve Sales Order UOM ${sourceLine.uom}`);

    const currentQty = pricedQtyMicros(item);
    const sourceQty = pricedQtyMicros(sourceLine);
    if (currentQty > sourceQty) {
      throw errors.reference(`Billing quantity exceeds Sales Order row ${rowKey}`, {
        sales_order: salesOrder.name,
        sales_order_row_id: rowKey,
        ordered_qty_micros: sourceQty,
        requested_qty_micros: currentQty,
      });
    }
    const persistedPriorQty = await context.reader.getFulfilledLineQuantityMicros(
      context.command.tenant_id, salesOrder.name, "Billing", rowKey, "",
    );
    if (enforceRemaining && persistedPriorQty + currentQty > sourceQty) {
      throw errors.reference(`Billing quantity exceeds Sales Order row ${rowKey}`, {
        sales_order: salesOrder.name,
        sales_order_row_id: rowKey,
        ordered_qty_micros: sourceQty,
        already_billed_qty_micros: persistedPriorQty,
        requested_qty_micros: currentQty,
      });
    }
    const allocationPriorQty = enforceRemaining ? persistedPriorQty : 0;

    const rateMinor = sourceLine.rate_minor ?? toScaledInt(sourceLine.rate, currencyScale, `${rowKey}.rate`);
    const discountMinor = allocatedMoney(sourceLine.discount_amount_minor ?? 0, sourceQty, allocationPriorQty, currentQty, `${rowKey}.discount`);
    const adjustmentMinor = allocatedMoney(sourceLine.adjustment_amount_minor ?? 0, sourceQty, allocationPriorQty, currentQty, `${rowKey}.adjustment`);
    const taxableAdjustmentMinor = allocatedMoney(sourceLine.taxable_adjustment_amount_minor ?? 0, sourceQty, allocationPriorQty, currentQty, `${rowKey}.taxable_adjustment`);
    const basisMinor = allocatedMoney(sourceLine.discount_basis_amount_minor ?? 0, sourceQty, allocationPriorQty, currentQty, `${rowKey}.discount_basis`);
    const grossMinor = multiplyMoneyByQty(rateMinor, currentQty, `${rowKey}.gross`);
    const netMinor = safeAdd([grossMinor, -discountMinor, adjustmentMinor], `${rowKey}.net`);

    result.push({
      ...item,
      sales_order_row_id: rowKey,
      rate: fromScaledInt(rateMinor, currencyScale),
      rate_minor: rateMinor,
      priced_qty_micros: currentQty,
      ...(sourceLine.item_price ? { item_price: sourceLine.item_price } : {}),
      ...(sourceLine.price_variant ? { price_variant: sourceLine.price_variant } : {}),
      ...(sourceLine.base_rate !== undefined ? { base_rate: sourceLine.base_rate } : {}),
      ...(sourceLine.base_rate_minor !== undefined ? { base_rate_minor: sourceLine.base_rate_minor } : {}),
      ...(sourceLine.standard_rate !== undefined ? { standard_rate: sourceLine.standard_rate } : {}),
      ...(sourceLine.sales_option ? { sales_option: sourceLine.sales_option } : {}),
      ...(sourceLine.sales_option_code ? { sales_option_code: sourceLine.sales_option_code } : {}),
      ...(sourceLine.sales_option_label ? { sales_option_label: sourceLine.sales_option_label } : {}),
      ...(sourceLine.sales_option_version !== undefined ? { sales_option_version: sourceLine.sales_option_version } : {}),
      ...(sourceLine.sales_mode ? { sales_mode: sourceLine.sales_mode } : {}),
      ...(sourceLine.sales_package ? { sales_package: sourceLine.sales_package } : {}),
      ...(sourceLine.sales_package_version !== undefined ? { sales_package_version: sourceLine.sales_package_version } : {}),
      ...(sourceLine.sales_package_checksum ? { sales_package_checksum: sourceLine.sales_package_checksum } : {}),
      ...(sourceLine.sales_package_snapshot ? { sales_package_snapshot: structuredClone(sourceLine.sales_package_snapshot) } : {}),
      ...(sourceLine.pricing_rule ? { pricing_rule: sourceLine.pricing_rule } : {}),
      ...(sourceLine.pricing_as_of ? { pricing_as_of: sourceLine.pricing_as_of } : {}),
      ...(sourceLine.pricing_rule_snapshots ? { pricing_rule_snapshots: structuredClone(sourceLine.pricing_rule_snapshots) } : {}),
      ...(sourceLine.discount_percentage !== undefined ? { discount_percentage: sourceLine.discount_percentage } : {}),
      ...(sourceLine.discount_basis_item_price ? { discount_basis_item_price: sourceLine.discount_basis_item_price } : {}),
      ...(sourceLine.discount_basis_variant ? { discount_basis_variant: sourceLine.discount_basis_variant } : {}),
      ...(sourceLine.discount_basis_rate !== undefined ? { discount_basis_rate: sourceLine.discount_basis_rate } : {}),
      ...(sourceLine.discount_basis_rate_minor !== undefined ? { discount_basis_rate_minor: sourceLine.discount_basis_rate_minor } : {}),
      discount_basis_amount_minor: basisMinor,
      discount_basis_amount: fromScaledInt(basisMinor, currencyScale),
      discount_amount_minor: discountMinor,
      discount_amount: fromScaledInt(discountMinor, currencyScale),
      adjustment_amount_minor: adjustmentMinor,
      adjustment_amount: fromScaledInt(adjustmentMinor, currencyScale),
      taxable_adjustment_amount_minor: taxableAdjustmentMinor,
      taxable_adjustment_amount: fromScaledInt(taxableAdjustmentMinor, currencyScale),
      amount_minor: grossMinor,
      amount: fromScaledInt(grossMinor, currencyScale),
      net_amount_minor: netMinor,
      net_amount: fromScaledInt(netMinor, currencyScale),
    });
  }
  return result;
}

export function salesOrderFulfillmentEntries(
  salesOrder: string,
  kind: "Delivery" | "Billing",
  items: SalesItem[],
  postingAt: string,
  reverse = false,
): FulfillmentEntry[] {
  return items.map((item, index) => {
    const rowKey = text(item.sales_order_row_id);
    const componentKey = text(item.sales_package_component_key);
    const quantity = kind === "Delivery" ? toScaledInt(item.qty, 6) : pricedQtyMicros(item);
    return {
      line_key: `${reverse ? "REV-" : ""}${kind === "Delivery" ? "DELIVERY" : "BILLING"}-${salesOrder}-${item.row_id || index + 1}`,
      sales_order: salesOrder,
      kind,
      item_code: item.item_code,
      qty_micros: reverse ? -quantity : quantity,
      ...(rowKey ? { sales_order_line_key: rowKey } : {}),
      ...(componentKey ? { package_component_key: componentKey, skip_legacy_projection: kind === "Delivery" } : {}),
      posting_at: postingAt,
    };
  });
}

function resolveSourceLine(
  source: Map<string, SalesItem>,
  requested: SalesItem,
  label: string,
  salesOrder: string,
): { rowKey: string; line: SalesItem } {
  const explicit = text(requested.sales_order_row_id);
  if (explicit) {
    const line = source.get(explicit);
    if (!line) throw errors.reference(`Sales Order row ${explicit} does not belong to ${salesOrder}`);
    return { rowKey: explicit, line };
  }
  const candidates = [...source.entries()].filter(([, line]) => line.item_code === requested.item_code);
  if (candidates.length === 1) {
    const [rowKey, line] = candidates[0]!;
    return { rowKey, line };
  }
  if (candidates.length === 0) throw errors.reference(`${label} cannot infer a Sales Order source row for item ${requested.item_code}; sales_order_row_id is required`);
  throw errors.validation(`${label} matches multiple Sales Order rows for item ${requested.item_code}; sales_order_row_id is required`);
}

function sourceLines(salesOrder: CanonicalDocument<SalesOrderData>): Map<string, SalesItem> {
  const map = new Map<string, SalesItem>();
  for (const [index, item] of salesOrder.data.items.entries()) {
    const key = text(item.row_id);
    if (!key) throw errors.reference(`Sales Order ${salesOrder.name} row ${index + 1} has no stable row_id`);
    if (map.has(key)) throw errors.reference(`Sales Order ${salesOrder.name} contains duplicate row_id ${key}`);
    map.set(key, item);
  }
  return map;
}

function allocatedMoney(totalMinor: number, sourceQty: number, priorQty: number, currentQty: number, field: string): number {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw errors.validation(`${field} must be a non-negative safe integer`);
  if (sourceQty <= 0 || priorQty < 0 || currentQty <= 0 || priorQty + currentQty > sourceQty) throw errors.validation(`${field} allocation quantity is invalid`);
  const prior = ratioMinor(totalMinor, priorQty, sourceQty, field);
  const cumulative = ratioMinor(totalMinor, priorQty + currentQty, sourceQty, field);
  return cumulative - prior;
}

function ratioMinor(total: number, numerator: number, denominator: number, field: string): number {
  const value = Number((BigInt(total) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} allocation exceeds safe integer range`);
  return value;
}

function multiplyMoneyByQty(rateMinor: number, qtyMicros: number, field: string): number {
  const value = Number((BigInt(rateMinor) * BigInt(qtyMicros) + 500_000n) / 1_000_000n);
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer range`);
  return value;
}

function safeAdd(values: number[], field: string): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw errors.validation(`${field} contains an unsafe integer`);
    total += value;
    if (!Number.isSafeInteger(total)) throw errors.validation(`${field} exceeds safe integer range`);
  }
  return total;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
