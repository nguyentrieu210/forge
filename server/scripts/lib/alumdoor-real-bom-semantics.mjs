import { ALUMDOOR_UOM_CATALOG, canonicalAlumdoorUom } from "./alumdoor-uom-catalog.mjs";

const CANONICAL_UOMS = new Set(ALUMDOOR_UOM_CATALOG.map((row) => row.name));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .replace(/Đ/g, "D")
  .toLocaleUpperCase("vi");

export function positiveBomNumber(value) {
  const raw = clean(value).replace(",", ".");
  if (!raw || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function itemConversion(item, uom) {
  const matches = (item?.uom_conversions ?? [])
    .filter((row) => canonicalAlumdoorUom(row?.uom) === uom)
    .map((row) => Number(row?.conversion_factor))
    .filter((value) => Number.isFinite(value) && value > 0);
  const unique = [...new Set(matches)];
  if (unique.length === 1) return { status: "accepted", conversion_factor: unique[0] };
  if (unique.length > 1) return { status: "blocked", reason: "conflicting_conversion", conversion_factors: unique };
  return { status: "blocked", reason: "missing_conversion" };
}

export function classifyBomSourceUom(rawValue) {
  const raw = clean(rawValue);
  const key = fold(raw).replace(/\s+/g, "");
  if (!raw) return { status: "blocked", reason: "unknown_uom", raw_uom: raw };

  const ratePatterns = [
    [/^KG\/M2$/, { denominator: "m2", axis: "area" }],
    [/^KG\/MNGANG$/, { denominator: "Mét", axis: "width" }],
    [/^KG\/MCAO$/, { denominator: "Mét", axis: "height" }],
    [/^KG\/M$/, { denominator: "Mét", axis: "linear" }],
    [/^KG\/CAP$/, { denominator: "Cặp", axis: "count" }],
    [/^KG\/CON$/, { denominator: "Con", axis: "count" }],
    [/^KG\/CAI$/, { denominator: "Cái", axis: "count" }],
  ];
  for (const [pattern, spec] of ratePatterns) {
    if (pattern.test(key)) return { status: "accepted", kind: "rate", raw_uom: raw, numerator_uom: "Kg", ...spec };
  }

  if (key === "MNGANG") {
    return { status: "accepted", kind: "ordinary", raw_uom: raw, runtime_uom: "Mét", axis: "width" };
  }

  const runtimeUom = canonicalAlumdoorUom(raw);
  if (!CANONICAL_UOMS.has(runtimeUom)) {
    return { status: "blocked", reason: "unknown_uom", raw_uom: raw, normalized_uom: runtimeUom };
  }
  return { status: "accepted", kind: "ordinary", raw_uom: raw, runtime_uom: runtimeUom, axis: null };
}

export function resolveBomRuntimeUom(record, item) {
  const stockUom = canonicalAlumdoorUom(item?.stock_uom);
  if (!stockUom || !CANONICAL_UOMS.has(stockUom)) {
    return { status: "blocked", reason: "missing_stock_uom", stock_uom: stockUom };
  }
  const classified = classifyBomSourceUom(record?.source_uom);
  if (classified.status !== "accepted") return { ...classified, stock_uom: stockUom };

  if (classified.kind === "rate") {
    if (classified.numerator_uom !== stockUom) {
      return {
        status: "blocked",
        reason: "rate_uom_stock_mismatch",
        raw_uom: classified.raw_uom,
        rate_numerator_uom: classified.numerator_uom,
        stock_uom: stockUom,
      };
    }
    return {
      status: "accepted",
      kind: "rate",
      raw_uom: classified.raw_uom,
      runtime_uom: stockUom,
      stock_uom: stockUom,
      rate_denominator: classified.denominator,
      rate_axis: classified.axis,
      conversion_factor: undefined,
    };
  }

  if (classified.runtime_uom === stockUom) {
    return { ...classified, status: "accepted", stock_uom: stockUom, conversion_factor: undefined };
  }
  const conversion = itemConversion(item, classified.runtime_uom);
  if (conversion.status !== "accepted") {
    return {
      status: "blocked",
      reason: conversion.reason,
      raw_uom: classified.raw_uom,
      runtime_uom: classified.runtime_uom,
      stock_uom: stockUom,
      ...(conversion.conversion_factors ? { conversion_factors: conversion.conversion_factors } : {}),
    };
  }
  return {
    ...classified,
    status: "accepted",
    stock_uom: stockUom,
    conversion_factor: conversion.conversion_factor,
  };
}

function manualActual(text) {
  const value = fold(text);
  return value === "THUC TE"
    || value.includes("TRU THUC TE")
    || value.includes("XUAT THUC TE")
    || value.includes("TRU SL THUC TE");
}

function parseExplicitCountMultiplier(text, denominator) {
  const value = fold(text).replace(/,/g, ".");
  const label = denominator === "Cặp" ? "CAP" : denominator === "Cái" ? "CAI" : denominator === "Con" ? "CON" : "";
  if (!label) return null;
  const patterns = [
    new RegExp(`1\\s*BO\\s*[Xx]?\\s*(\\d+(?:\\.\\d+)?)\\s*${label}`),
    new RegExp(`1\\s*BO\\s+(\\d+(?:\\.\\d+)?)\\s*${label}`),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${label}\\s*[/\\-]?\\s*(?:1\\s*)?(?:BO|PULY|CAI PULY)?`),
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const number = Number(match[1]);
      if (Number.isFinite(number) && number > 0) return number;
    }
  }
  return null;
}

function hasOffsetGeometry(text) {
  const value = fold(text);
  return /(?:RONG|CAO).*(?:\+|\-|CONG|TRU)|(?:\+|\-|CONG|TRU).*(?:RONG|CAO)/.test(value)
    || /R?PBRAY\s*[-+]\s*\d/.test(value);
}

function simpleGeometryBasis(text) {
  const value = fold(text);
  const hasWidth = /RONG|NGANG|RPBRAY|RCL/.test(value);
  const hasHeight = /CAO/.test(value);
  const hasArea = /DIEN TICH|\bDT\b|M2/.test(value) || (hasWidth && hasHeight);
  if (hasOffsetGeometry(text)) return { status: "blocked", reason: "unsupported_geometry_offset" };
  if (hasArea) return { status: "accepted", qty_basis: "Theo diện tích" };
  if (hasWidth) return { status: "accepted", qty_basis: "Theo chiều rộng" };
  if (hasHeight) return { status: "accepted", qty_basis: "Theo chiều cao" };
  return { status: "accepted", qty_basis: "Cố định" };
}

export function resolveBomQuantitySemantics(record, uomResolution, parentItem) {
  const rawQty = clean(record?.source_qty_or_formula);
  const numericQty = positiveBomNumber(rawQty);
  const formulaCode = clean(record?.source_formula_code);
  const formulaText = clean(record?.source_formula_text);
  const combinedFormula = [formulaCode, formulaText].filter(Boolean).join(" | ");

  if (manualActual(`${rawQty} ${combinedFormula}`)) {
    return {
      status: "excluded",
      reason: "manual_actual_consumption_source_rule",
      source_rule_kind: "manual_actual",
    };
  }

  if (formulaCode) {
    const multipliers = new Map([
      ["SL_X_DM", 1],
      ["SL_X2_X_DM", 2],
      ["SL_X4_X_DM", 4],
      ["SL_X6_X_DM", 6],
    ]);
    if (multipliers.has(formulaCode)) {
      if (!numericQty) return { status: "blocked", reason: "missing_quantity_evidence", formula_code: formulaCode };
      return { status: "accepted", qty: numericQty * multipliers.get(formulaCode), qty_basis: "Cố định", formula_kind: "coded_fixed_rate" };
    }
    if (formulaCode === "M_X_2" || formulaCode === "M_X_4") {
      const parentOutput = canonicalAlumdoorUom(parentItem?.default_sales_uom || parentItem?.stock_uom);
      if (parentOutput !== "Mét") return { status: "blocked", reason: "formula_parent_uom_mismatch", formula_code: formulaCode, parent_output_uom: parentOutput };
      return { status: "accepted", qty: formulaCode === "M_X_2" ? 2 : 4, qty_basis: "Cố định", formula_kind: "coded_parent_meter_multiplier" };
    }
    if (formulaCode === "CAO_CONG_0.15_X_SL") {
      return { status: "blocked", reason: "unsupported_geometry_offset", formula_code: formulaCode };
    }
    return { status: "blocked", reason: "unsupported_formula", formula_code: formulaCode };
  }

  if (uomResolution.kind === "rate") {
    if (!numericQty) return { status: "blocked", reason: "missing_quantity_evidence", source_uom: record?.source_uom };
    if (uomResolution.rate_axis === "area") {
      return { status: "accepted", qty: numericQty, qty_basis: "Theo diện tích", formula_kind: "rate_per_area" };
    }
    if (uomResolution.rate_axis === "width") {
      if (hasOffsetGeometry(formulaText)) return { status: "blocked", reason: "unsupported_geometry_offset", formula_text: formulaText };
      return { status: "accepted", qty: numericQty, qty_basis: "Theo chiều rộng", formula_kind: "rate_per_width" };
    }
    if (uomResolution.rate_axis === "height") {
      if (hasOffsetGeometry(formulaText)) return { status: "blocked", reason: "unsupported_geometry_offset", formula_text: formulaText };
      return { status: "accepted", qty: numericQty, qty_basis: "Theo chiều cao", formula_kind: "rate_per_height" };
    }
    if (uomResolution.rate_axis === "count") {
      const multiplier = parseExplicitCountMultiplier(formulaText, uomResolution.rate_denominator);
      if (!multiplier) return { status: "blocked", reason: "rate_uom_unresolved", source_uom: record?.source_uom, formula_text: formulaText };
      return { status: "accepted", qty: numericQty * multiplier, qty_basis: "Cố định", formula_kind: "rate_per_explicit_count", count_multiplier: multiplier };
    }
    if (uomResolution.rate_axis === "linear") {
      if (!formulaText) {
        const parentOutput = canonicalAlumdoorUom(parentItem?.default_sales_uom || parentItem?.stock_uom);
        if (parentOutput === "Mét") return { status: "accepted", qty: numericQty, qty_basis: "Cố định", formula_kind: "rate_per_parent_meter" };
        return { status: "blocked", reason: "ambiguous_formula", source_uom: record?.source_uom };
      }
      const basis = simpleGeometryBasis(formulaText);
      if (basis.status !== "accepted") return { ...basis, formula_text: formulaText };
      if (basis.qty_basis === "Cố định") return { status: "blocked", reason: "ambiguous_formula", formula_text: formulaText };
      return { status: "accepted", qty: numericQty, qty_basis: basis.qty_basis, formula_kind: "rate_per_geometry" };
    }
  }

  if (numericQty) {
    if (uomResolution.axis === "width") return { status: "accepted", qty: numericQty, qty_basis: "Theo chiều rộng", formula_kind: "ordinary_width" };
    const basis = formulaText ? simpleGeometryBasis(formulaText) : { status: "accepted", qty_basis: "Cố định" };
    if (basis.status !== "accepted") return { ...basis, formula_text: formulaText };
    return { status: "accepted", qty: numericQty, qty_basis: basis.qty_basis, formula_kind: formulaText ? "ordinary_with_source_note" : "ordinary_fixed" };
  }

  const explicitCount = parseExplicitCountMultiplier(formulaText, uomResolution.runtime_uom);
  if (explicitCount) return { status: "accepted", qty: explicitCount, qty_basis: "Cố định", formula_kind: "explicit_count" };

  return {
    status: "blocked",
    reason: formulaText ? "unsupported_formula" : "missing_quantity_evidence",
    formula_text: formulaText,
  };
}

export function buildBomSourceProvenance(record, itemCode, uomResolution, quantityResolution) {
  return {
    source_sheet: clean(record?.source_sheet),
    source_row: Number(record?.source_row),
    source_index: Number(record?.source_index),
    source_item_code: clean(record?.item_code),
    canonical_item_code: itemCode,
    raw_source_uom: clean(record?.source_uom),
    raw_source_quantity: clean(record?.source_qty_or_formula),
    raw_formula_code: clean(record?.source_formula_code),
    raw_formula_text: clean(record?.source_formula_text),
    runtime_uom: uomResolution?.runtime_uom ?? "",
    runtime_stock_uom: uomResolution?.stock_uom ?? "",
    runtime_conversion_factor: uomResolution?.conversion_factor ?? null,
    rate_denominator: uomResolution?.rate_denominator ?? null,
    rate_axis: uomResolution?.rate_axis ?? null,
    derived_qty: quantityResolution?.qty ?? null,
    qty_basis: quantityResolution?.qty_basis ?? null,
    formula_kind: quantityResolution?.formula_kind ?? null,
    resolver_status: quantityResolution?.status ?? uomResolution?.status ?? "blocked",
    resolver_reason: quantityResolution?.reason ?? uomResolution?.reason ?? "accepted",
  };
}

export function resolveBomParentOutput(parentItem) {
  const stockUom = canonicalAlumdoorUom(parentItem?.stock_uom);
  const salesUom = canonicalAlumdoorUom(parentItem?.default_sales_uom || stockUom);
  if (!stockUom || !salesUom) return { status: "blocked", reason: "missing_parent_uom" };
  if (salesUom === stockUom) {
    return { status: "accepted", quantity: 1, output_uom: stockUom, output_conversion_factor: undefined };
  }
  const conversion = itemConversion(parentItem, salesUom);
  if (conversion.status !== "accepted") return { status: "blocked", reason: `parent_${conversion.reason}`, output_uom: salesUom, stock_uom: stockUom };
  return { status: "accepted", quantity: 1, output_uom: salesUom, output_conversion_factor: conversion.conversion_factor };
}
