/** Bộ lọc đã lưu — đặt tên 1 tổ hợp tìm/lọc/sắp xếp rồi áp lại sau (client-only, localStorage, theo
 * từng doctype). KHÔNG dùng doctype "Filter" chuẩn của Frappe — field/schema doctype đó cần xác nhận
 * LIVE trên từng site cụ thể mới chắc đúng tên field, tránh đoán sai khi không kiểm tra được. */
import type { ListState } from "./filters.js";

const PREFIX = "mf-saved-filter:";

export interface SavedFilterPreset {
  name: string;
  q: string;
  filters: Record<string, string>;
  routeFilters: ListState["routeFilters"];
  sort: string;
  dateRange?: ListState["dateRange"];
}

export function loadSavedFilters(doctype: string): SavedFilterPreset[] {
  try {
    const raw = localStorage.getItem(PREFIX + doctype);
    return raw ? (JSON.parse(raw) as SavedFilterPreset[]) : [];
  } catch {
    return [];
  }
}

export function saveFilterPreset(doctype: string, name: string, state: Pick<ListState, "q" | "filters" | "routeFilters" | "sort" | "dateRange">): void {
  try {
    const list = loadSavedFilters(doctype).filter((p) => p.name !== name);
    list.push({ name, q: state.q, filters: state.filters, routeFilters: state.routeFilters, sort: state.sort, dateRange: state.dateRange });
    localStorage.setItem(PREFIX + doctype, JSON.stringify(list));
  } catch { /* private mode — bỏ qua, không phá list */ }
}

export function deleteFilterPreset(doctype: string, name: string): void {
  try {
    localStorage.setItem(PREFIX + doctype, JSON.stringify(loadSavedFilters(doctype).filter((p) => p.name !== name)));
  } catch { /* ignore */ }
}
