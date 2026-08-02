/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppActionField, DocField, Fieldtype } from "@metaforge/core";
import { Button, Input, Label } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import { ActionScreen as BaseActionScreen, type ActionScreenProps } from "./ActionScreen.js";

const RECEIPT_ACTION = "nhap-nhom-fifo";
const DASHBOARD_METHOD = "alumdoor.purchase.supplier_delivery_dashboard";
const BULK_PREVIEW_METHOD = "alumdoor.purchase.preview_bulk_fifo_receipt";
const BULK_COMMIT_METHOD = "alumdoor.purchase.bulk_fifo_receipt";

type Values = Record<string, unknown>;
type ResultRecord = Record<string, unknown>;
type WorkspaceTab = "overview" | "receive" | "history" | "commercial";
type ReceiptLine = Values & { _key: string };

interface DashboardSummary {
  purchase_order_count: number;
  open_purchase_order_count: number;
  overdue_purchase_order_count: number;
  material_count: number;
  completed_material_count: number;
  unsettled_material_count: number;
  ordered_bars: number;
  received_bars: number;
  remaining_bars: number;
  unapplied_bars: number;
  purchase_value: number;
  receipt_count: number;
}

interface DashboardMaterial extends ResultRecord {
  queue_key: string;
  window_id: string;
  status: string;
  item_code: string;
  material: string;
  ordered_bars: number;
  received_bars: number;
  allocated_bars: number;
  remaining_bars: number;
  unapplied_bars: number;
  tolerance: string;
  oldest_open_po_date: string | null;
  overdue_days: number | null;
  barem_weight_kg: number;
  actual_weight_kg: number | null;
}

interface DashboardOrder extends ResultRecord {
  purchase_order: string;
  transaction_date: string;
  schedule_date: string;
  status: string;
  ordered_bars: number;
  received_bars: number;
  remaining_bars: number;
  receipt_count: number;
  received_percentage: number;
  billed_percentage: number;
  overdue_days: number | null;
  purchase_value: number;
}

interface DashboardReceipt extends ResultRecord {
  purchase_receipt: string;
  posting_at: string;
  supplier_invoice_no: string;
  driver: string;
  purchase_orders: string[];
  line_count: number;
  qty_bar: number;
  barem_weight_kg: number;
  actual_weight_kg: number;
  value: number;
}

interface PriceHistoryRow extends ResultRecord {
  purchase_order: string;
  transaction_date: string;
  item_code: string;
  material: string;
  rate: number;
  previous_rate: number | null;
  change_pct: number | null;
  qty_bar: number;
  theoretical_kg: number;
  amount: number;
}

interface SupplierDashboard extends ResultRecord {
  supplier: string;
  generated_at: string;
  source: "purchase_allocation_ledger" | "submitted_documents_fallback";
  summary: DashboardSummary;
  materials: DashboardMaterial[];
  purchase_orders: DashboardOrder[];
  receipts: DashboardReceipt[];
  price_history: PriceHistoryRow[];
  billing: {
    invoice_count: number;
    invoice_total: number;
    invoice_outstanding_hint: number;
    note: string;
  };
  capabilities: ResultRecord;
}

const FIELD_COPY: Record<string, Pick<AppActionField, "label" | "description">> = {
  supplier: { label: "Nhà cung cấp", description: "Chọn nhà cung cấp cần theo dõi và đang giao hàng." },
  supplier_invoice_no: { label: "Số phiếu giao", description: "Bắt buộc khi nhận nhiều dòng để chống tạo phiếu trùng." },
  driver: { label: "Người giao / lái xe", description: "Có thể bỏ trống." },
  warehouse: { label: "Kho nhận", description: "Kho thực tế đang nhận cả chuyến hàng." },
  item_code: { label: "Mã nhôm", description: "Ví dụ AL71." },
  length_m: { label: "Dài mỗi cây (m)", description: "Ví dụ 7,2. Không phải tổng số mét." },
  qty_bar: { label: "Số cây", description: "Số cây đếm thực tế khi xuống hàng." },
  actual_weight_kg: { label: "Kg cân thực tế", description: "Tổng kg cân thực tế của dòng này." },
  rate: { label: "Đơn giá / kg", description: "Giá mua cho dòng hàng này." },
  color: { label: "Màu", description: "Màu thực tế của nhôm nhận." },
  is_stamped: { label: "Dập chữ", description: "Chọn Có hoặc Không." },
};

