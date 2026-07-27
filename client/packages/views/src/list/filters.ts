/**
 * List query logic — nguồn sự thật cho lọc/tìm/sắp/phân trang.
 *  - deriveStandardFilters: field in_standard_filter=1 (+ status/workflow_state) → UI filter.
 *  - deriveSearchFields: meta.search_fields (fallback title/name + vài Data).
 *  - buildServerQuery: ListState → ListOpts cho adapter.getList (server-side, tập lớn).
 *  - applyClientQuery: lọc/sắp/trang IN-MEMORY cho mock (demo) — cùng ngữ nghĩa server.
 */
import type { DocTypeMeta, DocField, Doc, ListOpts, Fieldtype, FilterOperator } from "@metaforge/core";
import { deriveColumns, isStatusField, type ListColumn } from "./columns.js";

export interface StandardFilter {
  fieldname: string;
  label: string;
  fieldtype: Fieldtype;
  /** cho Select: các lựa chọn (đã tách \n). */
  options?: string[];
  linkDoctype?: string;
}

export interface ListState {
  q: string;
  /** fieldname → giá trị đã chọn từ toolbar ("" = tất cả). */
  filters: Record<string, string>;
  /** Filter có operator từ KPI/Process route; giữ nguyên để list/count khớp nguồn số liệu. */
  routeFilters: Array<[string, FilterOperator, unknown]>;
  /** "field:asc" | "field:desc" | "" (mặc định modified desc). */
  sort: string;
  page: number; // 1-based
  pageSize: number;
  selected: string[];
  /**
   * Khoảng thời gian đang lọc nhanh (hôm nay/tháng này/quý…).
   *
   * Tách riêng khỏi `filters` (một field ↔ một giá trị) vì đây là điều kiện HAI ĐẦU trên cùng một
   * field, và tách khỏi `routeFilters` để người dùng xoá lọc ngày mà không mất luôn bộ lọc do
   * route KPI truyền vào.
   */
  dateRange?: { key: string; field: string; from: string; to: string };
}

export const DEFAULT_PAGE_SIZE = 20;

export function emptyListState(): ListState {
  return { q: "", filters: {}, routeFilters: [], sort: "", page: 1, pageSize: DEFAULT_PAGE_SIZE, selected: [], dateRange: undefined };
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
  if (fromMeta.length) return dedupe(["name", ...fromMeta]);
  const fields = meta.fields ?? [];
  const title = meta.title_field && fields.some((f) => f.fieldname === meta.title_field) ? [meta.title_field] : [];
  const dataish = fields
    .filter((f: DocField) => ["Data", "Small Text", "Link", "Select"].includes(f.fieldtype))
    .slice(0, 3)
    .map((f) => f.fieldname);
  return dedupe(["name", ...title, ...dataish]);
}

function dedupe(a: string[]): string[] {
  return Array.from(new Set(a));
}

/** Field cần nạp từ server (name + cột hiển thị + title + image + status + sort). */
export function queryFields(meta: DocTypeMeta, columns: ListColumn[]): string[] {
  const base = ["name", "modified", "docstatus"];
  const cols = columns.map((c) => c.fieldname);
  const img = meta.image_field ? [meta.image_field] : [];
  return dedupe([...base, ...cols, ...img]);
}

/** ListState → ListOpts (server). Search → orFilters LIKE trên search_fields; filter chuẩn → =. */
export function buildServerQuery(meta: DocTypeMeta, state: ListState, columns: ListColumn[]): ListOpts {
  const filters: Array<[string, FilterOperator, unknown]> = [...state.routeFilters];
  // Phải áp Ở CẢ list lẫn count. Thiếu một bên thì tổng số hiện ra không khớp số dòng đang
  // thấy — người dùng tưởng dữ liệu bị mất.
  if (state.dateRange) filters.push([state.dateRange.field, "between", [state.dateRange.from, state.dateRange.to]]);
  for (const [field, value] of Object.entries(state.filters)) {
    if (value === "" || value == null) continue;
    const sf = deriveStandardFilters(meta).find((f) => f.fieldname === field);
    if (sf && (sf.fieldtype === "Data" || sf.fieldtype === "Small Text")) filters.push([field, "like", `%${value}%`]);
    else filters.push([field, "=", value]);
  }

  let orFilters: Array<[string, "like", string]> | undefined;
  const q = state.q.trim();
  if (q) orFilters = deriveSearchFields(meta).map((f) => [f, "like", `%${q}%`]);

  return {
    fields: queryFields(meta, columns),
    filters: filters.length ? filters : undefined,
    orFilters,
    orderBy: state.sort ? state.sort.replace(":", " ") : "modified desc",
    limitStart: (state.page - 1) * state.pageSize,
    pageLength: state.pageSize,
  };
}

/** Phần `filters` chuẩn (KHÔNG gồm search) của count query. */
export function countFilters(meta: DocTypeMeta, state: ListState): Array<[string, FilterOperator, unknown]> | undefined {
  const filters: Array<[string, FilterOperator, unknown]> = [...state.routeFilters];
  // Phải áp Ở CẢ list lẫn count. Thiếu một bên thì tổng số hiện ra không khớp số dòng đang
  // thấy — người dùng tưởng dữ liệu bị mất.
  if (state.dateRange) filters.push([state.dateRange.field, "between", [state.dateRange.from, state.dateRange.to]]);
  for (const [field, value] of Object.entries(state.filters)) {
    if (value === "" || value == null) continue;
    const sf = deriveStandardFilters(meta).find((f) => f.fieldname === field);
    if (sf && (sf.fieldtype === "Data" || sf.fieldtype === "Small Text")) filters.push([field, "like", `%${value}%`]);
    else filters.push([field, "=", value]);
  }
  return filters.length ? filters : undefined;
}

/**
 * P1-10 — Count query KHỚP danh sách: filters chuẩn + orFilters search (đồng bộ buildServerQuery).
 * Đếm phải áp CÙNG điều kiện tìm kiếm với list ⇒ dùng reportview.get_count (nhận or_filters),
 * KHÔNG bỏ search như get_count cũ (khiến "N bản ghi" lệch số dòng hiển thị).
 */
export function countQuery(
  meta: DocTypeMeta,
  state: ListState,
): { filters?: Array<[string, FilterOperator, unknown]>; orFilters?: Array<[string, "like", string]> } {
  const filters = countFilters(meta, state);
  const q = state.q.trim();
  const orFilters = q ? deriveSearchFields(meta).map((f) => [f, "like", `%${q}%`] as [string, "like", string]) : undefined;
  return { filters, orFilters };
}

/** Mock/demo: lọc + sắp + phân trang in-memory (cùng ngữ nghĩa server). */
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
    if (q) {
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
