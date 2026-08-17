const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/Đ/g, "D");
const compact = (value) => fold(value).replace(/\s+/g, "");

function positive(value) {
  const raw = clean(value).replace(",", ".");
  if (!raw || !/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const field = (name, multiply = 1, offset = undefined, rounding = undefined) => JSON.stringify({
  base: { kind: "FIELD", field: name, ...(offset === undefined ? {} : { offset }) },
  ...(multiply === 1 ? {} : { multiply }),
  ...(rounding ? { rounding } : {}),
});
const product = (left, right, multiply = 1) => JSON.stringify({
  base: { kind: "PRODUCT", left, right },
  ...(multiply === 1 ? {} : { multiply }),
});

function inferred(extra = {}) {
  return {
    resolution_source: "engineering_inference",
    engineering_inference: true,
    confidence: "low",
    ...extra,
  };
}

const METRE_TO_KG_RATES = new Map([
  ["NVL-TR114-1.8", { rate: 4.4, confidence: "high", evidence: "same-item rows 1183/1191/1202/1220" }],
  ["NVL-TOLE1.2x190-RON", { rate: 1.78, confidence: "high", evidence: "same-item rows 1123/1146" }],
  ["NVL-RNHUA-DR", { rate: 0.263, confidence: "medium", evidence: "same-item row 1143; supersedes stale 0.101 family annotation" }],
  ["NVL-RINOX-DR", { rate: 0.124, confidence: "high", evidence: "same-item rows 58/1144" }],
]);

const isMetre = (value) => ["M", "MET", "METRE", "MÉT"].includes(fold(value));
const isArea = (value) => ["M2", "M²"].includes(fold(value).replace(/\s+/g, ""));
const isDiscrete = (value) => ["CÁI", "CON", "CẶP", "BỘ", "TẤM"].includes(fold(value));

export function resolveEngineeringBomUom(record, item, failed, canonicalItemCode = "") {
  if (!failed || failed.status !== "blocked") return failed;
  const stockUom = clean(item?.stock_uom || failed.stock_uom);
  if (!stockUom) return failed;
  const sourceUom = clean(record?.source_uom);
  const canonical = clean(canonicalItemCode || item?.item_code);

  if (failed.reason === "missing_conversion" && stockUom === "Kg" && isMetre(sourceUom)) {
    const known = METRE_TO_KG_RATES.get(canonical);
    if (known) {
      return {
        status: "accepted",
        kind: "ordinary",
        raw_uom: sourceUom,
        runtime_uom: "Mét",
        stock_uom: "Kg",
        conversion_factor: known.rate,
        ...inferred({
          confidence: known.confidence,
          assumption: `Item-scoped ${known.rate} kg/m from ${known.evidence}`,
          inference_kind: "same_item_linear_weight_rate",
          uom_inferred: true,
        }),
      };
    }
  }

  if (failed.reason === "missing_conversion" && stockUom === "Cuộn" && (isMetre(sourceUom) || isArea(sourceUom))) {
    return {
      status: "accepted",
      kind: "engineering_package",
      raw_uom: sourceUom,
      runtime_uom: "Cuộn",
      stock_uom: "Cuộn",
      package_length_m: 100,
      ...inferred({
        assumption: "Provisional item-scoped 100 m/cuộn package length; replace when supplier/package authority is recovered",
        inference_kind: "provisional_roll_package_length",
        uom_inferred: true,
        provisional_assumption: true,
      }),
    };
  }

  if (failed.reason === "missing_conversion" || failed.reason === "rate_uom_stock_mismatch" || failed.reason === "unknown_uom") {
    return {
      status: "accepted",
      kind: "engineering_stock",
      raw_uom: sourceUom,
      runtime_uom: stockUom,
      stock_uom: stockUom,
      source_consumption_uom: sourceUom,
      ...inferred({
        assumption: sourceUom
          ? `Source UOM ${sourceUom} is treated as stale/annotation; canonical stock UOM ${stockUom} wins`
          : `Blank source UOM inferred as canonical stock UOM ${stockUom}`,
        inference_kind: failed.reason === "unknown_uom" ? "blank_or_unknown_uom_to_stock" : "source_uom_to_stock_semantics",
        uom_inferred: true,
        provisional_assumption: true,
      }),
    };
  }

  return failed;
}

function kgPerM2FromText(text) {
  const matches = [...String(text ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*KG\s*\/\s*M2/gi)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function explicitMultiplier(text) {
  const value = compact(text);
  if (/X0,135X2|X0\.135X2/.test(value)) return 2;
  if (/\*2|X2/.test(value)) return 2;
  return 1;
}

function widthFormula(rate = 1, offset = undefined, rounding = undefined) {
  return field("PB_RAY_RONG", rate, offset, rounding);
}
function heightFormula(rate = 1, offset = undefined, rounding = undefined) {
  return field("PB_CAO", rate, offset, rounding);
}

export function resolveEngineeringBomQuantity(record, uomResolution, parentItem, canonicalItemCode, failed) {
  if (!failed || failed.status !== "blocked") return failed;
  const item = clean(canonicalItemCode);
  const raw = clean(record?.source_qty_or_formula);
  const n = positive(raw);
  const text = clean(record?.source_formula_text);
  const code = clean(record?.source_formula_code);
  const c = compact(text);
  const sourceUom = clean(record?.source_uom);
  const stockUom = clean(uomResolution?.stock_uom || uomResolution?.runtime_uom);

  if (uomResolution?.kind === "engineering_package" && stockUom === "Cuộn") {
    const metres = n ?? 1;
    return {
      status: "accepted",
      qty: metres / Number(uomResolution.package_length_m || 100),
      qty_basis: `${metres} m / ${uomResolution.package_length_m || 100} m/cuộn`,
      formula_kind: "engineering_roll_package_conversion",
      ...inferred({
        assumption: uomResolution.assumption,
        inference_kind: "provisional_roll_package_length",
        provisional_assumption: true,
      }),
    };
  }

  if (item === "NVL-TOLE1.2x190-RON" && isMetre(sourceUom) && !text && !code) {
    return {
      status: "runtime_formula",
      qty_basis: "2 × (cao phủ bì - 0,10 m), inferred from same ray family",
      formula_kind: "engineering_family_ray_two_heights",
      quantity_formula_json: heightFormula(2, -0.1),
      ...inferred({ confidence: "high", assumption: "Blank family rows inherit the same-item sealed-ray geometry", inference_kind: "same_family_geometry", formula_inferred: true }),
    };
  }

  if (item === "NVL-TR114-1.8" && isMetre(sourceUom) && /PBRAY-50/.test(c)) {
    return {
      status: "runtime_formula",
      qty_basis: "Rộng phủ bì ray - 0,05 m",
      formula_kind: "engineering_tr114_width_minus_50mm",
      quantity_formula_json: widthFormula(1, -0.05),
      ...inferred({ confidence: "high", assumption: "Same-item 4.4 kg/m conversion is carried by line conversion_factor", inference_kind: "same_item_geometry", formula_inferred: true }),
    };
  }

  if (uomResolution?.kind === "rate" && n) {
    if (item === "NVL-RON-DD") {
      return {
        status: "runtime_formula",
        qty_basis: "Rộng cắt/rộng phủ bì × kg/m",
        formula_kind: "engineering_ron_dd_width_rate",
        quantity_formula_json: widthFormula(n, -0.03),
        ...inferred({ confidence: text ? "medium" : "low", assumption: "RON đáy family uses width axis", inference_kind: "same_family_rate_axis", formula_inferred: true, conflict_resolved: failed.reason.includes("conflict") }),
      };
    }
    if (item === "NVL-VDAY-TDU") {
      return {
        status: "runtime_formula",
        qty_basis: "Rộng phủ bì × kg/m",
        formula_kind: "engineering_vday_width_rate",
        quantity_formula_json: widthFormula(n),
        ...inferred({ confidence: "medium", assumption: "V đáy family consumes along door width", inference_kind: "same_family_rate_axis", formula_inferred: true }),
      };
    }
    if (item === "NVL-TR114-1.8") {
      const rate = n === 1.7 ? 1.7 : 4.4;
      const offset = n === 1.7 ? 0.4 : 0.2;
      return {
        status: "runtime_formula",
        qty_basis: `(rộng phủ bì + ${offset.toFixed(2)} m) × ${rate} kg/m`,
        formula_kind: "engineering_tr114_rate_consensus",
        quantity_formula_json: widthFormula(rate, offset),
        ...inferred({ confidence: n === 4.4 ? "high" : "low", assumption: n === 4.4 ? "4.4 kg/m same-item consensus" : "1.7 kg/m retained only for explicit TP-TRỤC 34 anomaly", inference_kind: "same_item_rate_consensus", formula_inferred: true, conflict_resolved: true }),
      };
    }
    if (["NVL-TOLE1.2x190-KRON", "NVL-TOLE1.2x190-RON", "RONNHUAVANGCẢNHAY_RSU100", "RONNHUAVANGCANHAY_RSU70", "NVL-RINOX-DR", "NVL-RNHUA-DR"].includes(item)) {
      const multiplier = explicitMultiplier(text);
      const offset = /10CM/.test(c) ? -0.1 : 0;
      return {
        status: "runtime_formula",
        qty_basis: `Cao × ${n} kg/m${multiplier === 2 ? " × 2" : ""}`,
        formula_kind: "engineering_height_rate_multiplier",
        quantity_formula_json: heightFormula(n * multiplier, offset || undefined),
        ...inferred({ confidence: "high", assumption: "Explicit KG/M rate and geometry text determine height-axis consumption", inference_kind: "dimensional_rate_formula", formula_inferred: true }),
      };
    }
    if (uomResolution.rate_axis === "area") {
      return {
        status: "runtime_formula",
        qty_basis: `Diện tích × ${n}`,
        formula_kind: "engineering_area_rate",
        quantity_formula_json: field("billable_area_sqm", n),
        ...inferred({ confidence: "high", assumption: "KG/M2 dimensional semantics", inference_kind: "dimensional_rate_formula", formula_inferred: true }),
      };
    }
    const axis = uomResolution.rate_axis === "height" ? "PB_CAO" : "PB_RAY_RONG";
    return {
      status: "runtime_formula",
      qty_basis: `${axis} × ${n}`,
      formula_kind: "engineering_generic_linear_rate",
      quantity_formula_json: field(axis, n),
      ...inferred({ assumption: `Linear rate axis inferred as ${axis}`, inference_kind: "generic_linear_rate", formula_inferred: true }),
    };
  }

  const kgm2 = kgPerM2FromText(text);
  if (stockUom === "Kg" && (isArea(sourceUom) || kgm2)) {
    const rate = kgm2 ?? n ?? 1;
    const usesCutWidth = /R-0,03|RPBRAY-30|RONGPBRAY-30/.test(c);
    const formula = usesCutWidth
      ? product({ field: "PB_CAO" }, { field: "PB_RAY_RONG", offset: -0.03 }, rate)
      : field("billable_area_sqm", rate);
    return {
      status: "runtime_formula",
      qty_basis: usesCutWidth ? `Cao PB × (rộng PB - 0,03 m) × ${rate} kg/m²` : `Diện tích × ${rate} kg/m²`,
      formula_kind: "engineering_sheet_area_weight",
      quantity_formula_json: formula,
      ...inferred({
        confidence: kgm2 ? "high" : n ? "medium" : "low",
        assumption: kgm2 ? "Explicit kg/m² in formula wins over stale raw/UOM cells" : n ? "Raw numeric treated as family kg/m² rate" : "Fallback 1 kg/m² until material sheet authority is recovered",
        inference_kind: "sheet_area_weight",
        formula_inferred: true,
        provisional_assumption: !kgm2 && !n,
        conflict_resolved: Boolean(kgm2 && n && Math.abs(kgm2 - n) > 1e-9),
      }),
    };
  }

  if (stockUom === "Bộ" && isArea(sourceUom)) {
    return {
      status: "accepted",
      qty: 1,
      qty_basis: "1 trọn bộ / finished-door BOM",
      formula_kind: "engineering_complete_set_per_bom",
      ...inferred({ confidence: "medium", assumption: "Area/rate text is a material annotation; stock item is managed as one complete set", inference_kind: "stock_set_semantics", provisional_assumption: true }),
    };
  }

  if (stockUom === "Cái" && /1BO.*4CAP/.test(c)) {
    return {
      status: "accepted",
      qty: 8,
      qty_basis: "1 bộ × 4 cặp × 2 cái/cặp",
      formula_kind: "engineering_pair_to_piece",
      ...inferred({ confidence: "high", assumption: "Canonical count semantics 1 cặp = 2 cái", inference_kind: "count_semantics", conflict_resolved: true }),
    };
  }

  if (stockUom === "Cái" && /KG\/CAI/.test(compact(sourceUom))) {
    return {
      status: "accepted",
      qty: 1,
      qty_basis: "1 cái / BOM occurrence",
      formula_kind: "engineering_piece_rate_annotation",
      ...inferred({ assumption: "KG/CÁI treated as stale weight annotation because canonical stock is Cái", inference_kind: "count_semantics", provisional_assumption: true }),
    };
  }

  if (item === "NVL-XOP-N45") {
    return {
      status: "runtime_formula",
      qty_basis: "CEIL((rộng phủ bì / 0,45 m) × 2)",
      formula_kind: "engineering_xop_45cm_ceil",
      quantity_formula_json: widthFormula(2 / 0.45, undefined, "ceil"),
      ...inferred({ confidence: "high", assumption: "Discrete Tấm consumption rounds upward", inference_kind: "discrete_rounding", formula_inferred: true, rounding_inferred: true }),
    };
  }

  if (item === "NVL-BUOMFE-DL" && n) {
    return {
      status: "runtime_formula",
      qty_basis: `Cao × 12 × ${n} kg/m`,
      formula_kind: "engineering_buomfe_dl_height_count_weight",
      quantity_formula_json: heightFormula(12 * n),
      ...inferred({ confidence: "high", assumption: "Formula text explicitly states 12 con per metre height", inference_kind: "dimensional_rate_formula", formula_inferred: true }),
    };
  }
  if (item === "NVL-BUOMFE-ST" && n) {
    return {
      status: "runtime_formula",
      qty_basis: `Cao × 10 × ${n} kg/m`,
      formula_kind: "engineering_buomfe_st_height_count_weight",
      quantity_formula_json: heightFormula(10 * n),
      ...inferred({ confidence: "high", assumption: "Formula text explicitly states 10 con per metre height", inference_kind: "dimensional_rate_formula", formula_inferred: true }),
    };
  }
  if (item === "NVL-TIINOX" && n) {
    return {
      status: "runtime_formula",
      qty_basis: `Rộng cắt × ${n} kg/m`,
      formula_kind: "engineering_ti_inox_width_rate",
      quantity_formula_json: widthFormula(n, -0.03),
      ...inferred({ confidence: "medium", assumption: "TI cắt theo chiều rộng", inference_kind: "formula_semantics", formula_inferred: true }),
    };
  }

  if (item === "NVL-TRUC34" && n) {
    return {
      status: "runtime_formula",
      qty_basis: `(rộng phủ bì + 0,40 m) × ${n}`,
      formula_kind: "engineering_truc34_width_rate",
      quantity_formula_json: widthFormula(n, 0.4),
      ...inferred({ confidence: "medium", assumption: "Ignore stray area suffix because shaft is dimensionally linear", inference_kind: "dimensional_conflict_resolution", formula_inferred: true, conflict_resolved: true }),
    };
  }

  if (/DT\*SL\*12,6KG\/M2/.test(c)) {
    return {
      status: "runtime_formula",
      qty_basis: "Diện tích × 12,6 kg/m²",
      formula_kind: "engineering_explicit_126_area_rate",
      quantity_formula_json: field("billable_area_sqm", 12.6),
      ...inferred({ confidence: "high", assumption: "Explicit dimensional formula wins over conflicting raw numeric cell", inference_kind: "conflict_resolution", formula_inferred: true, conflict_resolved: true }),
    };
  }

  if (stockUom === "m2") {
    return {
      status: "runtime_formula",
      qty_basis: "Theo diện tích cửa",
      formula_kind: "engineering_area_component",
      quantity_formula_json: field("billable_area_sqm"),
      ...inferred({ confidence: text ? "medium" : "low", assumption: "m2 stock component follows billable area when source quantity is blank/stale", inference_kind: "stock_uom_geometry", formula_inferred: true, provisional_assumption: !text }),
    };
  }

  if (isDiscrete(stockUom) && /13CAY\/M|16CAY\/M/.test(c)) {
    const rods = /16CAY\/M/.test(c) ? 16 : 13;
    return {
      status: "runtime_formula",
      qty_basis: `CEIL(cao × ${rods}) - 1`,
      formula_kind: "engineering_discrete_rods_rounding",
      quantity_formula_json: heightFormula(rods, undefined, "ceil"),
      ...inferred({ confidence: "medium", assumption: "Discrete rod count rounds upward; source '-1 cây' retained in qty basis for runtime follow-up", inference_kind: "discrete_rounding", formula_inferred: true, rounding_inferred: true }),
    };
  }

  if (n) {
    return {
      status: "accepted",
      qty: n,
      qty_basis: "Engineering fallback preserves positive source numeric",
      formula_kind: "engineering_numeric_fallback",
      ...inferred({ assumption: `No stronger dimensional rule; preserve source numeric ${n} in canonical stock UOM`, inference_kind: "numeric_fallback", provisional_assumption: true }),
    };
  }

  return {
    status: "accepted",
    qty: 1,
    qty_basis: "Engineering fallback 1 canonical stock unit",
    formula_kind: "engineering_unit_fallback",
    ...inferred({ assumption: `No positive quantity authority for row ${Number(record?.source_row) || "?"}; use one canonical stock unit`, inference_kind: "unit_fallback", provisional_assumption: true }),
  };
}
