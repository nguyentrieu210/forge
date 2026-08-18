/**
 * List query logic — nguồn sự thật cho lọc/tìm/sắp/phân trang.
 *  - deriveStandardFilters: field in_standard_filter=1 (+ status/workflow_state) → UI filter.
 *  - deriveSearchFields: meta.search_fields (fallback title/name + vài Data).
 *  - buildServerQuery: ListState → ListOpts cho adapter.getList (server-side, tập lớn).
 *  - applyClientQuery: lọc/sắp/trang IN-MEMORY cho mock (demo) — cùng ngữ nghĩa server.
 */
import { buildLinkFilters, type DocTypeMeta, type DocField, type Doc, type ListOpts, type Fieldtype, type FilterOperator, type Filters } from "@metaforge/core";
import { deriveColumns, isStatusField, type ListColumn } from "./columns.js";

export interface StandardFilter {
  fieldname: string;
  label: string;
  fieldtype: Fieldtype;
  options?: string[];
  linkDoctype?: string;
  linkFilters?: Record<string, unknown> | Array<unknown>;
}

export interface AdvancedFilterState {
  /** all = AND with normal filters; any = one OR group (Frappe or_filters). */
  mode: "all" | "any";
  rules: Array<[string, FilterOperator, unknown]>;
}

export interface ListState {
  q: string;
  filters: Record<string, string>;
  routeFilters: Array<[string, FilterOperator, unknown]>;
  /** Operator-aware filters authored from the Advanced Filter dialog and persisted in URL. */
  advancedFilters?: AdvancedFilterState;
  sort: string;
  page: number;
  pageSize: number;
  selected: string[];
  dateRange?: { key: string; field: string; from: string; to: string };
}

export const DEFAULT_PAGE_SIZE = 20;

export function emptyListState(): ListState {
  return { q: "", filters: {}, routeFilters: [], advancedFilters: undefined, sort: "", page: 1, pageSize: DEFAULT_PAGE_SIZE, selected: [], dateRange: undefined };
}

export function deriveStandardFilters(meta: DocTypeMeta): StandardFilter[] {
  const fields = meta.fields ?? [];
  const picked = fields.filter((f) => f.in_standard_filter === 1 || isStatusField(f));
  const seen = new Set<string>();
  const out: StandardFilter[] = [];
  for (const f of picked) {
    if (seen.has(f.fieldname)) continue;
    seen.add(f.fieldname);
    out.push({
      fieldname: f.fieldname,
      label: f.label ?? f.fieldname,
      fieldtype: f.fieldtype,
      options: f.fieldtype === "Select" ? splitOptions(f.options) : undefined,
      linkDoctype: f.fieldtype === "Link" ? f.options : undefined,
      linkFilters: f.fieldtype === "Link" ? buildLinkFilters(f, {}) : undefined,
    });
  }
  return out;
}

