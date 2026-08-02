import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type DecisionComparison = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in";
export type DecisionLogic = "and" | "or" | "not";

export interface DecisionOperand extends JsonObject {
  kind: "field" | "value";
  field?: string;
  value?: JsonValue;
}

export interface DecisionExpression extends JsonObject {
  op: DecisionComparison | DecisionLogic | "exists";
  left?: DecisionOperand;
  right?: DecisionOperand;
  field?: string;
  exists?: boolean;
  args?: DecisionExpression[];
}

export interface DecisionRule extends JsonObject {
  key: string;
  version: number;
  priority: number;
  active: boolean;
  effective_from?: string;
  effective_to?: string;
  when: DecisionExpression;
  outcome: JsonObject;
  stop: boolean;
}

export interface DecisionRuleSet extends JsonObject {
  schema_version: 1;
  rules: DecisionRule[];
}

export interface DecisionRuleMatch extends JsonObject {
  key: string;
  version: number;
  priority: number;
  outcome: JsonObject;
}

const RULE_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_RULES = 500;
const MAX_NODES = 512;
const MAX_DEPTH = 32;
const MAX_OUTCOME_BYTES = 16_000;
const COMPARISONS = new Set<DecisionComparison>(["eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in"]);
const LOGIC = new Set<DecisionLogic>(["and", "or", "not"]);

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${where} must be an object`);
  return value as JsonObject;
}

function array(value: unknown, where: string): JsonValue[] {
  if (!Array.isArray(value)) throw errors.validation(`${where} must be an array`);
  return value as JsonValue[];
}

function text(value: unknown, where: string, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(`${where} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

function date(value: unknown, where: string): string {
  const normalized = text(value, where, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw errors.validation(`${where} must be YYYY-MM-DD`);
  }
  return normalized;
}

function parseOperand(value: unknown, where: string, knownFields?: ReadonlySet<string>): DecisionOperand {
  const input = object(value, where);
  if (input.kind === "field") {
    const field = text(input.field, `${where}.field`, 160);
    if (!FIELD.test(field)) throw errors.validation(`${where}.field is not a valid fieldname`);
    if (knownFields && !knownFields.has(field)) throw errors.validation(`${where}.field references unknown field ${field}`);
    if (input.value !== undefined) throw errors.validation(`${where} field operand cannot also declare value`);
    return { kind: "field", field };
  }
  if (input.kind === "value") {
    if (!("value" in input)) throw errors.validation(`${where}.value is required`);
    if (input.field !== undefined) throw errors.validation(`${where} value operand cannot also declare field`);
    return { kind: "value", value: input.value as JsonValue };
  }
  throw errors.validation(`${where}.kind must be field or value`);
}

function parseExpression(
  value: unknown,
  where: string,
  state: { nodes: number },
  depth: number,
  knownFields?: ReadonlySet<string>,
): DecisionExpression {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw errors.validation(`Decision rule expression exceeds ${MAX_NODES} nodes`);
  if (depth > MAX_DEPTH) throw errors.validation(`Decision rule expression exceeds depth ${MAX_DEPTH}`);
  const input = object(value, where);
  const op = text(input.op, `${where}.op`, 32);

  if (LOGIC.has(op as DecisionLogic)) {
    const rawArgs = array(input.args, `${where}.args`);
    if (op === "not" && rawArgs.length !== 1) throw errors.validation(`${where}.args must contain exactly one expression for not`);
    if (op !== "not" && rawArgs.length < 2) throw errors.validation(`${where}.args must contain at least two expressions for ${op}`);
    return {
      op: op as DecisionLogic,
      args: rawArgs.map((entry, index) => parseExpression(entry, `${where}.args[${index}]`, state, depth + 1, knownFields)),
    };
  }

  if (op === "exists") {
    const field = text(input.field, `${where}.field`, 160);
    if (!FIELD.test(field)) throw errors.validation(`${where}.field is not a valid fieldname`);
    if (knownFields && !knownFields.has(field)) throw errors.validation(`${where}.field references unknown field ${field}`);
    if (typeof input.exists !== "boolean") throw errors.validation(`${where}.exists must be boolean`);
    return { op: "exists", field, exists: input.exists };
  }

  if (!COMPARISONS.has(op as DecisionComparison)) throw errors.validation(`${where}.op is unsupported: ${op}`);
  const left = parseOperand(input.left, `${where}.left`, knownFields);
  const right = parseOperand(input.right, `${where}.right`, knownFields);
  if ((op === "in" || op === "not_in") && right.kind === "value" && !Array.isArray(right.value)) {
    throw errors.validation(`${where}.right must be an array value for ${op}`);
  }
  return { op: op as DecisionComparison, left, right };
}

