import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { toScaledInt } from "../../money/src/index.js";

export interface PayrollRuleEvaluationContext {
  currency: string;
  currencyScale: number;
  baseSalaryMinor: number;
  grossEarningsMinor: number;
  preRuleDeductionsMinor: number;
  workingDays: number;
  paymentHalfUnits: number;
  statutoryInputs?: JsonObject;
}

export interface PayrollRuleEvaluationResult {
  schemaVersion: 1;
  canonicalFormulaJson: string;
  inputs: JsonObject;
  outputs: Record<string, number>;
}

type InputType = "currency" | "integer" | "boolean";
export type PayrollRuleValueType = "amount" | "integer" | "boolean";
interface InputDefinition {
  type: InputType;
  required?: boolean;
  default?: unknown;
  min?: unknown;
  max?: unknown;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_OUTPUTS = 64;
const MAX_INPUTS = 64;
const MAX_DEPTH = 32;
const MAX_NODES = 1024;
const BUILTIN_INPUTS = new Set([
  "base_salary",
  "gross_earnings",
  "pre_rule_deductions",
  "working_days",
  "payment_half_units",
]);

export interface PayrollRuleFormulaMetadata {
  schemaVersion: 1;
  currency: string;
  outputKeys: ReadonlySet<string>;
  outputTypes: ReadonlyMap<string, PayrollRuleValueType>;
}

export function inspectPayrollRuleFormula(
  formulaJson: string,
  expectedCurrency: string,
  currencyScale: number,
): PayrollRuleFormulaMetadata {
  const formula = parseObjectJson(formulaJson, "Payroll rule formula_json");
  if (formula.schema_version !== 1) throw errors.reference("Payroll rule formula schema_version must be 1");
  if (typeof formula.currency !== "string" || formula.currency.trim() !== expectedCurrency) {
    throw errors.reference(`Payroll rule formula currency must be ${expectedCurrency}`);
  }
  if (!Number.isInteger(currencyScale) || currencyScale < 0 || currencyScale > 6) throw errors.reference("Payroll rule currency scale is invalid");
  const definitions = parseInputDefinitions(formula.inputs);
  const inputTypes = new Map<string, PayrollRuleValueType>([
    ["base_salary", "amount"],
    ["gross_earnings", "amount"],
    ["pre_rule_deductions", "amount"],
    ["working_days", "integer"],
    ["payment_half_units", "integer"],
  ]);
  for (const [key, definition] of definitions) {
    inputTypes.set(key, definition.type === "currency" ? "amount" : definition.type);
  }
  const outputObject = asObject(formula.outputs, "Payroll rule outputs");
  const outputKeys = Object.keys(outputObject);
  if (outputKeys.length === 0 || outputKeys.length > MAX_OUTPUTS) {
    throw errors.reference(`Payroll rule must define 1..${MAX_OUTPUTS} outputs`);
  }
  for (const key of outputKeys) requireKey(key, "Payroll rule output");

  let nodes = 0;
  const visiting = new Set<string>();
  const outputTypes = new Map<string, PayrollRuleValueType>();
  const validateOutput = (key: string): PayrollRuleValueType => {
    const known = outputTypes.get(key);
    if (known) return known;
    if (!Object.prototype.hasOwnProperty.call(outputObject, key)) throw errors.reference(`Unknown payroll rule output ${key}`);
    if (visiting.has(key)) throw errors.reference(`Payroll rule output cycle detected at ${key}`);
    visiting.add(key);
    const type = validateExpression(outputObject[key], 0);
    visiting.delete(key);
    outputTypes.set(key, type);
    return type;
  };
  const validateExpression = (raw: unknown, depth: number): PayrollRuleValueType => {
    nodes += 1;
    if (nodes > MAX_NODES) throw errors.reference(`Payroll rule exceeds ${MAX_NODES} expression nodes`);
    if (depth > MAX_DEPTH) throw errors.reference(`Payroll rule exceeds expression depth ${MAX_DEPTH}`);
    const node = asObject(raw, "Payroll rule expression");
    if (Object.prototype.hasOwnProperty.call(node, "const_minor")) {
      toScaledInt(node.const_minor as string | number, currencyScale, "payroll rule const_minor");
      return "amount";
    }
    if (Object.prototype.hasOwnProperty.call(node, "const_int")) {
      requireSafeInteger(node.const_int, "payroll rule const_int");
      return "integer";
    }
    if (Object.prototype.hasOwnProperty.call(node, "input")) {
      const key = requireKey(node.input, "Payroll rule input");
      const type = inputTypes.get(key);
      if (!type) throw errors.reference(`Unknown payroll rule input ${key}`);
      return type;
    }
    if (Object.prototype.hasOwnProperty.call(node, "output")) {
      return validateOutput(requireKey(node.output, "Payroll rule output reference"));
    }
    const op = typeof node.op === "string" ? node.op : "";
    if (!op) throw errors.reference("Payroll rule expression requires const/input/output/op");
    const expression = (value: unknown) => validateExpression(value, depth + 1);
    const numeric = (type: PayrollRuleValueType, label: string) => {
      if (type === "boolean") throw errors.reference(`Payroll rule ${label} requires numeric values`);
      return type;
    };
    const sameNumericArgs = (): PayrollRuleValueType => {
      if (!Array.isArray(node.args) || node.args.length === 0 || node.args.length > 64) {
        throw errors.reference(`Payroll rule ${op} requires 1..64 args`);
      }
      const types = node.args.map(expression);
      const first = numeric(types[0]!, op);
      if (types.some((type) => numeric(type, op) !== first)) throw errors.reference(`Payroll rule ${op} args must have the same value type`);
      return first;
    };
    switch (op) {
      case "add": case "min": case "max": return sameNumericArgs();
      case "sub": {
        if (!Array.isArray(node.args) || node.args.length !== 2) throw errors.reference("Payroll rule sub requires two args");
        const left = numeric(expression(node.args[0]), "sub");
        const right = numeric(expression(node.args[1]), "sub");
        if (left !== right) throw errors.reference("Payroll rule sub args must have the same value type");
        return left;
      }
      case "floor_zero": return numeric(expression(node.value), "floor_zero");
      case "mul_bps": {
        const bps = requireSafeInteger(node.bps, "payroll rule bps");
        if (bps < -100_000 || bps > 100_000) throw errors.reference("Payroll rule bps is out of range");
        if (expression(node.value) !== "amount") throw errors.reference("Payroll rule mul_bps requires an amount value");
        return "amount";
      }
      case "mul_int": {
        if (expression(node.value) !== "amount" || expression(node.factor) !== "integer") {
          throw errors.reference("Payroll rule mul_int requires amount value and integer factor");
        }
        return "amount";
      }
      case "if": {
        if (expression(node.condition) !== "boolean") throw errors.reference("Payroll rule if condition must be boolean");
        const thenType = expression(node.then);
        const elseType = expression(node.else);
        if (thenType !== elseType) throw errors.reference("Payroll rule if branches must have the same value type");
        return thenType;
      }
      case "eq": {
        const left = expression(node.left); const right = expression(node.right);
        if (left !== right) throw errors.reference("Payroll rule eq values must have the same type");
        return "boolean";
      }
      case "gt": case "gte": case "lt": case "lte": {
        const left = numeric(expression(node.left), op); const right = numeric(expression(node.right), op);
        if (left !== right) throw errors.reference(`Payroll rule ${op} values must have the same type`);
        return "boolean";
      }
      case "progressive": {
        if (expression(node.value) !== "amount") throw errors.reference("Payroll rule progressive requires an amount value");
        validateProgressiveTiers(node, currencyScale);
        return "amount";
      }
      default: throw errors.reference(`Unsupported payroll rule operation ${op}`);
    }
  };
  for (const key of outputKeys) validateOutput(key);
  return { schemaVersion: 1, currency: expectedCurrency, outputKeys: new Set(outputKeys), outputTypes };
}

export function payrollRuleInputRowsToObject(raw: unknown): JsonObject {
  if (raw === undefined || raw === null) return {};
  if (!Array.isArray(raw)) throw errors.reference("Salary Structure Assignment statutory_inputs must be a table");
  if (raw.length > MAX_INPUTS) throw errors.reference(`Salary Structure Assignment cannot define more than ${MAX_INPUTS} statutory inputs`);
  const result: JsonObject = {};
  for (const [index, value] of raw.entries()) {
    const row = asObject(value, `Statutory payroll input row ${index + 1}`);
    const key = requireKey(row.input_key, `Statutory payroll input row ${index + 1} key`);
    if (Object.prototype.hasOwnProperty.call(result, key)) throw errors.reference(`Statutory payroll input ${key} is duplicated`);
    const rawValue = row.value;
    if (!["string", "number", "boolean"].includes(typeof rawValue) || rawValue === "") {
      throw errors.reference(`Statutory payroll input ${key} value is required`);
    }
    result[key] = rawValue as string | number | boolean;
  }
  return result;
}

export function evaluatePayrollRuleFormula(
  formulaJson: string,
  context: PayrollRuleEvaluationContext,
): PayrollRuleEvaluationResult {
  inspectPayrollRuleFormula(formulaJson, context.currency, context.currencyScale);
  const formula = parseObjectJson(formulaJson, "Payroll rule formula_json");
  if (formula.schema_version !== 1) throw errors.reference("Payroll rule formula schema_version must be 1");
  if (typeof formula.currency !== "string" || formula.currency.trim() !== context.currency) {
    throw errors.reference(`Payroll rule formula currency must be ${context.currency}`);
  }
  if (!Number.isInteger(context.currencyScale) || context.currencyScale < 0 || context.currencyScale > 6) {
    throw errors.reference("Payroll rule currency scale is invalid");
  }

  const definitions = parseInputDefinitions(formula.inputs);
  const customRaw = context.statutoryInputs ?? {};
  for (const key of Object.keys(customRaw)) {
    if (!definitions.has(key)) throw errors.reference(`Unknown statutory payroll input ${key}`);
  }

  const inputTypes = new Map<string, InputType>([
    ["base_salary", "currency"],
    ["gross_earnings", "currency"],
    ["pre_rule_deductions", "currency"],
    ["working_days", "integer"],
    ["payment_half_units", "integer"],
  ]);
  const inputs = new Map<string, number>([
    ["base_salary", requireSafeInteger(context.baseSalaryMinor, "base_salary")],
    ["gross_earnings", requireSafeInteger(context.grossEarningsMinor, "gross_earnings")],
    ["pre_rule_deductions", requireSafeInteger(context.preRuleDeductionsMinor, "pre_rule_deductions")],
    ["working_days", requireSafeInteger(context.workingDays, "working_days")],
    ["payment_half_units", requireSafeInteger(context.paymentHalfUnits, "payment_half_units")],
  ]);

  for (const [key, definition] of definitions) {
    inputTypes.set(key, definition.type);
    const supplied = Object.prototype.hasOwnProperty.call(customRaw, key) ? customRaw[key] : undefined;
    const raw = supplied ?? definition.default;
    if (raw === undefined || raw === null || raw === "") {
      if (definition.required) throw errors.reference(`Statutory payroll input ${key} is required`);
      inputs.set(key, 0);
      continue;
    }
    const value = parseInputValue(raw, definition.type, context.currencyScale, key);
    const minimum = definition.min === undefined ? undefined : parseInputValue(definition.min, definition.type, context.currencyScale, `${key}.min`);
    const maximum = definition.max === undefined ? undefined : parseInputValue(definition.max, definition.type, context.currencyScale, `${key}.max`);
    if (minimum !== undefined && value < minimum) throw errors.reference(`Statutory payroll input ${key} is below minimum`);
    if (maximum !== undefined && value > maximum) throw errors.reference(`Statutory payroll input ${key} exceeds maximum`);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) throw errors.reference(`Statutory payroll input ${key} has invalid bounds`);
    inputs.set(key, value);
  }

