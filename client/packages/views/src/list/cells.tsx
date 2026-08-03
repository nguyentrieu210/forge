/** @jsxImportSource react */
/**
 * Cell renderers — format value theo fieldtype (badge trạng thái / check / số / ngày / ảnh).
 * Tách khỏi columns.ts (pure logic) vì cần JSX.
 */
import { Check, Minus } from "lucide-react";
import { formatNumber, type BoundFormatters } from "@metaforge/core";
import { withAppBase } from "@metaforge/core";
import { cn, useT } from "@metaforge/ui";

/** BASE của app (Vite thay lúc build). Node/test không có import.meta.env ⇒ về "/" (app ở gốc). */
const APP_BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
import type { ListColumn } from "./columns.js";

// P1-16: format qua LocaleContext (fmt) khi có — number_format/currency/date_format từ boot
// sysdefaults. Không có fmt (vd render ngoài provider ở demo mock) → fallback default #,###.##.
const NUMBER_FORMAT = "#,###.##";

export function formatValue(value: unknown, col: ListColumn, fmt?: BoundFormatters): string {
  if (value === null || value === undefined || value === "") return "";
  const prec = col.precision != null && col.precision !== "" ? Number(col.precision) : undefined;
  switch (col.fieldtype) {
    case "Currency":
      return (fmt ? fmt.currency(value as number, prec) : formatNumber(value as number, NUMBER_FORMAT, prec)) || String(value);
    case "Float":
      return (fmt ? fmt.number(value as number, prec) : formatNumber(value as number, NUMBER_FORMAT, prec)) || String(value);
    case "Percent":
      return ((fmt ? fmt.number(value as number, prec) : formatNumber(value as number, NUMBER_FORMAT, prec)) || String(value)) + "%";
    case "Int":
      return (fmt ? fmt.number(value as number, 0) : formatNumber(value as number, NUMBER_FORMAT, 0)) || String(value);
    case "Duration":
      return fmt ? fmt.duration(value as number) : String(value);
    case "Date":
      return fmt ? fmt.date(String(value)) : formatDateCell(String(value));
    case "Datetime":
      return formatDateCell(String(value), true); // datetime + giờ: locale date_format cho Datetime = follow-up
    default:
      return String(value);
  }
}

