/**
 * useListUrlState — trạng thái nội dung List sống trong URL (reload/back giữ nguyên).
 * Sở thích cột nằm riêng trong column-preferences để được scope theo site + user.
 */
import { useCallback, useMemo } from "react";
import type { DocTypeMeta, FilterOperator } from "@metaforge/core";
import { emptyListState, DEFAULT_PAGE_SIZE, type AdvancedFilterState, type ListState } from "./filters.js";
import { DATE_RANGE_LABELS, resolveDateRange, type DateRangeKey } from "./date-range.js";

export interface UrlStateBridge {
  get(key: string): string | null;
  set(next: Record<string, string | null>): void;
}

const FILTER_OPERATORS = new Set<FilterOperator>(["=", "!=", ">", "<", ">=", "<=", "like", "not like", "in", "not in", "between", "is"]);

function parseAdvancedFilters(raw: string | null, meta: DocTypeMeta): AdvancedFilterState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { mode?: unknown; m?: unknown; rules?: unknown; r?: unknown };
    const mode = (parsed.mode ?? parsed.m) === "any" ? "any" : "all";
    const source = parsed.rules ?? parsed.r;
    if (!Array.isArray(source)) return undefined;
    const allowed = new Set((meta.fields ?? []).map((field) => field.fieldname));
    allowed.add("name"); allowed.add("docstatus"); allowed.add("modified");
    const rules: AdvancedFilterState["rules"] = [];
    for (const row of source) {
      if (!Array.isArray(row) || row.length < 3) continue;
      const field = String(row[0] ?? "");
      const operator = row[1] as FilterOperator;
      if (!allowed.has(field) || !FILTER_OPERATORS.has(operator)) continue;
      rules.push([field, operator, row[2]]);
    }
    return rules.length ? { mode, rules } : undefined;
  } catch {
    return undefined;
  }
}

/** Đọc ListState từ query-string. Filter chuẩn mã hoá f_<field>=value. */
export function readState(bridge: UrlStateBridge, meta: DocTypeMeta): ListState {
  const s = emptyListState();
  s.q = bridge.get("q") ?? "";
  s.sort = bridge.get("sort") ?? "";
  s.page = clampInt(bridge.get("page"), 1, 1);
  s.pageSize = clampInt(bridge.get("plen"), DEFAULT_PAGE_SIZE, 1);
  const sel = bridge.get("sel");
  s.selected = sel ? sel.split(",").filter(Boolean) : [];
  const filters: Record<string, string> = {};
  const routeFilters = bridge.get("filters");
  if (routeFilters) {
    try {
      const parsed = JSON.parse(routeFilters) as Record<string, unknown>;
      const allowed = new Set((meta.fields ?? []).map((field) => field.fieldname));
      allowed.add("name"); allowed.add("docstatus");
      for (const [field, value] of Object.entries(parsed ?? {})) {
        if (!allowed.has(field) || value == null || value === "") continue;
        if (Array.isArray(value) && value.length === 2 && FILTER_OPERATORS.has(value[0] as FilterOperator)) {
          s.routeFilters.push([field, value[0] as FilterOperator, value[1]]);
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          filters[field] = String(value);
        }
      }
    } catch { /* malformed old URL: ignore */ }
  }
  const filterFieldnames = [
    ...(meta.fields ?? []).map((field) => field.fieldname),
    ...(meta.name === "Sales Order" ? ["_approval_status"] : []),
  ];
  for (const fieldname of new Set(filterFieldnames)) {
    const v = bridge.get(`f_${fieldname}`);
    if (v != null && v !== "") filters[fieldname] = v;
  }
  s.filters = filters;
  s.advancedFilters = parseAdvancedFilters(bridge.get("af"), meta);
  // Frappe exposes one OR bucket. `any` owns that bucket, so a stale q parameter must not silently
  // broaden results by joining search clauses into the same OR expression.
  if (s.advancedFilters?.mode === "any") s.q = "";

  const dr = bridge.get("dr");
  if (dr) {
    const [key, field] = dr.split(":");
    if (key && field && DATE_RANGE_LABELS.some((r) => r.key === key)) {
      const { from, to } = resolveDateRange(key as DateRangeKey);
      s.dateRange = { key, field, from, to };
    }
  }
  return s;
}

function clampInt(v: string | null, dflt: number, min: number): number {
  const n = v == null ? dflt : parseInt(v, 10);
  return Number.isFinite(n) && n >= min ? n : dflt;
}

export function useListUrlState(bridge: UrlStateBridge, meta: DocTypeMeta) {
  const state = useMemo(() => readState(bridge, meta), [bridge, meta]);

  const patch = useCallback(
    (p: Partial<ListState>) => {
      const next: Record<string, string | null> = {};
      if ("q" in p) next.q = p.q || null;
      if ("sort" in p) next.sort = p.sort || null;
      if ("page" in p) next.page = p.page && p.page > 1 ? String(p.page) : null;
      if ("pageSize" in p) next.plen = p.pageSize && p.pageSize !== DEFAULT_PAGE_SIZE ? String(p.pageSize) : null;
      if ("selected" in p) next.sel = p.selected && p.selected.length ? p.selected.join(",") : null;
      if ("routeFilters" in p) {
        const obj = Object.fromEntries((p.routeFilters ?? []).map(([field, operator, value]) => [field, [operator, value]]));
        next.filters = Object.keys(obj).length ? JSON.stringify(obj) : null;
      }
      if ("advancedFilters" in p) {
        const advanced = p.advancedFilters;
        next.af = advanced?.rules.length ? JSON.stringify({ m: advanced.mode, r: advanced.rules }) : null;
        if (advanced?.mode === "any") next.q = null;
      }
      if ("dateRange" in p) next.dr = p.dateRange ? `${p.dateRange.key}:${p.dateRange.field}` : null;
      if ("filters" in p) {
        for (const f of meta.fields ?? []) next[`f_${f.fieldname}`] = null;
        if (meta.name === "Sales Order") next.f__approval_status = null;
        for (const [k, v] of Object.entries(p.filters ?? {})) if (v) next[`f_${k}`] = v;
      }
      if (("q" in p || "filters" in p || "routeFilters" in p || "advancedFilters" in p || "dateRange" in p || "sort" in p || "pageSize" in p) && !("page" in p)) next.page = null;
      bridge.set(next);
    },
    [bridge, meta],
  );

  return [state, patch] as const;
}
