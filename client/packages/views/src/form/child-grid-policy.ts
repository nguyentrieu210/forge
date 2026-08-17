import type { Doc, DocField, DocTypeMeta } from "@metaforge/core";
import {
  defaultSalesDiscountPercent,
  deriveLinearSalesBasis,
  isOrdinaryQuantitySalesItem,
  isWidthQuantitySalesItem,
} from "./sales-line-policy.js";

export { defaultSalesDiscountPercent, deriveLinearSalesBasis, isOrdinaryQuantitySalesItem, isWidthQuantitySalesItem } from "./sales-line-policy.js";

const PURCHASE_COMPACT_FIELDS = ["item_code", "qty", "uom", "rate", "amount"] as const;
const SALES_COMPACT_FIELDS = [
  "item_code", "sales_option", "color", "height_m", "width_m", "set_count", "has_butterfly_bracket",
  "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount",
] as const;
const SALES_ORDER_ITEM_FULL_FIELDS = [
  "item_code", "door_type", "sales_option", "color", "sales_mode", "height_m", "width_m", "mesh_height_m", "set_count",
  "has_butterfly_bracket", "leaf_variant", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding",
  "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count", "cut_width_m", "billable_area_sqm",
  "estimated_weight_kg", "estimated_minutes", "formula_policy", "formula_version", "formula_explanation",
  "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount", "motor_model", "accessories", "install_note", "warehouse",
  "availability_status", "note",
] as const;
export const SALES_ORDER_HIDDEN_FIELDS = new Set([
  "door_type", "has_butterfly_bracket", "mesh_height_m", "leaf_height_deduction_m", "leaf_divisor_m", "leaf_rounding",
  "leaf_count", "estimated_weight_kg", "estimated_minutes", "formula_explanation", "motor_model",
  "accessories", "warehouse", "stock_qty", "available_qty", "available_stock_qty", "available_stock_uom",
  "availability_status", "install_note", "sales_mode", "discount_percentage", "sales_qty_basis",
  "price_variant", "discount_basis_variant", "sales_package", "sales_package_snapshot",
]);
const PURCHASE_ORDER_ITEM_FULL_FIELDS = [
  "item_code", "length_m", "theoretical_kg_per_m", "qty_bundle", "qty_bar", "theoretical_kg",
  "qty", "uom", "rate", "amount", "color", "is_stamped", "so_no", "warehouse", "note",
] as const;
const PURCHASE_RECEIPT_ITEM_FULL_FIELDS = [
  "item_code", "length_m", "qty_bundle", "qty_bar", "qty", "uom", "rate", "amount", "theoretical_kg",
  "actual_weight_kg", "color", "is_stamped", "so_no", "warehouse", "purchase_order", "note",
] as const;

export function isPurchaseGrid(meta: DocTypeMeta): boolean {
  return meta.name === "Purchase Order Item" || meta.name === "Purchase Receipt Item";
}
export function isSalesOrderGrid(meta: DocTypeMeta): boolean {
  return meta.name === "Quotation Item" || meta.name === "Sales Order Item";
}
export function isSalesTransactionGrid(meta: DocTypeMeta): boolean {
  return ["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"].includes(meta.name);
}

export function resolvePolicyColumns(meta: DocTypeMeta): DocField[] | undefined {
  const names = meta.name === "Purchase Order Item"
    ? PURCHASE_ORDER_ITEM_FULL_FIELDS
    : meta.name === "Purchase Receipt Item"
      ? PURCHASE_RECEIPT_ITEM_FULL_FIELDS
      : isSalesOrderGrid(meta) ? SALES_ORDER_ITEM_FULL_FIELDS : undefined;
  if (!names) return undefined;
  return names
    .map((fieldname) => (meta.fields ?? []).find((field) => field.fieldname === fieldname))
    .filter((field): field is DocField => Boolean(field))
    .filter((field) => meta.name !== "Sales Order Item" || !SALES_ORDER_HIDDEN_FIELDS.has(field.fieldname));
}

export function compactPolicyFields(meta: DocTypeMeta): readonly string[] | undefined {
  if (isPurchaseGrid(meta)) return PURCHASE_COMPACT_FIELDS;
  if (isSalesOrderGrid(meta)) return SALES_COMPACT_FIELDS;
  return undefined;
}

export function childGridPolicyLabel(meta: DocTypeMeta, field: DocField): string | undefined {
  if (meta.name === "Sales Order Item") {
    if (field.fieldname === "set_count") return "Số lượng";
    if (field.fieldname === "qty") return "Khối lượng";
  }
  if (isPurchaseGrid(meta)) {
    if (field.fieldname === "qty") return "Số lượng";
    if (field.fieldname === "uom") return "ĐVT";
  }
  return undefined;
}

