import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  SemanticFilter,
  SemanticFilterOperator,
  SemanticModelRegistry,
  SemanticOrder,
  SemanticQueryRequest,
} from "./index.js";
import type { SemanticQueryResult } from "./service.js";

export interface SemanticAssistantProposal {
  model: string;
  dimensions?: string[];
  metrics?: string[];
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  limit?: number;
}

export interface SemanticQueryExecutor {
  run(request: SemanticQueryRequest): Promise<SemanticQueryResult>;
}

export interface SemanticAiAuditIntent {
  tenantId: string;
  userId: string;
  question: string;
  proposal: SemanticAssistantProposal;
}

export interface SemanticAiAuditCompletion {
  auditId: string;
  status: "success" | "denied" | "error";
  rowCount?: number;
  errorCode?: string;
}

/**
 * Mandatory audit boundary for AI-triggered data access.
 * begin() happens before permission/query execution; if it fails, no data query runs.
 */
export interface SemanticAiAuditSink {
  begin(intent: SemanticAiAuditIntent): Promise<string>;
  finish(completion: SemanticAiAuditCompletion): Promise<void>;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER = /^[a-z][a-z0-9_]{0,79}$/;
const OPERATORS = new Set<SemanticFilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string, pattern: RegExp, max = 96): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || !pattern.test(value)) {
    throw errors.validation(`${field} is invalid`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string, maxItems: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) throw errors.validation(`${field} must be an array with at most ${maxItems} items`);
  const output = value.map((item, index) => asString(item, `${field}[${index}]`, MEMBER, 80));
  if (new Set(output).size !== output.length) throw errors.validation(`${field} contains duplicate members`);
  return output;
}

function jsonValue(value: unknown, field: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw errors.validation(`${field} must be finite`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 80) throw errors.validation(`${field} array is too large`);
    return value.map((entry, index) => jsonValue(entry, `${field}[${index}]`));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 20) throw errors.validation(`${field} object is too large`);
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of entries) {
      if (key.length > 80) throw errors.validation(`${field} contains an oversized key`);
      out[key] = jsonValue(entry, `${field}.${key}`);
    }
    return out;
  }
  throw errors.validation(`${field} is not JSON-compatible`);
}

function parseFilters(value: unknown): SemanticFilter[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) throw errors.validation("proposal.filters must contain at most 20 items");
  return value.map((entry, index) => {
    const object = asRecord(entry, `proposal.filters[${index}]`);
    const dimension = asString(object.dimension, `proposal.filters[${index}].dimension`, MEMBER, 80);
    const operator = object.operator;
    if (typeof operator !== "string" || !OPERATORS.has(operator as SemanticFilterOperator)) {
      throw errors.validation(`proposal.filters[${index}].operator is invalid`);
    }
    if (operator === "is_null") return { dimension, operator: "is_null" };
    if (object.value === undefined) throw errors.validation(`proposal.filters[${index}].value is required`);
    return { dimension, operator: operator as SemanticFilterOperator, value: jsonValue(object.value, `proposal.filters[${index}].value`) };
  });
}

function parseOrder(value: unknown): SemanticOrder[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw errors.validation("proposal.order_by must contain at most 8 items");
  return value.map((entry, index) => {
    const object = asRecord(entry, `proposal.order_by[${index}]`);
    const id = asString(object.id, `proposal.order_by[${index}].id`, MEMBER, 80);
    if (object.direction !== "asc" && object.direction !== "desc") throw errors.validation(`proposal.order_by[${index}].direction is invalid`);
    return { id, direction: object.direction };
  });
}

/**
 * Parses model output as data, never as SQL. Unknown model/member IDs fail closed against
 * the safe semantic catalog before a tenant query is even constructed.
 */
