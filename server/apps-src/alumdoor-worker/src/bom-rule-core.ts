import {
  evaluateBomQuantity,
  type BomQuantityFormula,
  type BomQuantityRounding,
} from "./bom-template-core.js";

export type BomRuleAuthority = "SOURCE" | "OWNER_CONFIRMED" | "ENGINEERING_INFERENCE";
export type BomRuleResultKind = "LENGTH" | "AREA" | "COUNT" | "WEIGHT" | "CONSTANT";
export type BomRuleScopeType = "BOM" | "ITEM" | "ITEM_GROUP" | "DOOR_TYPE" | "GENERIC";

export interface BomRuleApplicability {
  scope_type?: BomRuleScopeType | string;
  parent_item?: string;
  parent_item_group?: string;
  door_type?: string;
  component_item?: string;
  bom?: string;
  priority?: number;
  effective_from?: string;
  effective_to?: string;
  disabled?: unknown;
  note?: string;
}

export interface BomRuleMaster {
  name?: string;
  rule_code: string;
  rule_name?: string;
  description?: string;
  result_kind?: BomRuleResultKind | string;
  result_uom?: string;
  source_field?: string;
  operator?: string;
  operand?: number;
  multiply?: number;
  divide?: number;
  qty_per_set?: number;
  rounding?: BomQuantityRounding | string;
  precision?: number;
  formula_json?: string | BomQuantityFormula;
  version?: number;
  disabled?: unknown;
  authority_type?: BomRuleAuthority | string;
  source_sheet?: string;
  source_row?: number;
  source_formula_text?: string;
  source_formula_code?: string;
  source_note?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  applicability?: BomRuleApplicability[];
}

export interface BomRuleContext {
  bom?: string;
  parent_item?: string;
  parent_item_group?: string;
  door_type?: string;
  component_item?: string;
  on?: string;
}

