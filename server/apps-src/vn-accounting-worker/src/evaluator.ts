export type TaxInputs = Record<string, number>;

export interface TaxRulesetSchema {
  version: 1;
  outputs: Record<string, unknown>;
}

export interface TaxTestVector {
  name?: string;
  inputs: TaxInputs;
  expected: Record<string, number>;
}

export interface TaxEvaluation {
  outputs: Record<string, number>;
  trace: {
    schema_version: 1;
    input_names: string[];
    output_names: string[];
    node_count: number;
  };
}

interface EvalState {
  inputs: TaxInputs;
  nodes: number;
}

const MAX_DEPTH = 32;
const MAX_NODES = 500;
const MAX_INPUTS = 100;
const MAX_OUTPUTS = 50;
const MAX_TIERS = 32;

export function parseTaxRuleset(value: unknown): TaxRulesetSchema {
  const input = parseJsonObject(value, "expression_json");
  if (input.version !== 1) throw new Error("Tax ruleset schema version must be 1");
  if (!input.outputs || typeof input.outputs !== "object" || Array.isArray(input.outputs)) {
    throw new Error("Tax ruleset outputs must be an object");
  }
  const outputs = input.outputs as Record<string, unknown>;
  const names = Object.keys(outputs);
  if (!names.length || names.length > MAX_OUTPUTS) throw new Error(`Tax ruleset must define 1-${MAX_OUTPUTS} outputs`);
  for (const name of names) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Invalid tax output name: ${name}`);
  }
  return { version: 1, outputs };
}

export function parseTaxTestVectors(value: unknown): TaxTestVector[] {
  const raw = typeof value === "string" ? parseJson(value, "test_vectors_json") : value;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new Error("Tax ruleset requires 1-100 deterministic test vectors");
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Test vector ${index + 1} must be an object`);
    const vector = entry as Record<string, unknown>;
    const inputs = parseInputs(vector.inputs, `test_vectors[${index}].inputs`);
    const expected = parseExpected(vector.expected, `test_vectors[${index}].expected`);
    return {
      ...(typeof vector.name === "string" && vector.name.trim() ? { name: vector.name.trim() } : {}),
      inputs,
      expected,
    };
  });
}

export function evaluateTaxRuleset(schema: TaxRulesetSchema, rawInputs: unknown): TaxEvaluation {
  const inputs = parseInputs(rawInputs, "inputs");
  const state: EvalState = { inputs, nodes: 0 };
  const outputs: Record<string, number> = {};
  for (const [name, expression] of Object.entries(schema.outputs)) {
    outputs[name] = evaluateExpression(expression, state, 0, `outputs.${name}`);
  }
  return {
    outputs,
    trace: {
      schema_version: 1,
      input_names: Object.keys(inputs).sort(),
      output_names: Object.keys(outputs).sort(),
      node_count: state.nodes,
    },
  };
}

export function validateTaxTestVectors(schema: TaxRulesetSchema, vectors: TaxTestVector[]): void {
  for (const [index, vector] of vectors.entries()) {
    const actual = evaluateTaxRuleset(schema, vector.inputs).outputs;
    const expectedNames = Object.keys(vector.expected).sort();
    const actualNames = Object.keys(actual).sort();
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error(`Test vector ${vector.name ?? index + 1} output names do not match ruleset outputs`);
    }
    for (const name of expectedNames) {
      if (actual[name] !== vector.expected[name]) {
        throw new Error(`Test vector ${vector.name ?? index + 1} failed ${name}: expected ${vector.expected[name]}, got ${actual[name]}`);
      }
    }
  }
}

function evaluateExpression(expression: unknown, state: EvalState, depth: number, path: string): number {
  if (depth > MAX_DEPTH) throw new Error(`Tax expression exceeds max depth at ${path}`);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new Error("Tax expression exceeds max node count");
  const node = object(expression, path);
  const op = string(node.op, `${path}.op`);

  switch (op) {
    case "input": {
      const name = string(node.name, `${path}.name`);
      if (!(name in state.inputs)) throw new Error(`Missing tax input: ${name}`);
      return state.inputs[name]!;
    }
    case "const":
      return integer(node.value, `${path}.value`);
    case "add":
      return addMany(array(node.args, `${path}.args`).map((child, index) => evaluateExpression(child, state, depth + 1, `${path}.args[${index}]`)), path);
    case "sub":
      return safeNumber(BigInt(evaluateExpression(node.left, state, depth + 1, `${path}.left`)) - BigInt(evaluateExpression(node.right, state, depth + 1, `${path}.right`)), path);
    case "min": {
      const values = nonEmptyExpressions(node.args, state, depth, path);
      return Math.min(...values);
    }
    case "max": {
      const values = nonEmptyExpressions(node.args, state, depth, path);
      return Math.max(...values);
    }
    case "abs":
      return safeNumber(absBig(BigInt(evaluateExpression(node.value, state, depth + 1, `${path}.value`))), path);
    case "floor_zero":
      return Math.max(0, evaluateExpression(node.value, state, depth + 1, `${path}.value`));
    case "mul_bps": {
      const value = evaluateExpression(node.value, state, depth + 1, `${path}.value`);
      const basisPoints = integer(node.basis_points, `${path}.basis_points`);
      if (basisPoints < -100_000 || basisPoints > 100_000) throw new Error(`${path}.basis_points is outside supported range`);
      return roundedDivide(BigInt(value) * BigInt(basisPoints), 10_000n, path);
    }
    case "if":
      return evaluateCondition(node.condition, state, depth + 1, `${path}.condition`)
        ? evaluateExpression(node.then, state, depth + 1, `${path}.then`)
        : evaluateExpression(node.else, state, depth + 1, `${path}.else`);
    case "progressive":
      return evaluateProgressive(node, state, depth, path);
    default:
      throw new Error(`Unsupported tax operation ${op} at ${path}`);
  }
}

