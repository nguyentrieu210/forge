import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export type ReconciliationMetricKind = "count" | "count_distinct" | "sum_decimal";

export interface ReconciliationMetricSpec {
  name: string;
  kind: ReconciliationMetricKind;
  /** Dot path. `items[].qty` flattens child arrays deterministically. */
  path?: string;
}

/**
 * Computes source/target-neutral reconciliation metrics without binary-float addition.
 * Domain owners can choose the fields that matter; WS13 provides deterministic counting,
 * distinct identity and exact decimal aggregation.
 */
export function computeReconciliationMetrics(
  rows: readonly JsonObject[],
  specs: readonly ReconciliationMetricSpec[],
): Record<string, string> {
  const output: Record<string, string> = {};
  const names = new Set<string>();
  for (const spec of specs) {
    const name = requireText(spec.name, "metric name", 160);
    if (names.has(name)) throw errors.validation(`Duplicate reconciliation metric: ${name}`);
    names.add(name);
    if (spec.kind === "count") {
      const count = spec.path ? rows.flatMap((row) => valuesAtPath(row, spec.path!)).filter(hasValue).length : rows.length;
      output[name] = String(count);
      continue;
    }
    if (!spec.path) throw errors.validation(`Reconciliation metric ${name} requires path`);
    const values = rows.flatMap((row) => valuesAtPath(row, spec.path!)).filter(hasValue);
    if (spec.kind === "count_distinct") {
      output[name] = String(new Set(values.map(stableScalar)).size);
      continue;
    }
    if (spec.kind === "sum_decimal") {
      let total = "0";
      for (const value of values) total = addExactDecimal(total, decimalValue(value, `${name}:${spec.path}`));
      output[name] = total;
      continue;
    }
    throw errors.validation(`Unsupported reconciliation metric kind: ${String(spec.kind)}`);
  }
  return output;
}

export function addExactDecimal(left: string, right: string): string {
  const a = parseDecimal(left, "left decimal");
  const b = parseDecimal(right, "right decimal");
  const scale = Math.max(a.scale, b.scale);
  const leftMinor = a.minor * 10n ** BigInt(scale - a.scale);
  const rightMinor = b.minor * 10n ** BigInt(scale - b.scale);
  return formatDecimal(leftMinor + rightMinor, scale);
}

function valuesAtPath(root: JsonObject, path: string): JsonValue[] {
  const segments = requireText(path, "metric path", 500).split(".");
  let current: JsonValue[] = [root];
  for (const rawSegment of segments) {
    const isArray = rawSegment.endsWith("[]");
    const key = isArray ? rawSegment.slice(0, -2) : rawSegment;
    if (!key) throw errors.validation(`Invalid reconciliation metric path: ${path}`);
    const next: JsonValue[] = [];
    for (const value of current) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const child = (value as JsonObject)[key];
      if (child === undefined) continue;
      if (isArray) {
        if (!Array.isArray(child)) throw errors.validation(`Reconciliation path expects array at ${key}`);
        for (const entry of child) next.push(entry);
      } else next.push(child);
    }
    current = next;
  }
  return current;
}

function decimalValue(value: JsonValue, label: string): string {
  if (typeof value === "string") return formatParsedDecimal(parseDecimal(value, label));
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    if (/[eE]/.test(text)) throw errors.validation(`${label} must not use scientific notation`);
    return formatParsedDecimal(parseDecimal(text, label));
  }
  throw errors.validation(`${label} must contain decimal strings or finite numbers`);
}

function parseDecimal(value: string, label: string): { minor: bigint; scale: number } {
  const text = value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw errors.validation(`${label} must be a plain decimal`);
  const fraction = match[3] ?? "";
  const digits = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const sign = match[1] === "-" ? -1n : 1n;
  return { minor: BigInt(digits) * sign, scale: fraction.length };
}

function formatParsedDecimal(value: { minor: bigint; scale: number }): string {
  return formatDecimal(value.minor, value.scale);
}

function formatDecimal(minor: bigint, scale: number): string {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  let digits = absolute.toString().padStart(scale + 1, "0");
  if (scale) digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  digits = digits.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  if (digits.endsWith(".")) digits = digits.slice(0, -1);
  if (/^0(?:\.0+)?$/.test(digits)) return "0";
  return negative ? `-${digits}` : digits;
}

function stableScalar(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `${typeof value}:${String(value)}`;
  return `json:${JSON.stringify(canonicalize(value))}`;
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const input = value as JsonObject;
  const output: JsonObject = {};
  for (const key of Object.keys(input).sort()) {
    const entry = input[key];
    if (entry !== undefined) output[key] = canonicalize(entry);
  }
  return output;
}

function hasValue(value: JsonValue): boolean {
  return value !== null && value !== "";
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}
