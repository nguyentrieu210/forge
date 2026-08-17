export type BomScalar = string | number | boolean;

export type BomConditions = Record<string, BomScalar>;

export type BomQuantityRounding = "NONE" | "ROUND" | "CEIL" | "FLOOR";

export type BomQuantityOperand =
  | { value: number }
  | { field: string; offset?: number };

export type BomQuantityBase =
  | { kind: "CONSTANT"; value: number }
  | { kind: "FIELD"; field: string; offset?: number }
  | { kind: "PRODUCT"; left: BomQuantityOperand; right: BomQuantityOperand }
  | { kind: "QUOTIENT"; numerator: BomQuantityOperand; denominator: BomQuantityOperand };

export interface BomQuantityFormula {
  base: BomQuantityBase;
  multiply?: number;
  add?: number;
  rounding?: BomQuantityRounding;
  precision?: number;
}

export interface BomComponentRule {
  rule_code: string;
  component_key?: string;
  item_code: string;
  stock_uom?: string;
  conditions?: BomConditions;
  priority?: number;
  sequence?: number;
  quantity: BomQuantityFormula;
  note?: string;
}

export interface BomTemplateDefinition {
  template_code: string;
  item_code: string;
  conditions?: BomConditions;
  priority?: number;
  disabled?: unknown;
  required_context_fields?: string[];
  required_component_keys?: string[];
  component_rules: BomComponentRule[];
}

export interface ResolvedBomComponent {
  component_key?: string;
  item_code: string;
  stock_uom?: string;
  qty: number;
  source_rule: string;
  note?: string;
}

export interface ResolvedBomTemplate {
  template_code: string;
  item_code: string;
  components: ResolvedBomComponent[];
  applied_rules: string[];
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function isDisabled(value: unknown): boolean {
  return checked(value);
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} phải là số hữu hạn.`);
  return number;
}

function positive(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!(number > 0)) throw new Error(`${label} phải lớn hơn 0.`);
  return number;
}

function integer(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} phải là số nguyên.`);
  return number;
}

function sameScalar(actual: unknown, expected: BomScalar): boolean {
  if (typeof expected === "boolean") return checked(actual) === expected;
  if (typeof expected === "number") return Number(actual) === expected;
  return text(actual) === text(expected);
}

function matchesConditions(conditions: BomConditions | undefined, context: Record<string, unknown>): boolean {
  return Object.entries(conditions ?? {}).every(([field, expected]) => {
    if (!(field in context) || context[field] === undefined || context[field] === null || context[field] === "") return false;
    return sameScalar(context[field], expected);
  });
}

function specificity(conditions: BomConditions | undefined): number {
  return Object.keys(conditions ?? {}).length;
}