export function parseSemanticAssistantProposal(registry: SemanticModelRegistry, value: unknown): SemanticAssistantProposal {
  const object = asRecord(value, "proposal");
  const modelId = asString(object.model, "proposal.model", ID, 96);
  const model = registry.get(modelId);
  const dimensions = optionalStringArray(object.dimensions, "proposal.dimensions", 20);
  const metrics = optionalStringArray(object.metrics, "proposal.metrics", 20);
  if ((dimensions?.length ?? 0) === 0 && (metrics?.length ?? 0) === 0) {
    throw errors.validation("proposal must select at least one dimension or metric");
  }

  const dimensionIds = new Set(model.dimensions.map((dimension) => dimension.id));
  const metricIds = new Set(model.metrics.map((metric) => metric.id));
  for (const dimension of dimensions ?? []) if (!dimensionIds.has(dimension)) throw errors.validation(`Unknown semantic dimension ${dimension}`);
  for (const metric of metrics ?? []) if (!metricIds.has(metric)) throw errors.validation(`Unknown semantic metric ${metric}`);

  const filters = parseFilters(object.filters);
  for (const filter of filters ?? []) if (!dimensionIds.has(filter.dimension)) throw errors.validation(`Unknown semantic filter dimension ${filter.dimension}`);
  const orderBy = parseOrder(object.order_by);
  const selected = new Set([...(dimensions ?? []), ...(metrics ?? [])]);
  for (const order of orderBy ?? []) if (!selected.has(order.id)) throw errors.validation(`AI order member must be selected: ${order.id}`);

  let limit: number | undefined;
  if (object.limit !== undefined) {
    if (!Number.isSafeInteger(object.limit) || (object.limit as number) < 1 || (object.limit as number) > 200) {
      throw errors.validation("proposal.limit must be an integer from 1 to 200");
    }
    limit = object.limit as number;
  }

  return {
    model: modelId,
    ...(dimensions ? { dimensions } : {}),
    ...(metrics ? { metrics } : {}),
    ...(filters ? { filters } : {}),
    ...(orderBy ? { order_by: orderBy } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  return "UNEXPECTED_ERROR";
}

function isPermissionError(error: unknown): boolean {
  const code = errorCode(error).toUpperCase();
  return code.includes("PERMISSION") || code.includes("FORBIDDEN") || code === "HTTP_403";
}

/**
 * Deterministic tool boundary for `AI -> semantic -> permission -> query`.
 * The AI never supplies tenant_id and never receives raw SQL/schema identifiers.
 */
export class SemanticAssistantQueryTool {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly audit: SemanticAiAuditSink,
  ) {}

  catalog() {
    return this.registry.list();
  }

  async execute(input: {
    tenantId: string;
    userId: string;
    question: string;
    proposal: unknown;
  }): Promise<SemanticQueryResult> {
    if (!input.tenantId.trim()) throw errors.validation("tenantId is required");
    if (!input.userId.trim()) throw errors.validation("userId is required");
    const question = input.question.trim();
    if (!question || question.length > 2_000) throw errors.validation("question is required and must be at most 2000 characters");
    const proposal = parseSemanticAssistantProposal(this.registry, input.proposal);

    // Audit intent first. If evidence cannot be opened, no data read is allowed.
    const auditId = await this.audit.begin({
      tenantId: input.tenantId,
      userId: input.userId,
      question,
      proposal,
    });

    try {
      const result = await this.executor.run({
        tenant_id: input.tenantId,
        model: proposal.model,
        ...(proposal.dimensions ? { dimensions: proposal.dimensions } : {}),
        ...(proposal.metrics ? { metrics: proposal.metrics } : {}),
        ...(proposal.filters ? { filters: proposal.filters } : {}),
        ...(proposal.order_by ? { order_by: proposal.order_by } : {}),
        ...(proposal.limit !== undefined ? { limit: proposal.limit } : {}),
      });
      await this.audit.finish({ auditId, status: "success", rowCount: result.row_count });
      return result;
    } catch (error) {
      await this.audit.finish({
        auditId,
        status: isPermissionError(error) ? "denied" : "error",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }
}