function splitOptions(opts?: string): string[] {
  return (opts ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
}

export function deriveSearchFields(meta: DocTypeMeta): string[] {
  const raw = (meta as { search_fields?: string }).search_fields;
  const fromMeta = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const fields = meta.fields ?? [];
  const title = meta.title_field && fields.some((f) => f.fieldname === meta.title_field) ? [meta.title_field] : [];
  const searchable = fields
    .filter((f: DocField) => [
      "Data", "Small Text", "Text", "Long Text", "Code", "Select", "Link", "Dynamic Link",
      "Read Only", "Autocomplete", "Barcode", "Phone", "Color", "Currency", "Float", "Int", "Percent",
    ].includes(f.fieldtype))
    .map((f) => f.fieldname);
  return dedupe(["name", ...title, ...fromMeta, ...searchable]);
}

function dedupe(a: string[]): string[] {
  return Array.from(new Set(a));
}

export function queryFields(meta: DocTypeMeta, columns: ListColumn[]): string[] {
  const base = ["name", "modified", "docstatus"];
  const cols = columns.map((c) => c.fieldname);
  const img = columns.flatMap((column) => column.imageFieldname ? [column.imageFieldname] : []);
  return dedupe([...base, ...cols, ...img]);
}

function baseFilters(meta: DocTypeMeta, state: ListState): Array<[string, FilterOperator, unknown]> {
  const filters: Array<[string, FilterOperator, unknown]> = [...state.routeFilters];
  if (state.dateRange) filters.push([state.dateRange.field, "between", [state.dateRange.from, state.dateRange.to]]);
  for (const [field, value] of Object.entries(state.filters)) {
    if (value === "" || value == null) continue;
    const sf = deriveStandardFilters(meta).find((f) => f.fieldname === field);
    if (sf && (sf.fieldtype === "Data" || sf.fieldtype === "Small Text")) filters.push([field, "like", `%${value}%`]);
    else filters.push([field, "=", value]);
  }
  if (state.advancedFilters?.mode === "all") filters.push(...state.advancedFilters.rules);
  return filters;
}

function serverOrFilters(meta: DocTypeMeta, state: ListState): Filters | undefined {
  if (state.advancedFilters?.mode === "any" && state.advancedFilters.rules.length) {
    return state.advancedFilters.rules;
  }
  const q = state.q.trim();
  return q ? deriveSearchFields(meta).map((f) => [f, "like", `%${q}%`] as [string, "like", string]) : undefined;
}

/** ListState → ListOpts (server). */
export function buildServerQuery(meta: DocTypeMeta, state: ListState, columns: ListColumn[]): ListOpts {
  const filters = baseFilters(meta, state);
  return {
    fields: queryFields(meta, columns),
    filters: filters.length ? filters : undefined,
    orFilters: serverOrFilters(meta, state),
    orderBy: state.sort ? state.sort.replace(":", " ") : "modified desc",
    limitStart: (state.page - 1) * state.pageSize,
    pageLength: state.pageSize,
  };
}

export function countFilters(meta: DocTypeMeta, state: ListState): Array<[string, FilterOperator, unknown]> | undefined {
  const filters = baseFilters(meta, state);
  return filters.length ? filters : undefined;
}

export function countQuery(
  meta: DocTypeMeta,
  state: ListState,
): { filters?: Array<[string, FilterOperator, unknown]>; orFilters?: Filters } {
  return { filters: countFilters(meta, state), orFilters: serverOrFilters(meta, state) };
}

export function applyClientQuery(
  meta: DocTypeMeta,
  allRows: Doc[],
  state: ListState,
): { rows: Doc[]; total: number } {
  const search = deriveSearchFields(meta);
  const q = state.q.trim().toLowerCase();
  let rows = allRows.filter((r) => {
    for (const [field, operator, expected] of state.routeFilters) {
      if (!matchesFilter(r[field], operator, expected)) return false;
    }
    for (const [field, value] of Object.entries(state.filters)) {
      if (value === "" || value == null) continue;
      if (String(r[field] ?? "").toLowerCase() !== value.toLowerCase()) return false;
    }
    if (state.dateRange) {
      const value = String(r[state.dateRange.field] ?? "");
      if (value < state.dateRange.from || value > state.dateRange.to) return false;
    }
    const advanced = state.advancedFilters;
    if (advanced?.rules.length) {
      const matches = advanced.rules.map(([field, operator, expected]) => matchesFilter(r[field], operator, expected));
      if (advanced.mode === "all" ? matches.some((hit) => !hit) : !matches.some(Boolean)) return false;
    }
    if (q && state.advancedFilters?.mode !== "any") {
      const hit = search.some((f) => String(r[f] ?? "").toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  if (state.sort) {
    const [field, dir] = state.sort.split(":");
    const mul = dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => cmp(a[field!], b[field!]) * mul);
  }

  const total = rows.length;
  const start = (state.page - 1) * state.pageSize;
  return { rows: rows.slice(start, start + state.pageSize), total };
}

function cmp(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

export { deriveColumns };

function matchesFilter(actual: unknown, operator: FilterOperator, expected: unknown): boolean {
  const left = actual == null ? "" : actual;
  if (operator === "=") return String(left) === String(expected ?? "");
  if (operator === "!=") return String(left) !== String(expected ?? "");
  if (operator === "like" || operator === "not like") {
    const needle = String(expected ?? "").replace(/^%|%$/g, "").toLowerCase();
    const hit = String(left).toLowerCase().includes(needle);
    return operator === "like" ? hit : !hit;
  }
  if (operator === "in" || operator === "not in") {
    const values = Array.isArray(expected) ? expected.map(String) : String(expected ?? "").split(",").map((v) => v.trim());
    const hit = values.includes(String(left));
    return operator === "in" ? hit : !hit;
  }
  if (operator === "between" && Array.isArray(expected)) {
    return String(left) >= String(expected[0] ?? "") && String(left) <= String(expected[1] ?? "");
  }
  if (operator === ">") return Number(left) > Number(expected);
  if (operator === "<") return Number(left) < Number(expected);
  if (operator === ">=") return String(left) >= String(expected ?? "");
  if (operator === "<=") return String(left) <= String(expected ?? "");
  if (operator === "is") return expected === "set" ? left !== "" : left === "";
  return true;
}
