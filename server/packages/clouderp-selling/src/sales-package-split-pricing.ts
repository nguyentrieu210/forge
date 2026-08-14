import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { resolveSalesPackage, type ResolvedSalesPackage, type SalesPackageComponentSnapshot } from "./sales-package-resolver.js";
import type { SalesItem } from "./types.js";

const QTY_SCALE = 1_000_000;
const PERCENT_SCALE = 100_000_000;

/**
 * Validate and price selectable Sales Package children.
 *
 * The commercial parent keeps the standard full-set Item. Selected package components are
 * normal priced child rows for Item Price/Pricing Rule purposes, but remain owned by the
 * parent through sales_package_group_key. Their gross value is removed from the parent's
 * gross value before totals are calculated, so revenue is never counted twice.
 */
export async function applySelectablePackageChildPricing(
  context: ControllerContext<JsonObject>,
  items: SalesItem[],
  postingDate: string,
  currencyScale: number,
): Promise<SalesItem[]> {
  const groups = new Map<string, { parent: SalesItem; index: number; children: SalesItem[] }>();

  for (const [index, item] of items.entries()) {
    const groupKey = text((item as JsonObject).sales_package_group_key);
    const parentKey = text((item as JsonObject).sales_package_parent_key);
    if (groupKey && parentKey) {
      throw errors.validation(`Dòng ${index + 1}: không thể đồng thời là dòng bộ và dòng con của gói bán.`);
    }
    if (!groupKey) continue;
    if (groups.has(groupKey)) throw errors.validation(`Khóa nhóm gói bán ${groupKey} bị trùng.`);
    groups.set(groupKey, { parent: item, index, children: [] });
  }

  for (const [index, item] of items.entries()) {
    const parentKey = text((item as JsonObject).sales_package_parent_key);
    if (!parentKey) continue;
    const group = groups.get(parentKey);
    if (!group) throw errors.reference(`Dòng ${index + 1}: không tìm thấy dòng bộ cha ${parentKey}.`);
    group.children.push(item);
  }

  if (groups.size === 0) return items;
  const result = [...items];
  for (const [groupKey, group] of groups) {
    if (!isSplitMode(group.parent.sales_mode)) {
      if (group.children.length > 0) {
        throw errors.validation(`Dòng ${group.index + 1}: chỉ phương án Tách món mới được có món con tính giá riêng.`);
      }
      continue;
    }
    const packageName = text(group.parent.sales_package);
    if (!packageName) {
      if (group.children.length > 0) {
        throw errors.validation(`Dòng ${group.index + 1}: phương án Tách món chưa được gắn Gói bán hàng.`);
      }
      // Legacy direct split SKUs remain valid until a proven full-set parent/package mapping
      // exists. They do not gain selectable children merely because the UI assigns a group key.
      continue;
    }
    const snapshot = await resolveSalesPackage(context, {
      packageName,
      postingDate,
      itemCode: group.parent.item_code,
      facts: group.parent as unknown as Record<string, unknown>,
    });
    if (snapshot.selection_mode !== "SELECTABLE") {
      throw errors.validation(`Gói bán ${packageName} phải dùng chế độ SELECTABLE cho phương án Tách món.`);
    }
    if (group.children.length === 0) {
      throw errors.validation(`Dòng ${group.index + 1}: hãy tích chọn ít nhất một món trong Gói bán hàng.`);
    }

    const componentByKey = new Map(snapshot.components.map((component) => [component.component_key, component]));
    const selectedKeys = new Set<string>();
    for (const child of group.children) {
      const componentKey = text((child as JsonObject).sales_package_component_key);
      if (!componentKey) throw errors.validation(`Món con của dòng ${group.index + 1} thiếu mã component.`);
      if (selectedKeys.has(componentKey)) throw errors.validation(`Dòng ${group.index + 1}: component ${componentKey} được chọn nhiều lần.`);
      selectedKeys.add(componentKey);
      const component = componentByKey.get(componentKey);
      if (!component) throw errors.reference(`Dòng ${group.index + 1}: component ${componentKey} không thuộc Gói bán ${packageName}.`);
      assertChildMatchesComponent(group.parent, child, component, group.index);
    }
    for (const component of snapshot.components) {
      if (component.required && !selectedKeys.has(component.component_key)) {
        throw errors.validation(`Dòng ${group.index + 1}: món bắt buộc ${component.display_label || component.item_code} chưa được chọn.`);
      }
    }

    const adjustedParent = allocateParentResidual(group.parent, group.children, snapshot, currencyScale);
    result[group.index] = {
      ...adjustedParent,
      sales_package_version: snapshot.sales_package_version,
      sales_package_checksum: snapshot.sales_package_checksum,
      sales_package_snapshot: snapshot,
      sales_package_group_key: groupKey,
    } as SalesItem;
  }
  return result;
}

