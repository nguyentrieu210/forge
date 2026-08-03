import { errors } from "../../core/src/index.js";
import type { SemanticModelRegistry, SemanticModelSummary } from "./index.js";
import type { SemanticAccessController, SemanticAccessRequest } from "./service.js";

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code.toUpperCase();
  }
  return "";
}

function permissionDenied(error: unknown): boolean {
  const code = errorCode(error);
  return code.includes("PERMISSION") || code.includes("FORBIDDEN") || code === "HTTP_403";
}

/**
 * Catalog discovery follows the SAME permission + row-scope boundary as execution.
 * A model that the actor cannot safely scope is omitted instead of advertised and then
 * returning wider data later.
 */
export class PermissionAwareSemanticCatalogService {
  constructor(private readonly registry: SemanticModelRegistry, private readonly access: SemanticAccessController) {}

  async list(tenantId: string): Promise<SemanticModelSummary[]> {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    const visible: SemanticModelSummary[] = [];
    for (const summary of this.registry.list()) {
      if (await this.allowed(tenantId, summary.id)) visible.push(summary);
    }
    return visible;
  }

  async get(tenantId: string, modelId: string): Promise<SemanticModelSummary> {
    if (!tenantId.trim()) throw errors.validation("tenantId is required");
    const model = this.registry.get(modelId);
    const request: SemanticAccessRequest = { tenantId, model: model.id, permission: model.permission };
    await this.access.authorize(request);
    return this.registry.describe(modelId);
  }

  private async allowed(tenantId: string, modelId: string): Promise<boolean> {
    const model = this.registry.get(modelId);
    try {
      await this.access.authorize({ tenantId, model: model.id, permission: model.permission });
      return true;
    } catch (error) {
      if (permissionDenied(error)) return false;
      throw error;
    }
  }
}
