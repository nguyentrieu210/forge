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

export type FieldValidationCode =
  | "required"
  | "not_nullable"
  | "too_long"
  | "invalid_select"
  | "integer"
  | "duration"
  | "rating"
  | "phone"
  | "color"
  | "geolocation"
  | "numeric"
  | "check"
  | "date"
  | "datetime"
  | "time"
  | "json"
  | "table"
  | "table_limit"
  | "table_row"
  | "negative";

export interface FieldValidationIssue {
  code: FieldValidationCode;
  limit?: number;
  row?: number;
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** Legacy ownership/default semantics: only scalar missing values count as empty. */
function empty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Required validation also treats an empty child/multiselect collection as missing. */
function requiredEmpty(value: unknown): boolean {
  return empty(value) || (Array.isArray(value) && value.length === 0);
}

const pad = (value: number): string => String(value).padStart(2, "0");
function localDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function localDatetime(now: Date): string {
  return `${localDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
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

  // Frappe has two different fetch_from ownership modes. Ordinary fetch_from is source-owned:
  // once the source Link is chosen it may replace the target and the target becomes locked.
  // fetch_if_empty=1 is the operator-owned variant: auto-fill is only a convenience while blank,
  // so a user value must survive subsequent source refreshes. Preserve-user is still available
  // explicitly for non-Frappe/custom automatic sources.
  const dirtyGuard = field.dirtyGuard
    ?? (valueSource === "link" && editMode === "editable" && field.fetch_if_empty === 1
      ? "preserve_user_value"
      : undefined);

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
  // Desk resolves these pseudo-defaults in the browser's local timezone before sending them.
  // Preserve Frappe/MySQL wire shape instead of emitting UTC ISO (`T...Z`), which can shift dates
  // for +07 users and is not the canonical Datetime string used by the existing create path.
  if (field.default === "Today" && field.fieldtype === "Date") return localDate(now);
  if (field.default === "Now" && field.fieldtype === "Datetime") return localDatetime(now);
  return field.default;
}

/**
 * Mirror the generic server controller's domain-neutral value checks for immediate form feedback.
 * The server remains authoritative; this helper deliberately validates only canonical DocField
 * semantics already enforced by the server and never introduces app/business formulas.
 */
export function validateFieldValue(field: DocField, value: unknown, required = field.reqd === 1): FieldValidationIssue | undefined {
  if (required && requiredEmpty(value)) return { code: "required" };
  if (flag(field.not_nullable) && value === null) return { code: "not_nullable" };
  if (value === undefined || value === null || value === "") return undefined;

  const maxLength = typeof field.length === "number" && Number.isFinite(field.length) && field.length > 0
    ? Math.floor(field.length)
    : undefined;
  const negative = (candidate: unknown) => {
    if (typeof candidate === "number") return Number.isFinite(candidate) && candidate < 0;
    if (typeof candidate === "string" && /^-?\d+(\.\d+)?$/.test(candidate)) return Number(candidate) < 0;
    return false;
  };
  const stringTypes = new Set([
    "Data", "Small Text", "Text", "Long Text", "Code", "Select", "Link", "Dynamic Link",
    "Attach", "Attach Image", "Text Editor", "Markdown Editor", "HTML Editor", "Password",
    "Autocomplete", "Read Only", "Barcode", "Icon", "Image", "Signature",
  ]);

  if (stringTypes.has(field.fieldtype)) {
    if (typeof value !== "string") return { code: field.fieldtype === "Select" ? "invalid_select" : "too_long", ...(maxLength ? { limit: maxLength } : {}) };
    if (maxLength && value.length > maxLength) return { code: "too_long", limit: maxLength };
    if (field.fieldtype === "Select" && field.options) {
      const options = field.options.split("\n").map((entry) => entry.trim()).filter(Boolean);
      if (value && !options.includes(value)) return { code: "invalid_select" };
    }
  } else {
    switch (field.fieldtype) {
      case "Int":
      case "Long Int":
        if (typeof value !== "number" || !Number.isSafeInteger(value)) return { code: "integer" };
        break;
      case "Duration":
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return { code: "duration" };
        break;
      case "Rating":
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return { code: "rating" };
        break;
      case "Phone":
        if (typeof value !== "string" || (value && !/^[+()\-.\s\d]{3,32}$/.test(value))) return { code: "phone" };
        break;
      case "Color":
        if (typeof value !== "string" || (value && !/^#[0-9a-fA-F]{6}$/.test(value))) return { code: "color" };
        break;
      case "Geolocation":
        if (!value || typeof value !== "object" || Array.isArray(value)) return { code: "geolocation" };
        break;
      case "Float":
      case "Currency":
      case "Percent":
        if ((typeof value !== "number" || !Number.isFinite(value)) && (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))) return { code: "numeric" };
        break;
      case "Check":
        if (typeof value !== "boolean" && value !== 0 && value !== 1) return { code: "check" };
        break;
      case "Date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { code: "date" };
        break;
      case "Datetime":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return { code: "datetime" };
        break;
      case "Time":
        if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return { code: "time" };
        break;
      case "JSON":
        if (!value || typeof value !== "object") return { code: "json" };
        break;
      case "Table":
      case "Table MultiSelect":
        if (!Array.isArray(value)) return { code: "table" };
        if (value.length > 1000) return { code: "table_limit", limit: 1000 };
        for (let index = 0; index < value.length; index += 1) {
          const row = value[index];
          if (!row || typeof row !== "object" || Array.isArray(row)) return { code: "table_row", row: index + 1 };
        }
        break;
      default:
        break;
    }
  }

  if (flag(field.non_negative) && negative(value)) return { code: "negative" };
  return undefined;
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