function evaluateCondition(condition: unknown, state: EvalState, depth: number, path: string): boolean {
  if (depth > MAX_DEPTH) throw new Error(`Tax condition exceeds max depth at ${path}`);
  state.nodes += 1;
  if (state.nodes > MAX_NODES) throw new Error("Tax expression exceeds max node count");
  const node = object(condition, path);
  const op = string(node.op, `${path}.op`);
  if (op === "not") return !evaluateCondition(node.value, state, depth + 1, `${path}.value`);
  if (op === "and" || op === "or") {
    const values = array(node.args, `${path}.args`);
    if (!values.length) throw new Error(`${path}.args must not be empty`);
    return op === "and"
      ? values.every((entry, index) => evaluateCondition(entry, state, depth + 1, `${path}.args[${index}]`))
      : values.some((entry, index) => evaluateCondition(entry, state, depth + 1, `${path}.args[${index}]`));
  }
  if (!["eq", "lt", "lte", "gt", "gte"].includes(op)) throw new Error(`Unsupported tax condition ${op} at ${path}`);
  const left = evaluateExpression(node.left, state, depth + 1, `${path}.left`);
  const right = evaluateExpression(node.right, state, depth + 1, `${path}.right`);
  if (op === "eq") return left === right;
  if (op === "lt") return left < right;
  if (op === "lte") return left <= right;
  if (op === "gt") return left > right;
  return left >= right;
}

function evaluateProgressive(node: Record<string, unknown>, state: EvalState, depth: number, path: string): number {
  const value = evaluateExpression(node.value, state, depth + 1, `${path}.value`);
  if (value <= 0) return 0;
  const tiers = array(node.tiers, `${path}.tiers`);
  if (!tiers.length || tiers.length > MAX_TIERS) throw new Error(`${path}.tiers must contain 1-${MAX_TIERS} tiers`);
  let lower = 0;
  let remaining = value;
  let total = 0n;
  let openEnded = false;
  for (const [index, raw] of tiers.entries()) {
    const tier = object(raw, `${path}.tiers[${index}]`);
    const basisPoints = integer(tier.basis_points, `${path}.tiers[${index}].basis_points`);
    if (basisPoints < 0 || basisPoints > 100_000) throw new Error(`${path}.tiers[${index}].basis_points is outside supported range`);
    const upperRaw = tier.up_to_minor;
    let taxable: number;
    if (upperRaw === null) {
      if (index !== tiers.length - 1) throw new Error(`${path}.tiers open-ended tier must be last`);
      taxable = remaining;
      openEnded = true;
    } else {
      const upper = integer(upperRaw, `${path}.tiers[${index}].up_to_minor`);
      if (upper <= lower) throw new Error(`${path}.tiers must be strictly ascending`);
      taxable = Math.min(remaining, upper - lower);
      lower = upper;
    }
    if (taxable > 0) total += BigInt(roundedDivide(BigInt(taxable) * BigInt(basisPoints), 10_000n, `${path}.tiers[${index}]`));
    remaining -= taxable;
    if (remaining <= 0) break;
  }
  if (remaining > 0 && !openEnded) throw new Error(`${path}.tiers do not cover taxable value`);
  return safeNumber(total, path);
}

function nonEmptyExpressions(value: unknown, state: EvalState, depth: number, path: string): number[] {
  const entries = array(value, `${path}.args`);
  if (!entries.length) throw new Error(`${path}.args must not be empty`);
  return entries.map((entry, index) => evaluateExpression(entry, state, depth + 1, `${path}.args[${index}]`));
}

function addMany(values: number[], path: string): number {
  return safeNumber(values.reduce((sum, value) => sum + BigInt(value), 0n), path);
}

function roundedDivide(numerator: bigint, denominator: bigint, path: string): number {
  if (denominator <= 0n) throw new Error(`${path}: invalid divisor`);
  const negative = numerator < 0n;
  const absolute = absBig(numerator);
  const rounded = (absolute + denominator / 2n) / denominator;
  return safeNumber(negative ? -rounded : rounded, path);
}

function absBig(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function safeNumber(value: bigint, path: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Tax arithmetic exceeds safe integer bounds at ${path}`);
  return result;
}

function parseInputs(value: unknown, path: string): TaxInputs {
  const input = parseJsonObject(value, path);
  const entries = Object.entries(input);
  if (entries.length > MAX_INPUTS) throw new Error(`${path} exceeds ${MAX_INPUTS} inputs`);
  const result: TaxInputs = {};
  for (const [name, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Invalid tax input name: ${name}`);
    result[name] = integer(raw, `${path}.${name}`);
  }
  return result;
}

function parseExpected(value: unknown, path: string): Record<string, number> {
  const input = parseJsonObject(value, path);
  const result: Record<string, number> = {};
  for (const [name, raw] of Object.entries(input)) result[name] = integer(raw, `${path}.${name}`);
  return result;
}

function parseJsonObject(value: unknown, path: string): Record<string, unknown> {
  const parsed = typeof value === "string" ? parseJson(value, path) : value;
  return object(parsed, path);
}

function parseJson(value: string, path: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${path} must be valid JSON`);
  }
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${path} must be a safe integer minor-unit value`);
  return value;
}
