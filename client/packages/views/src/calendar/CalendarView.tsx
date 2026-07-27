/** @jsxImportSource react */
/**
 * CalendarView (presentational) — lưới THÁNG hoặc TUẦN, sự kiện theo field ngày.
 *
 * Data-driven: event = row có dateField; hiện titleField. Kéo-thả đổi ngày dùng HTML5 native
 * drag API (không thêm thư viện) — chỉ bật khi có onReschedule.
 *
 * Chế độ tuần thêm sau vì lưới tháng không dùng được cho lịch dạy: một ô ngày trong lưới tháng
 * cao chừng 4rem, mà một trung tâm có 3–6 buổi mỗi ngày, nên buổi học bị cắt mất. Tuần cho mỗi
 * ngày một cột cao hết màn hình, và thêm được GIỜ vào từng thẻ — thứ mà xếp lịch cần đến.
 */
import { useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, Button, Input, useT } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";

export type CalendarMode = "month" | "week";

export interface CalendarViewProps {
  year: number;
  month: number; // 1..12
  events: Doc[];
  dateField: string;
  titleField?: string;
  /** Mặc định "month" — giữ nguyên hành vi cho chỗ đã dùng trước khi có chế độ tuần. */
  mode?: CalendarMode;
  /** Thứ Hai của tuần đang xem (YYYY-MM-DD). Bắt buộc khi mode="week". */
  weekStart?: string;
  /** Field giờ hiển thị trên thẻ ở chế độ tuần (vd "start_time"). */
  timeField?: string;
  onEventClick?: (row: Doc) => void;
  /** Điều hướng THÁNG (giữ cho tương thích ngược). */
  onNavigate?: (year: number, month: number) => void;
  /** Lùi/tiến một đơn vị (tháng hoặc tuần) — dùng chung cho cả hai chế độ. */
  onShift?: (delta: -1 | 1) => void;
  /** Kéo sự kiện sang ngày khác → cha gọi updateDoc thật. Không cấp = tắt kéo-thả. */
  onReschedule?: (row: Doc, newDateKey: string) => void;
}

const WEEKDAY_KEYS = ["calendar.wd_1", "calendar.wd_2", "calendar.wd_3", "calendar.wd_4", "calendar.wd_5", "calendar.wd_6", "calendar.wd_7"];

function ymd(v: unknown): string {
  if (!v) return "";
  return String(v).slice(0, 10); // "YYYY-MM-DD" từ Date/Datetime
}

/** "18:00:00" → "18:00". Chuỗi rỗng/không nhận ra thì bỏ, không đoán. */
function hhmm(v: unknown): string {
  const raw = String(v ?? "");
  const match = /(\d{1,2}):(\d{2})/.exec(raw);
  const hours = match?.[1];
  const minutes = match?.[2];
  return hours && minutes ? `${hours.padStart(2, "0")}:${minutes}` : "";
}

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Thứ Hai của tuần chứa `date`. Tuần bắt đầu từ T2, khớp cột tiêu đề. */
export function mondayOf(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  result.setHours(0, 0, 0, 0);
  return result;
}

