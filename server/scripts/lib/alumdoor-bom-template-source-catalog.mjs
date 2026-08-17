const fixed = (value) => ({ base: { kind: "CONSTANT", value } });
const field = (name, multiply = 1, offset = undefined) => ({
  base: { kind: "FIELD", field: name, ...(offset === undefined ? {} : { offset }) },
  ...(multiply === 1 ? {} : { multiply }),
});
const product = (left, right, multiply = 1) => ({
  base: { kind: "PRODUCT", left, right },
  ...(multiply === 1 ? {} : { multiply }),
});

const SOURCE_DOCUMENT = "MS LIÊN BS.xlsx";
const SOURCE_SHEET = "ĐM";

const SPRING_ITEMS = [
  "NVL-LX-5.5 x 70 x 46V",
  "NVL-LX-5.5 x 70 x 50V",
  "NVL-LV-6.0 x 70 x 53V",
  "NVL-LV-6.5 x 80 x 63V",
  "NVL-LV-6.5 x 80 x 68V",
  "NVL-LV-7.0 x 90 x 65V",
  "NVL-LV-7.0 x 90 x 73V",
  "NVL-LV-7.0 x 90 x 83V",
];

const PULL_ROD_ITEMS = ["NVL-INOX", "NVL-NHUA", "NVL-MOC"];

const REQUIRED_ACTUAL_4D = [
  "BOTTOM_SEAL",
  "FOAM_45CM",
  "PULLEY_34",
  "SPRING",
  "SPRING_STOP_ARM",
  "PULL_ROD",
  "SCREW_HEAD_PULLEY",
  "SCREW_2P_PULLEY",
];

const REQUIRED_ACTUAL_46D = [
  "LEAF_SHEET",
  "SPIKE_PULLEY_WEIGHT",
  "BOTTOM_BAR_WEIGHT",
  "RAY_U70_WEIGHT",
  "FOAM_45CM",
  "SHAFT_34_WEIGHT",
  "PULLEY_34",
  "SPRING",
  "SPRING_STOP_ARM",
  "PULL_ROD",
  "SCREW_HEAD_PULLEY",
  "SCREW_2P_PULLEY",
];

function sourceRows(productRow, count = 24) {
  return Array.from({ length: count }, (_, index) => productRow + index + 1);
}

function sourceRule(row, input) {
  return {
    rule_code: `SRC-${row}-${input.code}`,
    component_key: input.key,
    item_code: input.item,
    source_row: row,
    source_uom: input.uom,
    source_formula: input.sourceFormula,
    sequence: input.sequence,
    quantity_formula_json: JSON.stringify(input.quantity),
  };
}

function actualEntry(sourceRow, key, reason, sourceRowsOverride = undefined) {
  return sourceRowsOverride
    ? { source_rows: sourceRowsOverride, key, reason }
    : { source_row: sourceRow, key, reason };
}

function sourceTemplateBase({
  name,
  itemCode,
  productRow,
  componentRows,
  requiredKeys,
  requiredActualKeys,
  allowedActualItems,
  deferred,
  rules,
  note,
}) {
  return {
    name,
    source: {
      document: SOURCE_DOCUMENT,
      sheet: SOURCE_SHEET,
      product_row: productRow,
      component_rows: componentRows,
    },
    data: {
      template_code: name,
      item_code: itemCode,
      conditions_json: JSON.stringify({ item_code: itemCode }),
      priority: 100,
      disabled: false,
      source_status: "READY_WITH_ACTUALS",
      source_ref: `${SOURCE_DOCUMENT} / ${SOURCE_SHEET} / rows ${productRow}-${componentRows.at(-1)}`,
      required_context_fields_json: "[]",
      required_component_keys_json: JSON.stringify(requiredKeys),
      required_actual_component_keys_json: JSON.stringify(requiredActualKeys),
      actual_component_allowed_items_json: JSON.stringify(allowedActualItems),
      deferred_components_json: JSON.stringify(deferred),
      note,
      component_rules: rules,
    },
  };
}

