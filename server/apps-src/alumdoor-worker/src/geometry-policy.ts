export type GeometryRuleOperator = "COPY" | "SUBTRACT" | "ADD";

export interface GeometryPolicyRule {
  rule_code?: string;
  target_field: string;
  source_field: string;
  operator: GeometryRuleOperator;
  operand_m?: number;
  customer_group?: string;
  ray_type?: string;
  has_butterfly_bracket?: unknown;
  priority?: number;
  sequence?: number;
  note?: string;
}

export interface GeometryRuleContext {
  customer_group?: string;
  ray_type?: string;
  has_butterfly_bracket?: boolean;
}

export interface GeometryRuleResult {
  values: Record<string, number>;
  applied_rules: Array<{
    rule_code: string;
    target_field: string;
    source_field: string;
    source_value_m: number;
    operator: GeometryRuleOperator;
    operand_m: number;
    output_value_m: number;
    note?: string;
  }>;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function finiteDimension(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function nonNegative(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizedConditions(rule: GeometryPolicyRule): Array<[keyof GeometryRuleContext, string | boolean]> {
  const out: Array<[keyof GeometryRuleContext, string | boolean]> = [];
  const customer = text(rule.customer_group);
  const ray = text(rule.ray_type);
  if (customer) out.push(["customer_group", customer]);
  if (ray) out.push(["ray_type", ray]);
  if (checked(rule.has_butterfly_bracket)) out.push(["has_butterfly_bracket", true]);
  return out;
}

function matches(rule: GeometryPolicyRule, context: GeometryRuleContext): boolean {
  return normalizedConditions(rule).every(([key, expected]) => {
    if (key === "has_butterfly_bracket") return Boolean(context.has_butterfly_bracket) === expected;
    return text(context[key]) === expected;
  });
}

function specificity(rule: GeometryPolicyRule): number {
  return normalizedConditions(rule).length;
}

function chooseRule(target: string, rules: GeometryPolicyRule[], context: GeometryRuleContext): GeometryPolicyRule | null {
  const candidates = rules
    .filter((rule) => rule.target_field === target && matches(rule, context))
    .map((rule) => ({ rule, specificity: specificity(rule), priority: Number(rule.priority ?? 0) || 0 }))
    .sort((a, b) => (b.specificity - a.specificity) || (b.priority - a.priority));
  if (!candidates.length) return null;
  const first = candidates[0]!;
  const tied = candidates.filter((entry) => entry.specificity === first.specificity && entry.priority === first.priority);
  if (tied.length > 1) {
    throw new Error(`Có ${tied.length} quy tắc hình học cùng mức cho ${target}: ${tied.map((entry) => text(entry.rule.rule_code) || "(không mã)").join(", ")}. Hệ thống không đoán.`);
  }
  return first.rule;
}

export function evaluateGeometryRules(input: {
  policy_name: string;
  geometry_profile: string;
  profile_fields: Array<{ geometry_field?: string; geometryField?: string; role?: string }>;
  rules: GeometryPolicyRule[];
  inputs: Record<string, unknown>;
  context?: GeometryRuleContext;
  required_targets?: string[];
}): GeometryRuleResult {
  const policyName = text(input.policy_name) || "Cutting Policy";
  if (!text(input.geometry_profile)) throw new Error(`${policyName}: thiếu Bộ quy cách hình học.`);
  const profileRoles = new Map(input.profile_fields.map((field) => [text(field.geometry_field ?? field.geometryField), text(field.role)]));
  const allowed = new Set(profileRoles.keys());
  const calculated = [...profileRoles].filter(([, role]) => role === "CALCULATED").map(([code]) => code);
  const required = new Set((input.required_targets ?? []).map(text).filter(Boolean));

  for (const rule of input.rules) {
    const target = text(rule.target_field);
    const source = text(rule.source_field);
    if (!allowed.has(target) || !allowed.has(source)) throw new Error(`${policyName}: rule ${text(rule.rule_code)} dùng field ngoài Geometry Profile.`);
    if (profileRoles.get(target) !== "CALCULATED") throw new Error(`${policyName}: ${target} không phải trường Tự tính.`);
    if (profileRoles.get(source) !== "INPUT") throw new Error(`${policyName}: ${source} không phải trường Nhập liệu.`);
    if (!["COPY", "SUBTRACT", "ADD"].includes(rule.operator)) throw new Error(`${policyName}: operator ${text(rule.operator)} không hợp lệ.`);
  }

  const values: Record<string, number> = {};
  for (const [code, value] of Object.entries(input.inputs)) {
    if (!allowed.has(code)) throw new Error(`${policyName}: input ${code} không thuộc Geometry Profile ${input.geometry_profile}.`);
    if (value === undefined || value === null || value === "") continue;
    values[code] = finiteDimension(value, code);
  }

  const applied: GeometryRuleResult["applied_rules"] = [];
  const context = input.context ?? {};
  for (const target of calculated) {
    const rule = chooseRule(target, input.rules, context);
    if (!rule) {
      if (required.has(target)) throw new Error(`${policyName}: chưa có quy tắc phù hợp để tính ${target} với ngữ cảnh hiện tại.`);
      continue;
    }
    const source = text(rule.source_field);
    if (!(source in values)) throw new Error(`${policyName}: thiếu ${source} để tính ${target}; hệ thống không tự điền 0.`);
    const sourceValue = finiteDimension(values[source], source);
    const operand = nonNegative(rule.operand_m, `${text(rule.rule_code)}: operand`);
    const output = rule.operator === "SUBTRACT" ? sourceValue - operand : rule.operator === "ADD" ? sourceValue + operand : sourceValue;
    if (!(output > 0)) throw new Error(`${policyName}: ${target} tính ra ${output}, phải lớn hơn 0.`);
    values[target] = round(output);
    applied.push({
      rule_code: text(rule.rule_code) || `${target}-${rule.operator}`,
      target_field: target,
      source_field: source,
      source_value_m: round(sourceValue),
      operator: rule.operator,
      operand_m: round(operand),
      output_value_m: round(output),
      ...(text(rule.note) ? { note: text(rule.note) } : {}),
    });
  }

  return { values, applied_rules: applied };
}
