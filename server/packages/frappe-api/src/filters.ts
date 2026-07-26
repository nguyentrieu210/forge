/**
 * Frappe list filters / sort → kernel list request.
 *
 * Frappe accepts the same filter four different ways, and clients use all of
 * them: `[[doctype, field, op, value]]`, `[[field, op, value]]`,
 * `{field: value}` and `{field: [op, value]}`.
 *
 * Unsupported operators are REJECTED, never dropped. A silently ignored filter
 * returns rows the caller did not ask for — a user looking at a filtered list
 * would believe they were seeing a subset while seeing everything.
 */

import { errors } from "../../core/src/index.js";
import type { ListFilter, ListOperator, SortSpec } from "../../document-kernel/src/index.js";
import type { JsonObject, JsonValue } from "../../contracts/src/index.js";

/**
 * Framework field aliases. Frappe names the timestamps `creation`/`modified`;
 * the kernel columns are `created_at`/`modified_at`.
 */
const FIELD_ALIAS: Record<string, string> = {
  creation: "created_at",
  modified: "modified_at",
};

const OPERATOR_ALIAS: Record<string, ListOperator> = {
  "=": "eq",
  "==": "eq",
  "!=": "ne",
  "<>": "ne",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
  like: "like",
  in: "in",
};

/** Operators Frappe supports that the kernel cannot express — rejected explicitly. */
const UNSUPPORTED = new Set(["not like", "not in", "between", "descendants of", "ancestors of", "not descendants of", "not ancestors of", "timespan", "previous", "next"]);

export function toKernelField(field: string): string {
  return FIELD_ALIAS[field] ?? field;
}

/** Reverse alias, for projecting kernel rows back into Frappe field names. */
export function toFrappeField(field: string): string {
  if (field === "created_at") return "creation";
  if (field === "modified_at") return "modified";
  return field;
}

/** Translates any Frappe filter form into kernel filters. */
export function toKernelFilters(raw: JsonValue | undefined, doctype: string): ListFilter[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map((entry) => fromArrayForm(entry, doctype));
  if (typeof raw === "object") return fromObjectForm(raw as JsonObject);
  throw errors.validation("filters must be an array or object");
}

function fromArrayForm(entry: JsonValue, doctype: string): ListFilter {
  if (!Array.isArray(entry)) throw errors.validation("Each filter must be an array or an object entry");
  // A 4-element filter names the doctype first. Cross-doctype filters would need
  // a join the kernel list does not perform, so a foreign doctype is refused
  // rather than quietly applied to the wrong table.
  let parts = entry;
  if (parts.length === 4) {
    const target = parts[0];
    if (typeof target === "string" && target !== doctype) {
      throw errors.validation(`Filters on a related doctype are not supported: ${target}`);
    }
    parts = parts.slice(1);
  }
  if (parts.length === 2) return build(String(parts[0]), "=", parts[1] ?? null);
  if (parts.length === 3) return build(String(parts[0]), String(parts[1]), parts[2] ?? null);
  throw errors.validation("A filter array must hold [field, operator, value]");
}

function fromObjectForm(object: JsonObject): ListFilter[] {
  const filters: ListFilter[] = [];
  for (const [field, value] of Object.entries(object)) {
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
      filters.push(build(field, value[0], value[1] ?? null));
      continue;
    }
    filters.push(build(field, "=", value ?? null));
  }
  return filters;
}

function build(field: string, rawOperator: string, value: JsonValue): ListFilter {
  const operator = rawOperator.trim().toLowerCase();
  if (UNSUPPORTED.has(operator)) throw errors.validation(`Filter operator is not supported: ${rawOperator}`);

  // Frappe's `is` operator: "set" / "not set".
  if (operator === "is") {
    const mode = String(value ?? "").trim().toLowerCase();
    if (mode === "not set") return { field: toKernelField(field), operator: "is_null" };
    if (mode === "set") throw errors.validation('Filter "is set" is not supported; filter on a concrete value instead');
    throw errors.validation(`Filter "is" expects "set" or "not set", received ${String(value)}`);
  }

  const mapped = OPERATOR_ALIAS[operator];
  if (!mapped) throw errors.validation(`Filter operator is not supported: ${rawOperator}`);

  const kernelField = toKernelField(field);
  if (mapped === "in") {
    const values = Array.isArray(value) ? value : String(value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
    if (!values.length) throw errors.validation(`Filter "in" on ${field} requires at least one value`);
    return { field: kernelField, operator: "in", value: values as JsonValue };
  }
  return { field: kernelField, operator: mapped, value: normalizeScalar(value) };
}

/**
 * Frappe sends `docstatus` and other integer fields as strings from a query
 * string. The kernel validates values against each field's declared type, so a
 * numeric-looking string would be rejected as the wrong type.
 */
function normalizeScalar(value: JsonValue): JsonValue {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d{1,15}$/.test(trimmed)) return Number(trimmed);
  }
  return value;
}

/**
 * `order_by` → kernel sort. Accepts `"field desc"`, `"field"`, `"`tab`.field desc"`
 * and a comma-separated list.
 */
export function toKernelSort(orderBy: string | undefined): SortSpec[] {
  if (!orderBy || !orderBy.trim()) return [];
  const specs: SortSpec[] = [];
  for (const clause of orderBy.split(",")) {
    // The backtick-quoted table prefix must be removed BEFORE splitting on
    // whitespace: a doctype name contains spaces (`` `tabSales Order`.modified ``),
    // so a naive whitespace split would take "tabSales" as the field name.
    const unqualified = clause.replace(/`[^`]*`\s*\./g, "").trim();
    const parts = unqualified.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const field = parts[0]!.replace(/`/g, "").split(".").pop() ?? "";
    if (!field) continue;
    const direction = (parts[1] ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    specs.push({ field: toKernelField(field), direction });
  }
  return specs;
}

/**
 * `or_filters` → the kernel's `search` term.
 *
 * The client uses `or_filters` for exactly one purpose: a LIKE across the
 * doctype's search fields (its list search box). The kernel expresses that as
 * `search`, which applies the same OR-of-LIKEs over server-declared search
 * fields — so this is a faithful translation, not an approximation. Anything
 * else in `or_filters` is refused rather than reduced to a search term.
 */
export function toKernelSearch(raw: JsonValue | undefined): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (!Array.isArray(raw)) throw errors.validation("or_filters must be an array");
  const terms = new Set<string>();
  for (const entry of raw) {
    if (!Array.isArray(entry)) throw errors.validation("Each or_filter must be an array");
    const parts = entry.length === 4 ? entry.slice(1) : entry;
    if (parts.length !== 3) throw errors.validation("An or_filter must hold [field, operator, value]");
    if (String(parts[1]).trim().toLowerCase() !== "like") {
      throw errors.validation("or_filters is supported only as a LIKE search across search fields");
    }
    terms.add(String(parts[2] ?? "").replace(/^%+|%+$/g, ""));
  }
  if (terms.size > 1) throw errors.validation("or_filters must search for a single term");
  const [term] = [...terms];
  return term ? term : undefined;
}
