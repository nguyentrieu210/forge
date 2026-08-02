import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilter, SemanticModelRegistry, SemanticOrder } from "./index.js";
import { parseSemanticQueryBody } from "./request.js";
import type { SemanticQueryExecutor, SemanticQueryResult } from "./service.js";

export interface SemanticAssistantProposal {
  model: string;
  dimensions?: string[];
  metrics?: string[];
  filters?: SemanticFilter[];
  order_by?: SemanticOrder[];
  limit?: number;
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

/**
 * Parses model output as strict semantic data, never as SQL.
 *
 * The shared external parser rejects unknown keys (`tenant_id`, `raw_sql`, etc.), nested
 * filter objects, forged operators and offsets. This function then resolves every model /
 * member against the safe semantic registry so a hallucinated member fails before audit or
 * tenant data access.
 */
export function parseSemanticAssistantProposal(registry: SemanticModelRegistry, value: unknown): SemanticAssistantProposal {
  const parsed = parseSemanticQueryBody(value as JsonValue | undefined, { maxLimit: 200, allowOffset: false });
  const model = registry.get(parsed.model);
  const dimensionIds = new Set(model.dimensions.map((dimension) => dimension.id));
  const metricIds = new Set(model.metrics.map((metric) => metric.id));

  for (const dimension of parsed.dimensions ?? []) {
    if (!dimensionIds.has(dimension)) throw errors.validation(`Unknown semantic dimension ${dimension}`);
  }
  for (const metric of parsed.metrics ?? []) {
    if (!metricIds.has(metric)) throw errors.validation(`Unknown semantic metric ${metric}`);
  }
  for (const filter of parsed.filters ?? []) {
    if (!dimensionIds.has(filter.dimension)) throw errors.validation(`Unknown semantic filter dimension ${filter.dimension}`);
  }

  const selected = new Set([...(parsed.dimensions ?? []), ...(parsed.metrics ?? [])]);
  for (const order of parsed.order_by ?? []) {
    if (!selected.has(order.id)) throw errors.validation(`AI order member must be selected: ${order.id}`);
  }

  return parsed as SemanticAssistantProposal;
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
 *
 * Catalog discovery intentionally does NOT live here: callers must use
 * `PermissionAwareSemanticCatalogService`, otherwise a user could discover models they may
 * not execute even though the raw schema remains hidden.
 */
export class SemanticAssistantQueryTool {
  constructor(
    private readonly registry: SemanticModelRegistry,
    private readonly executor: SemanticQueryExecutor,
    private readonly audit: SemanticAiAuditSink,
  ) {}

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
