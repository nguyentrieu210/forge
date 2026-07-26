/**
 * useListUrlState — trạng thái List sống trong URL (reload/back giữ nguyên) + cột ẩn ở localStorage.
 * AC#4/#7: q/filters/sort/page/pageSize/selected qua query-string. Router-agnostic:
 * nhận [searchParams, setSearchParams] (react-router) để package không phụ thuộc cứng router.
 */
import { useCallback, useMemo } from "react";
import type { DocTypeMeta, FilterOperator } from "@metaforge/core";
import { emptyListState, DEFAULT_PAGE_SIZE, type ListState } from "./filters.js";
import { DATE_RANGE_LABELS, resolveDateRange, type DateRangeKey } from "./date-range.js";

export interface UrlStateBridge {
  get(key: string): string | null;
  set(next: Record<string, string | null>): void;
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
  // KPI/Process routes có thể truyền `filters=<json object>`; chuẩn hoá về cùng ListState
  // để click KPI mở ĐÚNG danh sách đã lọc, không chỉ đổi URL rồi bỏ qua điều kiện.
  const routeFilters = bridge.get("filters");
  if (routeFilters) {
    try {
      const parsed = JSON.parse(routeFilters) as Record<string, unknown>;
      const allowed = new Set((meta.fields ?? []).map((field) => field.fieldname));
      allowed.add("name"); allowed.add("docstatus");
      const operators = new Set<FilterOperator>(["=", "!=", ">", "<", ">=", "<=", "like", "not like", "in", "not in", "between", "is"]);
      for (const [field, value] of Object.entries(parsed ?? {})) {
        if (!allowed.has(field) || value == null || value === "") continue;
        if (Array.isArray(value) && value.length === 2 && operators.has(value[0] as FilterOperator)) {
          s.routeFilters.push([field, value[0] as FilterOperator, value[1]]);
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          // Primitive route filters remain editable through the normal toolbar.
          filters[field] = String(value);
        }
      }
    } catch { /* URL cũ/sai JSON: bỏ qua, không làm crash list */ }
  }
  for (const f of meta.fields ?? []) {
    const v = bridge.get(`f_${f.fieldname}`);
    if (v != null && v !== "") filters[f.fieldname] = v;
  }
  s.filters = filters;

  /**
   * Khoảng thời gian: lưu KHOÁ (`this_month`) chứ không lưu hai mốc ngày, rồi tính lại lúc đọc.
   *
   * Lưu sẵn from/to thì một URL đánh dấu "tháng này" sang tháng sau vẫn trỏ vào tháng cũ — người
   * dùng mở lại thấy số liệu đứng yên và tưởng hệ thống hỏng. Lưu khoá thì "tháng này" luôn là
   * tháng hiện tại.
   */
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
      if ("dateRange" in p) {
        next.dr = p.dateRange ? `${p.dateRange.key}:${p.dateRange.field}` : null;
      }
      if ("filters" in p) {
        // xoá mọi f_* cũ rồi set lại từ p.filters
        for (const f of meta.fields ?? []) next[`f_${f.fieldname}`] = null;
        for (const [k, v] of Object.entries(p.filters ?? {})) if (v) next[`f_${k}`] = v;
      }
      // đổi filter/search/sort/pageSize → về trang 1 (trừ khi chính p.page được set)
      if (("q" in p || "filters" in p || "routeFilters" in p || "dateRange" in p || "sort" in p || "pageSize" in p) && !("page" in p)) next.page = null;
      bridge.set(next);
    },
    [bridge, meta],
  );

  return [state, patch] as const;
}

// ── Cột ẩn (localStorage per doctype) ─────────────────────────────────────────
const COL_KEY = (dt: string) => `metaforge:cols:${dt}`;

export function loadHiddenCols(doctype: string): string[] {
  try {
    const raw = localStorage.getItem(COL_KEY(doctype));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveHiddenCols(doctype: string, hidden: string[]): void {
  try {
    localStorage.setItem(COL_KEY(doctype), JSON.stringify(hidden));
  } catch {
    /* private mode — bỏ qua */
  }
}
