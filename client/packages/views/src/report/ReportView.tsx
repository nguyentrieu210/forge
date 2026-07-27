/** @jsxImportSource react */
/**
 * ReportView (M15, presentational) — render kết quả query_report.run (§7).
 * columns[] + result[] (dict theo fieldname hoặc mảng). UI qua @metaforge/ui Table.
 */
import { useMemo, useState } from "react";
import { Pin, FileSpreadsheet, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { sanitizeHtml, type BoundFormatters } from "@metaforge/core";
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, cn, toast, useT } from "@metaforge/ui";
import { buildCsv, downloadCsv, downloadXlsx, stampedName, type ExportColumn } from "./export.js";
import { useLocaleFormat } from "../container/provider.js";

export interface ReportColumn {
  label?: string;
  fieldname?: string;
  fieldtype?: string;
  width?: number;
  options?: string;
  precision?: number;
}

export interface ReportViewProps {
  columns: ReportColumn[];
  result: Array<Record<string, unknown>> | unknown[][];
  message?: string;
  loading?: boolean;
  /** doctype::name → title resolved for Link columns. */
  displayValues?: Record<string, string>;
  /** tên báo cáo — dùng đặt tên file khi xuất Excel. */
  title?: string;
  onLinkClick?: (doctype: string, name: string) => void;
}

function cellOf(row: Record<string, unknown> | unknown[], col: ReportColumn, idx: number): unknown {
  if (Array.isArray(row)) return row[idx];
  return row[col.fieldname ?? ""];
}

/**
 * Định dạng một ô báo cáo theo fieldtype.
 *
 * Trước đây ReportView render thẳng `String(v)`, nên mọi con số trong MỌI báo cáo hiện ra ở dạng
 * thô: "1234567.89" thay vì "1.234.567,89", và ngày ra "2026-07-25". Bảng số liệu mà không nhóm
 * hàng nghìn thì đọc sai bậc rất dễ — 1.234.567 với 12.345.670 nhìn thoáng gần như nhau.
 */
function formatReportCell(v: unknown, col: ReportColumn, fmt: BoundFormatters): string {
  if (v === null || v === undefined || v === "") return "";
  switch ((col.fieldtype ?? "").toLowerCase()) {
    case "currency": return fmt.currency(v as number, col.precision);
    case "float": return fmt.number(v as number, col.precision);
    case "percent": return `${fmt.number(v as number, col.precision)}%`;
    case "int": return fmt.number(v as number, 0);
    case "date": return fmt.date(String(v));
    case "duration": return fmt.duration(v as number);
    default: return String(v);
  }
}