  const outputObject = asObject(formula.outputs, "Payroll rule outputs");
  const outputKeys = Object.keys(outputObject);
  if (outputKeys.length === 0 || outputKeys.length > MAX_OUTPUTS) {
    throw errors.reference(`Payroll rule must define 1..${MAX_OUTPUTS} outputs`);
  }
  for (const key of outputKeys) requireKey(key, "Payroll rule output");

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  let nodes = 0;
  const evaluateOutput = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (!Object.prototype.hasOwnProperty.call(outputObject, key)) throw errors.reference(`Unknown payroll rule output ${key}`);
    if (visiting.has(key)) throw errors.reference(`Payroll rule output cycle detected at ${key}`);
    visiting.add(key);
    const value = evaluateExpression(outputObject[key], 0);
    visiting.delete(key);
    memo.set(key, value);
    return value;
  };

  const evaluateExpression = (raw: unknown, depth: number): number => {
    nodes += 1;
    if (nodes > MAX_NODES) throw errors.reference(`Payroll rule exceeds ${MAX_NODES} expression nodes`);
    if (depth > MAX_DEPTH) throw errors.reference(`Payroll rule exceeds expression depth ${MAX_DEPTH}`);
    const node = asObject(raw, "Payroll rule expression");

    if (Object.prototype.hasOwnProperty.call(node, "const_minor")) {
      return toScaledInt(node.const_minor as string | number, context.currencyScale, "payroll rule const_minor");
    }
    if (Object.prototype.hasOwnProperty.call(node, "const_int")) {
      return requireSafeInteger(node.const_int, "payroll rule const_int");
    }
    if (Object.prototype.hasOwnProperty.call(node, "input")) {
      const key = requireKey(node.input, "Payroll rule input");
      const value = inputs.get(key);
      if (value === undefined) throw errors.reference(`Unknown payroll rule input ${key}`);
      return value;
    }
    if (Object.prototype.hasOwnProperty.call(node, "output")) {
      return evaluateOutput(requireKey(node.output, "Payroll rule output reference"));
    }

    const op = typeof node.op === "string" ? node.op : "";
    if (!op) throw errors.reference("Payroll rule expression requires const/input/output/op");
    const expression = (value: unknown) => evaluateExpression(value, depth + 1);
    const args = () => {
      if (!Array.isArray(node.args) || node.args.length === 0 || node.args.length > 64) {
        throw errors.reference(`Payroll rule ${op} requires 1..64 args`);
      }
      return node.args.map(expression);
    };

    switch (op) {
      case "add": return args().reduce((sum, value) => safeAdd(sum, value), 0);
      case "sub": {
        if (!Array.isArray(node.args) || node.args.length !== 2) throw errors.reference("Payroll rule sub requires two args");
        return safeAdd(expression(node.args[0]), -expression(node.args[1]));
      }
      case "min": return Math.min(...args());
      case "max": return Math.max(...args());
      case "floor_zero": return Math.max(0, expression(node.value));
      case "mul_bps": {
        const bps = requireSafeInteger(node.bps, "payroll rule bps");
        if (bps < -100_000 || bps > 100_000) throw errors.reference("Payroll rule bps is out of range");
        return multiplyAndDivide(expression(node.value), bps, 10_000);
      }
      case "mul_int": return multiplySafe(expression(node.value), expression(node.factor));
      case "if": return expression(node.condition) !== 0 ? expression(node.then) : expression(node.else);
      case "eq": return expression(node.left) === expression(node.right) ? 1 : 0;
      case "gt": return expression(node.left) > expression(node.right) ? 1 : 0;
      case "gte": return expression(node.left) >= expression(node.right) ? 1 : 0;
      case "lt": return expression(node.left) < expression(node.right) ? 1 : 0;
      case "lte": return expression(node.left) <= expression(node.right) ? 1 : 0;
      case "progressive": return evaluateProgressive(node, expression(node.value), context.currencyScale);
      default: throw errors.reference(`Unsupported payroll rule operation ${op}`);
    }
  };

  const outputs: Record<string, number> = {};
  for (const key of outputKeys) outputs[key] = evaluateOutput(key);
  const tracedInputs: JsonObject = {};
  for (const [key, value] of inputs) {
    tracedInputs[key] = value;
    tracedInputs[`${key}__type`] = inputTypes.get(key) ?? "integer";
  }
  return {
    schemaVersion: 1,
    canonicalFormulaJson: JSON.stringify(formula),
    inputs: tracedInputs,
    outputs,
  };
}

