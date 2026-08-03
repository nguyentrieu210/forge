import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type FormulaOperator = "const" | "field" | "formula" | "add" | "sub" | "mul" | "div" | "min" | "max" | "neg" | "abs";

export interface FormulaExpression extends JsonObject {
  op: FormulaOperator;
  value?: string | number;
  field?: string;
  formula?: string;
  args?: FormulaExpression[];
}

export interface FormulaDefinition extends JsonObject {
  key: string;
  version: number;
  scale: number;
  active: boolean;
  effective_from?: string;
  effective_to?: string;
  expression: FormulaExpression;
}

export interface FormulaRuleSet extends JsonObject {
  schema_version: 1;
  formulas: FormulaDefinition[];
}

export interface FormulaResult extends JsonObject {
  key: string;
  version: number;
  scale: number;
  value: string;
}

const KEY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPERATORS = new Set<FormulaOperator>(["const", "field", "formula", "add", "sub", "mul", "div", "min", "max", "neg", "abs"]);
const MAX_FORMULAS = 500;
const MAX_NODES = 512;
const MAX_DEPTH = 32;
const MAX_SCALE = 8;
const MAX_LITERAL_DIGITS = 80;

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

function literal(value: unknown, where: string): string | number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${where} must be a finite decimal`);
    return value;
  }
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    throw errors.validation(`${where} must be a plain decimal string or finite number`);
  }
  const digits = value.replace(/[-.]/g, "");
  if (digits.length > MAX_LITERAL_DIGITS) throw errors.validation(`${where} exceeds ${MAX_LITERAL_DIGITS} digits`);
  return value.trim();
}

function parseExpression(
  value: unknown,
  where: string,
  state: { nodes: number },
  depth: number,
  knownFields?: ReadonlySet<string>,
): FormulaExpression {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw errors.validation(`Formula expression exceeds ${MAX_NODES} nodes`);
  if (depth > MAX_DEPTH) throw errors.validation(`Formula expression exceeds depth ${MAX_DEPTH}`);
  const input = object(value, where);
  const op = text(input.op, `${where}.op`, 32) as FormulaOperator;
  if (!OPERATORS.has(op)) throw errors.validation(`${where}.op is unsupported: ${op}`);

  if (op === "const") return { op, value: literal(input.value, `${where}.value`) };
  if (op === "field") {
    const field = text(input.field, `${where}.field`, 160);
    if (!FIELD.test(field)) throw errors.validation(`${where}.field is not a valid fieldname`);
    if (knownFields && !knownFields.has(field)) throw errors.validation(`${where}.field references unknown field ${field}`);
    return { op, field };
  }
  if (op === "formula") {
    const formula = text(input.formula, `${where}.formula`, 64);
    if (!KEY.test(formula)) throw errors.validation(`${where}.formula must be kebab-case`);
    return { op, formula };
  }

  const rawArgs = array(input.args, `${where}.args`);
  if ((op === "neg" || op === "abs") && rawArgs.length !== 1) throw errors.validation(`${where}.args must contain exactly one expression for ${op}`);
  if ((op === "sub" || op === "div") && rawArgs.length !== 2) throw errors.validation(`${where}.args must contain exactly two expressions for ${op}`);
  if (["add", "mul", "min", "max"].includes(op) && rawArgs.length < 2) throw errors.validation(`${where}.args must contain at least two expressions for ${op}`);
  return {
    op,
    args: rawArgs.map((entry, index) => parseExpression(entry, `${where}.args[${index}]`, state, depth + 1, knownFields)),
  };
}

export function parseFormulaRuleSet(value: unknown, knownFields?: ReadonlySet<string>): FormulaRuleSet {
  const input = object(value, "formula_rules");
  const schemaVersion = input.schema_version === undefined
    ? 1
    : integer(input.schema_version, "formula_rules.schema_version", 1, 1);
  const rawFormulas = array(input.formulas, "formula_rules.formulas");
  if (rawFormulas.length > MAX_FORMULAS) throw errors.validation(`formula_rules.formulas may contain at most ${MAX_FORMULAS} formulas`);
  const identities = new Set<string>();
  const formulas = rawFormulas.map((rawFormula, index): FormulaDefinition => {
    const where = `formula_rules.formulas[${index}]`;
    const formula = object(rawFormula, where);
    const key = text(formula.key, `${where}.key`, 64);
    if (!KEY.test(key)) throw errors.validation(`${where}.key must be kebab-case`);
    const version = formula.version === undefined ? 1 : integer(formula.version, `${where}.version`, 1, 1_000_000);
    const identity = `${key}@${version}`;
    if (identities.has(identity)) throw errors.validation(`Duplicate formula version: ${identity}`);
    identities.add(identity);
    const effectiveFrom = formula.effective_from === undefined ? undefined : date(formula.effective_from, `${where}.effective_from`);
    const effectiveTo = formula.effective_to === undefined ? undefined : date(formula.effective_to, `${where}.effective_to`);
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) throw errors.validation(`${where}.effective_to must not precede effective_from`);
    return {
      key,
      version,
      scale: formula.scale === undefined ? 2 : integer(formula.scale, `${where}.scale`, 0, MAX_SCALE),
      active: formula.active !== false,
      ...(effectiveFrom ? { effective_from: effectiveFrom } : {}),
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      expression: parseExpression(formula.expression, `${where}.expression`, { nodes: 0 }, 0, knownFields),
    };
  });
  return { schema_version: schemaVersion as 1, formulas };
}

function pow10(scale: number): bigint {
  return 10n ** BigInt(scale);
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw errors.validation("Formula division by zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const remainder = a % b;
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Parse JSON decimal input into a scaled integer, rounding half away from zero. */
function toScaled(value: JsonValue | undefined | string | number, scale: number, where: string): bigint {
  let raw: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${where} is not a finite number`);
    raw = value.toFixed(scale);
  } else if (typeof value === "string") {
    raw = value.trim();
  } else {
    throw errors.validation(`${where} must be a decimal string or number`);
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw errors.validation(`${where} must be a plain decimal value`);
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const kept = fraction.slice(0, scale).padEnd(scale, "0");
  let magnitude = BigInt(`${whole}${kept}` || "0");
  const discarded = fraction.slice(scale);
  if (discarded && discarded[0]! >= "5") magnitude += 1n;
  return negative ? -magnitude : magnitude;
}