const WORKSPACE_FIELDS = ["supplier"] as const;
const RECEIPT_HEADER_FIELDS = ["supplier_invoice_no", "driver", "warehouse"] as const;
const ITEM_FIELDS = ["item_code", "length_m", "qty_bar", "actual_weight_kg", "rate", "color", "is_stamped"] as const;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function friendly(field: AppActionField): AppActionField {
  const copy = FIELD_COPY[field.fieldname];
  return copy ? { ...field, ...copy } : field;
}

function toDocField(field: AppActionField): DocField {
  return {
    fieldname: field.fieldname,
    label: field.label,
    fieldtype: field.fieldtype as Fieldtype,
    ...(field.options ? { options: field.options } : {}),
    ...(field.required ? { reqd: 1 as const } : {}),
    ...(field.default == null ? {} : { default: field.default }),
  };
}

function initialValues(fields: AppActionField[]): Values {
  const values: Values = {};
  for (const field of fields) if (field.default != null) values[field.fieldname] = field.default;
  return values;
}

function empty(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(value: unknown): ResultRecord | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as ResultRecord : undefined;
}

function formatDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("vi-VN");
}

function formatDateTime(value: unknown): string {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString("vi-VN");
}

function statusClass(status: string): string {
  if (/quá hạn|vượt|đảo/i.test(status)) return "text-destructive";
  if (/đã giao đủ|đã đối soát/i.test(status)) return "text-emerald-700 dark:text-emerald-400";
  if (/đang giao|còn phải giao/i.test(status)) return "text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}

function FieldEditor({ field, values, onChange, idPrefix = "supplier-delivery" }: {
  field: AppActionField;
  values: Values;
  onChange: (fieldname: string, value: unknown) => void;
  idPrefix?: string;
}) {
  const { registry, services } = useMetaForge();
  const docField = toDocField(field);
  const Control = registry.resolve(docField.fieldtype);
  const id = `${idPrefix}-${field.fieldname}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {field.label}{field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {Control
        ? <Control
            field={docField}
            value={values[field.fieldname] ?? ""}
            onChange={(next: unknown) => onChange(field.fieldname, next)}
            id={id}
            required={field.required}
            services={services}
            {...(field.fieldtype === "Link" && field.options ? { linkTarget: field.options } : {})}
            docValues={values}
          />
        : <Input id={id} value={String(values[field.fieldname] ?? "")} onChange={(event) => onChange(field.fieldname, event.target.value)} />}
      {field.description ? <p className="text-[11px] leading-4 text-muted-foreground">{field.description}</p> : null}
    </div>
  );
}

function Stat({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${emphasis ? "bg-primary/5" : "bg-background"}`}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function DashboardLoading({ error }: { error?: string }) {
  if (error) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  return <EmptyState>Đang tổng hợp đơn mua, hàng đã nhận và đối soát của nhà cung cấp…</EmptyState>;
}

function MaterialTable({ rows, format }: { rows: DashboardMaterial[]; format: (value: number) => string }) {
  if (!rows.length) return <EmptyState>Nhà cung cấp chưa có nghĩa vụ giao hàng đã ghi sổ.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1180px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Mặt hàng / quy cách</th>
            <th className="px-3 py-2.5 text-right font-medium">Đã đặt</th>
            <th className="px-3 py-2.5 text-right font-medium">Đã nhận</th>
            <th className="px-3 py-2.5 text-right font-medium">Còn phải giao</th>
            <th className="px-3 py-2.5 text-right font-medium">Chưa phân bổ</th>
            <th className="px-3 py-2.5 text-right font-medium">Kg barem</th>
            <th className="px-3 py-2.5 text-right font-medium">Kg thực</th>
            <th className="px-3 py-2.5 text-right font-medium">Dung sai</th>
            <th className="px-3 py-2.5 font-medium">PO mở cũ nhất</th>
            <th className="px-3 py-2.5 font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.queue_key}:${row.window_id}`} className="border-t align-top">
              <td className="px-3 py-2.5 font-medium">{row.material}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.ordered_bars))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.received_bars))}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{format(number(row.remaining_bars))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.unapplied_bars))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.barem_weight_kg))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.actual_weight_kg == null ? "—" : format(number(row.actual_weight_kg))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.tolerance || "—"}</td>
              <td className="px-3 py-2.5">
                <div>{formatDate(row.oldest_open_po_date)}</div>
                {number(row.overdue_days) > 0 ? <div className="text-[11px] text-destructive">{format(number(row.overdue_days))} ngày</div> : null}
              </td>
              <td className={`px-3 py-2.5 font-medium ${statusClass(row.status)}`}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderTable({ rows, onOpen, format, currency }: {
  rows: DashboardOrder[];
  onOpen?: ActionScreenProps["onOpen"];
  format: (value: number) => string;
  currency: (value: number) => string;
}) {
  if (!rows.length) return <EmptyState>Chưa có đơn mua đã ghi sổ.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Đơn mua</th>
            <th className="px-3 py-2.5 font-medium">Ngày đặt</th>
            <th className="px-3 py-2.5 font-medium">Hẹn giao</th>
            <th className="px-3 py-2.5 text-right font-medium">Đặt</th>
            <th className="px-3 py-2.5 text-right font-medium">Nhận</th>
            <th className="px-3 py-2.5 text-right font-medium">Còn</th>
            <th className="px-3 py-2.5 text-right font-medium">% nhận</th>
            <th className="px-3 py-2.5 text-right font-medium">% hóa đơn</th>
            <th className="px-3 py-2.5 text-right font-medium">Giá trị PO</th>
            <th className="px-3 py-2.5 font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.purchase_order} className="border-t">
              <td className="px-3 py-2.5">
                {onOpen
                  ? <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen("Purchase Order", row.purchase_order)}>{row.purchase_order}</Button>
                  : <span className="font-semibold">{row.purchase_order}</span>}
              </td>
              <td className="px-3 py-2.5">{formatDate(row.transaction_date)}</td>
              <td className="px-3 py-2.5">{formatDate(row.schedule_date)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.ordered_bars))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.received_bars))}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{format(number(row.remaining_bars))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.received_percentage))}%</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.billed_percentage))}%</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{currency(number(row.purchase_value))}</td>
              <td className={`px-3 py-2.5 font-medium ${statusClass(row.status)}`}>
                {row.status}
                {number(row.overdue_days) > 0 ? <span className="ml-1 text-[11px]">({format(number(row.overdue_days))} ngày)</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptHistoryTable({ rows, onOpen, format, currency }: {
  rows: DashboardReceipt[];
  onOpen?: ActionScreenProps["onOpen"];
  format: (value: number) => string;
  currency: (value: number) => string;
}) {
  if (!rows.length) return <EmptyState>Chưa có phiếu nhập đã ghi sổ của nhà cung cấp.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Phiếu nhập</th>
            <th className="px-3 py-2.5 font-medium">Ngày nhận</th>
            <th className="px-3 py-2.5 font-medium">Phiếu giao NCC</th>
            <th className="px-3 py-2.5 font-medium">Người giao</th>
            <th className="px-3 py-2.5 text-right font-medium">Dòng</th>
            <th className="px-3 py-2.5 text-right font-medium">Cây</th>
            <th className="px-3 py-2.5 text-right font-medium">Kg barem</th>
            <th className="px-3 py-2.5 text-right font-medium">Kg thực</th>
            <th className="px-3 py-2.5 text-right font-medium">Giá trị</th>
            <th className="px-3 py-2.5 font-medium">PO được trừ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.purchase_receipt} className="border-t align-top">
              <td className="px-3 py-2.5">
                {onOpen
                  ? <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen("Purchase Receipt", row.purchase_receipt)}>{row.purchase_receipt}</Button>
                  : row.purchase_receipt}
              </td>
              <td className="px-3 py-2.5">{formatDateTime(row.posting_at)}</td>
              <td className="px-3 py-2.5">{row.supplier_invoice_no || "—"}</td>
              <td className="px-3 py-2.5">{row.driver || "—"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.line_count))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.qty_bar))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.barem_weight_kg))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.actual_weight_kg))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{currency(number(row.value))}</td>
              <td className="px-3 py-2.5">{row.purchase_orders.length ? row.purchase_orders.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceHistoryTable({ rows, onOpen, format, currency }: {
  rows: PriceHistoryRow[];
  onOpen?: ActionScreenProps["onOpen"];
  format: (value: number) => string;
  currency: (value: number) => string;
}) {
  if (!rows.length) return <EmptyState>Chưa có lịch sử giá từ đơn mua đã ghi sổ.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Ngày</th>
            <th className="px-3 py-2.5 font-medium">Mặt hàng / quy cách</th>
            <th className="px-3 py-2.5 font-medium">PO</th>
            <th className="px-3 py-2.5 text-right font-medium">Giá / kg</th>
            <th className="px-3 py-2.5 text-right font-medium">Giá trước</th>
            <th className="px-3 py-2.5 text-right font-medium">Biến động</th>
            <th className="px-3 py-2.5 text-right font-medium">Cây</th>
            <th className="px-3 py-2.5 text-right font-medium">Kg barem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.purchase_order}-${row.item_code}-${index}`} className="border-t">
              <td className="px-3 py-2.5">{formatDate(row.transaction_date)}</td>
              <td className="px-3 py-2.5 font-medium">{row.material}</td>
              <td className="px-3 py-2.5">
                {onOpen
                  ? <Button variant="link" className="h-auto p-0" onClick={() => onOpen("Purchase Order", row.purchase_order)}>{row.purchase_order}</Button>
                  : row.purchase_order}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{currency(number(row.rate))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.previous_rate == null ? "—" : currency(number(row.previous_rate))}</td>
              <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${number(row.change_pct) > 0 ? "text-destructive" : number(row.change_pct) < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                {row.change_pct == null ? "—" : `${number(row.change_pct) > 0 ? "+" : ""}${format(number(row.change_pct))}%`}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.qty_bar))}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{format(number(row.theoretical_kg))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulkAllocationSummary({ value, committed, onOpen, format }: {
  value: unknown;
  committed: boolean;
  onOpen?: ActionScreenProps["onOpen"];
  format: (value: number) => string;
}) {
  const data = record(value);
  if (!data) return null;
  const summaries = Array.isArray(data.line_summaries) ? data.line_summaries.filter((row) => record(row)) as ResultRecord[] : [];
  const allocations = Array.isArray(data.allocations) ? data.allocations.filter((row) => record(row)) as ResultRecord[] : [];
  const receipt = text(data.purchase_receipt ?? data.name);
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className={`size-2 rounded-full ${committed ? "bg-emerald-500" : "bg-amber-500"}`} />
        <h2 className="text-sm font-semibold">{committed ? "Đã tạo phiếu nhập nháp" : "Kết quả kiểm tra cả chuyến"}</h2>
        {receipt && onOpen ? <Button size="sm" className="ml-auto" onClick={() => onOpen("Purchase Receipt", receipt)}>Mở {receipt}</Button> : null}
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Dòng hàng" value={format(number(data.line_count))} />
        <Stat label="Tổng số cây" value={`${format(number(data.total_qty_bar))} cây`} emphasis />
        <Stat label="Kg barem" value={`${format(number(data.total_barem_weight_kg))} kg`} />
        <Stat label="Kg cân thực" value={`${format(number(data.total_actual_weight_kg))} kg`} />
      </div>
      {summaries.length ? (
        <div className="border-t px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Sau chuyến này từng mã còn phải giao</div>
          <div className="grid gap-2 lg:grid-cols-2">
            {summaries.map((row, index) => (
              <div key={`${row.input_row}-${row.item_code}-${index}`} className="rounded-lg border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">Dòng {format(number(row.input_row))} · {text(row.item_code)}</span>
                  <span className="font-semibold tabular-nums">còn {format(number(row.nominal_remaining_bars))} cây</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {format(number(row.nominal_remaining_meters))} m · lần tiếp theo hợp lệ {format(number(row.minimum_additional_bars_to_settle))}–{format(number(row.maximum_additional_bars_allowed))} cây
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {allocations.length ? (
        <div className="border-t px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Phân bổ vào đơn mua</div>
          <div className="space-y-1.5">
            {allocations.map((row, index) => {
              const order = text(row.purchase_order);
              return (
                <div key={`${order}-${row.input_row}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/15 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Dòng {format(number(row.input_row))}</span>
                  <span className="font-medium">{text(row.item_code)}</span>
                  {order && onOpen ? <Button variant="link" className="h-auto p-0 font-semibold" onClick={() => onOpen("Purchase Order", order)}>{order}</Button> : <span>{order || "—"}</span>}
                  <span className="ml-auto font-semibold tabular-nums">{format(number(row.allocated_bars))} cây</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OverviewTab({ dashboard, loading, error, onOpen }: {
  dashboard?: SupplierDashboard;
  loading: boolean;
  error?: string;
  onOpen?: ActionScreenProps["onOpen"];
}) {
  const { fmt } = useMetaForge();
  if (loading) return <DashboardLoading />;
  if (error) return <DashboardLoading error={error} />;
  if (!dashboard) return <EmptyState>Chọn nhà cung cấp để xem toàn bộ đơn đã đặt, đã giao và còn phải giao.</EmptyState>;
  const summary = dashboard.summary;
  const currency = (value: number) => fmt.currency ? fmt.currency(value) : fmt.number(value);
  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Đơn mua" value={fmt.number(summary.purchase_order_count)} hint={`${fmt.number(summary.open_purchase_order_count)} đơn chưa xong`} />
        <Stat label="Đơn quá hạn" value={fmt.number(summary.overdue_purchase_order_count)} emphasis={summary.overdue_purchase_order_count > 0} />
        <Stat label="Quy cách" value={fmt.number(summary.material_count)} hint={`${fmt.number(summary.completed_material_count)} đã đủ/đối soát`} />
        <Stat label="Đã đặt" value={`${fmt.number(summary.ordered_bars)} cây`} />
        <Stat label="Đã nhận" value={`${fmt.number(summary.received_bars)} cây`} />
        <Stat label="Còn phải giao" value={`${fmt.number(summary.remaining_bars)} cây`} emphasis />
        <Stat label="Đã nhận chưa phân bổ" value={`${fmt.number(summary.unapplied_bars)} cây`} hint="Hàng dư hợp lệ đang chờ nghĩa vụ" />
        <Stat label="Phiếu nhập" value={fmt.number(summary.receipt_count)} />
        <Stat label="Giá trị PO" value={currency(summary.purchase_value)} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Theo từng mặt hàng / quy cách</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Tách đúng mã + chiều dài + màu + dập; không gộp nhầm chỉ vì cùng mã.</p>
          </div>
          <span className="text-[11px] text-muted-foreground">Nguồn: {dashboard.source === "purchase_allocation_ledger" ? "allocation ledger" : "chứng từ đã ghi sổ"}</span>
        </div>
        <MaterialTable rows={dashboard.materials} format={(value) => fmt.number(value)} />
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Tiến độ từng đơn mua</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Ngày đặt, hẹn giao, số lần nhận, % nhận, % hóa đơn và số còn thiếu.</p>
        </div>
        <OrderTable rows={dashboard.purchase_orders} onOpen={onOpen} format={(value) => fmt.number(value)} currency={currency} />
      </section>
    </div>
  );
}