function makeUcKt4dXnVk() {
  // Real source: product at row 687; components at 688-712 (row 705 is a label-only row).
  const productRow = 687;
  const componentRows = [688, 689, 690, 691, 692, 693, 694, 695, 696, 697, 698, 699, 700, 701, 702, 703, 704, 706, 707, 708, 709, 710, 711, 712];
  return sourceTemplateBase({
    name: "SRC-UC-KT-4D-XN-VK",
    itemCode: "TP-UC KT 4D XN-VK",
    productRow,
    componentRows,
    requiredKeys: [
      "LEAF_SHEET", "T_BRACKET", "SPIKE_PULLEY_WEIGHT", "BOTTOM_BAR_WEIGHT",
      "RAY_U70_WEIGHT", "SHAFT_34_WEIGHT", "PLASTIC_STOP_CLAMP", "STEEL_BEARING",
      "FLOOR_LOCK_BRACKET_WEIGHT",
    ],
    requiredActualKeys: REQUIRED_ACTUAL_4D,
    allowedActualItems: {
      BOTTOM_SEAL: ["NVL-RONDAYUC"],
      FOAM_45CM: ["NVL-XOP-N45"],
      PULLEY_34: ["NVL-PULYUC34"],
      SPRING: SPRING_ITEMS,
      SPRING_STOP_ARM: ["NVL-VAIHAMXO"],
      PULL_ROD: PULL_ROD_ITEMS,
      SCREW_HEAD_PULLEY: ["NVL-VISDD-BANLO"],
      SCREW_2P_PULLEY: ["NVL-VIS-BANLO2P"],
    },
    deferred: [
      actualEntry(692, "BOTTOM_SEAL", "Nguồn ghi 'xem lại'; chưa được phép chốt công thức."),
      actualEntry(694, "FOAM_45CM", "Nguồn có công thức nhưng chưa chỉ rõ quy tắc làm tròn số tấm."),
      actualEntry(696, "PULLEY_34", "Nguồn ghi 'trừ thực tế'; nhập actual theo một bộ."),
      actualEntry(697, "SPRING", "SKU và số lượng lò xo chọn theo thực tế; nhập actual theo một bộ.", [697, 698, 699, 700, 701, 702, 703, 704]),
      actualEntry(707, "SPRING_STOP_ARM", "Phụ thuộc số lò xo thực tế; nhập actual theo một bộ."),
      actualEntry(708, "PULL_ROD", "Một ô mã nguồn chứa 3 NVL; nhập các NVL actual của cụm theo một bộ."),
      actualEntry(711, "SCREW_HEAD_PULLEY", "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ."),
      actualEntry(712, "SCREW_2P_PULLEY", "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ."),
    ],
    rules: [
      sourceRule(688, {
        code: "LEAF", key: "LEAF_SHEET", item: "NVL-TON3.8D-XN-VK", uom: "KG/M2", sequence: 10,
        sourceFormula: "ĐM: Caopb x (rpbray-30) x SL x 3,6. Project contract chuẩn hóa rộng cắt Úc = PB ray - 0,03 m; Production tách từng bộ nên SL=1.",
        quantity: product({ field: "PB_CAO" }, { field: "PB_RAY_RONG", offset: -0.03 }, 3.6),
      }),
      sourceRule(689, {
        code: "GIA-T", key: "T_BRACKET", item: "NVL-GIAT", uom: "CẶP", sequence: 20,
        sourceFormula: "1 bộ 1 cặp.", quantity: fixed(1),
      }),
      sourceRule(690, {
        code: "PULY-GAI", key: "SPIKE_PULLEY_WEIGHT", item: "NVL-PULYGAI", uom: "KG/M2", sequence: 30,
        sourceFormula: "Diện tích x SL x 0,126; Production tách từng bộ nên SL=1.", quantity: field("billable_area_sqm", 0.126),
      }),
      sourceRule(691, {
        code: "V-DAY", key: "BOTTOM_BAR_WEIGHT", item: "NVL-VDAY-TDU", uom: "KG/M", sequence: 40,
        sourceFormula: "ĐM: (rộng pbray-30) x 0,6 x SL. Project contract chuẩn hóa phần trừ = 0,03 m; Production tách từng bộ nên SL=1.",
        quantity: field("PB_RAY_RONG", 0.6, -0.03),
      }),
      sourceRule(693, {
        code: "RAY-U70", key: "RAY_U70_WEIGHT", item: "NVL-TOLE1.2x190-KRON", uom: "KG/M", sequence: 50,
        sourceFormula: "(chiều cao - 10cm) x SL x 2 ray x 1,78; Production tách từng bộ nên SL=1.", quantity: field("PB_CAO", 3.56, -0.1),
      }),
      sourceRule(695, {
        code: "TRUC-34", key: "SHAFT_34_WEIGHT", item: "NVL-TRUC34", uom: "KG/M", sequence: 60,
        sourceFormula: "(rộng pbray + 40cm) x 1,7 x SL; Production tách từng bộ nên SL=1.", quantity: field("PB_RAY_RONG", 1.7, 0.4),
      }),
      sourceRule(706, {
        code: "CUM-HAM", key: "PLASTIC_STOP_CLAMP", item: "NVL-CHNHUA", uom: "CÁI", sequence: 70,
        sourceFormula: "1 bộ x 2 cái.", quantity: fixed(2),
      }),
      sourceRule(709, {
        code: "GOI-SAT", key: "STEEL_BEARING", item: "NVL-GOIFE", uom: "CÁI", sequence: 80,
        sourceFormula: "1 bộ x 2 cái.", quantity: fixed(2),
      }),
      sourceRule(710, {
        code: "BAT-KHOA", key: "FLOOR_LOCK_BRACKET_WEIGHT", item: "NVL-BKAN", uom: "KG/CẶP", sequence: 90,
        sourceFormula: "1 bộ x 4 cặp x 0,1925.", quantity: fixed(0.77),
      }),
    ],
    note: "Chuẩn hóa trực tiếp block ĐM 687-712. Source-row lineage đối chiếu extractor thực tế; dòng không đủ công thức vẫn bắt buộc actual.",
  });
}