function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  if (scale === 0) return `${negative ? "-" : ""}${magnitude}`;
  const digits = magnitude.toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function effective(formula: FormulaDefinition, at: string): boolean {
  return formula.active && (!formula.effective_from || formula.effective_from <= at) && (!formula.effective_to || formula.effective_to >= at);
}

function collectReferences(expression: FormulaExpression, output: Set<string>): void {
  if (expression.op === "formula") output.add(expression.formula!);
  for (const child of expression.args ?? []) collectReferences(child, output);
}

function activeDefinitions(ruleSet: FormulaRuleSet, at: string): Map<string, FormulaDefinition> {
  const selected = new Map<string, FormulaDefinition>();
  for (const formula of ruleSet.formulas) {
    if (!effective(formula, at)) continue;
    const existing = selected.get(formula.key);
    if (!existing || formula.version > existing.version) selected.set(formula.key, formula);
  }
  for (const formula of selected.values()) {
    const references = new Set<string>();
    collectReferences(formula.expression, references);
    for (const reference of references) {
      if (!selected.has(reference)) throw errors.validation(`Formula ${formula.key} references unavailable formula ${reference}`);
    }
  }
  return selected;
}

function evaluateExpression(
  expression: FormulaExpression,
  scale: number,
  document: JsonObject,
  selected: Map<string, FormulaDefinition>,
  evaluateDefinition: (key: string) => string,
): bigint {
  const factor = pow10(scale);
  if (expression.op === "const") return toScaled(expression.value!, scale, "formula const");
  if (expression.op === "field") return toScaled(document[expression.field!], scale, `field ${expression.field}`);
  if (expression.op === "formula") return toScaled(evaluateDefinition(expression.formula!), scale, `formula ${expression.formula}`);
  const args = expression.args!.map((entry) => evaluateExpression(entry, scale, document, selected, evaluateDefinition));
  if (expression.op === "neg") return -args[0]!;
  if (expression.op === "abs") return args[0]! < 0n ? -args[0]! : args[0]!;
  if (expression.op === "add") return args.reduce((sum, value) => sum + value, 0n);
  if (expression.op === "sub") return args[0]! - args[1]!;
  if (expression.op === "mul") return args.slice(1).reduce((product, value) => roundDiv(product * value, factor), args[0]!);
  if (expression.op === "div") return roundDiv(args[0]! * factor, args[1]!);
  if (expression.op === "min") return args.reduce((best, value) => value < best ? value : best, args[0]!);
  return args.reduce((best, value) => value > best ? value : best, args[0]!);
}

/** Evaluate every latest-effective formula with cycle detection and fixed-point arithmetic. */
export function evaluateFormulaRules(
  ruleSetValue: FormulaRuleSet | unknown,
  document: JsonObject,
  atDate: string,
): FormulaResult[] {
  const ruleSet = parseFormulaRuleSet(ruleSetValue);
  const at = date(atDate, "atDate");
  const selected = activeDefinitions(ruleSet, at);
  const cache = new Map<string, string>();
  const visiting = new Set<string>();

  const evaluateDefinition = (key: string): string => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const formula = selected.get(key);
    if (!formula) throw errors.validation(`Unknown active formula ${key}`);
    if (visiting.has(key)) throw errors.validation(`Formula dependency cycle includes ${key}`);
    visiting.add(key);
    try {
      const scaled = evaluateExpression(formula.expression, formula.scale, document, selected, evaluateDefinition);
      const result = formatScaled(scaled, formula.scale);
      cache.set(key, result);
      return result;
    } finally {
      visiting.delete(key);
    }
  };

  return [...selected.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((formula) => ({ key: formula.key, version: formula.version, scale: formula.scale, value: evaluateDefinition(formula.key) }));
}