function HistoryTab({ dashboard, loading, error, onOpen }: {
  dashboard?: SupplierDashboard;
  loading: boolean;
  error?: string;
  onOpen?: ActionScreenProps["onOpen"];
}) {
  const { fmt } = useMetaForge();
  if (loading) return <DashboardLoading />;
  if (error) return <DashboardLoading error={error} />;
  if (!dashboard) return <EmptyState>Chọn nhà cung cấp để xem lịch sử nhận hàng và đối soát.</EmptyState>;
  const currency = (value: number) => fmt.currency ? fmt.currency(value) : fmt.number(value);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Lịch sử xe hàng / phiếu nhập</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Một chuyến có thể chạm nhiều PO và nhiều mặt hàng nhưng vẫn chỉ tạo một phiếu nhập.</p>
        </div>
        <ReceiptHistoryTable rows={dashboard.receipts} onOpen={onOpen} format={(value) => fmt.number(value)} currency={currency} />
      </section>
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Trạng thái nghĩa vụ và đối soát</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Đã giao đủ nominal khác với đã đối soát trong dung sai. Hệ thống giữ hai trạng thái riêng.</p>
        </div>
        <MaterialTable rows={dashboard.materials} format={(value) => fmt.number(value)} />
      </section>
    </div>
  );
}

