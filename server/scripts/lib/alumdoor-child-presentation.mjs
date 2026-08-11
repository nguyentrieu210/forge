import { parseField } from "./compile-brief.mjs";

const SALES_COMPACT_FIELDS = [
  "item_code", "sales_option", "color", "height_m", "width_m", "set_count", "has_butterfly_bracket",
  "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount",
];

const SALES_FULL_FIELDS = [
  "item_code", "sales_option", "color", "height_m", "width_m", "set_count", "has_butterfly_bracket",
  "leaf_variant", "single_layer_leaf_count", "double_layer_leaf_count", "cut_width_m", "billable_area_sqm",
  "length_m", "qty_bar", "uom", "qty", "rate", "discount_amount", "adjustment_amount", "net_amount", "note",
];

const PURCHASE_COMPACT_FIELDS = ["item_code", "qty", "uom", "rate", "amount"];
const PURCHASE_ORDER_FULL_FIELDS = [
  "item_code", "color", "height_m", "width_m", "set_count",
  "length_m", "theoretical_kg_per_m", "qty_bundle", "qty_bar", "theoretical_kg",
  "qty", "uom", "rate", "amount", "is_stamped", "so_no", "warehouse", "note",
];
const PURCHASE_RECEIPT_FULL_FIELDS = [
  "item_code", "color", "height_m", "width_m", "set_count",
  "length_m", "qty_bundle", "qty_bar", "qty", "uom", "rate", "rate_uom", "amount",
  "theoretical_kg", "actual_weight_kg", "actual_kg_per_m", "actual_kg_per_sqm", "weight_variance_pct",
  "condition", "is_stamped", "so_no", "warehouse", "purchase_order", "note",
];

const EXACT = new Map([
  ["Quotation Item", { quick: SALES_COMPACT_FIELDS, full: SALES_FULL_FIELDS }],
  ["Sales Order Item", { quick: SALES_COMPACT_FIELDS, full: SALES_FULL_FIELDS }],
  ["Purchase Order Item", { quick: PURCHASE_COMPACT_FIELDS, full: PURCHASE_ORDER_FULL_FIELDS }],
  ["Purchase Receipt Item", { quick: PURCHASE_COMPACT_FIELDS, full: PURCHASE_RECEIPT_FULL_FIELDS }],
]);

const SALES_PREVIEW = new Set(["Quotation Item", "Sales Order Item", "Delivery Note Item", "Sales Invoice Item"]);
const PURCHASE_PREVIEW = new Set(["Supplier Quotation Item", "Purchase Order Item", "Purchase Receipt Item", "Purchase Invoice Item"]);
const PREVIEW_METHOD = "alumdoor.ui.preview_child_row";

// Current Selling authority keeps these values for compatibility, audit, fulfilment identity,
// or downstream reproducibility. They are not normal operator columns. Do not let a generic
// `required`/`in_list_view` fallback leak them back into Sales Invoice / Delivery Note grids.
const SALES_INTERNAL_FIELDS = new Set([
  "sales_mode",
  "discount_percentage",
  "sales_qty_basis",
  "sales_option_code",
  "sales_option_label",
  "sales_option_version",
  "price_variant",
  "discount_basis_variant",
  "discount_basis_item_price",
  "sales_package",
  "sales_package_version",
  "sales_package_checksum",
  "sales_package_snapshot",
  "sales_order_row_id",
  "sales_package_component_key",
  "standard_amount",
  "formula_policy",
  "formula_version",
  "formula_explanation",
]);

function isLayout(fieldtype) {
  return ["Heading", "Section Break", "Column Break", "HTML", "Tab Break", "Fold", "Button"].includes(fieldtype);
}

function fieldObjects(doctype) {
  return (doctype.fields ?? []).map((field, index) => parseField(field, index, doctype.name));
}

function existing(names, fieldNames) {
  return names.filter((name) => fieldNames.has(name));
}

