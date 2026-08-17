import type { UrlStateBridge } from "../list/useListState.js";

export { resolveBulkRenderPolicy } from "@metaforge/core";
export { buildPrintPath } from "../print/printRoute.js";
export type { UrlStateBridge };

const CREATE_LAYOUT_FIELD_TYPES = new Set([
  "Heading", "Section Break", "Column Break", "HTML", "Tab Break", "Fold", "Button",
]);

interface CreateSurfaceField {
  fieldname: string;
  fieldtype: string;
  surface?: string;
  editMode?: string;
  hidden?: boolean | number;
  read_only?: boolean | number;
}

export interface CreateSurfaceMeta {
  fields?: CreateSurfaceField[];
  viewPolicy?: {
    quickEntry?: {
      enabled?: boolean;
      fields?: string[];
    };
  };
}

export type CreateSurface = "quick" | "full";

function flag(value: unknown): boolean {
  return value === true || value === 1;
}

/**
 * Create surface is fail-safe: a compact form is allowed only when metadata explicitly enables
 * Quick Entry AND that surface covers every editable business field. The old workspace heuristic
 * ("no child table => quick") produced valid-but-incomplete masters because optional configuration
 * fields silently disappeared. Child tables always require the full surface.
 *
 * Existing compilers may still mark required fields as `surface=quick`; the completeness check is
 * deliberately stronger than that legacy inference, so a complex form cannot become compact merely
 * because its three required fields happen to be tagged quick.
 */
export function resolveCreateSurface(
  meta: CreateSurfaceMeta | undefined,
  options: { forceExpanded?: boolean } = {},
): CreateSurface {
  const fields = meta?.fields ?? [];
  if (options.forceExpanded) return "full";
  if (fields.some((field) => field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect")) return "full";

  const quickPolicy = meta?.viewPolicy?.quickEntry;
  if (quickPolicy?.enabled !== true) return "full";

  const quickFields = Array.isArray(quickPolicy.fields)
    ? quickPolicy.fields
    : fields.filter((field) => field.surface === "quick").map((field) => field.fieldname);
  if (!quickFields.length) return "full";

  const quick = new Set(quickFields);
  const editableBusinessFields = fields.filter((field) => (
    !CREATE_LAYOUT_FIELD_TYPES.has(field.fieldtype)
    && field.surface !== "internal"
    && field.editMode !== "hidden"
    && field.editMode !== "readonly"
    && !flag(field.hidden)
    && !flag(field.read_only)
  ));

  return editableBusinessFields.every((field) => quick.has(field.fieldname)) ? "quick" : "full";
}