function parseInputDefinitions(raw: unknown): Map<string, InputDefinition> {
  if (raw === undefined || raw === null) return new Map();
  const object = asObject(raw, "Payroll rule inputs");
  const entries = Object.entries(object);
  if (entries.length > MAX_INPUTS) throw errors.reference(`Payroll rule cannot define more than ${MAX_INPUTS} custom inputs`);
  const result = new Map<string, InputDefinition>();
  for (const [key, value] of entries) {
    requireKey(key, "Payroll rule input");
    if (BUILTIN_INPUTS.has(key)) throw errors.reference(`Payroll rule input ${key} is reserved`);
    const definition = asObject(value, `Payroll rule input ${key}`) as unknown as InputDefinition;
    if (!["currency", "integer", "boolean"].includes(definition.type)) throw errors.reference(`Payroll rule input ${key} has invalid type`);
    result.set(key, definition);
  }
  return result;
}

function parseInputValue(raw: unknown, type: InputType, scale: number, field: string): number {
  if (type === "currency") return toScaledInt(raw as string | number, scale, field);
  if (type === "boolean") {
    if (raw === true || raw === 1 || raw === "1") return 1;
    if (raw === false || raw === 0 || raw === "0") return 0;
    throw errors.reference(`${field} must be boolean`);
  }
  return requireSafeInteger(raw, field);
}

