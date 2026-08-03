import { errors } from "../../core/src/index.js";
import type { JsonValue } from "../../contracts/src/index.js";
import type { SemanticFilter, SemanticQueryRequest } from "./index.js";

export type SemanticScalar = string | number | boolean;

function assertScalar(value: JsonValue | undefined, field: string): asserts value is SemanticScalar {
  if (typeof value === "string") {
    if (value.length > 2_000) throw errors.validation(`${field} string is too long`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${field} number must be finite`);
    return;
  }
  if (typeof value === "boolean") return;
  throw errors.validation(`${field} must be a string, finite number or boolean`);
}

export function assertSemanticFilterRuntimeInput(filter: SemanticFilter, field = "filter"): void {
  if (filter.operator === "is_null") {
    if (filter.value !== undefined) throw errors.validation(`${field}.value must be omitted for is_null`);
    return;
  }

  if (filter.operator === "in") {
    if (!Array.isArray(filter.value) || filter.value.length === 0 || filter.value.length > 80) {
      throw errors.validation(`${field}.value must be a non-empty scalar array with at most 80 entries for IN`);
    }
    filter.value.forEach((value, index) => assertScalar(value, `${field}.value[${index}]`));
    return;
  }

  assertScalar(filter.value, `${field}.value`);
  if (filter.operator === "like" && typeof filter.value !== "string") {
    throw errors.validation(`${field}.value must be a string for LIKE`);
  }
}

/**
 * Runtime guard before semantic compilation/execution. TypeScript types do not protect an
 * HTTP/LLM caller, so the authoritative service validates JSON values again at runtime.
 */
export function assertSemanticQueryRuntimeInput(request: SemanticQueryRequest): void {
  if (typeof request.tenant_id !== "string" || !request.tenant_id.trim() || request.tenant_id.length > 200) {
    throw errors.validation("tenant_id is required and must be at most 200 characters");
  }
  if (typeof request.model !== "string" || !request.model.trim() || request.model.length > 96) {
    throw errors.validation("model is required and must be at most 96 characters");
  }
  if ((request.filters?.length ?? 0) > 20) throw errors.validation("filters must contain at most 20 entries");
  request.filters?.forEach((filter, index) => assertSemanticFilterRuntimeInput(filter, `filters[${index}]`));

  if (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 10_000)) {
    throw errors.validation("limit must be an integer from 1 to 10000");
  }
  if (request.offset !== undefined && (!Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset > 100_000)) {
    throw errors.validation("offset must be an integer from 0 to 100000; large extracts require a feed/cursor contract");
  }
}
