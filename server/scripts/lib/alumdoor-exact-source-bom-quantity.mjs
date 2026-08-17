const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/Đ/g, "D")
  .replace(/\s+/g, "");

const field = (name, multiply = 1, offset = undefined) => JSON.stringify({
  base: { kind: "FIELD", field: name, ...(offset === undefined ? {} : { offset }) },
  ...(multiply === 1 ? {} : { multiply }),
});

const RULES = new Map();

function addRows(rows, rule) {
  for (const row of rows) RULES.set(row, rule);
}

addRows([1111, 1151], {
  item: "TP-TD327",
  uom: "Mét",
  formula: "1LAX(RPBRAY-30)",
  qty_basis: "1 lá × rộng phủ bì ray - 0,03 m",
  formula_kind: "source_row_exact_leaf_skirt_width_minus_30mm",
  quantity_formula_json: field("PB_RAY_RONG", 1, -0.03),
});
addRows([1160], {
  item: "TP-TD327",
  uom: "Mét",
  formula: "1LAXRCL",
  qty_basis: "1 lá × rộng cắt lá cửa lưới = PB ray - 0,03 m",
  formula_kind: "source_row_exact_mesh_leaf_skirt_rcl",
  quantity_formula_json: field("PB_RAY_RONG", 1, -0.03),
});
addRows([1171], {
  item: "TP-TD327",
  uom: "Mét",
  formula: "1LAX(RPBRAY-3CM)",
  qty_basis: "1 lá × rộng phủ bì ray - 0,03 m",
  formula_kind: "source_row_exact_leaf_skirt_width_minus_3cm",
  quantity_formula_json: field("PB_RAY_RONG", 1, -0.03),
});

addRows([1152], {
  item: "NVL-BAT-MV",
  uom: "Cái",
  formula: "BATMACVONG1MRONGX7CAI",
  qty_basis: "7 cái / m rộng",
  formula_kind: "source_row_exact_mv_bracket_per_width",
  quantity_formula_json: field("PB_RAY_RONG", 7),
});
addRows([1161, 1172], {
  item: "NVL-BAT-SN",
  uom: "Cái",
  formula: "BATSONGNGANG1MX7CAI",
  qty_basis: "7 cái / m ngang",
  formula_kind: "source_row_exact_sn_bracket_per_width",
  quantity_formula_json: field("PB_RAY_RONG", 7),
});

addRows([1162, 1173], {
  item: "NVL-DINHTAN-MV",
  uom: "Kg",
  formula: "0,0015KG/CON(1MNGANGX14CON)",
  qty_basis: "14 con/m ngang × 0,0015 kg/con",
  formula_kind: "source_row_exact_rivet_weight_per_width",
  quantity_formula_json: field("PB_RAY_RONG", 0.021),
});
addRows([1163, 1174], {
  item: "NVL-CONTAN-MV",
  uom: "Kg",
  formula: "0,0008KG/CON(1MNGANGX14CON)",
  qty_basis: "14 con/m ngang × 0,0008 kg/con",
  formula_kind: "source_row_exact_rivet_nut_weight_per_width",
  quantity_formula_json: field("PB_RAY_RONG", 0.0112),
});

addRows([1164, 1175], {
  item: "NVL-BOLSN",
  uom: "Cái",
  formula: "40CAI/M2",
  qty_basis: "40 cái/m²",
  formula_kind: "source_row_exact_sn_hoof_per_area",
  quantity_formula_json: field("billable_area_sqm", 40),
});
addRows([1165, 1176], {
  item: "NVL-NHAN",
  uom: "Cái",
  formula: "20CAI/M2",
  qty_basis: "20 cái/m²",
  formula_kind: "source_row_exact_sn_ring_per_area",
  quantity_formula_json: field("billable_area_sqm", 20),
});

addRows([1256], {
  item: "NVL-TON-DL8Dx124-STD",
  uom: "Kg",
  formula: "DT*SL*12,6KG/M2",
  source_qty: 12.6,
  qty_basis: "Diện tích × 12,6 kg/m²; canonical BOM output quantity = 1 nên SL=1",
  formula_kind: "source_row_exact_dl_leaf_126_per_area",
  quantity_formula_json: field("billable_area_sqm", 12.6),
});
addRows([1259], {
  item: "NVL-TON-DL1LYx124-STD",
  uom: "Kg",
  formula: "DT*SL*11,64KG/M2",
  source_qty: 11.64,
  qty_basis: "Diện tích × 11,64 kg/m²; canonical BOM output quantity = 1 nên SL=1",
  formula_kind: "source_row_exact_dl_leaf_1164_per_area",
  quantity_formula_json: field("billable_area_sqm", 11.64),
});

addRows([1271, 1277, 1283], {
  item: "NVL-V4-KEM_TOLE75_STD",
  uom: "Mét",
  formula: "RONGPBRAY-50",
  qty_basis: "Rộng phủ bì ray - 0,05 m",
  formula_kind: "source_row_exact_v4_width_minus_50mm",
  quantity_formula_json: field("PB_RAY_RONG", 1, -0.05),
});
addRows([1289, 1301, 1331], {
  item: "NVL-V4_KEM_STD",
  uom: "Mét",
  formula: "RONGPBRAY-50",
  qty_basis: "Rộng phủ bì ray - 0,05 m",
  formula_kind: "source_row_exact_v4_width_minus_50mm",
  quantity_formula_json: field("PB_RAY_RONG", 1, -0.05),
});
addRows([1820], {
  item: "NVL-V4_KEM_STD",
  uom: "Mét",
  formula: "(RONGPBRAY-30)1,464KG/M*2",
  source_qty: 1.464,
  qty_basis: "2 × (rộng phủ bì ray - 0,03 m); 1,464 kg/m là weight annotation, source consumption UOM là Mét",
  formula_kind: "source_row_exact_dl_v4_two_lengths_1464_weight_annotation",
  quantity_formula_json: field("PB_RAY_RONG", 2, -0.03),
});

function sourceNumber(value) {
  const normalized = clean(value).replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function resolveExactSourceBomQuantity(record, uomResolution, canonicalItemCode) {
  const row = Number(record?.source_row);
  const rule = RULES.get(row);
  if (!rule) return null;
  if (clean(record?.source_sheet || "ĐM") !== "ĐM") return null;
  if (clean(canonicalItemCode) !== rule.item) return null;
  if (clean(uomResolution?.runtime_uom) !== rule.uom) return null;
  if (fold(record?.source_formula_text) !== rule.formula) return null;
  if (rule.source_qty !== undefined) {
    const actual = sourceNumber(record?.source_qty_or_formula);
    if (actual === null || Math.abs(actual - rule.source_qty) > 1e-9) return null;
  }
  return {
    status: "runtime_formula",
    qty_basis: rule.qty_basis,
    formula_kind: rule.formula_kind,
    quantity_formula_json: rule.quantity_formula_json,
    reason: `exact_source_row_${row}`,
  };
}