function hasConditionalApplicability(field) {
  return [field.depends_on, field.mandatory_depends_on, field.reqd_depends_on]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

function isInternalField(doctypeName, field) {
  return field.hidden || isLayout(field.fieldtype)
    || (SALES_PREVIEW.has(doctypeName) && SALES_INTERNAL_FIELDS.has(field.fieldname));
}

function isAuthoredQuick(field, listed) {
  return listed.has(field.fieldname) || field.in_list_view === true || field.in_list_view === 1 || field.surface === "quick";
}

function requiredEditableNames(doctypeName, fields, full) {
  const allowed = new Set(full);
  return fields
    .filter((field) => allowed.has(field.fieldname)
      && field.required
      && !field.read_only
      && !isInternalField(doctypeName, field)
      && !hasConditionalApplicability(field))
    .map((field) => field.fieldname);
}

function closeQuickOverRequired(doctypeName, fields, full, preferredQuick) {
  const wanted = new Set([
    ...preferredQuick,
    ...requiredEditableNames(doctypeName, fields, full),
  ]);
  return full.filter((name) => wanted.has(name));
}

function previewPolicy(doctypeName) {
  if (SALES_PREVIEW.has(doctypeName)) {
    return {
      previewMethod: PREVIEW_METHOD,
      previewParentFields: ["customer", "customer_group", "selling_price_list", "currency", "transaction_date"],
    };
  }
  if (PURCHASE_PREVIEW.has(doctypeName)) {
    return {
      previewMethod: PREVIEW_METHOD,
      previewParentFields: ["company", "currency", "transaction_date"],
    };
  }
  return {};
}

function exactSurface(doctypeName, field, policy) {
  if (isInternalField(doctypeName, field) || !policy.full.includes(field.fieldname)) return "internal";
  return policy.quick.includes(field.fieldname) ? "quick" : "expanded";
}

function defaultSurface(doctypeName, field, listed) {
  if (isInternalField(doctypeName, field)) return "internal";
  if ((field.required && !hasConditionalApplicability(field)) || isAuthoredQuick(field, listed)) return "quick";
  return "expanded";
}

function genericPolicy(doctypeName, fields, listed) {
  const full = fields
    .filter((field) => !isInternalField(doctypeName, field))
    .map((field) => field.fieldname);
  let quick = fields
    .filter((field) => !isInternalField(doctypeName, field)
      && ((field.required && !hasConditionalApplicability(field)) || isAuthoredQuick(field, listed)))
    .map((field) => field.fieldname);
  if (!quick.length && full.length) quick = [full[0]];
  return { full, quick };
}

/**
 * Materialise AlumDoor child-grid presentation into the canonical brief source.
 *
 * Exact transaction children have an operator-curated full/compact contract. Other children keep
 * their authored list/field-level quick intent, while internal Selling snapshots stay out of
 * business surfaces. A conditional required field remains reachable in full/detail without being
 * blanket-promoted into every compact row. Runtime applicability is evaluated per row by the
 * generic grid.
 */
export function applyAlumdoorChildPresentation(brief) {
  let migrated = 0;
  for (const doctype of brief.doctypes ?? []) {
    if (!doctype?.child) continue;
    const fields = fieldObjects(doctype);
    const fieldNames = new Set(fields.map((field) => field.fieldname));
    const listed = new Set(existing(doctype.list ?? [], fieldNames));
    const declared = EXACT.get(doctype.name);
    const policy = declared
      ? (() => {
          const full = existing(declared.full, fieldNames);
          const preferredQuick = existing(declared.quick, new Set(full));
          return { full, quick: closeQuickOverRequired(doctype.name, fields, full, preferredQuick) };
        })()
      : genericPolicy(doctype.name, fields, listed);
    const preview = previewPolicy(doctype.name);

    doctype.fields = fields.map((field) => ({
      ...field,
      surface: declared
        ? exactSurface(doctype.name, field, policy)
        : defaultSurface(doctype.name, field, listed),
    }));
    doctype.form = { fields: policy.full, ...preview };
    doctype.quickEntry = { fields: policy.quick, ...preview };
    migrated += 1;
  }
  return { migrated };
}

export const alumdoorGoldenChildGridPolicies = Object.freeze({
  salesCompact: SALES_COMPACT_FIELDS,
  salesFull: SALES_FULL_FIELDS,
  purchaseCompact: PURCHASE_COMPACT_FIELDS,
  purchaseOrderFull: PURCHASE_ORDER_FULL_FIELDS,
  purchaseReceiptFull: PURCHASE_RECEIPT_FULL_FIELDS,
});
