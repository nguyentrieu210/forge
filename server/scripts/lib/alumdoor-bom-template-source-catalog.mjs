const fixed = (value) => ({ base: { kind: "CONSTANT", value } });
const field = (name, multiply = 1, offset = undefined) => ({
  base: { kind: "FIELD", field: name, ...(offset === undefined ? {} : { offset }) },
  ...(multiply === 1 ? {} : { multiply }),
});
const product = (left, right, multiply = 1) => ({
  base: { kind: "PRODUCT", left, right },
  ...(multiply === 1 ? {} : { multiply }),
});

/**
 * Source-backed BOM normalization catalog.
 *
 * Rule: source ambiguity is data, not permission to guess. A template stays disabled
 * until every production-critical source row is represented deterministically or has
 * an explicit structured input in Sales configuration.
 */
export const BOM_TEMPLATE_SOURCE_CATALOG = [
  {
    name: "SRC-UC-KT-4D-XN-VK",
    source: {
      document: "MS LIÊN BS.xlsx",
      sheet: "ĐM",
      product_row: 686,
      component_rows: [687, 688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 705, 706, 707, 708, 709, 710, 711],
    },
    data: {
      template_code: "SRC-UC-KT-4D-XN-VK",
      item_code: "TP-UC KT 4D XN-VK",
      conditions_json: JSON.stringify({ item_code: "TP-UC KT 4D XN-VK" }),
      priority: 100,
      disabled: false,
      source_status: "READY_WITH_ACTUALS",
      source_ref: "MS LIÊN BS.xlsx / ĐM / rows 686-711",
      required_context_fields_json: "[]",
      required_component_keys_json: JSON.stringify([
        "LEAF_SHEET",
        "T_BRACKET",
        "SPIKE_PULLEY_WEIGHT",
        "BOTTOM_BAR_WEIGHT",
        "RAY_U70_WEIGHT",
        "SHAFT_34_WEIGHT",
        "PLASTIC_STOP_CLAMP",
        "STEEL_BEARING",
        "FLOOR_LOCK_BRACKET_WEIGHT",
      ]),
      required_actual_component_keys_json: JSON.stringify([
        "BOTTOM_SEAL",
        "FOAM_45CM",
        "PULLEY_34",
        "SPRING",
        "SPRING_STOP_ARM",
        "PULL_ROD",
        "SCREW_HEAD_PULLEY",
        "SCREW_2P_PULLEY",
      ]),
      deferred_components_json: JSON.stringify([
        { source_row: 691, key: "BOTTOM_SEAL", reason: "Nguồn ghi 'xem lại'; chưa được phép chốt công thức." },
        { source_row: 693, key: "FOAM_45CM", reason: "Nguồn có công thức nhưng chưa chỉ rõ quy tắc làm tròn số tấm." },
        { source_row: 695, key: "PULLEY_34", reason: "Nguồn ghi 'trừ thực tế'; cần số puly thực tế từ cấu hình." },
        { source_rows: [696, 697, 698, 699, 700, 701, 702, 703], key: "SPRING", reason: "SKU và số lượng lò xo chọn theo thực tế; chưa có input cấu trúc." },
        { source_row: 706, key: "SPRING_STOP_ARM", reason: "Phụ thuộc số lò xo thực tế." },
        { source_row: 707, key: "PULL_ROD", reason: "Một ô mã nguồn chứa 3 NVL; cần chốt dùng cụm TP hay bung 3 NVL." },
        { source_row: 710, key: "SCREW_HEAD_PULLEY", reason: "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ." },
        { source_row: 711, key: "SCREW_2P_PULLEY", reason: "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ." },
      ]),
      note: "Pilot chuẩn hóa trực tiếp từ sheet ĐM. Các dòng không đủ công thức được bắt buộc nhập actual có cấu trúc theo một bộ; thiếu slot thì materializer chặn.",
      component_rules: [
        {
          rule_code: "SRC-687-LEAF",
          component_key: "LEAF_SHEET",
          item_code: "NVL-TON3.8D-XN-VK",
          source_row: 687,
          source_uom: "KG/M2",
          source_formula: "Caopb x (rpbray-30) x SL x 3,6; Production tách từng bộ nên SL=1.",
          sequence: 10,
          quantity_formula_json: JSON.stringify(product({ field: "PB_CAO" }, { field: "PB_RONG", offset: -0.3 }, 3.6)),
        },
        {
          rule_code: "SRC-688-GIA-T",
          component_key: "T_BRACKET",
          item_code: "NVL-GIAT",
          source_row: 688,
          source_uom: "CẶP",
          source_formula: "1 bộ 1 cặp.",
          sequence: 20,
          quantity_formula_json: JSON.stringify(fixed(1)),
        },
        {
          rule_code: "SRC-689-PULY-GAI",
          component_key: "SPIKE_PULLEY_WEIGHT",
          item_code: "NVL-PULYGAI",
          source_row: 689,
          source_uom: "KG/M2",
          source_formula: "Diện tích x SL x 0,126; Production tách từng bộ nên SL=1.",
          sequence: 30,
          quantity_formula_json: JSON.stringify(field("billable_area_sqm", 0.126)),
        },
        {
          rule_code: "SRC-690-V-DAY",
          component_key: "BOTTOM_BAR_WEIGHT",
          item_code: "NVL-VDAY-TDU",
          source_row: 690,
          source_uom: "KG/M",
          source_formula: "(rộng pbray - 30cm) x 0,6 x SL; Production tách từng bộ nên SL=1.",
          sequence: 40,
          quantity_formula_json: JSON.stringify(field("PB_RONG", 0.6, -0.3)),
        },
        {
          rule_code: "SRC-692-RAY-U70",
          component_key: "RAY_U70_WEIGHT",
          item_code: "NVL-TOLE1.2x190-KRON",
          source_row: 692,
          source_uom: "KG/M",
          source_formula: "(chiều cao - 10cm) x SL x 2 ray x 1,78; Production tách từng bộ nên SL=1.",
          sequence: 50,
          quantity_formula_json: JSON.stringify(field("PB_CAO", 3.56, -0.1)),
        },
        {
          rule_code: "SRC-694-TRUC-34",
          component_key: "SHAFT_34_WEIGHT",
          item_code: "NVL-TRUC34",
          source_row: 694,
          source_uom: "KG/M",
          source_formula: "(rộng pbray + 40cm) x 1,7 x SL; Production tách từng bộ nên SL=1.",
          sequence: 60,
          quantity_formula_json: JSON.stringify(field("PB_RONG", 1.7, 0.4)),
        },
        {
          rule_code: "SRC-705-CUM-HAM",
          component_key: "PLASTIC_STOP_CLAMP",
          item_code: "NVL-CHNHUA",
          source_row: 705,
          source_uom: "CÁI",
          source_formula: "1 bộ x 2 cái.",
          sequence: 70,
          quantity_formula_json: JSON.stringify(fixed(2)),
        },
        {
          rule_code: "SRC-708-GOI-SAT",
          component_key: "STEEL_BEARING",
          item_code: "NVL-GOIFE",
          source_row: 708,
          source_uom: "CÁI",
          source_formula: "1 bộ x 2 cái.",
          sequence: 80,
          quantity_formula_json: JSON.stringify(fixed(2)),
        },
        {
          rule_code: "SRC-709-BAT-KHOA",
          component_key: "FLOOR_LOCK_BRACKET_WEIGHT",
          item_code: "NVL-BKAN",
          source_row: 709,
          source_uom: "KG/CẶP",
          source_formula: "1 bộ x 4 cặp x 0,1925.",
          sequence: 90,
          quantity_formula_json: JSON.stringify(fixed(0.77)),
        },
      ],
    },
  },
];

export function bomSourceFixtureRows() {
  return BOM_TEMPLATE_SOURCE_CATALOG.map((entry) => ({
    type: "BOM Template",
    name: entry.name,
    data: structuredClone(entry.data),
  }));
}
