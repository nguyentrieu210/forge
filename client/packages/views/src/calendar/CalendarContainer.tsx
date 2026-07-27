/** @jsxImportSource react */
/**
 * CalendarContainer — nối CalendarView vào backend thật. Kéo-thả đổi ngày → adapter.updateDoc thật.
 *
 * Cửa sổ truy vấn đi theo chế độ đang xem: tháng lấy cả tháng, tuần lấy đúng 7 ngày. Lấy cả
 * tháng khi đang xem tuần thì tải về gấp bốn số bản ghi cần dùng, và trên một lớp học dày
 * lịch thì đó là chênh lệch thật.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast, Button, useT } from "@metaforge/ui";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "../container/provider.js";
import { useMeta, useList } from "../container/hooks.js";
import { CalendarView, mondayOf, type CalendarMode } from "./CalendarView.js";

export interface CalendarContainerProps {
  doctype: string;
  /** Bỏ trống thì suy field Date/Datetime đầu tiên từ metadata. */
  dateField?: string;
  titleField?: string;
  /** Field giờ hiện trên thẻ ở chế độ tuần. Tự suy nếu không truyền. */
  timeField?: string;
  onEventClick?: (row: Doc) => void;
  /** năm/tháng ban đầu — mặc định tháng hiện tại. */
  initialYear?: number;
  initialMonth?: number;
  /** Chế độ mở đầu. Lịch dạy nên mở ở TUẦN; danh mục theo hạn thì tháng hợp hơn. */
  initialMode?: CalendarMode;
}