export function CalendarView(props: CalendarViewProps) {
  const t = useT();
  const { year, month, events, dateField, onEventClick, onNavigate, onShift, onReschedule } = props;
  const mode: CalendarMode = props.mode ?? "month";
  const titleField = props.titleField ?? "name";
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // gom event theo ngày
  const byDay = new Map<string, Doc[]>();
  for (const e of events) {
    const key = ymd(e[dateField]);
    if (!key) continue;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(e);
  }
  // Trong một ngày, xếp theo GIỜ. Không sắp thì thứ tự là thứ tự trả về của server, và một
  // cột lịch đọc từ trên xuống mà giờ nhảy lung tung thì không dùng để xếp lịch được.
  const timeField = props.timeField;
  if (timeField) {
    for (const list of byDay.values()) list.sort((a, b) => hhmm(a[timeField]).localeCompare(hhmm(b[timeField])));
  }

  let cells: Array<{ day: number; key: string; label?: string } | null>;
  let heading: string;

  if (mode === "week") {
    const start = props.weekStart ? new Date(`${props.weekStart}T00:00:00`) : mondayOf(new Date());
    cells = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return { day: date.getDate(), key: dayKey(date), label: `${date.getDate()}/${date.getMonth() + 1}` };
    });
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    heading = `${start.getDate()}/${start.getMonth() + 1} – ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
  } else {
    const first = new Date(year, month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7; // T2=0 … CN=6
    const daysInMonth = new Date(year, month, 0).getDate();
    cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, key: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
    heading = `${t("calendar.month_prefix")} ${month}/${year}`;
  }

  const shift = (delta: -1 | 1) => {
    if (onShift) { onShift(delta); return; }
    // Không có onShift thì rơi về điều hướng tháng cũ, để chỗ dùng trước đây không đổi.
    if (!onNavigate) return;
    const next = month + delta;
    onNavigate(next < 1 ? year - 1 : next > 12 ? year + 1 : year, next < 1 ? 12 : next > 12 ? 1 : next);
  };
  const canShift = Boolean(onShift ?? onNavigate);

  const onEventDragStart = (e: DragEvent<HTMLDivElement>, row: Doc) => {
    e.dataTransfer.setData("text/plain", String(row.name));
    e.dataTransfer.effectAllowed = "move";
  };
  const onCellDrop = (e: DragEvent<HTMLDivElement>, key: string) => {
    e.preventDefault();
    setDragOverKey(null);
    const name = e.dataTransfer.getData("text/plain");
    const row = events.find((r) => String(r.name) === name);
    if (row && ymd(row[dateField]) !== key) onReschedule?.(row, key);
  };

  const today = dayKey(new Date());

  return (
    <div className="mf-calendar rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        {canShift ? <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label={mode === "week" ? "Tuần trước" : t("calendar.prev_month")}><ChevronLeft /></Button> : <span />}
        <b className="text-sm font-semibold">{heading}</b>
        {canShift ? <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label={mode === "week" ? "Tuần sau" : t("calendar.next_month")}><ChevronRight /></Button> : <span />}
      </div>
      <div className="mf-calendar-agenda divide-y md:hidden">
        {cells.map((cell) => {
          if (!cell) return null;
          const dayEvents = byDay.get(cell.key) ?? [];
          if (!dayEvents.length) return null;
          return <section key={cell.key} className="p-3" aria-labelledby={`mf-day-${cell.key}`}>
            <h3 id={`mf-day-${cell.key}`} className={cn("mb-2 text-sm font-semibold", cell.key === today && "text-primary")}>{cell.label ?? `${cell.day}/${month}`} {cell.key === today ? "· Hôm nay" : ""}</h3>
            <div className="space-y-2">{dayEvents.map((event) => {
              const time = timeField ? hhmm(event[timeField]) : "";
              const eventTitle = String(event[titleField] ?? event.name);
              return <div key={String(event.name)} className="mf-calendar-event flex items-center gap-2 p-2">
                <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-normal" onClick={onEventClick ? () => onEventClick(event) : undefined} disabled={!onEventClick}>
                  {time ? <span className="mr-2 font-semibold tabular-nums">{time}</span> : null}<span>{eventTitle}</span>
                </Button>
                {onReschedule ? <Input type="date" className="h-11 w-auto px-2 text-xs" value={cell.key} aria-label={`Đổi ngày cho ${eventTitle}`} onChange={(e) => { if (e.target.value && e.target.value !== cell.key) onReschedule(event, e.target.value); }} /> : null}
              </div>;
            })}</div>
          </section>;
        })}
        {events.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Không có lịch trong khoảng này</div> : null}
      </div>
      <div className="mf-cal-grid grid gap-px bg-border max-md:hidden" style={{ gridTemplateColumns: "repeat(7,1fr)" }} role="group" aria-label={heading}>
        {WEEKDAY_KEYS.map((k) => (
          <div key={k} className="bg-muted/40 py-1.5 text-center text-xs font-medium text-muted-foreground">{t(k)}</div>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`e${i}`} className="min-h-16 bg-card" />
          ) : (
            <div
              key={cell.key}
              className={cn(
                "space-y-1 bg-card p-1",
                // Cột tuần cao hơn hẳn: một ngày dạy có nhiều buổi, ô 4rem của lưới tháng
                // sẽ cắt mất phần lớn.
                mode === "week" ? "min-h-[22rem]" : "min-h-16",
                cell.key === today && "bg-primary/[0.04]",
                onReschedule && dragOverKey === cell.key && "bg-primary/5 ring-1 ring-inset ring-primary/40",
              )}
              onDragOver={onReschedule ? (e) => { e.preventDefault(); setDragOverKey(cell.key); } : undefined}
              onDragLeave={onReschedule ? () => setDragOverKey((k) => (k === cell.key ? null : k)) : undefined}
              onDrop={onReschedule ? (e) => onCellDrop(e, cell.key) : undefined}
              role="group"
              aria-label={`${cell.key}, ${(byDay.get(cell.key) ?? []).length} sự kiện`}
            >
              <div className={cn("text-xs text-muted-foreground", cell.key === today && "font-semibold text-primary")}>{cell.label ?? cell.day}</div>
              {(byDay.get(cell.key) ?? []).map((e) => {
                const time = timeField ? hhmm(e[timeField]) : "";
                return (
                  <div
                    key={String(e.name)}
                    draggable={Boolean(onReschedule)}
                    onDragStart={onReschedule ? (ev) => onEventDragStart(ev, e) : undefined}
                    className={cn(
                      "mf-calendar-event rounded bg-primary/10 px-1 py-0.5 text-xs text-primary",
                      mode === "week" ? "space-y-0.5" : "truncate",
                      onEventClick && "cursor-pointer hover:bg-primary/20",
                      onReschedule && "cursor-grab active:cursor-grabbing",
                    )}
                    onClick={onEventClick ? () => onEventClick(e) : undefined}
                    onKeyDown={onEventClick ? (event) => { if (event.key === "Enter") { event.preventDefault(); onEventClick(e); } } : undefined}
                    tabIndex={onEventClick ? 0 : undefined}
                    role={onEventClick ? "button" : undefined}
                    title={`${time ? `${time} · ` : ""}${String(e[titleField] ?? e.name)}`}
                  >
                    {time ? <div className="font-semibold tabular-nums">{time}</div> : null}
                    <div className={mode === "week" ? "line-clamp-2" : "truncate"}>{String(e[titleField] ?? e.name)}</div>
                  </div>
                );
              })}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
