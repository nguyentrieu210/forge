import type { DocField, DocTypeMeta } from "../types/meta.js";
import { NO_VALUE_FIELDTYPES } from "../types/fieldtype.js";

export type FieldValueSource = NonNullable<DocField["valueSource"]>;
export type FieldEditMode = NonNullable<DocField["editMode"]>;
export type FieldSurface = NonNullable<DocField["surface"]>;
export type FieldValueProvenance = "initial" | "default" | "auto" | "user" | "server";

export interface EffectiveFieldContract {
  valueSource: FieldValueSource;
  editMode: FieldEditMode;
  surface: FieldSurface;
  serverEnforced: boolean;
  dirtyGuard?: "preserve_user_value";
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function empty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Canonical client interpretation of one DocField's ownership/presentation contract.
 *
 * The server/compiler already persists the explicit MetaForge-native keys. Runtime code must
 * consume those keys first and only infer from Frappe-compatible flags for legacy metadata.
 * This helper is deliberately pure so Form, ChildGrid, AppAction and Builder preview cannot
 * invent different precedence rules.
 */
export function resolveFieldContract(field: DocField, workflowField = "workflow_state"): EffectiveFieldContract {
  const layout = NO_VALUE_FIELDTYPES.has(field.fieldtype);
  const valueSource: FieldValueSource = field.valueSource
    ?? (layout
      ? "system"
      : field.fetch_from
        ? "link"
        : field.read_only === 1
          ? (field.fieldname === workflowField ? "workflow" : "formula")
          : field.default !== undefined && field.default !== null
            ? "default"
            : "user");

  const editMode: FieldEditMode = field.editMode
    ?? (field.hidden === 1
      ? "hidden"
      : flag(field.set_only_once)
        ? "set_once"
        : field.read_only === 1 || layout
          ? "readonly"
          : "editable");

  const surface: FieldSurface = field.surface
    ?? (field.hidden === 1 || editMode === "hidden"
      ? "internal"
      : !layout && field.reqd === 1 && editMode !== "readonly"
        ? "quick"
        : "expanded");

  const serverEnforced = field.serverEnforced === true
    || ["system", "workflow", "formula"].includes(valueSource)
    || editMode === "readonly"
    || editMode === "hidden";

  const dirtyGuard = field.dirtyGuard
    ?? (valueSource === "link" && editMode === "editable" ? "preserve_user_value" : undefined);

  return {
    valueSource,
    editMode,
    surface,
    serverEnforced,
    ...(dirtyGuard ? { dirtyGuard } : {}),
  };
}

/** Resolve Frappe-compatible defaults once, through one reusable path. */
export function resolveFieldDefault(field: Pick<DocField, "fieldtype" | "default">, now = new Date()): unknown {
  if (field.default === undefined || field.default === null) return undefined;
  if (field.default === "Today" && field.fieldtype === "Date") return now.toISOString().slice(0, 10);
  if (field.default === "Now" && field.fieldtype === "Datetime") return now.toISOString();
  return field.default;
}

/**
 * Whether an automatic/default/link/projection value may be assigned locally.
 *
 * `dirtyGuard=preserve_user_value` means a user-owned value wins after the operator edits it.
 * Empty cells remain fillable; server reloads are handled by the caller as a new baseline.
 */
export function shouldApplyAutomaticValue(
  field: DocField,
  currentValue: unknown,
  provenance: FieldValueProvenance | undefined,
): boolean {
  const contract = resolveFieldContract(field);
  if (empty(currentValue)) return true;
  if (contract.dirtyGuard === "preserve_user_value" && provenance === "user") return false;
  return provenance !== "user";
}

/**
 * Merge an automatic patch without overwriting protected user edits. Unknown patch keys are
 * ignored so a named projection cannot accidentally create undeclared client fields.
 */
export function mergeAutomaticFieldPatch(
  meta: DocTypeMeta,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  provenance: Partial<Record<string, FieldValueProvenance>> = {},
): Record<string, unknown> {
  const fields = new Map((meta.fields ?? []).map((field) => [field.fieldname, field]));
  const next = { ...current };
  for (const [fieldname, value] of Object.entries(patch)) {
    const field = fields.get(fieldname);
    if (!field || !shouldApplyAutomaticValue(field, current[fieldname], provenance[fieldname])) continue;
    next[fieldname] = value;
  }
  return next;
}

/** Seed defaults for a new document/child row without copying layout/system-only fields. */
export function buildMetadataDefaults(meta: DocTypeMeta, now = new Date()): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of meta.fields ?? []) {
    if (NO_VALUE_FIELDTYPES.has(field.fieldtype)) continue;
    const contract = resolveFieldContract(field);
    if (contract.editMode === "hidden" && contract.valueSource !== "default") continue;
    const value = resolveFieldDefault(field, now);
    if (value !== undefined && value !== null && value !== "") defaults[field.fieldname] = value;
  }
  return defaults;
}

function collectDocReferences(expression: unknown, names: Set<string>): void {
  if (typeof expression !== "string" || !expression.trim()) return;
  const source = expression.trim();
  if (source.startsWith("eval:")) {
    for (const match of source.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(match[1]!);
    return;
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(source)) names.add(source);
}

/**
 * Fields whose value can change another field's visibility, link query, target or fetch_from.
 * Renderers use this list for selective subscriptions instead of watching the whole document.
 */
export function collectMetadataReactiveFields(meta: DocTypeMeta): string[] {
  const names = new Set<string>();
  for (const field of meta.fields ?? []) {
    collectDocReferences(field.depends_on, names);
    collectDocReferences(field.mandatory_depends_on, names);
    collectDocReferences(field.read_only_depends_on, names);
    if (field.fieldtype === "Dynamic Link" && field.options) names.add(field.options);
    if (typeof field.fetch_from === "string") {
      const dot = field.fetch_from.indexOf(".");
      if (dot > 0) names.add(field.fetch_from.slice(0, dot));
    }
    if (typeof field.link_filters === "string") {
      for (const match of field.link_filters.matchAll(/\bdoc\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(match[1]!);
    }
  }
  return [...names];
}

/** True after a set-once field has acquired a real value. */
export function setOnceIsLocked(field: DocField, value: unknown): boolean {
  return resolveFieldContract(field).editMode === "set_once" && !empty(value);
}
