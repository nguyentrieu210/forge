export type DecisionRuleOperator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in" | "exists";
export type DecisionRuleLogic = "all" | "any";

export interface DecisionRuleConditionModel {
  field: string;
  operator: DecisionRuleOperator;
  value?: string;
}

export interface DecisionRuleModel {
  key: string;
  version: number;
  priority: number;
  active: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  logic: DecisionRuleLogic;
  conditions: DecisionRuleConditionModel[];
  outcomeJson: string;
  stop: boolean;
}

export interface DecisionRuleSetModel {
  rules: DecisionRuleModel[];
}

export interface DecisionRuleBuilderIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface DecisionRuleBuilderValidation {
  ok: boolean;
  issues: DecisionRuleBuilderIssue[];
}

const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALUELESS = new Set<DecisionRuleOperator>(["exists"]);

export function blankDecisionRuleSet(): DecisionRuleSetModel {
  return { rules: [] };
}

export function newDecisionRule(index: number): DecisionRuleModel {
  return {
    key: `rule-${index + 1}`,
    version: 1,
    priority: 100,
    active: true,
    logic: "all",
    conditions: [{ field: "", operator: "eq", value: "" }],
    outcomeJson: "{}",
    stop: false,
  };
}

function parseValue(raw: string | undefined, operator: DecisionRuleOperator): unknown {
  if (operator === "exists") return undefined;
  const value = (raw ?? "").trim();
  if (operator === "in" || operator === "not_in") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean).map(coerceScalar);
  }
  return coerceScalar(value);
}

function coerceScalar(raw: string): string | number | boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return raw;
}

export function validateDecisionRuleSet(model: DecisionRuleSetModel, knownFields?: ReadonlySet<string>): DecisionRuleBuilderValidation {
  const issues: DecisionRuleBuilderIssue[] = [];
  const error = (code: string, path: string, message: string) => issues.push({ severity: "error" as const, code, path, message });
  const warning = (code: string, path: string, message: string) => issues.push({ severity: "warning" as const, code, path, message });
  if (model.rules.length > 500) error("rules_max", "rules", "Tối đa 500 rule trong một rule set");
  const identities = new Set<string>();
  model.rules.forEach((rule, ruleIndex) => {
    const path = `rules[${ruleIndex}]`;
    if (!KEY.test(rule.key)) error("key", `${path}.key`, "Rule key phải là kebab-case");
    if (!Number.isInteger(rule.version) || rule.version < 1) error("version", `${path}.version`, "Version phải là số nguyên dương");
    const identity = `${rule.key}@${rule.version}`;
    if (identities.has(identity)) error("duplicate", path, `Rule trùng phiên bản: ${identity}`);
    identities.add(identity);
    if (!Number.isInteger(rule.priority)) error("priority", `${path}.priority`, "Priority phải là số nguyên");
    if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) error("effective", path, "Ngày hết hiệu lực không được trước ngày bắt đầu");
    if (!rule.conditions.length) error("conditions", `${path}.conditions`, "Rule cần ít nhất một điều kiện");
    rule.conditions.forEach((condition, conditionIndex) => {
      const conditionPath = `${path}.conditions[${conditionIndex}]`;
      if (!FIELD.test(condition.field)) error("field", `${conditionPath}.field`, "Field không hợp lệ");
      if (knownFields && condition.field && !knownFields.has(condition.field)) error("field_unknown", `${conditionPath}.field`, `Field không tồn tại: ${condition.field}`);
      if (!VALUELESS.has(condition.operator) && !(condition.value ?? "").trim()) error("value", `${conditionPath}.value`, "Điều kiện cần giá trị");
      if ((condition.operator === "in" || condition.operator === "not_in") && !(condition.value ?? "").split(",").some((entry) => entry.trim())) {
        error("list_value", `${conditionPath}.value`, "in/not_in cần danh sách cách nhau bằng dấu phẩy");
      }
    });
    try {
      const outcome = JSON.parse(rule.outcomeJson || "{}");
      if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) error("outcome", `${path}.outcomeJson`, "Outcome phải là JSON object");
    } catch {
      error("outcome_json", `${path}.outcomeJson`, "Outcome JSON không hợp lệ");
    }
    if (!rule.active) warning("inactive", path, "Rule đang tắt và sẽ không được evaluator áp dụng");
  });
  return { ok: !issues.some((entry) => entry.severity === "error"), issues };
}

export function serializeDecisionRuleSet(model: DecisionRuleSetModel): { schema_version: 1; rules: Array<Record<string, unknown>> } {
  const validation = validateDecisionRuleSet(model);
  if (!validation.ok) throw new Error(`Decision rule set invalid: ${validation.issues.filter((entry) => entry.severity === "error").map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
  return {
    schema_version: 1,
    rules: model.rules.map((rule) => {
      const expressions = rule.conditions.map((condition) => condition.operator === "exists"
        ? { op: "exists", field: condition.field, exists: (condition.value ?? "true") !== "false" }
        : {
          op: condition.operator,
          left: { kind: "field", field: condition.field },
          right: { kind: "value", value: parseValue(condition.value, condition.operator) },
        });
      const when = expressions.length === 1
        ? expressions[0]
        : { op: rule.logic === "all" ? "and" : "or", args: expressions };
      return {
        key: rule.key,
        version: rule.version,
        priority: rule.priority,
        active: rule.active,
        ...(rule.effectiveFrom ? { effective_from: rule.effectiveFrom } : {}),
        ...(rule.effectiveTo ? { effective_to: rule.effectiveTo } : {}),
        when,
        outcome: JSON.parse(rule.outcomeJson || "{}"),
        stop: rule.stop,
      };
    }),
  };
}
