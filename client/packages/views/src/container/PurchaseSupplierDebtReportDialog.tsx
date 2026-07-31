import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@metaforge/ui";
import { useMetaForge } from "./provider.js";

export type SupplierDebtWindowStatus = "Open" | "Settled" | "Reversed";

export interface PurchaseSupplierDebtReportRow {
  queue_key: string;
  window_id: string;
  window_sequence: number;
  window_status: SupplierDebtWindowStatus;
  company: string;
  supplier: string;
  item_code: string;
  material: string;
  ordered_qty: string;
  received_qty: string;
  allocated_qty: string;
  nominal_remaining_qty: string;
  unapplied_receipt_qty: string;
  tolerance: string;
  oldest_open_po_date: string | null;
  oldest_open_po_age_days: number | null;
  barem_weight_kg: string;
  actual_weight_kg: string | null;
}

export interface PurchaseSupplierDebtReportColumn {
  key: keyof PurchaseSupplierDebtReportRow;
  label: string;
  align?: "left" | "right";
}

export interface PurchaseSupplierDebtReport {
  kind: "purchase_supplier_debt_report";
  title: string;
  description: string;
  generated_at: string;
  csv_filename: string;
  filters: Record<string, unknown>;
  columns: PurchaseSupplierDebtReportColumn[];
  rows: PurchaseSupplierDebtReportRow[];
  summary: Array<{ label: string; value: string }>;
}

interface FilterState {
  company: string;
  supplier: string;
  item_code: string;
  status: "" | SupplierDebtWindowStatus;
  from_date: string;
  to_date: string;
}

const EMPTY_FILTERS: FilterState = {
  company: "",
  supplier: "",
  item_code: "",
  status: "Open",
  from_date: "",
  to_date: "",
};

export interface PurchaseSupplierDebtReportDialogProps {
  open: boolean;
  refreshKey: number;
  onClose: () => void;
}

export function PurchaseSupplierDebtReportDialog(props: PurchaseSupplierDebtReportDialogProps) {
  const { open, refreshKey, onClose } = props;
  const { adapter } = useMetaForge();
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [report, setReport] = useState<PurchaseSupplierDebtReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const args: Record<string, unknown> = { limit: 500 };
      for (const [key, value] of Object.entries(filters)) {
        if (value) args[key] = value;
      }
      const next = await adapter.callGet<PurchaseSupplierDebtReport | null>(
        "metaforge.api.get_purchase_supplier_debt_report",
        args,
      );
      setReport(next);
    } catch (caught) {
      setReport(null);
      setError(adapter.mapError(caught).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadReport();
    // refreshKey deliberately reloads the report after a settlement/override mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  const exportCsv = () => {
    if (!report?.rows.length) return;
    const blob = new Blob([`\uFEFF${buildSupplierDebtCsv(report)}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = report.csv_filename;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !loading) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[min(98vw,1500px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{report?.title ?? "Công nợ giao hàng nhà cung cấp"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {report?.description ?? "Đọc trực tiếp từ allocation ledger của máy chủ."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <form
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(event) => { event.preventDefault(); void loadReport(); }}
          >
            <FilterInput label="Công ty" value={filters.company} onChange={(value) => setFilters((current) => ({ ...current, company: value }))} />
            <FilterInput label="Nhà cung cấp" value={filters.supplier} onChange={(value) => setFilters((current) => ({ ...current, supplier: value }))} />
            <FilterInput label="Mã vật tư" value={filters.item_code} onChange={(value) => setFilters((current) => ({ ...current, item_code: value }))} />
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Trạng thái</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2"
                value={filters.status}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  status: event.target.value as FilterState["status"],
                }))}
              >
                <option value="">Tất cả</option>
                <option value="Open">Đang mở</option>
                <option value="Settled">Đã tất toán</option>
                <option value="Reversed">Đã đảo</option>
              </select>
            </label>
            <FilterInput type="date" label="Từ ngày" value={filters.from_date} onChange={(value) => setFilters((current) => ({ ...current, from_date: value }))} />
            <FilterInput type="date" label="Đến ngày" value={filters.to_date} onChange={(value) => setFilters((current) => ({ ...current, to_date: value }))} />
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="submit" size="sm" disabled={loading}>Lọc báo cáo</Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  queueMicrotask(() => { void loadReport(); });
                }}
              >
                Đặt lại
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!report?.rows.length} onClick={exportCsv}>
                Xuất CSV
              </Button>
            </div>
          </form>

          {loading ? (
            <div className="grid min-h-40 place-items-center text-sm text-muted-foreground">Đang tải báo cáo…</div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : !report ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              FIFO chưa được kích hoạt hoặc bạn không có quyền xem báo cáo tổng hợp.
            </div>
          ) : (
            <>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                {report.summary.map((entry) => (
                  <div key={entry.label} className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                    <dd className="mt-1 font-semibold tabular-nums">{entry.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{report.rows.length} dòng</span>
                <span>Cập nhật {formatDateTime(report.generated_at)}</span>
              </div>

              {report.rows.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[1650px] text-sm">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        {report.columns.map((column) => (
                          <th
                            key={column.key}
                            className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row) => (
                        <tr key={`${row.queue_key}:${row.window_id}`} className="border-t align-top">
                          {report.columns.map((column) => (
                            <td
                              key={column.key}
                              className={column.align === "right" ? "whitespace-nowrap px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                            >
                              {reportCell(column.key, row[column.key])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  Không có cửa sổ phù hợp bộ lọc.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t px-5 py-3">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterInput(props: {
  label: string;
  value: string;
  type?: "text" | "date";
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <input
        className="h-9 w-full rounded-md border bg-background px-2"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function buildSupplierDebtCsv(report: PurchaseSupplierDebtReport): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [
    report.columns.map((column) => escape(column.label)).join(","),
    ...report.rows.map((row) => report.columns.map((column) => escape(row[column.key])).join(",")),
  ].join("\r\n");
}

function reportCell(key: keyof PurchaseSupplierDebtReportRow, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "window_status") return statusLabel(value as SupplierDebtWindowStatus);
  if (key === "oldest_open_po_date") return formatDate(String(value));
  return String(value);
}

function statusLabel(status: SupplierDebtWindowStatus): string {
  if (status === "Open") return "Đang mở";
  if (status === "Settled") return "Đã tất toán";
  return "Đã đảo tất toán";
}

function formatDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("vi-VN");
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("vi-VN");
}
