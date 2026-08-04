import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticFilterOperator } from "./index.js";
import type {
  SemanticDashboardFilterInput,
  SemanticDashboardRegistry,
  SemanticDashboardResult,
  SemanticDashboardService,
} from "./dashboard.js";

export interface SemanticAssistantDashboardProposal {
  dashboard: string;
  filters?: SemanticDashboardFilterInput[];
}

export interface SemanticAiDashboardAuditIntent {
  tenantId: string;
  userId: string;
  question: string;
  proposal: SemanticAssistantDashboardProposal;
}

export interface SemanticAiDashboardAuditCompletion {
  auditId: string;
  status: "success" | "denied" | "error";
  widgetCount?: number;
  rowCount?: number;
  errorCode?: string;
}

export interface SemanticAiDashboardAuditSink {
  begin(intent: SemanticAiDashboardAuditIntent): Promise<string>;
  finish(completion: SemanticAiDashboardAuditCompletion): Promise<void>;
}

const STABLE_ID = /^[a-z][a-z0-9_.-]{0,95}$/;
const MEMBER_ID = /^[a-z][a-z0-9_]{0,79}$/;
const OPERATORS = new Set<SemanticFilterOperator>(["=", "!=", ">", ">=", "<", "<=", "in", "like", "is_null"]);

function object(value: JsonValue | undefined, field: string): Record<string, JsonValue | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be an object`);
  return value as Record<string, JsonValue | undefined>;
}

function onlyKeys(value: Record<string, JsonValue | undefined>, allowed: string[], field: string): void {
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) if (!allow.has(key)) throw errors.validation(`${field} contains unsupported key ${key}`);
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
 * Strict parser for model-proposed dashboard requests. The model may choose only a registered
 * dashboard plus declared global filters. Tenant, raw SQL, layout and ad-hoc insight IDs are
 * not accepted input keys.
 */
export function parseSemanticAssistantDashboardProposal(
  registry: SemanticDashboardRegistry,
  value: JsonValue | undefined,
): SemanticAssistantDashboardProposal {
  const body = object(value, "AI dashboard proposal");
  onlyKeys(body, ["dashboard", "filters"], "AI dashboard proposal");
  if (typeof body.dashboard !== "string" || !STABLE_ID.test(body.dashboard)) throw errors.validation("AI dashboard proposal.dashboard is invalid");
  registry.get(body.dashboard);

  const filters: SemanticDashboardFilterInput[] = [];
  if (body.filters !== undefined) {
    if (!Array.isArray(body.filters) || body.filters.length > 20) throw errors.validation("AI dashboard proposal.filters must contain at most 20 entries");
    for (const [index, raw] of body.filters.entries()) {
      const row = object(raw, `AI dashboard proposal.filters[${index}]`);
      onlyKeys(row, ["filter", "operator", "value"], `AI dashboard proposal.filters[${index}]`);
      if (typeof row.filter !== "string" || !MEMBER_ID.test(row.filter)) throw errors.validation(`AI dashboard proposal.filters[${index}].filter is invalid`);
      if (typeof row.operator !== "string" || !OPERATORS.has(row.operator as SemanticFilterOperator)) {
        throw errors.validation(`AI dashboard proposal.filters[${index}].operator is invalid`);
      }
      filters.push({
        filter: row.filter,
        operator: row.operator as SemanticFilterOperator,
        ...(row.value !== undefined ? { value: structuredClone(row.value) } : {}),
      });
    }
  }

  const normalized = registry.validateFilters(body.dashboard, filters);
  return { dashboard: body.dashboard, ...(normalized.length > 0 ? { filters: normalized } : {}) };
}

/**
 * Audited AI -> dashboard boundary. The AI never receives authority to assemble arbitrary
 * queries or widgets; it can only select a trusted dashboard contract and its allowlisted
 * filters. Audit intent must be durable before permission checks or data reads begin.
 */
export class SemanticAssistantDashboardTool {
  constructor(
    private readonly registry: SemanticDashboardRegistry,
    private readonly dashboards: SemanticDashboardService,
    private readonly audit: SemanticAiDashboardAuditSink,
  ) {}

  async execute(input: {
    tenantId: string;
    userId: string;
    question: string;
    proposal: JsonValue | undefined;
  }): Promise<SemanticDashboardResult> {
    if (!input.tenantId.trim()) throw errors.validation("tenantId is required");
    if (!input.userId.trim()) throw errors.validation("userId is required");
    const question = input.question.trim();
    if (!question || question.length > 2_000) throw errors.validation("question is required and must be at most 2000 characters");
    const proposal = parseSemanticAssistantDashboardProposal(this.registry, input.proposal);

    const auditId = await this.audit.begin({
      tenantId: input.tenantId,
      userId: input.userId,
      question,
      proposal,
    });

    try {
      const result = await this.dashboards.run(input.tenantId, proposal.dashboard, proposal.filters ?? []);
      await this.audit.finish({
        auditId,
        status: "success",
        widgetCount: result.widgets.length,
        rowCount: result.widgets.reduce((sum, widget) => sum + widget.result.row_count, 0),
      });
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
