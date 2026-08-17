from pathlib import Path

path = Path("client/packages/views/src/form/ChildGrid.tsx")
text = path.read_text(encoding="utf-8")

import_anchor = 'export { defaultSalesDiscountPercent, deriveLinearSalesBasis, isOrdinaryQuantitySalesItem, isWidthQuantitySalesItem, type LinearSalesBasis } from "./sales-line-policy.js";\n'
policy_import = '''import {
  AREA_UOMS,
  COMPUTED_FROM,
  DOOR_FORMULA_INPUTS,
  DOOR_FORMULA_OUTPUTS,
  ITEM_DERIVED_FIELDS,
  SALES_ORDER_HIDDEN_FIELDS,
  SET_UOMS,
  childGridPolicyLabel,
  compactPolicyFields,
  deriveItemColorPolicy,
  deriveSalesQuantity,
  isAreaDoorSalesItem,
  isPurchaseGrid,
  isSalesOrderGrid,
  isSalesTransactionGrid,
  normalizedUom,
  resolveChildGridFieldPolicy,
  resolvePolicyColumns,
  salesSetCount,
  salesQuantityForRow as resolveSalesQuantityForRow,
  salesVisibilityOverride,
  type SalesQuantityPreview,
} from "./child-grid-policy.js";
export { deriveItemColorPolicy, deriveSalesQuantity, type SalesQuantityPolicy, type SalesQuantityPreview } from "./child-grid-policy.js";
'''
if policy_import not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit("child-grid import anchor changed")
    text = text.replace(import_anchor, import_anchor + policy_import, 1)

start = text.find("const PURCHASE_COMPACT_FIELDS")
end = text.find("export interface ChildGridProps", start)
if start < 0 or end < 0:
    raise SystemExit("child-grid top policy anchors changed")
text = text[:start] + text[end:]

old_visible = '''    ).visible || (meta.name === "Sales Order Item" && (() => {
      const basis = deriveLinearSalesBasis(row);
      const widthItem = isWidthQuantitySalesItem(row);
      const areaDoor = isAreaDoorSalesItem(row);
      return column.fieldname === "set_count"
        ? Boolean(areaDoor || basis || widthItem || isOrdinaryQuantitySalesItem(row))
        : column.fieldname === "height_m"
          ? areaDoor || basis === "RAY"
          : column.fieldname === "width_m"
            ? areaDoor || basis === "TRUC" || widthItem
            : false;
    })())));'''
new_visible = ''').visible || (meta.name === "Sales Order Item" && salesVisibilityOverride(row, column.fieldname))));'''
if text.count(old_visible) != 1:
    raise SystemExit(f"visible policy anchor changed: {text.count(old_visible)}")
text = text.replace(old_visible, new_visible, 1)

fn_start = text.find("export function resolveChildGridColumns(")
visible_marker = '  const visible = visibleColumns(gridColumns(meta), meta, rows, parentDoc, roles);'
visible_at = text.find(visible_marker, fn_start)
body_at = text.find("): DocField[] {", fn_start)
if fn_start < 0 or body_at < 0 or visible_at < 0:
    raise SystemExit("resolveChildGridColumns anchors changed")
body_at += len("): DocField[] {")
text = text[:body_at] + '''
  const policyColumns = resolvePolicyColumns(meta);
  if (policyColumns) return policyColumns;
''' + text[visible_at:]

old_compact = '  const compact = isPurchaseGrid(meta) ? PURCHASE_COMPACT_FIELDS : isSalesOrderGrid(meta) ? SALES_COMPACT_FIELDS : null;'
new_compact = '  const compact = compactPolicyFields(meta);'
if text.count(old_compact) != 1:
    raise SystemExit("compact policy anchor changed")
text = text.replace(old_compact, new_compact, 1)

label_start = text.find("function childGridColumnLabel(meta: DocTypeMeta, field: DocField): string {")
label_end = text.find("\n}\n\n/**\n * BỀ RỘNG CỘT", label_start)
if label_start < 0 or label_end < 0:
    raise SystemExit("column label anchors changed")
new_label = '''function childGridColumnLabel(meta: DocTypeMeta, field: DocField): string {
  return childGridPolicyLabel(meta, field) ?? field.label ?? field.fieldname;
}'''
text = text[:label_start] + new_label + text[label_end + 2:]

computed_start = text.find('  const COMPUTED_FROM = new Set([')
child_fields_marker = '  const childFieldnames = new Set((childMeta.fields ?? []).map((field) => field.fieldname));'
child_fields_at = text.find(child_fields_marker, computed_start)
if computed_start < 0 or child_fields_at < 0:
    raise SystemExit("computed policy anchors changed")
text = text[:computed_start] + text[child_fields_at:]

old_quantity = '''  const canApplySalesQuantity = (row: Doc, preview: SalesQuantityPreview): boolean => {
    if (String(row.inventory_mode ?? "").normalize("NFC").trim() !== "Nhôm cây/lá") return true;
    if (preview.policy === "LENGTH_X_PIECES") {
      return childFieldnames.has("length_m") && childFieldnames.has("qty_bar");
    }
    if (preview.policy === "PIECES") return childFieldnames.has("qty_bar");
    return true;
  };
  const salesQuantityForRow = (row: Doc): SalesQuantityPreview => {
    const preview = deriveSalesQuantity(row);
    return canApplySalesQuantity(row, preview)
      ? preview
      : { policy: "DIRECT", derived: false, label: "SL tính tiền" };
  };
'''
new_quantity = '  const salesQuantityForRow = (row: Doc): SalesQuantityPreview => resolveSalesQuantityForRow(row, childFieldnames);\n'
if text.count(old_quantity) != 1:
    raise SystemExit("sales quantity adapter anchor changed")
text = text.replace(old_quantity, new_quantity, 1)

field_start = text.find('  /** Màu được lọc theo Nhóm SP áp dụng của danh mục Màu vật tư; rỗng thì fail closed. */')
with_computed_at = text.find('  const withComputed = (row: Doc): Doc => {', field_start)
if field_start < 0 or with_computed_at < 0:
    raise SystemExit("field policy anchors changed")
new_field = '''  /** Business presentation rules live outside the generic renderer. */
  const fieldForRow = (field: DocField, row: Doc): DocField => resolveChildGridFieldPolicy(field, row, {
    childMeta,
    parentDoc,
    childFieldnames,
    allowedUomsByItem,
    allowedColorsByItem,
    colorPolicyByItem,
  });
'''
text = text[:field_start] + new_field + text[with_computed_at:]

path.write_text(text, encoding="utf-8")
