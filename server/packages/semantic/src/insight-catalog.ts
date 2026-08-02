import { errors } from "../../core/src/index.js";
import type { SemanticModelRegistry } from "./index.js";
import type { SemanticInsightRegistry, SemanticInsightSummary } from "./insights.js";
import type { SemanticAccessController } from "./service.js";

function code(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code.toUpperCase()
    : "";
}

function denied(error: unknown): boolean {
  const value = code(error);
  return value.includes("PERMISSION") || value.includes("FORBIDDEN") || value === "HTTP_403";
}

/**
 * Permission-filtered KPI/chart/pivot/table discovery for dashboard builders and AI.
 * An insight is visible only when the caller may report on its underlying semantic model.
 */
export class PermissionAwareSemanticInsightCatalogService {
  constructor(
    private readonly semantic: SemanticModelRegistry,
    private readonly insights: SemanticInsightRegistry,
    private readonly access: SemanticAccessController,
  ) {}

  async list(tenantId: string): Promise<SemanticInsightSummary[]> {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    const visible: SemanticInsightSummary[] = [];
    for (const insight of this.insights.list()) {
      const model = this.semantic.get(insight.model);
      try {
        await this.access.assert({ tenantId, model: model.id, permission: model.permission });
        visible.push(insight);
      } catch (error) {
        if (denied(error)) continue;
        throw error;
      }
    }
    return visible;
  }
}
