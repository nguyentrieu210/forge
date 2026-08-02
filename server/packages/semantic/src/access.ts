import { errors } from "../../core/src/index.js";
import type {
  SemanticModelRegistry,
  SemanticReadAccessScope,
  SemanticUserPermissionConstraint,
} from "./index.js";
import type { SemanticAccessController, SemanticAccessRequest } from "./service.js";

export interface SemanticReadScopeProvider {
  /** Existing WS11 permission service: action=report. */
  assertReport(tenantId: string, doctype: string): Promise<void>;
  /** Existing MetadataPermissionService.getReadScope for the same actor. */
  getReadScope(tenantId: string, doctype: string): Promise<SemanticReadAccessScope>;
}

function copyConstraint(value: SemanticUserPermissionConstraint, index: number): SemanticUserPermissionConstraint {
  if (!value || typeof value !== "object") throw errors.permission(`Semantic user permission[${index}] is invalid`);
  if (typeof value.allow_doctype !== "string" || !value.allow_doctype.trim() || value.allow_doctype.length > 160) {
    throw errors.permission(`Semantic user permission[${index}] allow_doctype is invalid`);
  }
  if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 20) {
    throw errors.permission(`Semantic user permission[${index}] fields are invalid`);
  }
  if (!Array.isArray(value.allowed_values) || value.allowed_values.length === 0 || value.allowed_values.length > 80) {
    throw errors.permission(`Semantic user permission[${index}] allowed_values are invalid`);
  }
  const fields = value.fields.map((field) => {
    if (typeof field !== "string" || !/^[a-z_][a-z0-9_]*$/.test(field)) throw errors.permission(`Semantic user permission[${index}] field is invalid`);
    return field;
  });
  const allowedValues = value.allowed_values.map((allowed) => {
    if (typeof allowed !== "string" || !allowed || allowed.length > 200) throw errors.permission(`Semantic user permission[${index}] allowed value is invalid`);
    return allowed;
  });
  return { allow_doctype: value.allow_doctype, fields: [...new Set(fields)], allowed_values: [...new Set(allowedValues)] };
}

function validateScope(modelId: string, model: ReturnType<SemanticModelRegistry["get"]>, value: SemanticReadAccessScope): SemanticReadAccessScope {
  if (!value || typeof value !== "object") throw errors.permission(`Semantic read scope for ${modelId} is invalid`);
  if (!["all", "owner", "shared", "owner_or_shared"].includes(value.mode)) throw errors.permission(`Semantic read scope mode for ${modelId} is invalid`);
  if (typeof value.actor_user_id !== "string" || !value.actor_user_id.trim() || value.actor_user_id.length > 200) {
    throw errors.permission(`Semantic read scope actor for ${modelId} is invalid`);
  }
  if (!Array.isArray(value.user_permissions) || value.user_permissions.length > 20) {
    throw errors.permission(`Semantic read scope user permissions for ${modelId} are invalid`);
  }

  if (model.source.kind === "view") {
    if ((value.mode === "owner" || value.mode === "owner_or_shared") && !model.source.access?.ownerField) {
      throw errors.permission(`Semantic model ${modelId} cannot enforce owner-scoped access`);
    }
    if ((value.mode === "shared" || value.mode === "owner_or_shared") && !model.source.access?.nameField) {
      throw errors.permission(`Semantic model ${modelId} cannot enforce shared-record access`);
    }
  }

  const physicalDimensionFields = new Set(model.dimensions.map((dimension) => dimension.field));
  const constraints = value.user_permissions.map((restriction, index) => {
    const copied = copyConstraint(restriction, index);
    if (!copied.fields.some((field) => physicalDimensionFields.has(field))) {
      throw errors.permission(`Semantic model ${modelId} cannot enforce ${copied.allow_doctype} user-permission scope`);
    }
    return copied;
  });
  return {
    mode: value.mode,
    actor_user_id: value.actor_user_id,
    user_permissions: constraints,
  };
}

/**
 * Adapter owned by WS08, built around existing WS11 services rather than changing IAM.
 * Report permission and row scope are fetched for the same model/doctype on every request.
 */
export class ReadScopeSemanticAccessController implements SemanticAccessController {
  constructor(private readonly registry: SemanticModelRegistry, private readonly provider: SemanticReadScopeProvider) {}

  async authorize(request: SemanticAccessRequest): Promise<SemanticReadAccessScope> {
    const model = this.registry.get(request.model);
    if (model.permission.doctype !== request.permission.doctype || model.permission.action !== request.permission.action) {
      throw errors.permission(`Semantic permission contract mismatch for ${request.model}`);
    }
    await this.provider.assertReport(request.tenantId, model.permission.doctype);
    const scope = await this.provider.getReadScope(request.tenantId, model.permission.doctype);
    return validateScope(model.id, model, scope);
  }
}