function makeUcKt46Template({ name, itemCode, productRow, leafItem, sourceProductName }) {
  const row = (offset) => productRow + offset;
  const componentRows = sourceRows(productRow);
  const springRows = Array.from({ length: 8 }, (_, index) => row(10 + index));
  return sourceTemplateBase({
    name,
    itemCode,
    productRow,
    componentRows,
    requiredKeys: ["T_BRACKET", "BOTTOM_SEAL", "PLASTIC_STOP_CLAMP", "STEEL_BEARING", "FLOOR_LOCK_BRACKET_WEIGHT"],
    requiredActualKeys: REQUIRED_ACTUAL_46D,
    allowedActualItems: {
      LEAF_SHEET: [leafItem],
      SPIKE_PULLEY_WEIGHT: ["NVL-PULYGAI"],
      BOTTOM_BAR_WEIGHT: ["NVL-VDAY-TDU"],
      RAY_U70_WEIGHT: ["NVL-TOLE1.2x190-KRON"],
      FOAM_45CM: ["NVL-XOP-N45"],
      SHAFT_34_WEIGHT: ["NVL-TRUC34"],
      PULLEY_34: ["NVL-PULYUC34"],
      SPRING: SPRING_ITEMS,
      SPRING_STOP_ARM: ["NVL-VAIHAMXO"],
      PULL_ROD: PULL_ROD_ITEMS,
      SCREW_HEAD_PULLEY: ["NVL-VISDD-BANLO"],
      SCREW_2P_PULLEY: ["NVL-VIS-BANLO2P"],
    },
    deferred: [
      actualEntry(row(1), "LEAF_SHEET", `ĐM ${sourceProductName} có hệ số 4,4 KG/M2 nhưng ô công thức trống; không suy diễn cách nhân.`),
      actualEntry(row(3), "SPIKE_PULLEY_WEIGHT", "ĐM có hệ số 0,126 nhưng ô công thức trống; không suy diễn cách nhân."),
      actualEntry(row(4), "BOTTOM_BAR_WEIGHT", "ĐM có hệ số 0,6 nhưng ô công thức trống; không suy diễn cách nhân."),
      actualEntry(row(6), "RAY_U70_WEIGHT", "ĐM ghi chiều cao - 10cm x số lượng nhưng không ghi rõ cách áp hệ số 1,78; nhập actual để tránh suy diễn."),
      actualEntry(row(7), "FOAM_45CM", "ĐM ghi (rộng/45cm)*2 nhưng không chỉ rõ quy tắc làm tròn số tấm."),
      actualEntry(row(8), "SHAFT_34_WEIGHT", "ĐM ghi rộng + 40cm nhưng không ghi rõ cách áp hệ số 1,7; nhập actual để tránh suy diễn."),
      actualEntry(row(9), "PULLEY_34", "Nguồn ghi 'trừ thực tế'; nhập actual theo một bộ."),
      actualEntry(row(10), "SPRING", "SKU và số lượng lò xo chọn theo thực tế; nhập actual theo một bộ.", springRows),
      actualEntry(row(19), "SPRING_STOP_ARM", "Phụ thuộc số lò xo thực tế; nhập actual theo một bộ."),
      actualEntry(row(20), "PULL_ROD", "Một ô mã nguồn chứa 3 NVL; nhập các NVL actual của cụm theo một bộ."),
      actualEntry(row(23), "SCREW_HEAD_PULLEY", "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ."),
      actualEntry(row(24), "SCREW_2P_PULLEY", "Số vít phụ thuộc số puly thực tế; nhập actual theo một bộ."),
    ],
    rules: [
      sourceRule(row(2), {
        code: "GIA-T", key: "T_BRACKET", item: "NVL-GIAT", uom: "CẶP", sequence: 20,
        sourceFormula: "Định mức nguồn = 1 cặp / một bộ.", quantity: fixed(1),
      }),
      sourceRule(row(5), {
        code: "RON-DAY", key: "BOTTOM_SEAL", item: "NVL-RONDAYUC", uom: "KG/M ngang", sequence: 50,
        sourceFormula: "ron đáy = chiều rộng pbray x 0,0077.", quantity: field("PB_RAY_RONG", 0.0077),
      }),
      sourceRule(row(18), {
        code: "CUM-HAM", key: "PLASTIC_STOP_CLAMP", item: "NVL-CHNHUA", uom: "CÁI", sequence: 70,
        sourceFormula: "Định mức nguồn = 2 cái / một bộ.", quantity: fixed(2),
      }),
      sourceRule(row(21), {
        code: "GOI-SAT", key: "STEEL_BEARING", item: "NVL-GOIFE", uom: "CÁI", sequence: 80,
        sourceFormula: "Định mức nguồn = 2 cái / một bộ.", quantity: fixed(2),
      }),
      sourceRule(row(22), {
        code: "BAT-KHOA", key: "FLOOR_LOCK_BRACKET_WEIGHT", item: "NVL-BKAN", uom: "KG/CẶP", sequence: 90,
        sourceFormula: "1 bộ x 4 cặp x 0,1925.", quantity: fixed(0.77),
      }),
    ],
    note: `Factory nguồn KT 4.6D từ block ${productRow}-${productRow + 24}. Chỉ tự tính các dòng có ngữ nghĩa đủ rõ ngay trong block; các hệ số/công thức thiếu chi tiết bắt buộc nhập actual. Leaf nguồn: ${leafItem}.`,
  });
}

