/** @jsxImportSource react */
/**
 * CalendarView (M07, presentational) — lưới tháng, sự kiện theo field ngày.
 * Data-driven: event = row có dateField; hiện titleField. Điều hướng qua onNavigate.
 * Kéo-thả đổi ngày dùng HTML5 native drag API (không thêm thư viện) — chỉ bật khi có onReschedule.
 * View tuần/ngày = PHA sau.
 */
import { useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, Button, useT } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";

export interface CalendarViewProps {
  year: number;
  month: number; // 1..12
  events: Doc[];
  dateField: string;
  titleField?: string;
  onEventClick?: (row: Doc) => void;
  onNavigate?: (year: number, month: number) => void;
  /** Kéo sự kiện sang ngày khác → cha gọi updateDoc thật. Không cấp = tắt kéo-thả. */
  onReschedule?: (row: Doc, newDateKey: string) => void;
}

const WEEKDAY_KEYS = ["calendar.wd_1", "calendar.wd_2", "calendar.wd_3", "calendar.wd_4", "calendar.wd_5", "calendar.wd_6", "calendar.wd_7"];

function ymd(v: unknown): string {
  if (!v) return "";
  return String(v).slice(0, 10); // "YYYY-MM-DD" từ Date/Datetime
}

export function CalendarView(props: CalendarViewProps) {
  const t = useT();
  const { year, month, events, dateField, onEventClick, onNavigate, onReschedule } = props;
  const titleField = props.titleField ?? "name";
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // gom event theo ngày
  const byDay = new Map<string, Doc[]>();
  for (const e of events) {
    const key = ymd(e[dateField]);
    if (!key) continue;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(e);
  }

  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // T2=0 … CN=6
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, key });
  }

  const prev = () => onNavigate?.(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const next = () => onNavigate?.(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1);

  const onEventDragStart = (e: DragEvent<HTMLDivElement>, row: Doc) => {
    e.dataTransfer.setData("text/plain", String(row.name));
    e.dataTransfer.effectAllowed = "move";
  };
  const onCellDrop = (e: DragEvent<HTMLDivElement>, dayKey: string) => {
    e.preventDefault();
    setDragOverKey(null);
    const name = e.dataTransfer.getData("text/plain");
    const row = events.find((r) => String(r.name) === name);
    if (row && ymd(row[dateField]) !== dayKey) onReschedule?.(row, dayKey);
  };

  return (
    <div className="mf-calendar rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        {onNavigate ? <Button variant="ghost" size="icon-sm" onClick={prev} aria-label={t("calendar.prev_month")}><ChevronLeft /></Button> : <span />}
        <b className="text-sm font-semibold">{`${t("calendar.month_prefix")} ${month}/${year}`}</b>
        {onNavigate ? <Button variant="ghost" size="icon-sm" onClick={next} aria-label={t("calendar.next_month")}><ChevronRight /></Button> : <span />}
      </div>
      <div className="mf-cal-grid grid gap-px bg-border" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
        {WEEKDAY_KEYS.map((k) => (
          <div key={k} className="bg-muted/40 py-1.5 text-center text-xs font-medium text-muted-foreground">{t(k)}</div>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`e${i}`} className="min-h-16 bg-card" />
          ) : (
            <div
              key={cell.key}
              className={cn("min-h-16 space-y-1 bg-card p-1", onReschedule && dragOverKey === cell.key && "bg-primary/5 ring-1 ring-inset ring-primary/40")}
              onDragOver={onReschedule ? (e) => { e.preventDefault(); setDragOverKey(cell.key); } : undefined}
              onDragLeave={onReschedule ? () => setDragOverKey((k) => (k === cell.key ? null : k)) : undefined}
              onDrop={onReschedule ? (e) => onCellDrop(e, cell.key) : undefined}
            >
              <div className="text-xs text-muted-foreground">{cell.day}</div>
              {(byDay.get(cell.key) ?? []).map((e) => (
                <div
                  key={String(e.name)}
                  draggable={Boolean(onReschedule)}
                  onDragStart={onReschedule ? (ev) => onEventDragStart(ev, e) : undefined}
                  className={cn(
                    "mf-calendar-event truncate rounded bg-primary/10 px-1 py-0.5 text-xs text-primary",
                    onEventClick && "cursor-pointer hover:bg-primary/20",
                    onReschedule && "cursor-grab active:cursor-grabbing",
                  )}
                  onClick={onEventClick ? () => onEventClick(e) : undefined}
                  title={String(e[titleField] ?? e.name)}
                >
                  {String(e[titleField] ?? e.name)}
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
