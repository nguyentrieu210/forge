import { GEOMETRY_FIELDS, GEOMETRY_PROFILES } from "./alumdoor-geometry-catalog.mjs";

export const CUTTING_RULE_OPERATORS = Object.freeze(["COPY", "SUBTRACT", "ADD"]);

const cond = (values = {}) => Object.freeze({ ...values });
const rule = (code, targetField, sourceField, operator, operandM = 0, conditions = {}, priority = 0, note = "") =>
  Object.freeze({ code, targetField, sourceField, operator, operandM, conditions: cond(conditions), priority, note });

// Cutting Policy owns GEOMETRY only. Pricing, BOM quantities and purchase/sales amount formulas are deliberately absent.
// Evidence: QUY CÁCH (3).xlsx / CT TT-SX + ĐƠN GIÁ TRỌN BỘ, and 25.7 QUY TRÌNH (2).docx.
export const CUTTING_POLICIES = Object.freeze([
  Object.freeze({
    code: "CP-CUA-DUC",
    name: "Cửa Đức — công thức chuẩn",
    doorType: "Cửa Đức",
    geometryProfile: "GP-CUA-DUC",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("DUC-RCL-DL", "CAT_LA_RONG", "PB_NHUA_RONG", "SUBTRACT", 0.02, { customer_group: "Đại lý" }, 0,
        "Đại lý: rộng cắt lá = rộng phủ bì nhựa - 0,02 m."),
      rule("DUC-RCL-LE", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.08, { customer_group: "Lẻ" }, 0,
        "Khách lẻ: rộng cắt lá = rộng phủ bì ray - 0,08 m; 0,06 trong bản quy trình là khoảng cách PB ray→PB nhựa, không phải số trừ cắt."),
    ]),
  }),
  Object.freeze({
    code: "CP-CUA-UC",
    name: "Cửa Úc — công thức chuẩn",
    doorType: "Cửa Úc",
    geometryProfile: "GP-CUA-UC",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("UC-RCL", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "Rộng cắt lá = rộng phủ bì ray - 0,03 m."),
      rule("UC-RAY-U70", "RAY_DAI", "PB_CAO", "SUBTRACT", 0.10, { ray_type: "Ray sắt U70" }, 0,
        "Ray sắt U70 không ron: dài ray = cao phủ bì - 0,10 m."),
    ]),
  }),
  Object.freeze({
    code: "CP-CUA-TAM-LIEN-UC",
    name: "Cửa tấm liền Úc — công thức chuẩn",
    doorType: "Cửa tấm liền Úc",
    geometryProfile: "GP-CUA-UC",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("TLUC-RCL-U70", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.05, { ray_type: "Ray sắt U70" }, 10,
        "Đức kéo tay/AL70 dùng ray sắt U70 không ron: rộng cắt lá = PB ray - 0,05 m."),
      rule("TLUC-RCL-U76", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.08, { ray_type: "Ray hộp/đơn U76" }, 10,
        "Đức kéo tay/AL70 dùng ray hộp U76 hoặc ray đơn U76: rộng cắt lá = PB ray - 0,08 m."),
    ]),
  }),
  Object.freeze({
    code: "CP-CUA-LUOI",
    name: "Cửa Lưới — công thức chuẩn",
    doorType: "Cửa Lưới",
    geometryProfile: "GP-CUA-LUOI",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("LUOI-RCL", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "Rộng cắt lá = PB ray - 0,03 m."),
      rule("LUOI-RCL-BUOM", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.035, { has_butterfly_bracket: true }, 10,
        "Có lá Đài Loan bắn bướm: rộng cắt lá = PB ray - 0,035 m."),
      rule("LUOI-RAY", "RAY_DAI", "PB_CAO", "SUBTRACT", 0.10, {}, 0,
        "Ray sắt U70: dài ray = cao phủ bì - 0,10 m khi thành phần ray được BOM chọn."),
      rule("LUOI-V4", "V4_DAI", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "V4/V5: dài = PB ray - 0,03 m khi thành phần V4/V5 được BOM chọn."),
      rule("LUOI-TRUC", "TRUC_DAI", "PB_RAY_RONG", "SUBTRACT", 0.05, {}, 0,
        "Trục 114: dài = PB ray - 0,05 m khi thành phần trục được BOM chọn."),
    ]),
  }),
  Object.freeze({
    code: "CP-CUA-DAI-LOAN",
    name: "Cửa Đài Loan — công thức chuẩn",
    doorType: "Cửa Đài Loan",
    geometryProfile: "GP-CUA-DAI-LOAN",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("DL-RCL", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "Rộng cắt lá = PB ray - 0,03 m."),
      rule("DL-RCL-BUOM", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.035, { has_butterfly_bracket: true }, 10,
        "Có bắn bướm: rộng cắt lá = PB ray - 0,035 m."),
      rule("DL-RAY", "RAY_DAI", "PB_CAO", "SUBTRACT", 0.10, {}, 0,
        "Ray sắt U70 có ron: dài ray = cao phủ bì - 0,10 m khi BOM chọn ray."),
      rule("DL-V4", "V4_DAI", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "V4/V5: dài = PB ray - 0,03 m khi BOM chọn V4/V5."),
      rule("DL-TRUC", "TRUC_DAI", "PB_RAY_RONG", "SUBTRACT", 0.05, {}, 0,
        "Trục 114-1.8ly: dài = PB ray - 0,05 m khi BOM chọn trục."),
    ]),
  }),
  Object.freeze({
    code: "CP-CUA-SIEU-TRUONG",
    name: "Cửa Siêu Trường — công thức chuẩn",
    doorType: "Cửa Siêu Trường",
    geometryProfile: "GP-CUA-SIEU-TRUONG",
    requiredTargets: Object.freeze(["CAT_LA_RONG"]),
    rules: Object.freeze([
      rule("ST-RCL", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.03, {}, 0,
        "Rộng cắt lá = PB ray - 0,03 m."),
      rule("ST-RCL-BUOM", "CAT_LA_RONG", "PB_RAY_RONG", "SUBTRACT", 0.035, { has_butterfly_bracket: true }, 10,
        "Có bắn bướm: rộng cắt lá = PB ray - 0,035 m."),
    ]),
  }),
]);