const UC_KT_46_VARIANTS = [
  {
    name: "SRC-UC-KT-46D-XN-VK",
    itemCode: "TP-UC KT 4.6D XN-VK",
    productRow: 732,
    leafItem: "NVL-TOLE0.42x598-XN-VK",
    sourceProductName: "CỬA ÚC KT 4.6D XN-VK",
  },
  {
    name: "SRC-UC-KT-46D-XR-CF",
    itemCode: "TP-UC KT 4.6D XR-CF",
    productRow: 757,
    leafItem: "NVL-TOLE0.42x598-XR-CF",
    sourceProductName: "CỬA ÚC KT 4.6D XR-CAFE",
  },
  {
    name: "SRC-UC-KT-46D-TR-XLC",
    itemCode: "TP-UC KT 4.6D TRẮNG-XLC",
    productRow: 782,
    leafItem: "NVL-TOLE0.42x598-TR-XLC",
    sourceProductName: "CỬA ÚC KT 4.6D TR-XLC",
  },
  {
    name: "SRC-UC-KT-46D-KU-GU",
    itemCode: "TP-UC KT 4.6D KU-GU",
    productRow: 807,
    leafItem: "NVL-TOLE0.42x598-KU-GU",
    sourceProductName: "CỬA ÚC KT 4.6D KU-GU",
  },
];

/**
 * Source-backed BOM normalization catalog.
 * Blank/ambiguous formulas never inherit a calculation from a neighboring product.
 * Source rows are the real Excel/extractor row numbers, not zero-based indexes.
 */
export const BOM_TEMPLATE_SOURCE_CATALOG = [
  makeUcKt4dXnVk(),
  ...UC_KT_46_VARIANTS.map(makeUcKt46Template),
];

export function bomSourceFixtureRows() {
  return BOM_TEMPLATE_SOURCE_CATALOG.map((entry) => ({
    type: "BOM Template",
    name: entry.name,
    data: structuredClone(entry.data),
  }));
}