function validateProgressiveTiers(node: JsonObject, scale: number): void {
  if (!Array.isArray(node.tiers) || node.tiers.length === 0 || node.tiers.length > 32) {
    throw errors.reference("Payroll rule progressive requires 1..32 tiers");
  }
  let previousUpper = 0;
  for (const [index, rawTier] of node.tiers.entries()) {
    const tier = asObject(rawTier, `Payroll rule progressive tier ${index + 1}`);
    const rateBps = requireSafeInteger(tier.rate_bps, `Payroll rule progressive tier ${index + 1} rate_bps`);
    if (rateBps < 0 || rateBps > 10_000) throw errors.reference("Payroll rule progressive rate_bps must be 0..10000");
    const isFinal = tier.up_to === null || tier.up_to === undefined;
    if (isFinal && index !== node.tiers.length - 1) throw errors.reference("Only the final progressive tier may omit up_to");
    if (!isFinal) {
      const upper = toScaledInt(tier.up_to as string | number, scale, `Payroll rule progressive tier ${index + 1} up_to`);
      if (upper <= previousUpper) throw errors.reference("Payroll rule progressive up_to values must increase");
      previousUpper = upper;
    }
  }
}

function evaluateProgressive(node: JsonObject, rawValue: number, scale: number): number {
  if (!Array.isArray(node.tiers) || node.tiers.length === 0 || node.tiers.length > 32) {
    throw errors.reference("Payroll rule progressive requires 1..32 tiers");
  }
  const value = Math.max(0, rawValue);
  let previousUpper = 0;
  let remaining = value;
  let total = 0;
  for (const [index, rawTier] of node.tiers.entries()) {
    const tier = asObject(rawTier, `Payroll rule progressive tier ${index + 1}`);
    const rateBps = requireSafeInteger(tier.rate_bps, `Payroll rule progressive tier ${index + 1} rate_bps`);
    if (rateBps < 0 || rateBps > 10_000) throw errors.reference("Payroll rule progressive rate_bps must be 0..10000");
    const isFinal = tier.up_to === null || tier.up_to === undefined;
    if (isFinal && index !== node.tiers.length - 1) throw errors.reference("Only the final progressive tier may omit up_to");
    let band = remaining;
    if (!isFinal) {
      const upper = toScaledInt(tier.up_to as string | number, scale, `Payroll rule progressive tier ${index + 1} up_to`);
      if (upper <= previousUpper) throw errors.reference("Payroll rule progressive up_to values must increase");
      band = Math.min(remaining, upper - previousUpper);
      previousUpper = upper;
    }
    if (band > 0) {
      total = safeAdd(total, multiplyAndDivide(band, rateBps, 10_000));
      remaining -= band;
    }
    if (remaining <= 0) break;
  }
  if (remaining > 0) throw errors.reference("Payroll rule progressive tiers do not cover the input value");
  return total;
}

function parseObjectJson(value: string, field: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw errors.reference(`${field} must be valid JSON`);
  }
  return asObject(parsed, field);
}

function asObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.reference(`${field} must be a JSON object`);
  return value as JsonObject;
}

function requireKey(value: unknown, field: string): string {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) throw errors.reference(`${field} must match ${KEY_PATTERN}`);
  return value;
}

function requireSafeInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) throw errors.reference(`${field} must be a safe integer`);
  return number;
}

function safeAdd(left: number, right: number): number {
  return safeBigInt(BigInt(left) + BigInt(right), "Payroll rule arithmetic overflow");
}

function multiplySafe(left: number, right: number): number {
  return safeBigInt(BigInt(left) * BigInt(right), "Payroll rule multiplication overflow");
}

function multiplyAndDivide(value: number, multiplier: number, denominator: number): number {
  const numerator = BigInt(value) * BigInt(multiplier);
  const divisor = BigInt(denominator);
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = ((absolute + divisor / 2n) / divisor) * sign;
  return safeBigInt(rounded, "Payroll rule ratio overflow");
}

function safeBigInt(value: bigint, message: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation(message);
  return number;
}
