import { ALUMDOOR_UOM_CATALOG, canonicalAlumdoorUom } from "./alumdoor-uom-catalog.mjs";
import { BOM_TEMPLATE_SOURCE_CATALOG } from "./alumdoor-bom-template-source-catalog.mjs";

const UOMS = new Set(ALUMDOOR_UOM_CATALOG.map((row) => row.name));
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const fold = (v) => clean(v).normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("vi").replace(/Đ/g, "D");

export function positiveBomNumber(value) {
  const raw = clean(value).replace(",", ".");
  if (!raw || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function itemConversion(item, uom) {
  const values = (item?.uom_conversions ?? [])
    .filter((row) => canonicalAlumdoorUom(row?.uom) === uom)
    .map((row) => Number(row?.conversion_factor))
    .filter((n) => Number.isFinite(n) && n > 0);
  const unique = [...new Set(values)];
  if (unique.length === 1) return { status: "accepted", conversion_factor: unique[0] };
  if (unique.length > 1) return { status: "blocked", reason: "conflicting_conversion", conversion_factors: unique };
  return { status: "blocked", reason: "missing_conversion" };
}

export function classifyBomSourceUom(rawValue) {
  const raw = clean(rawValue);
  const key = fold(raw).replace(/\s+/g, "");
  if (!raw) return { status: "blocked", reason: "unknown_uom", raw_uom: raw };
  const rates = [
    [/^KG\/M2$/, { denominator: "m2", axis: "area" }],
    [/^KG\/MNGANG$/, { denominator: "Mét", axis: "width" }],
    [/^KG\/MCAO$/, { denominator: "Mét", axis: "height" }],
    [/^KG\/M$/, { denominator: "Mét", axis: "linear" }],
    [/^KG\/CAP$/, { denominator: "Cặp", axis: "count" }],
    [/^KG\/CON$/, { denominator: "Con", axis: "count" }],
    [/^KG\/CAI$/, { denominator: "Cái", axis: "count" }],
  ];
  for (const [pattern, spec] of rates) if (pattern.test(key)) return { status: "accepted", kind: "rate", raw_uom: raw, numerator_uom: "Kg", ...spec };
  if (key === "MNGANG") return { status: "accepted", kind: "ordinary", raw_uom: raw, runtime_uom: "Mét", axis: "width" };
  const runtimeUom = canonicalAlumdoorUom(raw);
  if (!UOMS.has(runtimeUom)) return { status: "blocked", reason: "unknown_uom", raw_uom: raw, normalized_uom: runtimeUom };
  return { status: "accepted", kind: "ordinary", raw_uom: raw, runtime_uom: runtimeUom, axis: null };
}

export function resolveBomRuntimeUom(record, item) {
  const stockUom = canonicalAlumdoorUom(item?.stock_uom);
  if (!stockUom || !UOMS.has(stockUom)) return { status: "blocked", reason: "missing_stock_uom", stock_uom: stockUom };
  const source = classifyBomSourceUom(record?.source_uom);
  if (source.status !== "accepted") return { ...source, stock_uom: stockUom };
  if (source.kind === "rate") {
    if (source.numerator_uom !== stockUom) return { status: "blocked", reason: "rate_uom_stock_mismatch", raw_uom: source.raw_uom, rate_numerator_uom: source.numerator_uom, stock_uom: stockUom };
    return {
      ...source,
      status: "accepted",
      runtime_uom: stockUom,
      stock_uom: stockUom,
      rate_denominator: source.denominator,
      rate_axis: source.axis,
    };
  }
  if (source.runtime_uom === stockUom) return { ...source, status: "accepted", stock_uom: stockUom };
  const conversion = itemConversion(item, source.runtime_uom);
  if (conversion.status !== "accepted") return { status: "blocked", reason: conversion.reason, raw_uom: source.raw_uom, runtime_uom: source.runtime_uom, stock_uom: stockUom, ...(conversion.conversion_factors ? { conversion_factors: conversion.conversion_factors } : {}) };
  return { ...source, status: "accepted", stock_uom: stockUom, conversion_factor: conversion.conversion_factor };
}

const templateRuleByRow = new Map();
const templateDeferredByRow = new Map();
for (const entry of BOM_TEMPLATE_SOURCE_CATALOG) {
  const sourceSheet = clean(entry?.source?.sheet || "ĐM");
  const allowedItems = JSON.parse(entry.data.actual_component_allowed_items_json || "{}");
  for (const rule of entry.data.component_rules ?? []) {
    templateRuleByRow.set(Number(rule.source_row), {
      template_code: entry.data.template_code,
      source_sheet: sourceSheet,
      rule,
      expected_items: [clean(rule.item_code)].filter(Boolean),
    });
  }
  for (const deferred of JSON.parse(entry.data.deferred_components_json || "[]")) {
    const rows = deferred.source_rows ?? [deferred.source_row];
    const expectedItems = (allowedItems?.[deferred.key] ?? []).map(clean).filter(Boolean);
    for (const row of rows) {
      templateDeferredByRow.set(Number(row), {
        template_code: entry.data.template_code,
        source_sheet: sourceSheet,
        deferred,
        expected_items: expectedItems,
      });
    }
  }
}

function lineageItemMatches(record, canonicalItemCode, expectedItems) {
  const actual = new Set([clean(record?.item_code), clean(canonicalItemCode)].filter(Boolean));
  return expectedItems.some((itemCode) => actual.has(clean(itemCode)));
}

function lineageMismatch(record, canonicalItemCode, mapped, kind) {
  return {
    status: "blocked",
    reason: "template_lineage_item_mismatch",
    kind,
    template_code: mapped.template_code,
    component_key: kind === "formula" ? mapped.rule.component_key : mapped.deferred.key,
    source_sheet: clean(record?.source_sheet),
    expected_source_sheet: mapped.source_sheet,
    source_item_code: clean(record?.item_code),
    canonical_item_code: clean(canonicalItemCode),
    expected_item_code: mapped.expected_items.length === 1 ? mapped.expected_items[0] : undefined,
    expected_item_codes: mapped.expected_items,
  };
}

export function resolveTemplateLineage(record, canonicalItemCode = "") {
  const row = Number(record?.source_row);
  const mapped = templateRuleByRow.get(row);
  if (mapped) {
    if (mapped.source_sheet && clean(record?.source_sheet) !== mapped.source_sheet) return { status: "unmapped" };
    if (!lineageItemMatches(record, canonicalItemCode, mapped.expected_items)) return lineageMismatch(record, canonicalItemCode, mapped, "formula");
    return {
      status: "mapped",
      kind: "formula",
      template_code: mapped.template_code,
      component_key: mapped.rule.component_key,
      expected_item_code: mapped.expected_items[0],
      quantity_formula_json: mapped.rule.quantity_formula_json,
      source_formula: mapped.rule.source_formula,
    };
  }
  const deferred = templateDeferredByRow.get(row);
  if (deferred) {
    if (deferred.source_sheet && clean(record?.source_sheet) !== deferred.source_sheet) return { status: "unmapped" };
    if (!lineageItemMatches(record, canonicalItemCode, deferred.expected_items)) return lineageMismatch(record, canonicalItemCode, deferred, "deferred_actual");
    return {
      status: "mapped",
      kind: "deferred_actual",
      template_code: deferred.template_code,
      component_key: deferred.deferred.key,
      expected_item_codes: deferred.expected_items,
      reason: deferred.deferred.reason,
    };
  }
  return { status: "unmapped" };
}

function manualActual(text) {
  const value = fold(text);
  return value === "THUC TE" || value.includes("TRU THUC TE") || value.includes("XUAT THUC TE") || value.includes("TRU SL THUC TE");
}
function hasGeometry(text) { return /RONG|NGANG|CAO|DIEN TICH|\bDT\b|M2|PBRAY|RCL/.test(fold(text)); }
const formulaField = (field, multiply = 1, offset = undefined) => JSON.stringify({
  base: { kind: "FIELD", field, ...(offset === undefined ? {} : { offset }) },
  ...(multiply === 1 ? {} : { multiply }),
});
const formulaProduct = (left, right, multiply = 1) => JSON.stringify({
  base: { kind: "PRODUCT", left, right },
  ...(multiply === 1 ? {} : { multiply }),
});
const closeNumber = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-9;

function resolveExactSourceGeometry(record, uomResolution, canonicalItemCode, n, text) {
  const compact = fold(text).replace(/\s+/g, "");
  const item = clean(canonicalItemCode);

  if (item === "NVL-RONDAYUC" && compact === "RONDAY=CHIEURONGPBRAYX0.0077" && closeNumber(n, 0.0077)) {
    return { status: "runtime_formula", qty_basis: "Theo rộng phủ bì ray", formula_kind: "source_exact_uc_bottom_seal", quantity_formula_json: formulaField("PB_RAY_RONG", n) };
  }
  if (["NVL-TRUC34", "NVL-TR114-1.8"].includes(item) && compact === "TRUC=CHIEURONGPBRAY+40CM" && closeNumber(n, 1.7)) {
    return { status: "runtime_formula", qty_basis: "Theo rộng phủ bì ray + 0,40 m", formula_kind: "source_exact_uc_shaft_plus_40cm", quantity_formula_json: formulaField("PB_RAY_RONG", n, 0.4) };
  }
  if (item === "NVL-3X6M" && compact === "M=RONGPBRAY-30" && uomResolution.runtime_uom === "Mét") {
    return { status: "runtime_formula", qty_basis: "Theo rộng phủ bì ray - 0,03 m", formula_kind: "source_exact_uc_width_minus_30mm", quantity_formula_json: formulaField("PB_RAY_RONG", 1, -0.03) };
  }
  if (item.startsWith("NVL-TON-DL5.2Dx124-") && compact === "C*(R-0,03)*SL*6,32KG/M2" && closeNumber(n, 6.32)) {
    return { status: "runtime_formula", qty_basis: "Cao PB × rộng cắt lá × 6,32 kg/m²", formula_kind: "source_exact_dl_leaf_632", quantity_formula_json: formulaProduct({ field: "PB_CAO" }, { field: "PB_RAY_RONG", offset: -0.03 }, n) };
  }
  if (item === "NVL-V4_KEM_STD" && compact === "(RONGPBRAY-30)1,312KG/M" && uomResolution.runtime_uom === "Mét") {
    return { status: "runtime_formula", qty_basis: "Theo rộng phủ bì ray - 0,03 m", formula_kind: "source_exact_dl_v4_width_minus_30mm", quantity_formula_json: formulaField("PB_RAY_RONG", 1, -0.03) };
  }
  if (compact === "(RPBRAY-30)X2XTL" && item === "NVL-V4_KEM_STD" && uomResolution.runtime_uom === "Mét") {
    return { status: "runtime_formula", qty_basis: "2 × (rộng phủ bì ray - 0,03 m)", formula_kind: "source_exact_dl_v4_two_lengths", quantity_formula_json: formulaField("PB_RAY_RONG", 2, -0.03) };
  }
  if (compact === "(RPBRAY-30)X2XTL" && item === "NVL-TR114-1.8" && uomResolution.runtime_uom === "Kg" && closeNumber(n, 1.312)) {
    return { status: "runtime_formula", qty_basis: "2 × rộng cắt × 1,312 kg/m", formula_kind: "source_exact_dl_shaft_two_lengths_weight", quantity_formula_json: formulaField("PB_RAY_RONG", 2 * n, -0.03) };
  }
  return null;
}

export function resolveBomQuantity(record, uomResolution, parentItem, canonicalItemCode = "") {
  void parentItem;
  const mapped = resolveTemplateLineage(record, canonicalItemCode);
  if (mapped.status === "blocked") return mapped;
  if (mapped.status === "mapped") {
    if (mapped.kind === "deferred_actual") return { ...mapped, status: "deferred", qty_basis: "Runtime actual" };
    return { ...mapped, status: "runtime_formula", qty_basis: "BOM Template" };
  }
  const raw = clean(record?.source_qty_or_formula);
  const n = positiveBomNumber(raw);
  const code = clean(record?.source_formula_code);
  const text = clean(record?.source_formula_text);
  if (manualActual(`${raw} ${code} ${text}`)) return { status: "deferred", reason: "manual_actual_consumption_source_rule", qty_basis: "Runtime actual" };
  const multipliers = new Map([["SL_X_DM",1],["SL_X2_X_DM",2],["SL_X4_X_DM",4],["SL_X6_X_DM",6]]);
  if (multipliers.has(code)) {
    if (!n) return { status: "blocked", reason: "missing_quantity_evidence" };
    return { status: "accepted", qty: n * multipliers.get(code), qty_basis: "Cố định", formula_kind: "coded_fixed_rate" };
  }
  if (code === "M_X_2" || code === "M_X_4") return { status: "runtime_formula", qty_basis: "Theo chiều dài", formula_kind: code, quantity_formula_json: JSON.stringify({ base:{ kind:"FIELD", field:"RAY_DAI" }, multiply: code === "M_X_2" ? 2 : 4 }), lineage_source_formula_code: code };
  if (code === "CAO_CONG_0.15_X_SL") return { status: "runtime_formula", qty_basis: "Theo chiều cao", formula_kind: code, quantity_formula_json: JSON.stringify({ base:{ kind:"FIELD", field:"PB_CAO", offset:0.15 } }), lineage_source_formula_code: code };
  if (code) return { status: "blocked", reason: "unsupported_formula", formula_code: code };
  const exactGeometry = resolveExactSourceGeometry(record, uomResolution, canonicalItemCode, n, text);
  if (exactGeometry) return exactGeometry;
  if (uomResolution.kind === "rate") {
    if (!n) return { status: "blocked", reason: "missing_quantity_evidence" };
    if (uomResolution.rate_axis === "area") return { status: "runtime_formula", qty_basis: "Theo diện tích", quantity_formula_json: JSON.stringify({ base:{ kind:"FIELD", field:"billable_area_sqm" }, multiply:n }), formula_kind:"rate_per_area" };
    if (["width","height","linear"].includes(uomResolution.rate_axis)) {
      if (!text) return { status: "blocked", reason: "ambiguous_formula" };
      if (hasGeometry(text)) return { status: "blocked", reason: "geometry_formula_not_in_template_catalog", formula_text:text };
    }
    return { status: "blocked", reason: "rate_uom_unresolved", formula_text:text };
  }
  if (n) {
    if (text && hasGeometry(text)) return { status: "blocked", reason: "geometry_formula_not_in_template_catalog", formula_text:text };
    return { status: "accepted", qty:n, qty_basis:uomResolution.axis === "width" ? "Theo chiều rộng" : "Cố định", formula_kind:"ordinary_fixed" };
  }
  return { status: "blocked", reason: text ? "formula_not_in_template_catalog" : "missing_quantity_evidence", formula_text:text };
}

export function resolveBomParentOutput(parentItem) {
  const stockUom = canonicalAlumdoorUom(parentItem?.stock_uom);
  if (!stockUom || !UOMS.has(stockUom)) return { status:"blocked", reason:"missing_parent_stock_uom", stock_uom:stockUom };
  return { status:"accepted", quantity:1, output_uom:stockUom };
}

export function blockerClass(type) {
  if (["unsupported_formula","formula_not_in_template_catalog","geometry_formula_not_in_template_catalog","template_lineage_item_mismatch"].includes(type)) return "resolver_defect";
  return "missing_authoritative_evidence";
}
