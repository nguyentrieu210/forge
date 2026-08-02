import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type DecisionComparison = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "in" | "not_in";
export type DecisionLogic = "and" | "or" | "not";
export type DecisionValueType = "literal" | "decimal";

export interface DecisionOperand extends JsonObject {
  kind: "field" | "value";
  field?: string;
  value?: JsonValue;
  value_type?: DecisionValueType;
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
  key: string; version: number; priority: number; active: boolean;
  effective_from?: string; effective_to?: string;
  when: DecisionExpression; outcome: JsonObject; stop: boolean;
}
export interface DecisionRuleSet extends JsonObject { schema_version: 1; rules: DecisionRule[]; }
export interface DecisionRuleMatch extends JsonObject { key: string; version: number; priority: number; outcome: JsonObject; }

const RULE_KEY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const MAX_RULES = 500;
const MAX_NODES = 512;
const MAX_DEPTH = 32;
const MAX_OUTCOME_BYTES = 16_000;
const MAX_DECIMAL_DIGITS = 120;
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
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${where} is required and must be at most ${max} characters`);
  return value.trim();
}
function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  return Number(value);
}
function date(value: unknown, where: string): string {
  const normalized = text(value, where, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) throw errors.validation(`${where} must be YYYY-MM-DD`);
  return normalized;
}
function decimalText(value: unknown, where: string): string {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!DECIMAL.test(raw)) throw errors.validation(`${where} must be a plain decimal string/number`);
  if (raw.replace(/[-.]/g, "").length > MAX_DECIMAL_DIGITS) throw errors.validation(`${where} exceeds ${MAX_DECIMAL_DIGITS} decimal digits`);
  return raw;
}
function assertDecimalValue(value: JsonValue | undefined, where: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => decimalText(entry, `${where}[${index}]`));
    return;
  }
  decimalText(value, where);
}

function parseOperand(value: unknown, where: string, knownFields?: ReadonlySet<string>): DecisionOperand {
  const input = object(value, where);
  if (input.kind === "field") {
    const field = text(input.field, `${where}.field`, 160);
    if (!FIELD.test(field)) throw errors.validation(`${where}.field is not a valid fieldname`);
    if (knownFields && !knownFields.has(field)) throw errors.validation(`${where}.field references unknown field ${field}`);
    if (input.value !== undefined || input.value_type !== undefined) throw errors.validation(`${where} field operand cannot declare value/value_type`);
    return { kind: "field", field };
  }
  if (input.kind === "value") {
    if (!("value" in input)) throw errors.validation(`${where}.value is required`);
    if (input.field !== undefined) throw errors.validation(`${where} value operand cannot also declare field`);
    const valueType = input.value_type === undefined ? "literal" : text(input.value_type, `${where}.value_type`, 16);
    if (valueType !== "literal" && valueType !== "decimal") throw errors.validation(`${where}.value_type must be literal or decimal`);
    const parsed = { kind: "value" as const, value: input.value as JsonValue, ...(valueType === "decimal" ? { value_type: "decimal" as const } : {}) };
    if (valueType === "decimal") assertDecimalValue(parsed.value, `${where}.value`);
    return parsed;
  }
  throw errors.validation(`${where}.kind must be field or value`);
}

function parseExpression(value: unknown, where: string, state: { nodes: number }, depth: number, knownFields?: ReadonlySet<string>): DecisionExpression {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw errors.validation(`Decision rule expression exceeds ${MAX_NODES} nodes`);
  if (depth > MAX_DEPTH) throw errors.validation(`Decision rule expression exceeds depth ${MAX_DEPTH}`);
  const input = object(value, where);
  const op = text(input.op, `${where}.op`, 32);
  if (LOGIC.has(op as DecisionLogic)) {
    const rawArgs = array(input.args, `${where}.args`);
    if (op === "not" && rawArgs.length !== 1) throw errors.validation(`${where}.args must contain exactly one expression for not`);
    if (op !== "not" && rawArgs.length < 2) throw errors.validation(`${where}.args must contain at least two expressions for ${op}`);
    return { op: op as DecisionLogic, args: rawArgs.map((entry, index) => parseExpression(entry, `${where}.args[${index}]`, state, depth + 1, knownFields)) };
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
  if ((op === "in" || op === "not_in") && right.kind === "value" && !Array.isArray(right.value)) throw errors.validation(`${where}.right must be an array value for ${op}`);
  return { op: op as DecisionComparison, left, right };
}

export function parseDecisionRuleSet(value: unknown, knownFields?: ReadonlySet<string>): DecisionRuleSet {
  const input = object(value, "decision_rules");
  const schemaVersion = input.schema_version === undefined ? 1 : integer(input.schema_version, "decision_rules.schema_version", 1, 1);
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
      key, version,
      priority: rule.priority === undefined ? 100 : integer(rule.priority, `${where}.priority`, -1_000_000, 1_000_000),
      active: rule.active !== false,
      ...(effectiveFrom ? { effective_from: effectiveFrom } : {}), ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      when: parseExpression(rule.when, `${where}.when`, { nodes: 0 }, 0, knownFields),
      outcome, stop: rule.stop === true,
    };
  });
  return { schema_version: schemaVersion as 1, rules };
}

function valueOf(operand: DecisionOperand, document: JsonObject): JsonValue | undefined {
  return operand.kind === "field" ? document[operand.field!] : operand.value;
}

type DecimalParts = { sign: 1 | -1; digits: bigint; scale: number };
function decimalParts(value: JsonValue | undefined): DecimalParts | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let raw: string;
  try { raw = decimalText(value, "decision decimal"); } catch { return null; }
  const sign: 1 | -1 = raw.startsWith("-") ? -1 : 1;
  const unsigned = sign === -1 ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  return { sign, digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}
function compareDecimal(left: JsonValue | undefined, right: JsonValue | undefined): number | null {
  const a = decimalParts(left); const b = decimalParts(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const av = BigInt(a.sign) * a.digits * 10n ** BigInt(scale - a.scale);
  const bv = BigInt(b.sign) * b.digits * 10n ** BigInt(scale - b.scale);
  return av < bv ? -1 : av > bv ? 1 : 0;
}
function decimalMode(expression: DecisionExpression): boolean {
  return expression.left?.value_type === "decimal" || expression.right?.value_type === "decimal";
}
function equals(left: JsonValue | undefined, right: JsonValue | undefined, asDecimal: boolean): boolean {
  if (asDecimal) return compareDecimal(left, right) === 0;
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}
function compare(left: JsonValue | undefined, right: JsonValue | undefined, asDecimal: boolean): number | null {
  if (asDecimal) return compareDecimal(left, right);
  if (typeof left === "number" && typeof right === "number" && Number.isFinite(left) && Number.isFinite(right)) return left < right ? -1 : left > right ? 1 : 0;
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
  const left = valueOf(expression.left!); const right = valueOf(expression.right!);
  const asDecimal = decimalMode(expression);
  if (expression.op === "eq") return equals(left, right, asDecimal);
  if (expression.op === "ne") return !equals(left, right, asDecimal);
  if (expression.op === "in" || expression.op === "not_in") {
    const list = Array.isArray(right) ? right : [];
    const included = list.some((entry) => equals(left, entry, asDecimal));
    return expression.op === "in" ? included : !included;
  }
  const ordering = compare(left, right, asDecimal);
  if (ordering === null) return false;
  if (expression.op === "gt") return ordering > 0;
  if (expression.op === "gte") return ordering >= 0;
  if (expression.op === "lt") return ordering < 0;
  return ordering <= 0;
}

function effective(rule: DecisionRule, at: string): boolean {
  return rule.active && (!rule.effective_from || rule.effective_from <= at) && (!rule.effective_to || rule.effective_to >= at);
}
export function evaluateDecisionRules(ruleSetValue: DecisionRuleSet | unknown, document: JsonObject, atDate: string): DecisionRuleMatch[] {
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
