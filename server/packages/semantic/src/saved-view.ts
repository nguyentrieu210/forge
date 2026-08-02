import type { JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { SemanticQueryRequest } from "./index.js";
import { parseSemanticQueryBody, type SemanticQueryWithoutTenant } from "./request.js";

export interface SemanticSavedView {
  id: string;
  label: string;
  ownerUserId: string;
  query: SemanticQueryWithoutTenant;
  createdAt: string;
  modifiedAt: string;
}

const ID = /^[a-z][a-z0-9_.-]{0,95}$/;

function text(value: string, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw errors.validation(`${field} is required and must be at most ${max} characters`);
  return value;
}

/**
 * Parses a private saved BI view. Tenant is deliberately not persisted in the artifact;
 * the current trusted tenant is injected when materializing the query.
 */
export function parseSemanticSavedView(value: JsonValue | undefined): SemanticSavedView {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation("saved semantic view must be an object");
  const object = value as Record<string, JsonValue | undefined>;
  const allowed = new Set(["id", "label", "ownerUserId", "query", "createdAt", "modifiedAt"]);
  for (const key of Object.keys(object)) if (!allowed.has(key)) throw errors.validation(`saved semantic view contains unsupported key ${key}`);
  const id = text(object.id as string, "saved semantic view.id", 96);
  if (!ID.test(id)) throw errors.validation("saved semantic view.id must be a stable lowercase id");
  const ownerUserId = text(object.ownerUserId as string, `Saved view ${id} ownerUserId`, 200);
  const createdAt = text(object.createdAt as string, `Saved view ${id} createdAt`, 80);
  const modifiedAt = text(object.modifiedAt as string, `Saved view ${id} modifiedAt`, 80);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(modifiedAt))) throw errors.validation(`Saved view ${id} timestamps must be ISO-like dates`);
  if (Date.parse(modifiedAt) < Date.parse(createdAt)) throw errors.validation(`Saved view ${id} modifiedAt cannot precede createdAt`);
  return {
    id,
    label: text(object.label as string, `Saved view ${id} label`, 160),
    ownerUserId,
    query: parseSemanticQueryBody(object.query, { maxLimit: 2_000, allowOffset: false }),
    createdAt,
    modifiedAt,
  };
}

/**
 * Owner-private contract only. Sharing is intentionally absent until WS15/WS11 provide an
 * explicit permission-sharing model for BI artifacts.
 */
export class SemanticSavedViewRegistry {
  private readonly views = new Map<string, SemanticSavedView>();

  constructor(values: Array<JsonValue | SemanticSavedView>) {
    if (!Array.isArray(values) || values.length > 500) throw errors.validation("saved semantic views must contain at most 500 entries");
    for (const value of values) {
      const parsed = parseSemanticSavedView(value as JsonValue);
      if (this.views.has(parsed.id)) throw errors.validation(`Duplicate saved semantic view ${parsed.id}`);
      this.views.set(parsed.id, parsed);
    }
  }

  list(ownerUserId: string): SemanticSavedView[] {
    text(ownerUserId, "ownerUserId", 200);
    return [...this.views.values()]
      .filter((view) => view.ownerUserId === ownerUserId)
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
      .map((view) => structuredClone(view));
  }

  materialize(input: { id: string; ownerUserId: string; tenantId: string }): SemanticQueryRequest {
    if (!ID.test(input.id)) throw errors.validation("saved view id is invalid");
    text(input.ownerUserId, "ownerUserId", 200);
    text(input.tenantId, "tenantId", 200);
    const view = this.views.get(input.id);
    if (!view || view.ownerUserId !== input.ownerUserId) throw errors.permission("Saved semantic view is not available to this user");
    return { tenant_id: input.tenantId, ...structuredClone(view.query) };
  }
}
