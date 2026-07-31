import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@metaforge/ui";

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

interface FilterState extends Record<string, unknown> {
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
  reports: PurchaseSupplierDebtReport[];
  onClose: () => void;
}

export function PurchaseSupplierDebtReportDialog(props: PurchaseSupplierDebtReportDialogProps) {
  const { open, reports, onClose } = props;
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const columns = reports[0]?.columns ?? [];
  const generatedAt = reports.reduce(
    (latest, report) => Date.parse(report.generated_at) > Date.parse(latest) ? report.generated_at : latest,
    reports[0]?.generated_at ?? "",
  );
  const allRows = useMemo(() => {
    const rows = new Map<string, PurchaseSupplierDebtReportRow>();
    for (const report of reports) {
      for (const row of report.rows) rows.set(`${row.queue_key}:${row.window_id}`, row);
    }
    return [...rows.values()];
  }, [reports]);
  const filteredRows = useMemo(
    () => allRows.filter((row) => matchesFilters(row, filters)),
    [allRows, filters],
  );
  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);

  const exportCsv = () => {
    if (!filteredRows.length) return;
    const report: PurchaseSupplierDebtReport = {
      kind: "purchase_supplier_debt_report",
      title: "Công nợ giao hàng nhà cung cấp",
      description: "Các cửa sổ liên quan đến chứng từ đang mở.",
      generated_at: generatedAt,
      csv_filename: `purchase-supplier-debt-${(generatedAt || new Date().toISOString()).slice(0, 10)}.csv`,
      filters,
      columns,
      rows: filteredRows,
      summary,
    };
    const blob = new Blob([`\uFEFF${buildSupplierDebtCsv(report)}`], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = report.csv_filename;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="flex max-h-[94vh] w-[min(98vw,1500px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>Công nợ giao hàng nhà cung cấp</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Snapshot ledger của các cửa sổ liên quan đến chứng từ đang mở. Không dùng bảng progress tương thích làm nguồn sự thật.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6">
            <FilterInput label="Công ty" value={filters.company} onChange={(value) => setFilters((current) => ({ ...current, company: value }))} />
            <FilterInput label="Nhà cung cấp" value={filters.supplier} onChange={(value) => setFilters((current) => ({ ...current, supplier: value }))} />
            <FilterInput label="Mã vật tư" value={filters.item_code} onChange={(value) => setFilters((current) => ({ ...current, item_code: value }))} />
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">Trạng thái</span>
              <Select
                value={filters.status || "all"}
                onValueChange={(value) => setFilters((current) => ({
                  ...current,
                  status: value === "all" ? "" : value as SupplierDebtWindowStatus,
                }))}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="Open">Đang mở</SelectItem>
                  <SelectItem value="Settled">Đã tất toán</SelectItem>
                  <SelectItem value="Reversed">Đã đảo</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <FilterInput type="date" label="PO mở cũ nhất từ" value={filters.from_date} onChange={(value) => setFilters((current) => ({ ...current, from_date: value }))} />
            <FilterInput type="date" label="PO mở cũ nhất đến" value={filters.to_date} onChange={(value) => setFilters((current) => ({ ...current, to_date: value }))} />
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="button" size="sm" variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                Đặt lại
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!filteredRows.length} onClick={exportCsv}>
                Xuất CSV
              </Button>
            </div>
          </div>

          {!reports.length ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              FIFO chưa được kích hoạt hoặc chứng từ chưa có cửa sổ phân bổ.
            </div>
          ) : (
            <>
              <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                {summary.map((entry) => (
                  <div key={entry.label} className="rounded-lg border px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                    <dd className="mt-1 font-semibold tabular-nums">{entry.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{filteredRows.length} / {allRows.length} cửa sổ</span>
                {generatedAt ? <span>Cập nhật {formatDateTime(generatedAt)}</span> : null}
              </div>

              {filteredRows.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table unwrapped className="w-full min-w-[1650px] text-sm">
                    <TableHeader className="bg-muted/60 text-muted-foreground">
                      <TableRow>
                        {columns.map((column) => (
                          <TableHead
                            key={column.key}
                            className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}
                          >
                            {column.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={`${row.queue_key}:${row.window_id}`} className="align-top">
                          {columns.map((column) => (
                            <TableCell
                              key={column.key}
                              className={column.align === "right" ? "whitespace-nowrap px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                            >
                              {reportCell(column.key, row[column.key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
          <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
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
      <Input
        className="h-9 w-full"
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function matchesFilters(row: PurchaseSupplierDebtReportRow, filters: FilterState): boolean {
  const contains = (value: string, query: string): boolean =>
    !query || value.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"));
  if (!contains(row.company, filters.company)) return false;
  if (!contains(row.supplier, filters.supplier)) return false;
  if (!contains(row.item_code, filters.item_code)) return false;
  if (filters.status && row.window_status !== filters.status) return false;
  if (filters.from_date && (!row.oldest_open_po_date || row.oldest_open_po_date < filters.from_date)) return false;
  if (filters.to_date && (!row.oldest_open_po_date || row.oldest_open_po_date > filters.to_date)) return false;
  return true;
}

function summarizeRows(rows: PurchaseSupplierDebtReportRow[]): Array<{ label: string; value: string }> {
  const sum = (field: "ordered_qty" | "allocated_qty" | "nominal_remaining_qty" | "unapplied_receipt_qty"): string =>
    formatDecimal(rows.reduce((total, row) => total + numeric(row[field]), 0));
  return [
    { label: "Nhà cung cấp", value: String(new Set(rows.map((row) => row.supplier)).size) },
    { label: "Luồng vật tư", value: String(new Set(rows.map((row) => row.queue_key)).size) },
    { label: "Cửa sổ", value: String(rows.length) },
    { label: "Đã đặt", value: sum("ordered_qty") },
    { label: "Đã phân bổ", value: sum("allocated_qty") },
    { label: "Nợ danh nghĩa", value: sum("nominal_remaining_qty") },
    { label: "Phiếu nhập chờ", value: sum("unapplied_receipt_qty") },
  ];
}

function numeric(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal(value: number): string {
  return value.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
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