export function ReportView(props: ReportViewProps) {
  const t = useT();
  const fmt = useLocaleFormat();
  const { columns, result, message, loading } = props;
  // Ghim 1 cột: báo cáo thường rất rộng, cuộn ngang là mất cột định danh (mã phiếu/tên KH) nên
  // không biết đang đọc dòng nào. Ghim = đưa cột đó lên đầu + sticky trái.
  // CHỈ 1 cột: sticky nhiều cột cần biết bề rộng thật của từng cột để tính `left` — số đo đó chỉ có
  // sau khi trình duyệt layout xong, phải đo DOM và tính lại mỗi lần resize; ghim 1 cột ngoài cùng
  // thì left=0 luôn đúng, không cần đo gì.
  const [pinned, setPinned] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const sortedResult = useMemo(() => {
    if (!sort) return result;
    const index = columns.findIndex((column, columnIndex) => (column.fieldname ?? String(columnIndex)) === sort.key);
    if (index < 0) return result;
    const column = columns[index]!;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...result].sort((left, right) => {
      const a = cellOf(left, column, index);
      const b = cellOf(right, column, index);
      const an = Number(a), bn = Number(b);
      const compared = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(a ?? "").localeCompare(String(b ?? ""), "vi", { numeric: true });
      return compared * direction;
    });
  }, [columns, result, sort]);
  if (loading) return <div className="space-y-2 p-4" aria-busy="true"><div className="h-9 animate-pulse rounded bg-muted" /><div className="h-52 animate-pulse rounded bg-muted" /><span className="sr-only">{t("report.running")}</span></div>;
  const numeric = (ft?: string) => ["currency", "float", "int", "percent"].includes((ft ?? "").toLowerCase());

  // Giữ index GỐC theo cột: result có thể là mảng-mảng, cellOf tra theo vị trí — đổi thứ tự hiển thị
  // mà tra theo index mới sẽ đọc nhầm ô.
  const indexed = columns.map((c, i) => ({ col: c, idx: i }));
  const pinnedAt = pinned ? indexed.findIndex((x) => (x.col.fieldname ?? String(x.idx)) === pinned) : -1;
  const ordered = pinnedAt > 0
    ? [indexed[pinnedAt]!, ...indexed.filter((_, i) => i !== pinnedAt)]
    : indexed;
  const keyOf = (x: { col: ReportColumn; idx: number }) => x.col.fieldname ?? String(x.idx);
  const isPinnedCell = (position: number) => pinnedAt > 0 && position === 0;

  return (
    <div className="mf-report rounded-lg border">
      {message ? <div className="border-b p-3 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: sanitizeHtml(message) }} /> : null}

      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {result.length} {t("report.row_count_suffix")}
        </span>
        {/* Xuất từ dữ liệu ĐANG HIỂN THỊ, không gọi lại server: người dùng vừa lọc/ghim cột xong
            thì file tải về phải khớp đúng cái họ đang nhìn. Gọi lại server dễ ra bộ số khác
            (dữ liệu đổi giữa chừng) mà không ai nhận ra. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!result.length}
          onClick={() => {
            const cols = ordered.map((x) => x.col);
            const rows = sortedResult as Array<Record<string, unknown> | unknown[]>;
            const raw = (row: Record<string, unknown> | unknown[], _col: ExportColumn, i: number) =>
              cellOf(row, cols[i] as ReportColumn, ordered[i]?.idx ?? i);
            const text = (row: Record<string, unknown> | unknown[], _col: ExportColumn, i: number) =>
              formatReportCell(cellOf(row, cols[i] as ReportColumn, ordered[i]?.idx ?? i), cols[i] as ReportColumn, fmt);
            const ten = stampedName(props.title || "bao-cao");
            // Rơi về CSV nếu không nạp được SheetJS (mạng đứt giữa chừng, chặn chunk…) — thà file
            // kém đẹp còn hơn bấm xuất mà không có gì xảy ra và người dùng không hiểu vì sao.
            void downloadXlsx(ten, cols, rows, raw, text)
              .then(() => toast.success("Đã xuất file Excel"))
              .catch(() => { downloadCsv(ten, buildCsv(cols, rows, text)); toast.success("Đã xuất file CSV dự phòng"); });
          }}
        >
          <FileSpreadsheet className="mr-1.5 size-3.5" />
          {t("report.export_excel")}
        </Button>
      </div>

      {/*
        `w-max min-w-full` + `unwrapped`:
         - Table mặc định là `w-full`, tức là BỊ ÉP vừa bề ngang khung. Báo cáo kho có 16+ cột nên
           mỗi cột bị bóp còn vài chục pixel, chữ xuống dòng lung tung — nhìn như mất cột, đúng
           như báo cáo "bảng không hiện hết". Cho phép bảng rộng theo nội dung rồi để KHUNG cuộn
           ngang mới là cách đọc được.
         - `unwrapped` vì ở đây đã có sẵn vùng cuộn; không có cờ này thì Table tự bọc thêm một
           `overflow-auto` nữa ⇒ hai thanh cuộn lồng nhau, kéo cái ngoài thì cái trong không nhúc nhích.
      */}
      <div className="overflow-x-auto">
        <Table unwrapped className="w-max min-w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {ordered.map((x, position) => {
                const key = keyOf(x);
                const isPinned = pinned === key;
                return (
                  <TableHead
                    key={key}
                    aria-sort={sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "group/col",
                      numeric(x.col.fieldtype) && "text-right",
                      isPinnedCell(position) && "sticky left-0 z-20 bg-card shadow-[inset_-1px_0_0_var(--border)]",
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-1", numeric(x.col.fieldtype) && "flex-row-reverse")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-1 font-medium"
                        onClick={() => setSort((current) => current?.key === key ? (current.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" })}
                        aria-label={`Sắp xếp theo ${x.col.label ?? x.col.fieldname}`}
                      >
                        {x.col.label ?? x.col.fieldname}
                        {sort?.key === key ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-50" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={cn("size-5 shrink-0 [&_svg]:size-3", isPinned ? "opacity-100 text-primary" : "opacity-0 group-hover/col:opacity-60")}
                        aria-label={isPinned ? t("report.unpin_column") : t("report.pin_column")}
                        title={isPinned ? t("report.unpin_column") : t("report.pin_column")}
                        onClick={() => setPinned((p) => (p === key ? null : key))}
                      >
                        <Pin />
                      </Button>
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sortedResult as Array<Record<string, unknown> | unknown[]>).map((row, ri) => (
              <TableRow key={ri}>
                {ordered.map((x, position) => {
                  const v = cellOf(row, x.col, x.idx);
                  return (
                    <TableCell
                      key={keyOf(x)}
                      // Số liệu báo cáo KHÔNG xuống dòng: một ô "Nhập kho tổng APH" bị bẻ làm 3 dòng
                      // sẽ đẩy cả hàng cao lên và làm mất mạch khi dò theo hàng ngang.
                      className={cn(
                        "whitespace-nowrap",
                        numeric(x.col.fieldtype) && "text-right tabular-nums",
                        isPinnedCell(position) && "sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--border)]",
                      )}
                    >
                      {v === null || v === undefined ? "" : (x.col.fieldtype === "Link" && x.col.options
                        ? <ReportLink doctype={x.col.options} value={String(v)} displayValues={props.displayValues} onClick={props.onLinkClick} />
                        : formatReportCell(v, x.col, fmt))}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {result.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length || 1}>
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReportLink({ doctype, value, displayValues, onClick }: { doctype: string; value: string; displayValues?: Record<string, string>; onClick?: (doctype: string, name: string) => void }) {
  const label = displayValues?.[`${doctype}::${value}`] ?? value;
  const content = <span className="block min-w-0"><span className="block truncate font-medium">{label}</span>{label !== value ? <span className="block truncate text-[11px] text-muted-foreground">{value}</span> : null}</span>;
  return onClick ? <Button type="button" variant="link" className="h-auto max-w-full justify-start p-0 text-left" onClick={() => onClick(doctype, value)}>{content}</Button> : content;
}
