import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, FileText, RefreshCw, Search, Truck, WalletCards } from "lucide-react";
import { FrappeAdapterImpl, type MetaForgeBootDTO, type ReportResult } from "@metaforge/adapter-frappe";
import type { Doc, Filters } from "@metaforge/core";
import { TouchCard } from "@metaforge/shell";
import { Badge, Button, Input, toast } from "@metaforge/ui";

type ReportColumn = { fieldname?: string; label?: string };
type RowRecord = Record<string, unknown>;

interface ReceivableRow {
  customer: string;
  customerName: string;
  voucherNo: string;
  postingDate: string;
  dueDate: string;
  invoiced: number;
  paid: number;
  outstanding: number;
  currency: string;
}

interface CustomerDebt {
  customer: string;
  customerName: string;
  outstanding: number;
  overdue: number;
  invoices: ReceivableRow[];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function reportRecords(report: ReportResult): RowRecord[] {
  const columns = (report.columns ?? []) as ReportColumn[];
  return (report.result ?? []).map((row) => {
    if (!Array.isArray(row)) return row && typeof row === "object" ? row as RowRecord : {};
    const out: RowRecord = {};
    columns.forEach((column, index) => {
      const key = column.fieldname || column.label;
      if (key) out[key] = row[index];
    });
    return out;
  });
}

function pick(row: RowRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return undefined;
}

function money(value: number, currency = "VND") {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString("vi-VN")} ${currency || "VND"}`;
  }
}

function overdueDays(dueDate: string): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  if (!Number.isFinite(due.getTime()) || due >= now) return 0;
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
}

async function resolveCompany(adapter: FrappeAdapterImpl): Promise<string> {
  const context = await adapter.getBusinessContext("alumdoor", ["company"]).catch(() => null);
  const selected = context?.selection.company;
  if (selected) return selected;
  const dimension = context?.dimensions.find((item) => item.key === "company");
  if (dimension?.defaultValue) return dimension.defaultValue;
  if (dimension?.options.length === 1) return dimension.options[0]!.value;
  const companies = await adapter.getList("Company", { fields: ["name"], pageLength: 1 }).catch(() => []);
  return text(companies[0]?.name);
}

export function CustomerReceivablesScreen({ adapter, boot }: { adapter: FrappeAdapterImpl; boot: MetaForgeBootDTO }) {
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const company = await resolveCompany(adapter);
      if (!company) throw new Error("Không xác định được công ty để đọc công nợ.");
      const filters = {
        company,
        report_date: today(),
        party_type: "Customer",
        ageing_based_on: "Due Date",
        calculate_ageing_with: "Report Date",
        range: "30, 60, 90, 120",
        group_by_party: 0,
        show_future_payments: 1,
      } as unknown as Filters;
      const report = await adapter.runReport("Accounts Receivable", filters, { ignorePreparedReport: true });
      const normalized = reportRecords(report).map((row): ReceivableRow => {
        const invoiced = number(pick(row, "invoiced", "invoice_amount", "grand_total"));
        const outstanding = number(pick(row, "outstanding", "outstanding_amount"));
        const paidFromReport = number(pick(row, "paid", "paid_amount"));
        return {
          customer: text(pick(row, "party", "customer")),
          customerName: text(pick(row, "party_name", "customer_name", "party", "customer")),
          voucherNo: text(pick(row, "voucher_no", "invoice", "name")),
          postingDate: text(pick(row, "posting_date")),
          dueDate: text(pick(row, "due_date")),
          invoiced,
          paid: paidFromReport || Math.max(0, invoiced - outstanding),
          outstanding,
          currency: text(pick(row, "currency", "party_account_currency")) || boot.sysdefaults.currency || "VND",
        };
      }).filter((row) => row.customer && row.voucherNo && row.outstanding > 0);
      setRows(normalized);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : adapter.mapError(error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [adapter, boot.sysdefaults.currency]);

  useEffect(() => { void load(); }, [load]);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerDebt>();
    for (const row of rows) {
      const current = map.get(row.customer) ?? {
        customer: row.customer,
        customerName: row.customerName || row.customer,
        outstanding: 0,
        overdue: 0,
        invoices: [],
      };
      current.outstanding += row.outstanding;
      if (overdueDays(row.dueDate) > 0) current.overdue += row.outstanding;
      current.invoices.push(row);
      map.set(row.customer, current);
    }
    const needle = query.trim().toLocaleLowerCase("vi");
    return [...map.values()]
      .filter((item) => !needle || `${item.customer} ${item.customerName}`.toLocaleLowerCase("vi").includes(needle))
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding || a.customerName.localeCompare(b.customerName, "vi"));
  }, [rows, query]);

  const detail = selected ? customers.find((item) => item.customer === selected) ?? [...new Map(rows.map((row) => [row.customer, row])).keys()].includes(selected) ? (() => {
    const invoices = rows.filter((row) => row.customer === selected);
    return {
      customer: selected,
      customerName: invoices[0]?.customerName || selected,
      outstanding: invoices.reduce((sum, row) => sum + row.outstanding, 0),
      overdue: invoices.reduce((sum, row) => sum + (overdueDays(row.dueDate) > 0 ? row.outstanding : 0), 0),
      invoices,
    } satisfies CustomerDebt;
  })() : undefined : undefined;

  if (detail) {
    const currency = detail.invoices[0]?.currency || boot.sysdefaults.currency || "VND";
    const due = detail.outstanding - detail.overdue;
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="-ml-2 h-9 gap-1.5 px-2" onClick={() => setSelected(null)}><ChevronLeft className="size-4" /> Danh sách khách</Button>
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">{detail.customer}</div>
          <h2 className="mt-1 text-lg font-semibold">{detail.customerName}</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <DebtKpi label="Còn nợ" value={money(detail.outstanding, currency)} />
            <DebtKpi label="Quá hạn" value={money(detail.overdue, currency)} danger={detail.overdue > 0} />
            <DebtKpi label="Chưa quá hạn" value={money(Math.max(0, due), currency)} />
          </div>
        </section>
        <section className="space-y-2">
          <div className="px-1 text-sm font-semibold">Chi tiết theo hóa đơn · {detail.invoices.length}</div>
          {detail.invoices
            .slice()
            .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
            .map((invoice) => {
              const days = overdueDays(invoice.dueDate);
              return (
                <TouchCard key={invoice.voucherNo}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{invoice.voucherNo}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /> {invoice.postingDate || "Không rõ ngày"} · Hạn {invoice.dueDate || "chưa đặt"}</div>
                      </div>
                      {days > 0 ? <Badge variant="destructive">Quá {days} ngày</Badge> : <Badge variant="secondary">Chưa quá hạn</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center text-xs">
                      <DebtKpi label="Hóa đơn" value={money(invoice.invoiced, invoice.currency)} compact />
                      <DebtKpi label="Đã thu" value={money(invoice.paid, invoice.currency)} compact />
                      <DebtKpi label="Còn nợ" value={money(invoice.outstanding, invoice.currency)} compact danger={days > 0} />
                    </div>
                  </div>
                </TouchCard>
              );
            })}
        </section>
      </div>
    );
  }

  const total = customers.reduce((sum, item) => sum + item.outstanding, 0);
  const overdue = customers.reduce((sum, item) => sum + item.overdue, 0);
  const currency = rows[0]?.currency || boot.sysdefaults.currency || "VND";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Công nợ khách hàng chi tiết</h2>
            <p className="mt-1 text-sm text-muted-foreground">Theo từng hóa đơn, số đã thu, còn nợ và quá hạn.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} aria-label="Làm mới công nợ"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <DebtKpi label="Tổng còn nợ" value={money(total, currency)} />
          <DebtKpi label="Tổng quá hạn" value={money(overdue, currency)} danger={overdue > 0} />
        </div>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-10" placeholder="Tìm khách hàng…" />
      </div>

      <section className="space-y-2">
        {customers.map((item) => {
          const itemCurrency = item.invoices[0]?.currency || currency;
          return (
            <TouchCard key={item.customer} onClick={() => setSelected(item.customer)}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.customerName}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{item.customer} · {item.invoices.length} hóa đơn còn nợ</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{money(item.outstanding, itemCurrency)}</span>
                  {item.overdue > 0 ? <span className="mt-1 inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> Quá hạn {money(item.overdue, itemCurrency)}</span> : <span className="mt-1 block text-xs text-muted-foreground">Chưa quá hạn</span>}
                </span>
              </div>
            </TouchCard>
          );
        })}
        {!loading && !customers.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Không có công nợ còn mở theo quyền hiện tại.</div> : null}
      </section>
    </div>
  );
}

function DebtKpi({ label, value, danger, compact }: { label: string; value: string; danger?: boolean; compact?: boolean }) {
  return (
    <div className={compact ? "min-w-0" : "rounded-xl bg-muted/50 p-3"}>
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${compact ? "mt-1 text-xs" : "mt-1 text-sm"} truncate font-semibold ${danger ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

export function DeliveryNotesScreen({ adapter }: { adapter: FrappeAdapterImpl }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adapter.getList("Delivery Note", {
        fields: ["name", "customer", "customer_name", "posting_date", "status", "grand_total", "currency", "is_return", "modified"],
        filters: [["docstatus", "=", 1], ["is_return", "=", 0]] as Filters,
        orderBy: "posting_date desc",
        pageLength: 80,
      });
      setRows(result);
    } catch (error) {
      toast.error(adapter.mapError(error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [adapter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!needle) return rows;
    return rows.filter((row) => `${text(row.name)} ${text(row.customer)} ${text(row.customer_name)}`.toLocaleLowerCase("vi").includes(needle));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Phiếu xuất kho / giao hàng</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sale xem các phiếu đã xác nhận theo quyền hiện tại.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} aria-label="Làm mới phiếu xuất"><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></Button>
        </div>
      </section>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-10" placeholder="Tìm số phiếu hoặc khách hàng…" />
      </div>
      <section className="space-y-2">
        {filtered.map((row) => (
          <TouchCard key={text(row.name)}>
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Truck className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{text(row.name)}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{text(row.customer_name || row.customer || "Khách hàng")} · {text(row.posting_date)}</span>
                <span className="mt-2 flex items-center gap-2"><Badge variant="secondary">{text(row.status || "Đã xác nhận")}</Badge>{number(row.grand_total) > 0 ? <span className="text-xs font-medium">{money(number(row.grand_total), text(row.currency) || "VND")}</span> : null}</span>
              </span>
              <FileText className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </div>
          </TouchCard>
        ))}
        {!loading && !filtered.length ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Chưa có phiếu xuất phù hợp.</div> : null}
      </section>
    </div>
  );
}
