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

/**
 * Legacy/source-import envelope used when the source catalog identifies a
 * component but does not provide an authoritative production quantity yet.
 * It is intentionally not evaluated or converted to zero.
 */
export interface DeferredBomQuantityFormula {
  kind: "DEFERRED";
  reason?: string;
  source_formula?: unknown;
  source_value?: unknown;
}

export type StoredBomQuantityFormula = BomQuantityFormula | DeferredBomQuantityFormula;

export interface BomComponentRule {
  rule_code: string;
  component_key?: string;
  item_code: string;
  stock_uom?: string;
  conditions?: BomConditions;
  priority?: number;
  sequence?: number;
  quantity: StoredBomQuantityFormula;
  note?: string;
}

export interface BomTemplateDefinition {
  source_name?: string;
  modified?: string;
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
  quantity_fields?: string[];
  source_rule: string;
  note?: string;
}

export interface ResolvedBomTemplate {
  source_name?: string;
  template_code: string;
  item_code: string;
  components: ResolvedBomComponent[];
  applied_rules: string[];
}

export interface PreviewResolvedBomComponent extends Omit<ResolvedBomComponent, "qty"> {
  qty: number | null;
  quantity_error?: string;
}

export interface PreviewResolvedBomTemplate extends Omit<ResolvedBomTemplate, "components"> {
  components: PreviewResolvedBomComponent[];
}

/**
 * Sales-order BOM projection. It describes only which child Items belong to
 * the selected finished Item. Production quantity and production UOM are
 * intentionally absent; a sales line derives its own dimensions, quantity and
 * selling UOM from the parent line plus the child Item master.
 */
export interface ResolvedBomCompositionComponent {
  component_key?: string;
  item_code: string;
  source_rule: string;
  note?: string;
}