export interface BomRuleEvaluation {
  rule_code: string;
  rule_version: number;
  formula_display: string;
  result_per_piece: number;
  qty_per_set: number;
  set_count: number;
  consumption_qty: number;
  consumption_uom: string;
  formula_snapshot: string;
  authority_type: string;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positive(value: unknown, fallback: number): number {
  const parsed = finite(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function dateOnly(value: unknown): string {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function activeOn(row: BomRuleApplicability, on: string): boolean {
  if (checked(row.disabled)) return false;
  const from = dateOnly(row.effective_from);
  const to = dateOnly(row.effective_to);
  return (!from || from <= on) && (!to || to >= on);
}

function normalizedScope(value: unknown): BomRuleScopeType {
  const scope = text(value).toUpperCase();
  if (scope === "BOM" || scope === "ITEM" || scope === "ITEM_GROUP" || scope === "DOOR_TYPE") return scope;
  return "GENERIC";
}

function scopeRank(scope: BomRuleScopeType): number {
  if (scope === "BOM") return 4;
  if (scope === "ITEM") return 3;
  if (scope === "ITEM_GROUP" || scope === "DOOR_TYPE") return 2;
  return 1;
}

function same(actual: unknown, expected: unknown): boolean {
  const right = text(expected);
  return !right || text(actual) === right;
}

function applicabilityMatches(row: BomRuleApplicability, context: BomRuleContext): boolean {
  if (text(row.component_item) && !same(context.component_item, row.component_item)) return false;
  const scope = normalizedScope(row.scope_type);
  if (scope === "BOM") return Boolean(text(row.bom)) && same(context.bom, row.bom);
  if (scope === "ITEM") return Boolean(text(row.parent_item)) && same(context.parent_item, row.parent_item);
  if (scope === "ITEM_GROUP") return Boolean(text(row.parent_item_group)) && same(context.parent_item_group, row.parent_item_group);
  if (scope === "DOOR_TYPE") return Boolean(text(row.door_type)) && same(context.door_type, row.door_type);
  return true;
}

export function resolveBomRuleMaster(rules: BomRuleMaster[], context: BomRuleContext): BomRuleMaster | null {
  const on = dateOnly(context.on) || new Date().toISOString().slice(0, 10);
  const candidates = rules
    .filter((rule) => !checked(rule.disabled))
    .flatMap((rule) => {
      const applicability = Array.isArray(rule.applicability) && rule.applicability.length
        ? rule.applicability
        : [{ scope_type: "GENERIC" as const, component_item: context.component_item }];
      return applicability
        .filter((row) => activeOn(row, on) && applicabilityMatches(row, context))
        .map((row) => ({
          rule,
          scope: normalizedScope(row.scope_type),
          priority: finite(row.priority, 0),
        }));
    })
    .sort((left, right) => (scopeRank(right.scope) - scopeRank(left.scope))
      || (right.priority - left.priority)
      || positive(right.rule.version, 1) - positive(left.rule.version, 1));

  if (!candidates.length) return null;
  const first = candidates[0]!;
  const tied = candidates.filter((entry) => scopeRank(entry.scope) === scopeRank(first.scope)
    && entry.priority === first.priority
    && positive(entry.rule.version, 1) === positive(first.rule.version, 1));
  const distinct = [...new Map(tied.map((entry) => [text(entry.rule.rule_code), entry.rule])).values()];
  if (distinct.length > 1) {
    throw new Error(`Có ${distinct.length} Quy tắc BOM cùng mức cho ${text(context.component_item) || "component"}: ${distinct.map((rule) => text(rule.rule_code)).join(", ")}. Hệ thống không tự đoán.`);
  }
  return first.rule;
}

function parseFormulaJson(value: BomRuleMaster["formula_json"]): BomQuantityFormula | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as BomQuantityFormula : null;
  } catch {
    throw new Error("BOM Rule formula_json không hợp lệ.");
  }
}

export function bomRuleFormula(rule: BomRuleMaster): BomQuantityFormula {
  const stored = parseFormulaJson(rule.formula_json);
  if (stored) return stored;
  const sourceField = text(rule.source_field);
  const operator = text(rule.operator).toUpperCase() || "COPY";
  const operand = finite(rule.operand, 0);
  const multiply = finite(rule.multiply, 1);
  const divide = finite(rule.divide, 1);
  if (divide === 0) throw new Error(`${rule.rule_code}: hệ số chia không được bằng 0.`);

  let formula: BomQuantityFormula;
  if (operator === "CONSTANT") {
    formula = { base: { kind: "CONSTANT", value: operand } };
  } else {
    if (!sourceField) throw new Error(`${rule.rule_code}: thiếu trường nguồn từ hàng cha.`);
    const offset = operator === "ADD" ? operand : operator === "SUBTRACT" ? -operand : 0;
    formula = { base: { kind: "FIELD", field: sourceField, ...(offset ? { offset } : {}) } };
    if (operator === "MULTIPLY") formula.multiply = operand;
    if (operator === "DIVIDE") {
      if (operand === 0) throw new Error(`${rule.rule_code}: số chia không được bằng 0.`);
      formula.multiply = 1 / operand;
    }
  }
  const combinedMultiply = finite(formula.multiply, 1) * multiply / divide;
  if (Math.abs(combinedMultiply - 1) > 1e-12) formula.multiply = combinedMultiply;
  else delete formula.multiply;
  const rounding = text(rule.rounding).toUpperCase();
  if (["NONE", "ROUND", "CEIL", "FLOOR"].includes(rounding)) formula.rounding = rounding as BomQuantityRounding;
  const precision = Number(rule.precision);
  if (Number.isInteger(precision) && precision >= 0 && precision <= 12) formula.precision = precision;
  return formula;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(value);
}

export function bomRuleFormulaDisplay(rule: BomRuleMaster): string {
  const formula = bomRuleFormula(rule);
  if (formula.base.kind === "CONSTANT") return formatNumber(formula.base.value);
  if (formula.base.kind === "FIELD") {
    const offset = finite(formula.base.offset, 0);
    const base = `${formula.base.field}${offset > 0 ? ` + ${formatNumber(offset)}` : offset < 0 ? ` - ${formatNumber(Math.abs(offset))}` : ""}`;
    const factor = finite(formula.multiply, 1);
    return Math.abs(factor - 1) > 1e-12 ? `(${base}) × ${formatNumber(factor)}` : base;
  }
  if (formula.base.kind === "PRODUCT") return "Tích hai trường hình học";
  return "Thương hai trường hình học";
}

export function evaluateBomRuleMaster(
  rule: BomRuleMaster,
  values: Record<string, unknown>,
  options: { set_count?: number } = {},
): BomRuleEvaluation {
  const formula = bomRuleFormula(rule);
  const resultPerPiece = evaluateBomQuantity(formula, values, `BOM Rule ${rule.rule_code}`);
  const qtyPerSet = positive(rule.qty_per_set, 1);
  const setCount = positive(options.set_count, 1);
  const consumptionQty = Math.round((resultPerPiece * qtyPerSet * setCount + Number.EPSILON) * 1e6) / 1e6;
  const snapshot = {
    rule_code: text(rule.rule_code),
    rule_name: text(rule.rule_name),
    version: positive(rule.version, 1),
    result_kind: text(rule.result_kind),
    result_uom: text(rule.result_uom),
    formula,
    qty_per_set: qtyPerSet,
    authority_type: text(rule.authority_type),
    source_sheet: text(rule.source_sheet),
    source_row: Number.isFinite(Number(rule.source_row)) ? Number(rule.source_row) : null,
    source_formula_text: text(rule.source_formula_text),
  };
  return {
    rule_code: text(rule.rule_code),
    rule_version: positive(rule.version, 1),
    formula_display: bomRuleFormulaDisplay(rule),
    result_per_piece: resultPerPiece,
    qty_per_set: qtyPerSet,
    set_count: setCount,
    consumption_qty: consumptionQty,
    consumption_uom: text(rule.result_uom),
    formula_snapshot: JSON.stringify(snapshot),
    authority_type: text(rule.authority_type),
  };
}