/** Temporary display bridge until Item master is loaded; server remains final authority. */
export function isAreaDoorSalesItem(row: Record<string, unknown>): boolean {
  if (String(row.inventory_mode ?? "").normalize("NFC").trim() === "Thành phẩm theo m2") return true;
  return /^TP-(?:TD-|ALD-|ALVIP|AL70|AL75|UC)/i.test(String(row.item_code ?? "").trim());
}

export const AREA_UOMS = new Set(["m2", "m²", "sqm"]);
const METRE_UOMS = new Set(["m", "mét", "met", "meter", "metre"]);
export const SET_UOMS = new Set(["bộ", "bo", "set"]);
const PIECE_UOMS = new Set(["cây", "cay", "lá", "la", "đoạn", "doan"]);

export function normalizedUom(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
}
function checkedValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || ["true", "yes", "có", "co"].includes(String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("vi"));
}
export function deriveItemColorPolicy(
  inventoryMode: unknown,
  profileRequireColor: unknown,
  allowedColorCount: number,
): { required: boolean; visible: boolean } {
  const mode = String(inventoryMode ?? "").normalize("NFC").trim();
  const required = checkedValue(profileRequireColor) || mode === "Nhôm cây/lá" || mode === "Thành phẩm theo m2";
  return { required, visible: required || allowedColorCount > 0 };
}
function finitePositive(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
export function salesSetCount(row: Doc): number | undefined {
  return row.set_count === undefined ? 1 : finitePositive(row.set_count);
}
function roundSalesQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export type SalesQuantityPolicy = "DIRECT" | "AREA" | "LENGTH_X_PIECES" | "PIECES";
export interface SalesQuantityPreview {
  policy: SalesQuantityPolicy;
  derived: boolean;
  quantity?: number;
  label: string;
}

export function deriveSalesQuantity(row: Doc): SalesQuantityPreview {
  const mode = String(row.inventory_mode ?? "").normalize("NFC").trim();
  const uom = normalizedUom(row.uom);
  const sets = salesSetCount(row);
  if (isWidthQuantitySalesItem(row) && METRE_UOMS.has(uom)) {
    const width = finitePositive(row.width_m);
    return { policy: "LENGTH_X_PIECES", derived: true, ...(width && sets ? { quantity: roundSalesQuantity(width * sets) } : {}), label: "Rộng × Số lượng (m)" };
  }
  if (isOrdinaryQuantitySalesItem(row)) {
    const quantity = row.set_count === undefined ? finitePositive(row.qty) : sets;
    return { policy: "PIECES", derived: true, ...(quantity ? { quantity } : {}), label: "Số lượng" };
  }
  const linearBasis = deriveLinearSalesBasis(row);
  if (linearBasis && METRE_UOMS.has(uom)) {
    const dimension = finitePositive(linearBasis === "RAY" ? row.height_m : row.width_m);
    return { policy: "LENGTH_X_PIECES", derived: true, ...(dimension && sets ? { quantity: roundSalesQuantity(dimension * sets) } : {}), label: linearBasis === "RAY" ? "Cao × Số lượng (m)" : "Rộng × Số lượng (m)" };
  }
  if (mode === "Thành phẩm theo m2") {
    if (SET_UOMS.has(uom)) return { policy: "PIECES", derived: true, ...(sets == null ? {} : { quantity: sets }), label: "Số bộ tính tiền" };
    if (AREA_UOMS.has(uom)) {
      if (String(row.door_type ?? "").trim()) {
        return { policy: "AREA", derived: true, quantity: sets == null || finitePositive(row.billable_area_sqm) == null ? undefined : roundSalesQuantity(Number(row.billable_area_sqm)), label: "Diện tích tính tiền (m²)" };
      }
      const width = finitePositive(row.width_m), height = finitePositive(row.height_m), minimum = Math.max(0, Number(row.min_area_sqm) || 0);
      return { policy: "AREA", derived: true, ...(width && height && sets ? { quantity: roundSalesQuantity(Math.max(width * height, minimum) * sets) } : {}), label: "Diện tích tính tiền (m²)" };
    }
  }
  if (mode === "Nhôm cây/lá") {
    const pieces = finitePositive(row.qty_bar);
    if (METRE_UOMS.has(uom)) {
      const length = finitePositive(row.length_m);
      return { policy: "LENGTH_X_PIECES", derived: true, ...(length && pieces ? { quantity: roundSalesQuantity(length * pieces) } : {}), label: "Tổng mét tính tiền" };
    }
    if (PIECE_UOMS.has(uom)) return { policy: "PIECES", derived: true, ...(pieces ? { quantity: pieces } : {}), label: "Số cây/lá tính tiền" };
  }
  return { policy: "DIRECT", derived: false, label: "SL tính tiền" };
}

export function salesVisibilityOverride(row: Doc, fieldname: string): boolean {
  const basis = deriveLinearSalesBasis(row);
  const widthItem = isWidthQuantitySalesItem(row);
  const areaDoor = isAreaDoorSalesItem(row);
  return fieldname === "set_count"
    ? Boolean(areaDoor || basis || widthItem || isOrdinaryQuantitySalesItem(row))
    : fieldname === "height_m" ? areaDoor || basis === "RAY"
      : fieldname === "width_m" ? areaDoor || basis === "TRUC" || widthItem : false;
}

export const COMPUTED_FROM = new Set([
  "qty", "rate", "qty_bar", "length_m", "theoretical_kg_per_m", "width_m", "height_m", "set_count",
  "mesh_height_m", "sales_mode", "has_butterfly_bracket", "uom", "conversion_factor", "actual_weight_kg", "discount_percentage",
]);
export const DOOR_FORMULA_INPUTS = new Set([
  "width_m", "height_m", "set_count", "mesh_height_m", "sales_mode", "has_butterfly_bracket", "uom",
  "leaf_variant", "leaf_divisor_m", "single_layer_leaf_count",
]);
export const DOOR_FORMULA_OUTPUTS = [
  "formula_policy", "formula_version", "formula_explanation", "width_basis", "cut_width_m", "billable_area_sqm",
  "leaf_height_deduction_m", "leaf_rounding", "leaf_count", "double_layer_leaf_count", "estimated_weight_kg", "estimated_minutes",
] as const;
export const ITEM_DERIVED_FIELDS = [
  "conversion_factor", "uom", "stock_uom", "stock_qty", "inventory_mode", "measurement_profile", "min_area_sqm",
  "item_name", "description", "color", "colour", "rate", "standard_rate", "rate_requires_approval", "amount",
  "discount_percentage", "discount_amount", "standard_amount", "formula_policy", "formula_version", "formula_explanation",
  "width_basis", "cut_width_m", "billable_area_sqm", "door_type", "leaf_variant", "leaf_height_deduction_m",
  "leaf_divisor_m", "leaf_rounding", "leaf_count", "single_layer_leaf_count", "double_layer_leaf_count",
  "estimated_weight_kg", "estimated_minutes", "paint_required", "length_m", "qty_bundle", "qty_bar", "actual_weight_kg",
  "total_length_m", "material_specification", "theoretical_kg_per_m", "theoretical_kg", "actual_kg_per_m",
  "actual_kg_per_sqm", "so_no", "available_qty", "available_stock_qty", "available_stock_uom", "availability_status",
] as const;

export interface ChildGridFieldPolicyContext {
  childMeta: DocTypeMeta;
  parentDoc?: Record<string, unknown>;
  childFieldnames: Set<string>;
  allowedUomsByItem: Record<string, string[]>;
  allowedColorsByItem: Record<string, string[]>;
  colorPolicyByItem: Record<string, { required: boolean; visible: boolean } | undefined>;
}

export function salesQuantityForRow(row: Doc, childFieldnames: Set<string>): SalesQuantityPreview {
  const preview = deriveSalesQuantity(row);
  if (String(row.inventory_mode ?? "").normalize("NFC").trim() !== "Nhôm cây/lá") return preview;
  if (preview.policy === "LENGTH_X_PIECES" && !(childFieldnames.has("length_m") && childFieldnames.has("qty_bar"))) return { policy: "DIRECT", derived: false, label: "SL tính tiền" };
  if (preview.policy === "PIECES" && !childFieldnames.has("qty_bar")) return { policy: "DIRECT", derived: false, label: "SL tính tiền" };
  return preview;
}

/** Pure metadata/row policy. The renderer owns state/services; this module owns business presentation rules. */
export function resolveChildGridFieldPolicy(field: DocField, row: Doc, context: ChildGridFieldPolicyContext): DocField {
  const { childMeta, parentDoc, childFieldnames, allowedUomsByItem, allowedColorsByItem, colorPolicyByItem } = context;
  const itemCode = String(row.item_code ?? "").trim();
  if (isSalesTransactionGrid(childMeta)) {
    const quantity = salesQuantityForRow(row, childFieldnames);
    const linearBasis = deriveLinearSalesBasis(row);
    const widthItem = isWidthQuantitySalesItem(row);
    const ordinaryItem = isOrdinaryQuantitySalesItem(row);
    const areaDoor = isAreaDoorSalesItem(row);
    if (areaDoor && field.fieldname === "width_m") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Rộng PB\n(m)", reqd: 1 };
    if (areaDoor && field.fieldname === "height_m") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Cao PB\n(m)", reqd: 1 };
    if (areaDoor && field.fieldname === "set_count") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Số bộ", reqd: 1 };
    if (linearBasis && field.fieldname === "set_count") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Số lượng", reqd: 1 };
    if (linearBasis && field.fieldname === "height_m" && linearBasis === "RAY") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Cao (m)", reqd: 1 };
    if (linearBasis && field.fieldname === "width_m" && linearBasis === "TRUC") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Rộng (m)", reqd: 1 };
    if (widthItem && field.fieldname === "set_count") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Số lượng", reqd: 1 };
    if (widthItem && field.fieldname === "width_m") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Rộng (m)", reqd: 1 };
    if (ordinaryItem && field.fieldname === "set_count") return { ...field, hidden: 0, depends_on: undefined, mandatory_depends_on: undefined, label: "Số lượng", reqd: 1 };
    if (ordinaryItem && field.fieldname === "qty") return { ...field, read_only: 1, read_only_depends_on: undefined, label: "Khối lượng" };
    if (field.fieldname === "width_m" && row.inventory_mode === "Thành phẩm theo m2") {
      const widthBasis = String(row.width_basis ?? "").normalize("NFC").toLocaleLowerCase("vi");
      const customerGroup = String(parentDoc?.customer_group ?? "").trim();
      const label = widthBasis.includes("nhựa") ? "Rộng PB nhựa\n(m)" : widthBasis.includes("ray") ? "Rộng PB ray\n(m)" : customerGroup === "Đại lý" ? "Rộng PB nhựa\n(m)" : customerGroup === "Lẻ" ? "Rộng PB ray\n(m)" : "Rộng theo chính sách\n(m)";
      return { ...field, label };
    }
    if (field.fieldname === "height_m" && row.inventory_mode === "Thành phẩm theo m2") return { ...field, label: "Cao PB\n(m)" };
    if (field.fieldname === "qty") return { ...field, label: "Khối lượng", read_only: quantity.derived ? 1 : field.read_only };
    if (field.fieldname === "rate") return { ...field, label: "Đơn giá (chiết khấu)\n(VNĐ)" };
    if (field.fieldname === "sales_option") return { ...field, label: "Phương án bán" };
    if (field.fieldname === "discount_percentage") return { ...field, hidden: 1, read_only: 1 };
    if (field.fieldname === "discount_amount") return { ...field, label: "Tiền CK\n(VNĐ)", read_only: 1 };
    if (field.fieldname === "adjustment_amount") return { ...field, label: "Phụ thu\n(VNĐ)", read_only: 1 };
    if (field.fieldname === "net_amount" || field.fieldname === "amount") return { ...field, label: "Thành tiền\n(VNĐ)", read_only: 1 };
    if (field.fieldname === "length_m" && quantity.policy === "LENGTH_X_PIECES") return { ...field, reqd: 1, label: "Dài một cây/đoạn (m)" };
    if (field.fieldname === "qty_bar" && (quantity.policy === "LENGTH_X_PIECES" || quantity.policy === "PIECES")) return { ...field, reqd: 1, label: "Số cây/đoạn" };
  }
  if (field.fieldname === "uom" && itemCode && Object.hasOwn(allowedUomsByItem, itemCode)) {
    const allowed = allowedUomsByItem[itemCode] ?? [];
    return { ...field, label: "ĐVT", link_filters: JSON.stringify([["UOM", "name", "in", allowed.length ? allowed : ["__NO_CONFIGURED_SALES_UOM__"]]]) };
  }
  if ((field.fieldname === "color" || field.fieldname === "colour") && deriveLinearSalesBasis(row) === "TRUC") return { ...field, hidden: 1, reqd: 0, read_only: 1, depends_on: undefined, mandatory_depends_on: undefined };
  if (field.fieldname !== "color" && field.fieldname !== "colour") return field;
  const allowed = allowedColorsByItem[itemCode] ?? [];
  const colorPolicy = colorPolicyByItem[itemCode];
  return {
    ...field,
    ...(colorPolicy ? { hidden: colorPolicy.visible ? 0 : 1, reqd: colorPolicy.required ? 1 : 0, depends_on: undefined, mandatory_depends_on: undefined } : {}),
    link_filters: JSON.stringify([["Item Color", "name", "in", allowed.length ? allowed : ["__NO_ALLOWED_COLOR_CONFIG__"]]]),
  };
}