/** Versioned, effective-dated business/routing rule artifact. No script or executable source is accepted. */
export function parseDecisionRuleSet(value: unknown, knownFields?: ReadonlySet<string>): DecisionRuleSet {
  const input = object(value, "decision_rules");
  const schemaVersion = input.schema_version === undefined
    ? 1
    : integer(input.schema_version, "decision_rules.schema_version", 1, 1);
  const rawRules = array(input.rules, "decision_rules.rules");
  if (rawRules.length > MAX_RULES) throw errors.validation(`decision_rules.rules may contain at most ${MAX_RULES} rules`);
  const identities = new Set<string>();
  const rules = rawRules.map((rawRule, index): DecisionRule => {
    const where = `decision_rules.rules[${index}]`;
    const rule = object(rawRule, where);
    const key = text(rule.key, `${where}.key`, 64);
    if (!RULE_KEY.test(key)) throw errors.validation(`${where}.key must be kebab-case`);
    const version = rule.version === undefined ? 1 : integer(rule.version, `${where}.version`, 1, 1_000_000);
    const identity = `${key}@${version}`;
    if (identities.has(identity)) throw errors.validation(`Duplicate decision rule version: ${identity}`);
    identities.add(identity);
    const effectiveFrom = rule.effective_from === undefined ? undefined : date(rule.effective_from, `${where}.effective_from`);
    const effectiveTo = rule.effective_to === undefined ? undefined : date(rule.effective_to, `${where}.effective_to`);
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) throw errors.validation(`${where}.effective_to must not precede effective_from`);
    const outcome = object(rule.outcome, `${where}.outcome`);
    if (JSON.stringify(outcome).length > MAX_OUTCOME_BYTES) throw errors.validation(`${where}.outcome exceeds ${MAX_OUTCOME_BYTES} bytes`);
    return {
      key,
      version,
      priority: rule.priority === undefined ? 100 : integer(rule.priority, `${where}.priority`, -1_000_000, 1_000_000),
      active: rule.active !== false,
      ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      when: parseExpression(rule.when, `${where}.when`, { nodes: 0 }, 0, knownFields),
      outcome,
      stop: rule.stop === true,
    };
  });
  return { schema_version: schemaVersion as 1, rules };
}

function valueOf(operand: DecisionOperand, document: JsonObject): JsonValue | undefined {
  return operand.kind === "field" ? document[operand.field!] : operand.value;
}

function equals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true;
  if (typeof left === "number" || typeof right === "number") {
    const a = Number(left); const b = Number(right);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function compare(left: JsonValue | undefined, right: JsonValue | undefined): number | null {
  const a = Number(left); const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a < b ? -1 : a > b ? 1 : 0;
  if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
  return null;
}

export function evaluateDecisionExpression(expression: DecisionExpression, document: JsonObject): boolean {
  if (expression.op === "and") return expression.args!.every((entry) => evaluateDecisionExpression(entry, document));
  if (expression.op === "or") return expression.args!.some((entry) => evaluateDecisionExpression(entry, document));
  if (expression.op === "not") return !evaluateDecisionExpression(expression.args![0]!, document);
  if (expression.op === "exists") {
    const actual = document[expression.field!];
    const exists = actual !== undefined && actual !== null && actual !== "";
    return exists === expression.exists;
  }
  const left = valueOf(expression.left!, document);
  const right = valueOf(expression.right!, document);
  if (expression.op === "eq") return equals(left, right);
  if (expression.op === "ne") return !equals(left, right);
  if (expression.op === "in" || expression.op === "not_in") {
    const list = Array.isArray(right) ? right : [];
    const included = list.some((entry) => equals(left, entry));
    return expression.op === "in" ? included : !included;
  }
  const ordering = compare(left, right);
  if (ordering === null) return false;
  if (expression.op === "gt") return ordering > 0;
  if (expression.op === "gte") return ordering >= 0;
  if (expression.op === "lt") return ordering < 0;
  return ordering <= 0;
}

function effective(rule: DecisionRule, at: string): boolean {
  return rule.active && (!rule.effective_from || rule.effective_from <= at) && (!rule.effective_to || rule.effective_to >= at);
}

/** Pick the latest effective version per key, then evaluate in stable priority/key order. */
export function evaluateDecisionRules(
  ruleSetValue: DecisionRuleSet | unknown,
  document: JsonObject,
  atDate: string,
): DecisionRuleMatch[] {
  const ruleSet = parseDecisionRuleSet(ruleSetValue);
  const at = date(atDate, "atDate");
  const effectiveRules = new Map<string, DecisionRule>();
  for (const rule of ruleSet.rules) {
    if (!effective(rule, at)) continue;
    const existing = effectiveRules.get(rule.key);
    if (!existing || rule.version > existing.version) effectiveRules.set(rule.key, rule);
  }
  const ordered = [...effectiveRules.values()].sort((left, right) => left.priority - right.priority || left.key.localeCompare(right.key));
  const matches: DecisionRuleMatch[] = [];
  for (const rule of ordered) {
    if (!evaluateDecisionExpression(rule.when, document)) continue;
    matches.push({ key: rule.key, version: rule.version, priority: rule.priority, outcome: rule.outcome });
    if (rule.stop) break;
  }
  return matches;
}