export function allocateParentResidual(
  parent: SalesItem,
  children: SalesItem[],
  snapshot: ResolvedSalesPackage,
  currencyScale: number,
): SalesItem {
  const componentByKey = new Map(snapshot.components.map((component) => [component.component_key, component]));
  const parentGross = grossMinor(parent, currencyScale);
  const parentBasis = moneyMinor(parent.discount_basis_amount_minor, parent.discount_basis_amount, currencyScale, "parent discount basis");
  let grossDeduction = 0;
  let basisDeduction = 0;

  for (const child of children) {
    const component = componentByKey.get(text((child as JsonObject).sales_package_component_key));
    if (!component) continue;
    const childGross = grossMinor(child, currencyScale);
    if (component.deduct_from_parent) grossDeduction = safeAdd(grossDeduction, childGross, "package child deduction");
    if (component.deduct_from_discount_basis) basisDeduction = safeAdd(basisDeduction, childGross, "package discount-basis deduction");
  }
  if (grossDeduction > parentGross) {
    throw errors.validation(`Tổng giá các món tách (${fromScaledInt(grossDeduction, currencyScale)}) vượt giá bộ (${fromScaledInt(parentGross, currencyScale)}).`);
  }
  if (basisDeduction > parentBasis) {
    throw errors.validation(`Tổng giá trừ khỏi cơ sở chiết khấu vượt cơ sở chiết khấu của dòng bộ.`);
  }

  const pricedQtyMicros = positiveSafeInteger(parent.priced_qty_micros ?? parent.qty_micros, "parent priced quantity");
  const requestedResidualGross = parentGross - grossDeduction;
  const residualRateMinor = divideRounded(BigInt(requestedResidualGross) * BigInt(QTY_SCALE), BigInt(pricedQtyMicros), "package residual rate");
  const residualGross = multiplyMinorByQty(residualRateMinor, pricedQtyMicros, "package residual gross");
  const residualBasis = Math.max(0, parentBasis - basisDeduction);
  const percentageMicros = toScaledInt(parent.discount_percentage ?? "0", 6, "parent discount percentage");
  const originalDiscount = moneyMinor(parent.discount_amount_minor, parent.discount_amount, currencyScale, "parent discount");
  const residualDiscount = percentageMicros > 0
    ? percentOfMinor(residualBasis, percentageMicros)
    : Math.min(originalDiscount, residualGross);
  const adjustment = moneyMinor(parent.adjustment_amount_minor, parent.adjustment_amount, currencyScale, "parent adjustment");
  const residualNet = safeAdd(safeAdd(residualGross, -residualDiscount, "package residual net"), adjustment, "package residual net");
  if (residualNet < 0) throw errors.validation("Giá còn lại của dòng bộ không thể âm sau khi tách món.");

  return {
    ...parent,
    rate: fromScaledInt(residualRateMinor, currencyScale),
    rate_minor: residualRateMinor,
    amount: fromScaledInt(residualGross, currencyScale),
    amount_minor: residualGross,
    discount_basis_amount: fromScaledInt(residualBasis, currencyScale),
    discount_basis_amount_minor: residualBasis,
    discount_amount: fromScaledInt(residualDiscount, currencyScale),
    discount_amount_minor: residualDiscount,
    net_amount: fromScaledInt(residualNet, currencyScale),
    net_amount_minor: residualNet,
    sales_package_full_set_amount: fromScaledInt(parentGross, currencyScale),
    sales_package_full_set_amount_minor: parentGross,
    sales_package_component_deduction: fromScaledInt(grossDeduction, currencyScale),
    sales_package_component_deduction_minor: grossDeduction,
  } as SalesItem;
}

