/**
 * Dashboard serializer (Builder serializer #4) — DashboardModel → Number Card + Dashboard Chart +
 * Dashboard (multi-doc, adapter RIÊNG — không nhồi chung DocType). THUẦN + test. Live round-trip
 * hoãn (Dashboard Chart cần cấu hình nguồn/time-series đầy đủ — ghi KNOWN_GAPS).
 */
import type { DashboardModel } from "./DashboardBuilder.js";

export interface DashboardValidationResult {
  ok: boolean;
  issues: Array<{ severity: "error" | "warning"; code: string; message: string }>;
}

export function validateDashboard(m: DashboardModel): DashboardValidationResult {
  const issues: DashboardValidationResult["issues"] = [];
  const err = (code: string, message: string) => issues.push({ severity: "error", code, message });
  if (!m.name || !String(m.name).trim()) err("name", "Dashboard cần tên");
  if ((m.cards ?? []).length === 0 && (m.charts ?? []).length === 0) issues.push({ severity: "warning", code: "empty", message: "Dashboard chưa có card/chart" });
  for (const c of m.cards ?? []) {
    if (!c.label) err("card_label", "Number Card thiếu label");
    if (!c.document_type) err("card_doctype", `Card "${c.label}" thiếu document_type`);
    if (c.function !== "Count" && !c.aggregate_field) err("card_field", `Card "${c.label}" (${c.function}) cần aggregate_field`);
  }
  for (const c of m.charts ?? []) {
    if (!c.title) err("chart_title", "Chart thiếu title");
    if (!c.document_type) err("chart_doctype", `Chart "${c.title}" thiếu document_type`);
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

export interface NumberCardDoc { doctype: "Number Card"; label: string; document_type: string; function: string; aggregate_function_based_on?: string; type: "Document Type"; }
export interface DashboardChartDoc { doctype: "Dashboard Chart"; chart_name: string; document_type: string; chart_type: string; type: "Count"; }
export interface DashboardDoc { doctype: "Dashboard"; dashboard_name: string; cards: Array<{ card: string }>; charts: Array<{ chart: string }>; }

export interface DashboardPlan {
  numberCards: NumberCardDoc[];
  charts: DashboardChartDoc[];
  dashboard: DashboardDoc;
}

const CHART_TYPE: Record<string, string> = { Bar: "Bar", Line: "Line", Pie: "Pie", Percentage: "Percentage" };

/** serializeDashboard — model → tập doc (thứ tự apply: cards + charts trước, Dashboard link sau). */
export function serializeDashboard(m: DashboardModel): DashboardPlan {
  const numberCards: NumberCardDoc[] = (m.cards ?? []).map((c) => ({
    doctype: "Number Card", label: c.label, document_type: c.document_type,
    function: c.function, ...(c.aggregate_field ? { aggregate_function_based_on: c.aggregate_field } : {}), type: "Document Type",
  }));
  const charts: DashboardChartDoc[] = (m.charts ?? []).map((c) => ({
    doctype: "Dashboard Chart", chart_name: c.title, document_type: c.document_type, chart_type: CHART_TYPE[c.chart_type] ?? "Bar", type: "Count",
  }));
  return {
    numberCards, charts,
    dashboard: { doctype: "Dashboard", dashboard_name: m.name, cards: numberCards.map((c) => ({ card: c.label })), charts: charts.map((c) => ({ chart: c.chart_name })) },
  };
}