const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function CalendarContainer(props: CalendarContainerProps) {
  const t = useT();
  const { doctype } = props;
  const now = new Date();
  const [mode, setMode] = useState<CalendarMode>(props.initialMode ?? "month");
  const [year, setYear] = useState(props.initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(props.initialMonth ?? now.getMonth() + 1);
  const [weekStart, setWeekStart] = useState(() => dayKey(mondayOf(now)));
  const { adapter, scopeKey } = useMetaForge();
  const qc = useQueryClient();
  const metaQ = useMeta(doctype);
  const titleField = props.titleField ?? metaQ.data?.title_field;

  /**
   * Field ngày: app chỉ định, hoặc field Date/Datetime đầu tiên.
   *
   * Suy từ KIỂU chứ không từ tên, để một dòng nav `calendar:<DocType>` là đủ cho mọi app.
   * Doctype không có field ngày nào thì nói thẳng ở dưới — vẽ một cái lịch rỗng sẽ khiến
   * người dùng tưởng là chưa có dữ liệu.
   */
  const dateField = props.dateField
    ?? metaQ.data?.fields?.find((field) => field.fieldtype === "Date" || field.fieldtype === "Datetime")?.fieldname
    ?? "";

  /**
   * Field giờ: lấy field Time đầu tiên nếu app không chỉ định.
   *
   * Suy từ KIỂU, không từ tên — đoán theo tên (`start_time`) là đúng cái sai đã khiến ô Link
   * hỏng ở chỗ khác. Doctype không có field Time thì thẻ chỉ hiện tiêu đề, không bịa ra giờ.
   */
  const timeField = props.timeField ?? metaQ.data?.fields?.find((field) => field.fieldtype === "Time")?.fieldname;

  const window = useMemo(() => {
    if (mode === "week") {
      const start = new Date(`${weekStart}T00:00:00`);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: dayKey(start), to: dayKey(end) };
    }
    const last = new Date(year, month, 0);
    return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(last.getDate())}` };
  }, [mode, weekStart, year, month]);

  const fields = useMemo(() => {
    const base = new Set(["name", dateField, "modified"]);
    if (titleField) base.add(titleField);
    if (timeField) base.add(timeField);
    return [...base];
  }, [dateField, titleField, timeField]);

  const listQ = useList(
    doctype,
    {
      fields,
      // Hai điều kiện thay vì `between`: kiểu `FilterOperator` phía client CÓ khai
      // "between", nhưng server trả `Filter operator is not supported: between` — một
      // toán tử được hứa mà không được cài. `>=` và `<=` cho đúng kết quả và chạy được
      // ngay, nên lịch không phải chờ hợp đồng đó được vá.
      filters: [[dateField, ">=", window.from], [dateField, "<=", window.to]],
      pageLength: 500,
    },
    Boolean(metaQ.data) && Boolean(dateField),
  );

  /**
   * Nhãn cho thẻ khi title field lại là một Link.
   *
   * `Class Session` được đặt tên theo `class_group`, mà đó là Link — nên hàng trả về từ
   * `getList` chứa `LOP-2026-0008`, và thẻ lịch in ra cái mã. Danh sách đã giải bằng
   * `resolveDisplayValues`; lịch trước đây đọc thẳng hàng nên bỏ qua bước đó.
   *
   * Gom thành MỘT lời gọi cho cả tuần, không phải mỗi thẻ một lời gọi.
   */
  const titleMeta = metaQ.data?.fields?.find((field) => field.fieldname === titleField);
  const titleLinkDoctype = titleMeta?.fieldtype === "Link" ? titleMeta.options : undefined;
  const displayRequests = useMemo(() => {
    if (!titleLinkDoctype || !titleField) return [];
    const seen = new Set<string>();
    const out: Array<{ doctype: string; name: string }> = [];
    for (const row of listQ.data ?? []) {
      const value = row[titleField];
      if (!value || seen.has(String(value))) continue;
      seen.add(String(value));
      out.push({ doctype: titleLinkDoctype, name: String(value) });
    }
    return out;
  }, [listQ.data, titleField, titleLinkDoctype]);

  const displayQ = useQuery({
    queryKey: [scopeKey, "display-values", "calendar", JSON.stringify(displayRequests)],
    queryFn: () => adapter.resolveDisplayValues(displayRequests),
    enabled: displayRequests.length > 0,
    staleTime: 5 * 60_000,
  });

  const events = useMemo(() => {
    const labels = new Map((displayQ.data ?? []).map((entry) => [entry.name, entry.label]));
    if (!titleField || !labels.size) return listQ.data ?? [];
    // Thay tại chỗ giá trị title bằng nhãn đã giải, để CalendarView không phải biết gì về
    // chuyện Link — nó vẫn chỉ đọc `titleField` như trước.
    return (listQ.data ?? []).map((row) => {
      const resolved = labels.get(String(row[titleField]));
      return resolved ? { ...row, [titleField]: resolved } : row;
    });
  }, [listQ.data, displayQ.data, titleField]);

  const shift = (delta: -1 | 1) => {
    if (mode === "week") {
      const start = new Date(`${weekStart}T00:00:00`);
      start.setDate(start.getDate() + delta * 7);
      setWeekStart(dayKey(start));
      return;
    }
    const next = month + delta;
    setYear(next < 1 ? year - 1 : next > 12 ? year + 1 : year);
    setMonth(next < 1 ? 12 : next > 12 ? 1 : next);
  };

  const onReschedule = async (row: Doc, newDateKey: string) => {
    try {
      await adapter.updateDoc(doctype, String(row.name), { [dateField]: newDateKey }, String(row.modified ?? ""));
      toast.success(t("calendar.rescheduled"));
      void qc.invalidateQueries({ queryKey: [scopeKey, "list", doctype] });
    } catch (e) {
      toast.error(adapter.mapError(e).message);
    }
  };

  if (metaQ.isLoading) return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{t("common.loading")}</div>;
  if (metaQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(metaQ.error).message}</div>;
  if (!dateField) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{doctype} không có trường ngày nào, nên không dựng được lịch.</div>;
  if (listQ.error) return <div className="p-4 text-sm text-destructive" role="alert">{adapter.mapError(listQ.error).message}</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {/* Đổi chế độ là thao tác của người xếp lịch, không phải cấu hình của app — nên nó
            nằm trên màn hình, không nằm trong manifest. */}
        <Button size="sm" variant={mode === "week" ? "default" : "outline"} onClick={() => setMode("week")}>Tuần</Button>
        <Button size="sm" variant={mode === "month" ? "default" : "outline"} onClick={() => setMode("month")}>Tháng</Button>
        {listQ.isLoading ? <span className="ml-2 text-xs text-muted-foreground">{t("common.loading")}</span> : null}
      </div>
      <CalendarView
        mode={mode}
        year={year}
        month={month}
        weekStart={weekStart}
        events={events}
        dateField={dateField}
        titleField={titleField}
        timeField={timeField}
        onEventClick={props.onEventClick}
        onShift={shift}
        onReschedule={onReschedule}
      />
    </div>
  );
}