function assertChildMatchesComponent(parent: SalesItem, child: SalesItem, component: SalesPackageComponentSnapshot, parentIndex: number): void {
  if (child.item_code !== component.item_code) {
    throw errors.validation(`Dòng ${parentIndex + 1}: component ${component.component_key} phải dùng mặt hàng ${component.item_code}.`);
  }
  if (text(child.uom) !== component.uom) {
    throw errors.validation(`Dòng ${parentIndex + 1}: ${component.item_code} phải dùng ĐVT ${component.uom}.`);
  }
  const childQty = toScaledInt(child.qty, 6, `${component.item_code}.qty`);
  if (childQty !== component.qty_micros) {
    throw errors.validation(`Dòng ${parentIndex + 1}: số lượng ${component.item_code} phải theo quy cách Gói bán (${component.qty}).`);
  }
  if (component.sales_option && text(child.sales_option) !== component.sales_option) {
    throw errors.validation(`Dòng ${parentIndex + 1}: ${component.item_code} phải dùng đúng chính sách bán ${component.sales_option}.`);
  }
  if (component.inherit_color && text((child as JsonObject).color) !== text((parent as JsonObject).color)) {
    throw errors.validation(`Dòng ${parentIndex + 1}: màu của ${component.item_code} phải theo dòng bộ cha.`);
  }
  if (component.inherit_dimensions) {
    for (const field of ["width_m", "height_m", "billable_area_sqm", "length_m"] as const) {
      if (!sameOptionalNumber((child as JsonObject)[field], (parent as JsonObject)[field])) {
        throw errors.validation(`Dòng ${parentIndex + 1}: ${field} của ${component.item_code} phải theo dòng bộ cha.`);
      }
    }
  }
  if (component.inherit_set_count && !sameOptionalNumber((child as JsonObject).set_count, (parent as JsonObject).set_count)) {
    throw errors.validation(`Dòng ${parentIndex + 1}: số bộ của ${component.item_code} phải theo dòng bộ cha.`);
  }
}

function sameOptionalNumber(left: unknown, right: unknown): boolean {
  const leftEmpty = left === undefined || left === null || left === "";
  const rightEmpty = right === undefined || right === null || right === "";
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) <= 0.000001;
}

function grossMinor(item: SalesItem, scale: number): number {
  const qtyMicros = positiveSafeInteger(item.priced_qty_micros ?? item.qty_micros, `${item.item_code}.priced_qty`);
  const rateMinor = moneyMinor(item.rate_minor, item.rate, scale, `${item.item_code}.rate`);
  return multiplyMinorByQty(rateMinor, qtyMicros, `${item.item_code}.gross`);
}

function moneyMinor(minor: unknown, value: unknown, scale: number, field: string): number {
  if (typeof minor === "number") {
    if (!Number.isSafeInteger(minor) || minor < 0) throw errors.validation(`${field} must be a non-negative safe integer`);
    return minor;
  }
  if (value === undefined || value === null || value === "") return 0;
  const parsed = toScaledInt(value as string | number, scale, field);
  if (parsed < 0) throw errors.validation(`${field} cannot be negative`);
  return parsed;
}

function multiplyMinorByQty(amountMinor: number, qtyMicros: number, field: string): number {
  return divideRounded(BigInt(amountMinor) * BigInt(qtyMicros), BigInt(QTY_SCALE), field);
}

function percentOfMinor(amountMinor: number, percentageMicros: number): number {
  return divideRounded(BigInt(amountMinor) * BigInt(percentageMicros), BigInt(PERCENT_SCALE), "package residual discount");
}

function divideRounded(numerator: bigint, denominator: bigint, field: string): number {
  if (denominator <= 0n) throw errors.validation(`${field} divisor must be positive`);
  const result = (numerator + denominator / 2n) / denominator;
  const value = Number(result);
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer range`);
  return value;
}

function positiveSafeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw errors.validation(`${field} must be positive`);
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} exceeds safe integer range`);
  return value;
}

function isSplitMode(value: unknown): boolean {
  return normalized(value) === "tach mon";
}

function normalized(value: unknown): string {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim() : "";
}