function priority(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function assertContextFields(template: BomTemplateDefinition, context: Record<string, unknown>): void {
  for (const field of template.required_context_fields ?? []) {
    if (!(field in context) || context[field] === undefined || context[field] === null || context[field] === "") {
      throw new Error(`${template.template_code}: thiếu ngữ cảnh bắt buộc ${field}; hệ thống không tự đoán.`);
    }
  }
}

function chooseTemplate(templates: BomTemplateDefinition[], context: Record<string, unknown>): BomTemplateDefinition {
  const candidates = templates
    .filter((template) => !isDisabled(template.disabled) && matchesConditions(template.conditions, context))
    .map((template) => ({
      template,
      specificity: specificity(template.conditions),
      priority: priority(template.priority),
    }))
    .sort((a, b) => (b.specificity - a.specificity) || (b.priority - a.priority));

  if (!candidates.length) throw new Error("Không có BOM Template phù hợp với cấu hình hiện tại; hệ thống không tự đoán.");

  const first = candidates[0]!;
  const tied = candidates.filter((entry) => entry.specificity === first.specificity && entry.priority === first.priority);
  if (tied.length > 1) {
    throw new Error(`Có ${tied.length} BOM Template cùng mức: ${tied.map((entry) => entry.template.template_code).join(", ")}. Hệ thống không đoán.`);
  }
  return first.template;
}

function readOperand(operand: BomQuantityOperand, values: Record<string, unknown>, label: string): number {
  if ("value" in operand) return finite(operand.value, label);
  const field = text(operand.field);
  if (!field) throw new Error(`${label}: thiếu field nguồn.`);
  if (!(field in values) || values[field] === undefined || values[field] === null || values[field] === "") {
    throw new Error(`${label}: thiếu ${field}; hệ thống không tự điền 0.`);
  }
  return finite(values[field], `${label}.${field}`) + finite(operand.offset ?? 0, `${label}.offset`);
}

function applyRounding(value: number, rounding: BomQuantityRounding, precision: number): number {
  if (rounding === "CEIL") return Math.ceil(value);
  if (rounding === "FLOOR") return Math.floor(value);
  const factor = 10 ** precision;
  if (rounding === "ROUND") return Math.round((value + Number.EPSILON) * factor) / factor;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function evaluateBomQuantity(
  formula: BomQuantityFormula,
  values: Record<string, unknown>,
  label = "BOM quantity",
): number {
  const base = formula.base;
  let value: number;

  if (base.kind === "CONSTANT") {
    value = finite(base.value, `${label}.value`);
  } else if (base.kind === "FIELD") {
    value = readOperand(base.offset === undefined ? { field: base.field } : { field: base.field, offset: base.offset }, values, label);
  } else if (base.kind === "PRODUCT") {
    value = readOperand(base.left, values, `${label}.left`) * readOperand(base.right, values, `${label}.right`);
  } else if (base.kind === "QUOTIENT") {
    const numerator = readOperand(base.numerator, values, `${label}.numerator`);
    const denominator = readOperand(base.denominator, values, `${label}.denominator`);
    if (denominator === 0) throw new Error(`${label}: mẫu số bằng 0.`);
    value = numerator / denominator;
  } else {
    const unreachable: never = base;
    throw new Error(`${label}: quantity base không hợp lệ: ${String(unreachable)}.`);
  }

  value = (value * finite(formula.multiply ?? 1, `${label}.multiply`)) + finite(formula.add ?? 0, `${label}.add`);
  const precision = integer(formula.precision ?? 6, `${label}.precision`);
  if (precision < 0 || precision > 12) throw new Error(`${label}.precision phải từ 0 đến 12.`);
  value = applyRounding(value, formula.rounding ?? "NONE", precision);
  return positive(value, label);
}

function chooseComponentRule(
  componentKey: string,
  rules: BomComponentRule[],
  context: Record<string, unknown>,
): BomComponentRule | null {
  const candidates = rules
    .filter((rule) => text(rule.component_key) === componentKey && matchesConditions(rule.conditions, context))
    .map((rule) => ({ rule, specificity: specificity(rule.conditions), priority: priority(rule.priority) }))
    .sort((a, b) => (b.specificity - a.specificity) || (b.priority - a.priority));

  if (!candidates.length) return null;
  const first = candidates[0]!;
  const tied = candidates.filter((entry) => entry.specificity === first.specificity && entry.priority === first.priority);
  if (tied.length > 1) {
    throw new Error(`Có ${tied.length} BOM Component Rule cùng mức cho ${componentKey}: ${tied.map((entry) => entry.rule.rule_code).join(", ")}. Hệ thống không đoán.`);
  }
  return first.rule;
}

function assertRule(rule: BomComponentRule, templateCode: string): void {
  if (!text(rule.rule_code)) throw new Error(`${templateCode}: BOM Component Rule thiếu rule_code.`);
  if (!text(rule.item_code)) throw new Error(`${templateCode}/${rule.rule_code}: thiếu item_code.`);
}

export function resolveBomTemplate(input: {
  templates: BomTemplateDefinition[];
  context?: Record<string, unknown>;
  values?: Record<string, unknown>;
}): ResolvedBomTemplate {
  const context = input.context ?? {};
  const values = { ...context, ...(input.values ?? {}) };
  const template = chooseTemplate(input.templates, context);

  if (!text(template.template_code)) throw new Error("BOM Template thiếu template_code.");
  if (!text(template.item_code)) throw new Error(`${template.template_code}: thiếu item_code thành phẩm.`);
  assertContextFields(template, context);

  for (const rule of template.component_rules) assertRule(rule, template.template_code);

  const keyed = new Map<string, BomComponentRule[]>();
  const independent: BomComponentRule[] = [];
  for (const rule of template.component_rules) {
    const key = text(rule.component_key);
    if (!key) independent.push(rule);
    else keyed.set(key, [...(keyed.get(key) ?? []), rule]);
  }

  const selected: BomComponentRule[] = [];
  for (const key of keyed.keys()) {
    const rule = chooseComponentRule(key, keyed.get(key)!, context);
    if (rule) selected.push(rule);
  }
  for (const rule of independent) {
    if (matchesConditions(rule.conditions, context)) selected.push(rule);
  }

  const selectedKeys = new Set(selected.map((rule) => text(rule.component_key)).filter(Boolean));
  for (const key of template.required_component_keys ?? []) {
    if (!selectedKeys.has(text(key))) {
      throw new Error(`${template.template_code}: thiếu BOM Component Rule phù hợp cho ${key}; hệ thống không tự bỏ vật tư bắt buộc.`);
    }
  }

  selected.sort((a, b) => (Number(a.sequence ?? 0) - Number(b.sequence ?? 0)) || text(a.rule_code).localeCompare(text(b.rule_code), "vi"));

  const components = selected.map((rule) => {
    const qty = evaluateBomQuantity(rule.quantity, values, `${template.template_code}/${rule.rule_code}`);
    return {
      ...(text(rule.component_key) ? { component_key: text(rule.component_key) } : {}),
      item_code: text(rule.item_code),
      ...(text(rule.stock_uom) ? { stock_uom: text(rule.stock_uom) } : {}),
      qty,
      source_rule: text(rule.rule_code),
      ...(text(rule.note) ? { note: text(rule.note) } : {}),
    } satisfies ResolvedBomComponent;
  });

  return {
    template_code: text(template.template_code),
    item_code: text(template.item_code),
    components,
    applied_rules: components.map((component) => component.source_rule),
  };
}