export interface ResolvedBomComposition {
  source_name?: string;
  template_code: string;
  item_code: string;
  components: ResolvedBomCompositionComponent[];
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

function templateConflictLabel(template: BomTemplateDefinition): string {
  const code = text(template.template_code);
  const source = text(template.source_name);
  return source && source !== code ? `${code} [${source}]` : code;
}

function assertContextFields(template: BomTemplateDefinition, context: Record<string, unknown>): void {
  for (const field of template.required_context_fields ?? []) {
    if (!(field in context) || context[field] === undefined || context[field] === null || context[field] === "") {
      throw new Error(`${template.template_code}: thiếu ngữ cảnh bắt buộc ${field}; hệ thống không tự đoán.`);
    }
  }
}

function chooseTemplate(templates: BomTemplateDefinition[], context: Record<string, unknown>): BomTemplateDefinition {
  const contextItemCode = text(context.item_code);
  const activeTemplates = templates.filter((template) => !isDisabled(template.disabled));
  const itemTemplates = activeTemplates
    // A BOM Template belongs to exactly one finished item. When the runtime
    // has an item_code, never let a template for another product compete on
    // generic/empty conditions; doing so turns a valid catalog into a
    // false "same level" ambiguity.
    .filter((template) => !contextItemCode || text(template.item_code) === contextItemCode);
  const candidates = itemTemplates
    .filter((template) => matchesConditions(template.conditions, context))
    .map((template) => ({
      template,
      specificity: specificity(template.conditions),
      priority: priority(template.priority),
      modified: text(template.modified),
    }))
    .sort((a, b) => (b.specificity - a.specificity)
      || (b.priority - a.priority)
      || b.modified.localeCompare(a.modified, "en"));

  if (!candidates.length) {
    if (contextItemCode && !itemTemplates.length) {
      throw new Error(`Mặt hàng ${contextItemCode} chưa có BOM Template; hãy cấu hình BOM cho đúng mã hàng.`);
    }
    const mismatches = [...new Set(itemTemplates.flatMap((template) => Object.entries(template.conditions ?? {})
      .filter(([field, expected]) => !(field in context)
        || context[field] === undefined
        || context[field] === null
        || context[field] === ""
        || !sameScalar(context[field], expected))
      .map(([field, expected]) => {
        const actual = field in context && context[field] !== undefined && context[field] !== null && context[field] !== ""
          ? text(context[field])
          : "chưa nhập";
        return `${field} cần ${text(expected)}, hiện ${actual}`;
      })))]
      .slice(0, 6);
    const scope = contextItemCode ? ` của ${contextItemCode}` : "";
    throw new Error(`BOM Template${scope} không khớp cấu hình${mismatches.length ? `: ${mismatches.join("; ")}` : " hiện tại"}. Hệ thống không tự đoán.`);
  }

  const first = candidates[0]!;
  const tied = candidates.filter((entry) => entry.specificity === first.specificity
    && entry.priority === first.priority
    && entry.modified === first.modified);
  if (tied.length > 1) {
    throw new Error(`Có ${tied.length} BOM Template cùng mức và cùng thời điểm cập nhật: ${tied.map((entry) => templateConflictLabel(entry.template)).join(", ")}. Hãy vô hiệu hóa bản thừa; hệ thống không đoán.`);
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

function bomQuantityFields(formula: StoredBomQuantityFormula): string[] {
  if (isDeferredBomQuantityFormula(formula) || !formula.base || typeof formula.base !== "object") return [];
  const fields: string[] = [];
  const append = (operand: BomQuantityOperand) => {
    if ("field" in operand && text(operand.field)) fields.push(text(operand.field));
  };
  if (formula.base.kind === "FIELD") append(formula.base);
  else if (formula.base.kind === "PRODUCT") {
    append(formula.base.left);
    append(formula.base.right);
  } else if (formula.base.kind === "QUOTIENT") {
    append(formula.base.numerator);
    append(formula.base.denominator);
  }
  return [...new Set(fields)];
}

function applyRounding(value: number, rounding: BomQuantityRounding, precision: number): number {
  if (rounding === "CEIL") return Math.ceil(value);
  if (rounding === "FLOOR") return Math.floor(value);
  const factor = 10 ** precision;
  if (rounding === "ROUND") return Math.round((value + Number.EPSILON) * factor) / factor;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function evaluateBomQuantity(
  formula: StoredBomQuantityFormula,
  values: Record<string, unknown>,
  label = "BOM quantity",
): number {
  if (isDeferredBomQuantityFormula(formula)) throw new Error(deferredBomQuantityMessage(formula, label));
  if (!formula.base || typeof formula.base !== "object") {
    throw new Error(`${label}: công thức số lượng BOM thiếu base; hãy hoàn thiện quantity_formula_json. Hệ thống không tự đoán.`);
  }
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

export function isDeferredBomQuantityFormula(formula: unknown): formula is DeferredBomQuantityFormula {
  return Boolean(formula && typeof formula === "object" && !Array.isArray(formula)
    && text((formula as Record<string, unknown>).kind).toLocaleUpperCase("vi") === "DEFERRED");
}

export function deferredBomQuantityMessage(formula: DeferredBomQuantityFormula, label: string): string {
  const reason = text(formula.reason);
  const reasonLabel = reason === "missing_conversion"
    ? "chưa có hệ số quy đổi từ dữ liệu BOM nguồn"
    : reason === "missing_or_non_authoritative_source_value"
      ? "chưa có số lượng nguồn đã được xác nhận"
      : reason === "runtime_formula_requires_geometry"
        ? "công thức nguồn cần bổ sung quy tắc kích thước"
        : reason === "runtime_formula_not_persistable_as_numeric_bom_item"
          ? "công thức nguồn chưa được chuyển sang số lượng sản xuất"
        : reason || "công thức nguồn đang chờ hoàn thiện";
  return `${label ? `${label}: ` : ""}${reasonLabel}; cần hoàn thiện công thức BOM trước khi sản xuất. Hệ thống không tự đoán số lượng.`;
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
    const quantityFields = bomQuantityFields(rule.quantity);
    return {
      ...(text(rule.component_key) ? { component_key: text(rule.component_key) } : {}),
      item_code: text(rule.item_code),
      ...(text(rule.stock_uom) ? { stock_uom: text(rule.stock_uom) } : {}),
      qty,
      ...(quantityFields.length ? { quantity_fields: quantityFields } : {}),
      source_rule: text(rule.rule_code),
      ...(text(rule.note) ? { note: text(rule.note) } : {}),
    } satisfies ResolvedBomComponent;
  });

  return {
    ...(text(template.source_name) ? { source_name: text(template.source_name) } : {}),
    template_code: text(template.template_code),
    item_code: text(template.item_code),
    components,
    applied_rules: components.map((component) => component.source_rule),
  };
}

/**
 * Read-only sales preview. It exposes an identified component even when its
 * imported source quantity is explicitly DEFERRED, while preserving a null
 * quantity and a clear reason. Production/materialization continues to use
 * resolveBomTemplate and therefore fails closed.
 */
export function resolveBomTemplatePreview(input: {
  templates: BomTemplateDefinition[];
  context?: Record<string, unknown>;
  values?: Record<string, unknown>;
}): PreviewResolvedBomTemplate {
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
  for (const rule of independent) if (matchesConditions(rule.conditions, context)) selected.push(rule);

  const selectedKeys = new Set(selected.map((rule) => text(rule.component_key)).filter(Boolean));
  for (const key of template.required_component_keys ?? []) {
    if (!selectedKeys.has(text(key))) {
      throw new Error(`${template.template_code}: thiếu BOM Component Rule phù hợp cho ${key}; hệ thống không tự bỏ vật tư bắt buộc.`);
    }
  }

  selected.sort((a, b) => (Number(a.sequence ?? 0) - Number(b.sequence ?? 0)) || text(a.rule_code).localeCompare(text(b.rule_code), "vi"));
  const components = selected.map((rule) => {
    const label = `${template.template_code}/${rule.rule_code}`;
    const common = {
      ...(text(rule.component_key) ? { component_key: text(rule.component_key) } : {}),
      item_code: text(rule.item_code),
      ...(text(rule.stock_uom) ? { stock_uom: text(rule.stock_uom) } : {}),
      ...(bomQuantityFields(rule.quantity).length ? { quantity_fields: bomQuantityFields(rule.quantity) } : {}),
      source_rule: text(rule.rule_code),
      ...(text(rule.note) ? { note: text(rule.note) } : {}),
    };
    if (isDeferredBomQuantityFormula(rule.quantity)) {
      return {
        ...common,
        qty: null,
        quantity_error: deferredBomQuantityMessage(rule.quantity, ""),
      } satisfies PreviewResolvedBomComponent;
    }
    return {
      ...common,
      qty: evaluateBomQuantity(rule.quantity, values, label),
    } satisfies PreviewResolvedBomComponent;
  });

  return {
    ...(text(template.source_name) ? { source_name: text(template.source_name) } : {}),
    template_code: text(template.template_code),
    item_code: text(template.item_code),
    components,
    applied_rules: components.map((component) => component.source_rule),
  };
}

/**
 * Resolve BOM membership for a sales document without reading or evaluating
 * the production quantity formula. Template and component conditions still
 * fail closed, so the composition cannot silently mix variants.
 */
export function resolveBomTemplateComposition(input: {
  templates: BomTemplateDefinition[];
  context?: Record<string, unknown>;
}): ResolvedBomComposition {
  const context = input.context ?? {};
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
  for (const rule of independent) if (matchesConditions(rule.conditions, context)) selected.push(rule);

  const selectedKeys = new Set(selected.map((rule) => text(rule.component_key)).filter(Boolean));
  for (const key of template.required_component_keys ?? []) {
    if (!selectedKeys.has(text(key))) {
      throw new Error(`${template.template_code}: thiếu BOM Component Rule phù hợp cho ${key}; hệ thống không tự bỏ vật tư bắt buộc.`);
    }
  }

  selected.sort((a, b) => (Number(a.sequence ?? 0) - Number(b.sequence ?? 0))
    || text(a.rule_code).localeCompare(text(b.rule_code), "vi"));
  const components = selected.map((rule) => ({
    ...(text(rule.component_key) ? { component_key: text(rule.component_key) } : {}),
    item_code: text(rule.item_code),
    source_rule: text(rule.rule_code),
    ...(text(rule.note) ? { note: text(rule.note) } : {}),
  } satisfies ResolvedBomCompositionComponent));

  return {
    ...(text(template.source_name) ? { source_name: text(template.source_name) } : {}),
    template_code: text(template.template_code),
    item_code: text(template.item_code),
    components,
    applied_rules: components.map((component) => component.source_rule),
  };
}