function formatDateCell(v: string, withTime = false): string {
  const d = new Date(v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return v;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const base = `${dd}/${mm}/${d.getFullYear()}`;
  if (!withTime) return base;
  return `${base} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Màu badge theo giá trị trạng thái (heuristic giống Frappe indicator). */
export function statusVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  const v = value.toLowerCase();
  if (/(open|draft|pending|to do|todo|chờ|mở|nháp)/.test(v)) return "secondary";
  if (/(working|in progress|processing|đang|xử lý)/.test(v)) return "default";
  if (/(closed|completed|done|approved|paid|hoàn thành|đóng|duyệt|xong)/.test(v)) return "outline";
  if (/(cancel|rejected|failed|overdue|error|huỷ|hủy|từ chối|lỗi|quá hạn)/.test(v)) return "destructive";
  return "secondary";
}

type Tone = "info" | "warning" | "success" | "destructive" | "subtle";
// Bản *-text đạt WCAG AA; --info/--warning/--success thô chỉ ~3:1 trên nền card sáng mà đây là
// chữ 12.5px (cột trạng thái của mọi danh sách).
const TONE_CLS: Record<Tone, string> = {
  info: "border-info/25 bg-info/10 text-info-text",
  warning: "border-warning/30 bg-warning/12 text-warning-text",
  success: "border-success/25 bg-success/10 text-success-text",
  destructive: "border-destructive/25 bg-destructive/10 text-destructive-text",
  subtle: "border-border bg-muted text-subtle",
};

/** scMap prototype: Đang làm=blue · Chờ duyệt=amber · Hoàn thành=green · Quá hạn/Huỷ=red · Mở/Nháp=subtle. */
export function statusTone(value: string): Tone {
  const v = value.toLowerCase();
  if (/(working|in progress|processing|đang|xử lý|transit|chuyển)/.test(v)) return "info";
  if (/(pending|chờ|quarantine|review|kiểm)/.test(v)) return "warning";
  if (/(closed|completed|done|approved|paid|received|hoàn thành|đóng|duyệt|xong|đã nhận)/.test(v)) return "success";
  if (/(cancel|rejected|failed|overdue|error|hold|huỷ|hủy|từ chối|lỗi|quá hạn|giữ|discrepancy|lệch)/.test(v)) return "destructive";
  return "subtle";
}

/** Run3 desktop list: status = dot 6px + chữ màu semantic (KHÔNG badge nền). */
export function StatusBadge({ value, optionLabels }: { value: string; optionLabels?: Record<string, string> }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  // Màu sắc suy từ giá trị GỐC (statusTone khớp theo chuỗi tiếng Anh: Draft/Submitted/Cancelled…),
  // còn chữ hiện ra thì lấy bản dịch. Đảo lại sẽ mất màu trạng thái khi đổi sang tiếng Việt.
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-none shadow-[inset_0_1px_0_rgb(255_255_255_/_0.32)]", TONE_CLS[statusTone(value)])}>
      <span className="size-1.5 shrink-0 rounded-full bg-current shadow-[0_0_0_2px_rgb(255_255_255_/_0.48)]" />
      {optionLabels?.[value] ?? value}
    </span>
  );
}

// Component riêng (không phải nhánh JSX trong renderCell) để useT() chạy đúng thứ tự hook —
// renderCell là hàm thường, gọi trong .map nên KHÔNG được chứa hook.
function CheckCell({ checked }: { checked: boolean }) {
  const t = useT();
  return checked ? (
    <Check className="mx-auto size-4 text-primary" aria-label={t("cell.yes")} />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label={t("cell.no")} />
  );
}

/** Render 1 cell (không gồm cột tiêu đề — cột đó ListView tự dựng link+avatar). */
export function renderCell(value: unknown, col: ListColumn, fmt?: BoundFormatters) {
  if (col.isStatus) return <StatusBadge value={value == null ? "" : String(value)} optionLabels={col.optionLabels} />;
  if (col.fieldtype === "Check") return <CheckCell checked={Boolean(value)} />;
  // Select: ô lưu giá trị GỐC tiếng Anh ("Material Transfer"); đổi sang nhãn đã dịch KHI HIỆN,
  // không đụng tới giá trị. Đây là lý do danh sách trước đây vẫn đầy chữ Anh dù form đã dịch.
  if (col.fieldtype === "Select" && value != null && col.optionLabels) {
    const label = col.optionLabels[String(value)];
    if (label) return <span>{label}</span>;
  }
  const text = formatValue(value, col, fmt);
  if (text === "") return <span className="text-muted-foreground/60">—</span>;
  return <span className={cn(col.align === "right" && "tabular-nums")}>{text}</span>;
}

/** Avatar ảnh cho cột tiêu đề (nếu doctype có image_field). */
export function RowAvatar({ src, alt }: { src?: string; alt: string }) {
  const initial = (alt || "?").trim().charAt(0).toUpperCase();
  // Frappe trả file_url tính từ GỐC SITE ("/files/x.jpg"), còn app chạy dưới "/kho/" — dùng thẳng
  // là trình duyệt gọi ra ngoài phạm vi app và nhận 404, ảnh không bao giờ hiện.
  src = src ? withAppBase(src, APP_BASE) : src;
  if (src) {
    // ảnh động → allowlist inline (kích thước cố định); không phải "browser default"
    return <img src={src} alt={alt} className="size-8 shrink-0 rounded-lg border border-border/80 object-cover shadow-sm" />;
  }
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border/80 bg-muted text-xs font-semibold text-muted-foreground shadow-sm">
      {initial}
    </span>
  );
}
