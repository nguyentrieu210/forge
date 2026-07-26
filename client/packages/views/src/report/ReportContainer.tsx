/** @jsxImportSource react */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { contextToReportFilters, displayValueKey, type DisplayValueResult } from "@metaforge/core";
import { useMetaForge } from "../container/provider.js";
import { ReportView, type ReportColumn, type ReportViewProps } from "./ReportView.js";

export function ReportContainer({ report, title }: { report: string; title?: string }) {
  const { adapter, scopeKey, businessContext } = useMetaForge();
  const filters = useMemo(() => contextToReportFilters(businessContext), [businessContext]);
  const reportQ = useQuery({
    queryKey: [scopeKey, "report", report, JSON.stringify(filters)],
    queryFn: () => adapter.runReport(report, filters),
    enabled: Boolean(report),
  });
  const columns = (reportQ.data?.columns ?? []) as ReportColumn[];
  const rows = (reportQ.data?.result ?? []) as ReportViewProps["result"];
  const requests = useMemo(() => {
    const out: Array<{ doctype: string; name: string }> = [];
    const seen = new Set<string>();
    columns.forEach((column, columnIndex) => {
      if (column.fieldtype !== "Link" || !column.options) return;
      rows.forEach((row) => {
        const raw = Array.isArray(row) ? row[columnIndex] : row[column.fieldname ?? ""];
        if (raw == null || raw === "") return;
        const name = String(raw);
        const key = displayValueKey(column.options!, name);
        if (!seen.has(key)) { seen.add(key); out.push({ doctype: column.options!, name }); }
      });
    });
    return out;
  }, [columns, rows]);
  const displayQ = useQuery({
    queryKey: [scopeKey, "report-display-values", JSON.stringify(requests)],
    queryFn: () => adapter.resolveDisplayValues(requests),
    enabled: requests.length > 0,
    staleTime: 5 * 60_000,
  });
  const displayValues = useMemo(() => Object.fromEntries((displayQ.data ?? []).map((item: DisplayValueResult) => [displayValueKey(item.doctype, item.name), item.label])), [displayQ.data]);
  return <ReportView
    columns={columns}
    result={rows}
    message={reportQ.data?.message}
    loading={reportQ.isLoading}
    displayValues={displayValues}
    title={title ?? report}
  />;
}