function CommercialTab({ dashboard, loading, error, onOpen }: {
  dashboard?: SupplierDashboard;
  loading: boolean;
  error?: string;
  onOpen?: ActionScreenProps["onOpen"];
}) {
  const { fmt } = useMetaForge();
  if (loading) return <DashboardLoading />;
  if (error) return <DashboardLoading error={error} />;
  if (!dashboard) return <EmptyState>Chọn nhà cung cấp để xem lịch sử giá và tiến độ hóa đơn.</EmptyState>;
  const currency = (value: number) => fmt.currency ? fmt.currency(value) : fmt.number(value);
  return (
    <div className="space-y-4">
      <section className="grid gap-2 sm:grid-cols-3">
        <Stat label="Hóa đơn mua đã ghi sổ" value={fmt.number(number(dashboard.billing.invoice_count))} />
        <Stat label="Tổng trường giá trị hóa đơn" value={currency(number(dashboard.billing.invoice_total))} />
        <Stat label="Outstanding trên hóa đơn" value={currency(number(dashboard.billing.invoice_outstanding_hint))} hint="Chỉ tham khảo; công nợ tiền chính thức đọc Payment Ledger / GL" />
      </section>
      <div className="rounded-xl border bg-muted/15 px-4 py-3 text-xs text-muted-foreground">
        Công nợ giao hàng và công nợ tiền là hai sổ khác nhau. Workspace này dùng PO/Receipt để theo dõi NCC còn phải giao; số phải trả chính thức vẫn lấy từ Payment Ledger / GL.
      </div>
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">Lịch sử giá mua</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Giá theo từng quy cách và ngày PO để nhìn ngay lần tăng/giảm so với lần mua trước.</p>
        </div>
        <PriceHistoryTable rows={dashboard.price_history} onOpen={onOpen} format={(value) => fmt.number(value)} currency={currency} />
      </section>
    </div>
  );
}

