/** @jsxImportSource react */
/**
 * CalendarContainer — nối CalendarView vào backend thật (mock demo trước đây là chỗ DUY NHẤT dùng
 * CalendarView, chưa app live nào wiring). Kéo-thả đổi ngày → adapter.updateDoc thật.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast, useT } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "../container/provider.js";
import { useMeta, useList } from "../container/hooks.js";
import { CalendarView } from "./CalendarView.js";

export interface CalendarContainerProps {
  doctype: string;
  dateField: string;
  titleField?: string;
  onEventClick?: (row: Doc) => void;
  /** năm/tháng ban đầu — mặc định tháng hiện tại. */
  initialYear?: number;
  initialMonth?: number;
}

export function CalendarContainer(props: CalendarContainerProps) {
  const t = useT();
  const { doctype, dateField } = props;
  const now = new Date();
  const [year, setYear] = useState(props.initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(props.initialMonth ?? now.getMonth() + 1);
  const { adapter, scopeKey } = useMetaForge();
  const qc = useQueryClient();
  const metaQ = useMeta(doctype);
  const titleField = props.titleField ?? metaQ.data?.title_field;

  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = new Date(year, month, 0);
  const to = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

  const fields = useMemo(() => {
    const base = new Set(["name", dateField, "modified"]);
    if (titleField) base.add(titleField);
    return [...base];
  }, [dateField, titleField]);
  const listQ = useList(
    doctype,
    { fields, filters: { [dateField]: ["between", [from, to]] }, pageLength: 500 },
    Boolean(metaQ.data),
  );

  const onReschedule = async (row: Doc, newDateKey: string) => {
    try {
      await adapter.updateDoc(doctype, String(row.name), { [dateField]: newDateKey }, String(row.modified ?? ""));
      toast.success(t("calendar.rescheduled"));
      void qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype] });
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    }
  };

  if (metaQ.isLoading || listQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (listQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(listQ.error).message}</div>;

  return (
    <CalendarView
      year={year}
      month={month}
      events={listQ.data ?? []}
      dateField={dateField}
      titleField={titleField}
      onEventClick={props.onEventClick}
      onNavigate={(y, m) => { setYear(y); setMonth(m); }}
      onReschedule={onReschedule}
    />
  );
}
