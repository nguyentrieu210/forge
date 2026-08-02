import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { PermissionAwareSemanticCatalogService } from "./catalog.js";
import type { PermissionAwareSemanticInsightCatalogService } from "./insight-catalog.js";
import type { SemanticFilter, SemanticFilterOperator } from "./index.js";
import type { SemanticInsightRegistry } from "./insights.js";
import { parseSemanticQueryBody } from "./request.js";
import type { SemanticQueryExecutor, SemanticQueryResult } from "./service.js";

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
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
function id(value: JsonValue | undefined, field: string, member = false): string {
  const pattern = member ? MEMBER : ID;
  if (typeof value !== "string" || !pattern.test(value)) throw errors.validation(`${field} is invalid`);
  return value;
}
function scalar(value: JsonValue | undefined, field: string): string | number | boolean {
  if (typeof value === "string") {
    if (!value.trim() || value.length > 2_000) throw errors.validation(`${field} is invalid`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
    return value;
  }
  if (typeof value === "boolean") return value;
  throw errors.validation(`${field} must be a string, finite number or boolean`);
}
function scopeFilters(value: JsonValue | undefined): SemanticFilter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw errors.validation("scope_filters must be an array with at most 20 entries");
  return value.map((entry, index) => {
    const row = object(entry, `scope_filters[${index}]`);
    onlyKeys(row, ["dimension", "operator", "value"], `scope_filters[${index}]`);
    const dimension = id(row.dimension, `scope_filters[${index}].dimension`, true);
    const operator = row.operator;
    if (typeof operator !== "string" || !OPERATORS.has(operator as SemanticFilterOperator)) throw errors.validation(`scope_filters[${index}].operator is invalid`);
    if (operator === "is_null") {
      if (row.value !== undefined) throw errors.validation(`scope_filters[${index}].value must be omitted for is_null`);
      return { dimension, operator: "is_null" };
    }
    if (operator === "in") {
      if (!Array.isArray(row.value) || row.value.length === 0 || row.value.length > 80) throw errors.validation(`scope_filters[${index}].value must be a non-empty scalar array`);
      return { dimension, operator: "in", value: row.value.map((item, itemIndex) => scalar(item, `scope_filters[${index}].value[${itemIndex}]`)) };
    }
    const parsed = scalar(row.value, `scope_filters[${index}].value`);
    if (operator === "like" && typeof parsed !== "string") throw errors.validation(`scope_filters[${index}].value must be string for LIKE`);
    return { dimension, operator: operator as SemanticFilterOperator, value: parsed };
  });
}
function sourceValues(value: JsonValue | undefined): Record<string, string | number | boolean> {
  const body = object(value, "source_values");
  const entries = Object.entries(body);
  if (entries.length > 20) throw errors.validation("source_values has too many entries");
  const result: Record<string, string | number | boolean> = {};
  for (const [key, raw] of entries) {
    if (!MEMBER.test(key)) throw errors.validation(`source_values contains invalid dimension ${key}`);
    result[key] = scalar(raw, `source_values.${key}`);
  }
  return result;
}

/** Router-independent read surface; tenant always comes from trusted caller context. */
export class SemanticReadApi {
  constructor(
    private readonly executor: SemanticQueryExecutor,
    private readonly catalogService: PermissionAwareSemanticCatalogService,
    private readonly insightRegistry?: SemanticInsightRegistry,
    private readonly insightCatalogService?: PermissionAwareSemanticInsightCatalogService,
  ) {}

  catalog(tenantId: string) { return this.catalogService.list(tenantId); }

  insightCatalog(tenantId: string) {
    if (!this.insightCatalogService) throw errors.validation("Semantic insight catalog is not configured");
    return this.insightCatalogService.list(tenantId);
  }

  async query(tenantId: string, body: JsonValue | undefined): Promise<SemanticQueryResult> {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    const parsed = parseSemanticQueryBody(body, { maxLimit: 2_000, allowOffset: true });
    return this.executor.run({ tenant_id: tenantId, ...parsed });
  }

  async insight(tenantId: string, body: JsonValue | undefined): Promise<SemanticQueryResult> {
    if (!this.insightRegistry) throw errors.validation("Semantic insight registry is not configured");
    const input = object(body, "insight query");
    onlyKeys(input, ["insight", "scope_filters"], "insight query");
    const request = this.insightRegistry.query(id(input.insight, "insight query.insight"), tenantId, scopeFilters(input.scope_filters));
    return this.executor.run(request);
  }

  async drill(tenantId: string, body: JsonValue | undefined): Promise<SemanticQueryResult> {
    if (!this.insightRegistry) throw errors.validation("Semantic insight registry is not configured");
    const input = object(body, "drill query");
    onlyKeys(input, ["insight", "drill", "source_values"], "drill query");
    const request = this.insightRegistry.drill({
      insight: id(input.insight, "drill query.insight"),
      drill: id(input.drill, "drill query.drill"),
      tenantId,
      sourceValues: sourceValues(input.source_values),
    });
    return this.executor.run(request);
  }
}
