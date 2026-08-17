const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/Đ/g, "D")
  .replace(/\s+/g, "");

const RULES = new Map();
function add(rows, rule) {
  for (const row of rows) RULES.set(row, rule);
}

add([385, 494], {
  item: "HH-LMT36-TK400-600", uom: "cái", raw: "0.0", formula: "phụ thu nâng cấp lắc 36",
  resolver_reason: "formula_not_in_template_catalog", evidence_reason: "missing_conditional_quantity_evidence",
});
add([556], {
  item: "HH-LMT36-TK400-600", uom: "cái", raw: "", formula: "phụ thu nâng cấp lắc 36",
  resolver_reason: "formula_not_in_template_catalog", evidence_reason: "missing_conditional_quantity_evidence",
});
add([1201], {
  item: "TP-RAYINOX-6P-RON", uom: "M", raw: "", formula: "ÁP DỤNG CHO CỬA CÓ DIỆN TÍCH <8M2",
  resolver_reason: "formula_not_in_template_catalog", evidence_reason: "missing_conditional_quantity_evidence",
});

add([718, 838, 863, 888, 913, 937, 948, 959, 970, 981, 992, 1003, 1014, 1025, 1037], {
  item: "NVL-TOLE1.2x190-KRON", uom: "KG/M", raw: "1.78", formula: "ray = chiều cao - 10cm x số lượng",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1123], {
  item: "NVL-TOLE1.2x190-RON", uom: "KG/M", raw: "1.78", formula: "ray = chiều cao - 10cm x số lượng",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1129], {
  item: "NVL-TOLE1.2x190-KRON", uom: "KG/M", raw: "1.78", formula: "CAO X SỐ LƯỢNG X 1,78",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1146], {
  item: "NVL-TOLE1.2x190-RON", uom: "KG/M", raw: "1.78", formula: "CAO X SỐ LƯỢNG X 1,78",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1122, 1147], {
  item: "RONNHUAVANGCANHAY_RSU70", uom: "KG/M", raw: "0.135", formula: "CAO X SỐ LƯỢNG x0,135x2",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1134, 1139, 1142], {
  item: "RONNHUAVANGCẢNHAY_RSU100", uom: "KG/M", raw: "0.1425", formula: "CAO X SỐ LƯỢNG x0,1425",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1143], {
  item: "NVL-RNHUA-DR", uom: "KG/M", raw: "0.263", formula: "CAO X SỐ LƯỢNG x0,263",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([1144], {
  item: "NVL-RINOX-DR", uom: "KG/M", raw: "0.124", formula: "CAO X SỐ LƯỢNG x0,124",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_evidence",
});
add([719], {
  item: "NVL-XOP-N45", uom: "TẤM", raw: "1.0", formula: "xốp = ((chiều rộng pbray/45 cm))*2x số lượng",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_quantity_multiplier_and_rounding_evidence",
});

add([839, 864, 889, 914, 1038, 1064, 1089], {
  item: "NVL-XOP-N45", uom: "TẤM", raw: "1.0", formula: "xốp = ((chiều rộng pbray/45 cm))*2",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});
add([938, 949, 960, 971, 982, 993, 1004, 1015, 1026], {
  item: "NVL-XOP-N45", uom: "TẤM", raw: "14.0", formula: "xốp = ((chiều rộng pbray/45 cm))*2",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});
add([1107], {
  item: "NVL-LUOIMV_STD", uom: "KG/M", raw: "0.35", formula: "(CAO LƯỚI MV X 16 CÂY/M )-1 CÂY (0,35KG/M)Cao pb x (Rpbray-3cm)",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});
add([1158, 1169], {
  item: "NVL-LUOISNPHI19_STD", uom: "KG", raw: "0.435", formula: "(CAO LƯỚI SNX 13 CÂY/M )-1 CÂY (0,435KG/M)",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});
add([1159, 1170], {
  item: "NVL-BOLSN", uom: "cái", raw: "2.0", formula: "((CAO LƯỚI SNX 13 CÂY/M )-1 CÂY)*2 CON",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});
add([1185, 1193], {
  item: "TP-LUOISN13x26_STD", uom: "KG", raw: "0.435", formula: "(CAO LƯỚI SNX 13 CÂY/M )-1 CÂY (0,435KG/M)",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "missing_rounding_rule",
});

add([521], {
  item: "NVL-BUOMFE-DL", uom: "KG/M cao", raw: "0.235", formula: "1m lá cao x 12 con x 0.235kg/m",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});
add([523], {
  item: "NVL-BUOMFE-ST", uom: "KG/M cao", raw: "0.311", formula: "1m lá cao x 10 con x 0.311kg/m",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});
add([727], {
  item: "NVL-TIINOX", uom: "KG/M", raw: "0.11", formula: "TI cắt theo chiều rộng x 0,11(tính tiền đồng giá)",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});
add([1061], {
  item: "NVL-RON-DD", uom: "KG/M", raw: "0.117", formula: "rộng cắt lá x TL 0,117",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});
add([1086], {
  item: "NVL-RON-DD", uom: "KG/M", raw: "0.117", formula: "rộng cắt lá x TL 0,117* diện tích cửa",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});
add([1090], {
  item: "NVL-TRUC34", uom: "KG/M", raw: "1.7", formula: "trục = chiều rộngpbray+40cm *1,700*diện tích",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "ambiguous_formula_semantics",
});

add([1087], {
  item: "NVL-BO1VIS-AL701LOP", uom: "KG", raw: "0.066", formula: "rộng cắt lá x TL 0,117",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "conflicting_quantity_evidence",
});
add([1088], {
  item: "NVL-VIS", uom: "KG", raw: "0.0341", formula: "Cao x Rộng cắt lá x TL 0,0093",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "conflicting_quantity_evidence",
});
add([1253], {
  item: "NVL-TON-DL6Dx124-STD", uom: "KG", raw: "8.2", formula: "DT*SL*12,6kg/m2",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "conflicting_quantity_evidence",
});

add([1183, 1191], {
  item: "NVL-TR114-1.8", uom: "KG/M", raw: "4.4", formula: "Rpbray+20cm",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "conflicting_formula_authority",
});
add([1211], {
  item: "NVL-TR114-1.8", uom: "KG", raw: "4.4", formula: "Rpbray+20cm",
  resolver_reason: "geometry_formula_not_in_template_catalog", evidence_reason: "conflicting_formula_authority",
});

export function classifyExactSourceBomEvidenceGap(record, canonicalItemCode, resolverReason) {
  const rule = RULES.get(Number(record?.source_row));
  if (!rule) return null;
  if (clean(record?.source_sheet || "ĐM") !== "ĐM") return null;
  if (clean(canonicalItemCode) !== rule.item) return null;
  if (clean(record?.source_uom) !== rule.uom) return null;
  if (clean(record?.source_qty_or_formula) !== rule.raw) return null;
  if (fold(record?.source_formula_text) !== fold(rule.formula)) return null;
  if (clean(resolverReason) !== rule.resolver_reason) return null;
  return { reason: rule.evidence_reason, resolver_reason: rule.resolver_reason };
}
