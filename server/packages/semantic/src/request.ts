import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticFilterOperator, SemanticOrder, SemanticQueryRequest } from "./index.js";

export type SemanticQueryWithoutTenant = Omit<SemanticQueryRequest, "tenant_id">;

const MODEL = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER = /^[a-z][a-z0-9_]{0,79}$/;
const OPERATORS = new Set<SemanticFilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);

function object(value: JsonValue | undefined, field: string): Record<string, JsonValue | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  return value as Record<string, JsonValue | undefined>;
}

function onlyKeys(value: Record<string, JsonValue | undefined>, allowed: string[], field: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) throw errors.validation(`${field} contains unsupported key ${key}`);
}

function text(value: JsonValue | undefined, field: string, pattern: RegExp, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || !pattern.test(value)) throw errors.validation(`${field} is invalid`);
  return value;
}

function members(value: JsonValue | undefined, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 40) throw errors.validation(`${field} must be an array with at most 40 entries`);
  const output = value.map((entry, index) => text(entry, `${field}[${index}]`, MEMBER, 80));
  if (new Set(output).size !== output.length) throw errors.validation(`${field} contains duplicate members`);
  return output;
}

function scalar(value: JsonValue | undefined, field: string): string | number | boolean {
  if (typeof value === "string") {
    if (value.length > 2_000) throw errors.validation(`${field} is too long`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
    return value;
  }
  if (typeof value === "boolean") return value;
  throw errors.validation(`${field} must be a string, finite number or boolean`);
}

function filters(value: JsonValue | undefined, field: string): SemanticFilter[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw errors.validation(`${field} must be an array with at most 20 entries`);
  return value.map((entry, index) => {
    const row = object(entry, `${field}[${index}]`);
    onlyKeys(row, ["dimension", "operator", "value"], `${field}[${index}]`);
    const dimension = text(row.dimension, `${field}[${index}].dimension`, MEMBER, 80);
    const operator = row.operator;
    if (typeof operator !== "string" || !OPERATORS.has(operator as SemanticFilterOperator)) throw errors.validation(`${field}[${index}].operator is invalid`);
    if (operator === "is_null") {
      if (row.value !== undefined) throw errors.validation(`${field}[${index}].value must be omitted for is_null`);
      return { dimension, operator: "is_null" };
    }
    if (operator === "in") {
      if (!Array.isArray(row.value) || row.value.length === 0 || row.value.length > 80) {
        throw errors.validation(`${field}[${index}].value must be a non-empty scalar array with at most 80 entries`);
      }
      return { dimension, operator: "in", value: row.value.map((item, itemIndex) => scalar(item, `${field}[${index}].value[${itemIndex}]`)) };
    }
    const parsed = scalar(row.value, `${field}[${index}].value`);
    if (operator === "like" && typeof parsed !== "string") throw errors.validation(`${field}[${index}].value must be string for LIKE`);
    return { dimension, operator: operator as SemanticFilterOperator, value: parsed };
  });
}

function orderBy(value: JsonValue | undefined, field: string): SemanticOrder[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw errors.validation(`${field} must be an array with at most 8 entries`);
  return value.map((entry, index) => {
    const row = object(entry, `${field}[${index}]`);
    onlyKeys(row, ["id", "direction"], `${field}[${index}]`);
    const id = text(row.id, `${field}[${index}].id`, MEMBER, 80);
    if (row.direction !== "asc" && row.direction !== "desc") throw errors.validation(`${field}[${index}].direction is invalid`);
    return { id, direction: row.direction };
  });
}

function boundedInteger(value: JsonValue | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw errors.validation(`${field} must be an integer from ${min} to ${max}`);
  }
  return value as number;
}

/**
 * Strict JSON parser for HTTP/LLM boundaries. tenant_id is intentionally not part of the
 * accepted shape; trusted request context injects it after parsing.
 */
export function parseSemanticQueryBody(
  value: JsonValue | undefined,
  options: { maxLimit?: number; allowOffset?: boolean } = {},
): SemanticQueryWithoutTenant {
  const body = object(value, "semantic query");
  onlyKeys(body, ["model", "dimensions", "metrics", "filters", "order_by", "limit", "offset"], "semantic query");
  if (body.tenant_id !== undefined) throw errors.validation("tenant_id must come from trusted request context");

  const model = text(body.model, "semantic query.model", MODEL, 96);
  const dimensions = members(body.dimensions, "semantic query.dimensions");
  const metrics = members(body.metrics, "semantic query.metrics");
  if ((dimensions?.length ?? 0) === 0 && (metrics?.length ?? 0) === 0) throw errors.validation("semantic query must select at least one dimension or metric");
  const parsedFilters = filters(body.filters, "semantic query.filters");
  const parsedOrder = orderBy(body.order_by, "semantic query.order_by");
  const limit = boundedInteger(body.limit, "semantic query.limit", 1, options.maxLimit ?? 10_000);
  const offset = boundedInteger(body.offset, "semantic query.offset", 0, 100_000);
  if (offset !== undefined && options.allowOffset === false) throw errors.validation("semantic query.offset is not allowed on this surface");

  return {
    model,
    ...(dimensions ? { dimensions } : {}),
    ...(metrics ? { metrics } : {}),
    ...(parsedFilters ? { filters: parsedFilters } : {}),
    ...(parsedOrder ? { order_by: parsedOrder } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}