export function cuttingPolicyByName(name) {
  return CUTTING_POLICIES.find((policy) => policy.name === name) ?? null;
}

export function cuttingPolicyByDoorType(doorType) {
  return CUTTING_POLICIES.find((policy) => policy.doorType === doorType) ?? null;
}

export function cuttingPolicyFixtureData(policy) {
  return {
    geometry_profile: policy.geometryProfile,
    geometry_rules: policy.rules.map((entry, index) => ({
      rule_code: entry.code,
      target_field: entry.targetField,
      source_field: entry.sourceField,
      operator: entry.operator,
      operand_m: entry.operandM,
      customer_group: entry.conditions.customer_group ?? "",
      ray_type: entry.conditions.ray_type ?? "",
      has_butterfly_bracket: entry.conditions.has_butterfly_bracket === true ? 1 : 0,
      priority: entry.priority,
      sequence: (index + 1) * 10,
      note: entry.note,
    })),
  };
}

export function assertCuttingPolicyCatalog() {
  const fieldByCode = new Map(GEOMETRY_FIELDS.map((field) => [field.code, field]));
  const profileByCode = new Map(GEOMETRY_PROFILES.map((profile) => [profile.code, profile]));
  const policyCodes = new Set();
  for (const policy of CUTTING_POLICIES) {
    if (policyCodes.has(policy.code)) throw new Error(`Cutting Policy code trùng: ${policy.code}`);
    policyCodes.add(policy.code);
    const profile = profileByCode.get(policy.geometryProfile);
    if (!profile) throw new Error(`${policy.code}: Geometry Profile không tồn tại ${policy.geometryProfile}`);
    const profileFields = new Map(profile.fields.map((field) => [field.geometryField, field]));
    for (const target of policy.requiredTargets ?? []) {
      if (!profileFields.has(target)) throw new Error(`${policy.code}: required target ngoài profile ${target}`);
    }
    const ruleCodes = new Set();
    for (const entry of policy.rules) {
      if (ruleCodes.has(entry.code)) throw new Error(`${policy.code}: rule code trùng ${entry.code}`);
      ruleCodes.add(entry.code);
      if (!CUTTING_RULE_OPERATORS.includes(entry.operator)) throw new Error(`${entry.code}: operator không hợp lệ`);
      if (!fieldByCode.has(entry.targetField) || !fieldByCode.has(entry.sourceField)) throw new Error(`${entry.code}: Geometry Field không tồn tại`);
      const target = profileFields.get(entry.targetField);
      const source = profileFields.get(entry.sourceField);
      if (!target || !source) throw new Error(`${entry.code}: source/target không thuộc ${policy.geometryProfile}`);
      if (target.role !== "CALCULATED") throw new Error(`${entry.code}: target phải là CALCULATED`);
      if (source.role !== "INPUT") throw new Error(`${entry.code}: source phải là INPUT`);
      if (!Number.isFinite(entry.operandM) || entry.operandM < 0) throw new Error(`${entry.code}: operand_m không hợp lệ`);
    }
  }
  return true;
}