function SupplierDeliveryWorkspace({ action, onOpen }: ActionScreenProps) {
  const { adapter, fmt } = useMetaForge();
  const fields = useMemo(() => action.fields.map(friendly), [action.fields]);
  const byName = useMemo(() => new Map(fields.map((field) => [field.fieldname, field])), [fields]);
  const itemFields = useMemo(() => ITEM_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field)), [byName]);
  const workspaceFields = useMemo(() => WORKSPACE_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field)), [byName]);
  const receiptHeaderFields = useMemo(() => RECEIPT_HEADER_FIELDS.map((name) => byName.get(name)).filter((field): field is AppActionField => Boolean(field)), [byName]);

  const [values, setValues] = useState<Values>(() => initialValues(fields));
  const [rows, setRows] = useState<ReceiptLine[]>(() => [{ _key: "line-1", ...initialValues(itemFields) }]);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [dashboard, setDashboard] = useState<SupplierDashboard>();
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);
  const [preview, setPreview] = useState<unknown>();
  const [result, setResult] = useState<unknown>();
  const [receiptError, setReceiptError] = useState<string>();
  const [receiptBusy, setReceiptBusy] = useState<"check" | "create">();

  const supplier = text(values.supplier);

  useEffect(() => {
    if (!supplier) {
      setDashboard(undefined);
      setDashboardError(undefined);
      setDashboardBusy(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setDashboardBusy(true);
      setDashboardError(undefined);
      adapter.callPost<SupplierDashboard>(DASHBOARD_METHOD, { supplier })
        .then((answer) => { if (active) setDashboard(answer); })
        .catch((caught) => { if (active) { setDashboard(undefined); setDashboardError(adapter.mapError(caught).message); } })
        .finally(() => { if (active) setDashboardBusy(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adapter, supplier, refreshToken]);

  const changeHeader = (fieldname: string, value: unknown) => {
    setValues((previous) => ({ ...previous, [fieldname]: value }));
    setPreview(undefined);
    setResult(undefined);
    setReceiptError(undefined);
  };

  const changeRow = (key: string, fieldname: string, value: unknown) => {
    setRows((current) => current.map((row) => row._key === key ? { ...row, [fieldname]: value } : row));
    setPreview(undefined);
    setResult(undefined);
    setReceiptError(undefined);
  };

  const addRow = () => {
    setRows((current) => [...current, { _key: `line-${Date.now()}-${current.length + 1}`, ...initialValues(itemFields) }]);
    setPreview(undefined);
    setResult(undefined);
  };

  const removeRow = (key: string) => {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row._key !== key));
    setPreview(undefined);
    setResult(undefined);
  };

  const requiredErrors = useMemo(() => {
    const errors: string[] = [];
    if (!supplier) errors.push("Nhà cung cấp");
    if (empty(values.warehouse)) errors.push("Kho nhận");
    if (empty(values.supplier_invoice_no)) errors.push("Số phiếu giao");
    const requiredLineFields = itemFields.filter((field) => field.required || ["item_code", "length_m", "qty_bar", "actual_weight_kg", "color", "is_stamped"].includes(field.fieldname));
    rows.forEach((row, index) => {
      for (const field of requiredLineFields) if (empty(row[field.fieldname])) errors.push(`Dòng ${index + 1}: ${field.label}`);
    });
    return errors;
  }, [itemFields, rows, supplier, values.supplier_invoice_no, values.warehouse]);

  const totals = useMemo(() => rows.reduce((acc, row) => {
    acc.bars += number(row.qty_bar);
    acc.meters += number(row.qty_bar) * number(row.length_m);
    acc.actualKg += number(row.actual_weight_kg);
    acc.value += number(row.actual_weight_kg) * number(row.rate);
    return acc;
  }, { bars: 0, meters: 0, actualKg: 0, value: 0 }), [rows]);

  const runReceipt = async (phase: "check" | "create") => {
    if (requiredErrors.length) {
      setReceiptError(`Còn thiếu: ${requiredErrors.slice(0, 6).join(", ")}${requiredErrors.length > 6 ? ` và ${requiredErrors.length - 6} ô khác` : ""}.`);
      return;
    }
    if (phase === "create" && !window.confirm(`Tạo một phiếu nhập nháp cho ${rows.length} dòng hàng của chuyến này?`)) return;
    setReceiptBusy(phase);
    setReceiptError(undefined);
    try {
      const payload = {
        supplier,
        warehouse: values.warehouse,
        supplier_invoice_no: values.supplier_invoice_no,
        driver: values.driver,
        lines: rows.map(({ _key, ...line }) => line),
      };
      const answer = await adapter.callPost<unknown>(phase === "check" ? BULK_PREVIEW_METHOD : BULK_COMMIT_METHOD, payload);
      if (phase === "check") { setPreview(answer); setResult(undefined); }
      else {
        setResult(answer);
        setPreview(undefined);
        setRefreshToken((current) => current + 1);
      }
    } catch (caught) {
      setReceiptError(adapter.mapError(caught).message);
    } finally {
      setReceiptBusy(undefined);
    }
  };

  const tabs: Array<{ key: WorkspaceTab; label: string; hint: string }> = [
    { key: "overview", label: "Tổng quan", hint: "Đã đặt · đã giao · còn nợ" },
    { key: "receive", label: "Nhận hàng", hint: "Một xe · nhiều dòng" },
    { key: "history", label: "Lịch sử & đối soát", hint: "Receipt · trạng thái" },
    { key: "commercial", label: "Giá & hóa đơn", hint: "Biến động giá · billing" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3" data-action-screen={action.name} data-supplier-delivery-workspace>
      <header className="rounded-xl border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Mua hàng</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Theo dõi giao hàng nhà cung cấp</h1>
            <p className="mt-1 text-sm text-muted-foreground">Mở một nhà cung cấp là thấy đơn đã đặt, hàng đã giao, còn phải giao, lịch sử nhận, đối soát và giá mua.</p>
          </div>
          <div className="w-full sm:w-[340px]">
            {workspaceFields.map((field) => <FieldEditor key={field.fieldname} field={field} values={values} onChange={changeHeader} idPrefix="supplier-workspace" />)}
          </div>
        </div>
      </header>

      <nav className="grid gap-1 rounded-xl border bg-card p-1 sm:grid-cols-4" aria-label="Theo dõi giao hàng">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-lg px-3 py-2 text-left transition-colors ${tab === item.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            onClick={() => setTab(item.key)}
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div className={`mt-0.5 text-[10px] ${tab === item.key ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{item.hint}</div>
          </button>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab dashboard={dashboard} loading={dashboardBusy} error={dashboardError} onOpen={onOpen} /> : null}

      {tab === "receive" ? (
        <div className="space-y-3">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Thông tin chuyến hàng</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Nhà cung cấp lấy từ đầu workspace. Một số phiếu giao NCC chỉ được tạo một phiếu nhập cho cùng dữ liệu.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {receiptHeaderFields.map((field) => <FieldEditor key={field.fieldname} field={field} values={values} onChange={changeHeader} idPrefix="receipt-header" />)}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Hàng vừa nhận</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Mỗi mã / chiều dài / màu / dập là một dòng. Hệ thống tự trừ PO cũ nhất phù hợp.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>+ Thêm dòng</Button>
            </div>
            <div className="divide-y">
              {rows.map((row, index) => (
                <div key={row._key} className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Dòng {index + 1}</span>
                    {rows.length > 1 ? <Button type="button" size="sm" variant="outline" onClick={() => removeRow(row._key)}>Xóa dòng</Button> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    {itemFields.map((field) => <FieldEditor key={field.fieldname} field={field} values={row} onChange={(fieldname, value) => changeRow(row._key, fieldname, value)} idPrefix={`receipt-${row._key}`} />)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                    <span><strong className="text-foreground">{fmt.number(number(row.qty_bar))}</strong> cây</span>
                    <span><strong className="text-foreground">{fmt.number(number(row.qty_bar) * number(row.length_m))}</strong> m</span>
                    <span><strong className="text-foreground">{fmt.number(number(row.actual_weight_kg))}</strong> kg thực</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 border-t bg-muted/15 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Dòng hàng" value={fmt.number(rows.length)} />
              <Stat label="Tổng cây" value={`${fmt.number(totals.bars)} cây`} />
              <Stat label="Tổng mét" value={`${fmt.number(totals.meters)} m`} />
              <Stat label="Kg cân thực" value={`${fmt.number(totals.actualKg)} kg`} hint={fmt.currency ? `Giá trị theo kg thực: ${fmt.currency(totals.value)}` : undefined} />
            </div>
          </section>

          {receiptError ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{receiptError}</div> : null}
          {preview != null || result != null ? <BulkAllocationSummary value={result ?? preview} committed={result != null} onOpen={onOpen} format={(value) => fmt.number(value)} /> : null}

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            {requiredErrors.length ? <span className="mr-auto text-xs text-muted-foreground">Còn thiếu {requiredErrors.length} ô bắt buộc</span> : <span className="mr-auto text-xs text-muted-foreground">Kiểm tra trước chỉ mô phỏng, chưa tăng tồn kho.</span>}
            <Button variant="outline" disabled={Boolean(receiptBusy)} onClick={() => runReceipt("check")}>{receiptBusy === "check" ? "Đang kiểm tra…" : "Kiểm tra cả chuyến"}</Button>
            {preview != null ? <Button disabled={Boolean(receiptBusy)} onClick={() => runReceipt("create")}>{receiptBusy === "create" ? "Đang tạo…" : "Tạo 1 phiếu nhập"}</Button> : null}
          </div>
        </div>
      ) : null}

      {tab === "history" ? <HistoryTab dashboard={dashboard} loading={dashboardBusy} error={dashboardError} onOpen={onOpen} /> : null}
      {tab === "commercial" ? <CommercialTab dashboard={dashboard} loading={dashboardBusy} error={dashboardError} onOpen={onOpen} /> : null}
    </div>
  );
}

export function ActionScreen(props: ActionScreenProps) {
  if (props.action.name !== RECEIPT_ACTION) return <BaseActionScreen {...props} />;
  return <SupplierDeliveryWorkspace {...props} />;
}

export type { ActionScreenProps } from "./ActionScreen.js";
