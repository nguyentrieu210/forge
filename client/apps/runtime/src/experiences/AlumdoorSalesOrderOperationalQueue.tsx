import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, CircleAlert, Factory, Loader2, PackageCheck, RefreshCw, Scissors, Search, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Doc } from "@metaforge/core";
import { useMetaForge } from "@metaforge/views/provider";
import { Button, Input } from "@metaforge/ui";

type QueueFilter = "all" | "overdue" | "today" | "upcoming";
type Json = Record<string, unknown>;

interface OperationalState {
  sales_order: string;
  reservation_state?: string;
  reservation_count?: number;
  active_reservations?: number;
  used_reservations?: number;
  expired_reservations?: number;
  released_reservations?: number;
  production_request?: string | null;
  production_state?: string | null;
  cut_order?: string | null;
  cut_state?: string | null;
}

interface OperationalSummary {
  company?: string;
  rows?: OperationalState[];
}

const PAGE_SIZE = 250;
const MAX_ORDERS = 10_000;
const dayKey = (value?: unknown) => String(value ?? "").slice(0, 10);
const todayKey = () => {
  const value = new Date();
  return new Date(value.valueOf() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const addDays = (iso: string, days: number) => {
  const value = new Date(`${iso}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const money = (value: unknown, currency = "VND") => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: currency || "VND",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);
const normalizedStatus = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("vi");
const TERMINAL_STATUSES = new Set(["completed", "closed", "cancelled", "canceled", "đã hoàn tất", "đã đóng", "đã huỷ", "đã hủy"]);

function dueBucket(row: Doc, today: string, sevenDays: string): QueueFilter {
  const due = dayKey(row.delivery_date);
  if (due && due < today) return "overdue";
  if (due === today) return "today";
  if (due && due > today && due <= sevenDays) return "upcoming";
  return "all";
}

function statusTone(row: Doc, today: string, sevenDays: string) {
  const bucket = dueBucket(row, today, sevenDays);
  if (bucket === "overdue") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (bucket === "today") return "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted/30 text-foreground";
}

function planningTone(value: string) {
  const normalized = normalizedStatus(value);
  if (["đang giữ", "đã dùng", "đã phát hành", "đã cắt", "completed"].includes(normalized)) {
    return "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300";
  }
  if (["hết hạn", "expired", "failed", "lỗi"].includes(normalized)) {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (["chưa giữ", "nháp", "draft", "chưa phát hành"].includes(normalized)) {
    return "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function PlanningBadge({ value, title }: { value?: string | null; title?: string }) {
  const label = String(value ?? "").trim() || "—";
  return <span title={title} className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${planningTone(label)}`}>{label}</span>;
}

export function AlumdoorSalesOrderOperationalQueue() {
  const { adapter, businessContext } = useMetaForge();
  const navigate = useNavigate();
  const company = String(businessContext.company ?? "").trim();
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [operational, setOperational] = useState<Map<string, OperationalState>>(new Map());
  const [error, setError] = useState("");
  const [operationalError, setOperationalError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const today = useMemo(todayKey, []);
  const sevenDays = useMemo(() => addDays(today, 7), [today]);

  const loadOperational = useCallback(async (resolvedCompany: string) => {
    setOperational(new Map());
    setOperationalError("");
    try {
      const summary = await adapter.callPost<OperationalSummary>("alumdoor.sales.order_operational_summary", { company: resolvedCompany });
      const map = new Map<string, OperationalState>();
      for (const row of Array.isArray(summary.rows) ? summary.rows : []) {
        const key = String(row.sales_order ?? "").trim();
        if (key) map.set(key, row);
      }
      setOperational(map);
    } catch (caught) {
      setOperationalError(adapter.mapError(caught).message);
    }
  }, [adapter]);

  const load = useCallback(async () => {
    setError("");
    setOperationalError("");
    setOperational(new Map());
    setRows(null);
    if (!company) {
      setRows([]);
      setError("Cần chọn Công ty trên thanh ngữ cảnh trước khi xem Đơn hàng.");
      return;
    }
    try {
      const all: Doc[] = [];
      for (let start = 0; start < MAX_ORDERS; start += PAGE_SIZE) {
        const page = await adapter.getList("Sales Order", {
          fields: ["name", "customer", "transaction_date", "delivery_date", "status", "grand_total", "currency", "per_delivered", "modified", "company"],
          filters: [["docstatus", "=", 1], ["company", "=", company]],
          orderBy: "delivery_date asc",
          limitStart: start,
          pageLength: PAGE_SIZE,
        });
        all.push(...page);
        if (page.length < PAGE_SIZE) {
          setRows(all.filter((row) => !TERMINAL_STATUSES.has(normalizedStatus(row.status))));
          void loadOperational(company);
          return;
        }
      }
      throw new Error(`Sales Order vượt ${MAX_ORDERS} bản ghi đã xác nhận trong ${company}; từ chối cắt cụt work queue.`);
    } catch (caught) {
      setError(adapter.mapError(caught).message);
      setRows([]);
    }
  }, [adapter, company, loadOperational]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const source = rows ?? [];
    let overdue = 0;
    let todayCount = 0;
    let upcoming = 0;
    for (const row of source) {
      const bucket = dueBucket(row, today, sevenDays);
      if (bucket === "overdue") overdue += 1;
      else if (bucket === "today") todayCount += 1;
      else if (bucket === "upcoming") upcoming += 1;
    }
    return { open: source.length, overdue, today: todayCount, upcoming };
  }, [rows, sevenDays, today]);

  const planningSummary = useMemo(() => {
    let held = 0;
    let production = 0;
    let cut = 0;
    for (const state of operational.values()) {
      if (state.reservation_state === "Đang giữ" || state.reservation_state === "Đã dùng") held += 1;
      if (state.production_request) production += 1;
      if (state.cut_order) cut += 1;
    }
    return { held, production, cut };
  }, [operational]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return (rows ?? []).filter((row) => {
      const bucket = dueBucket(row, today, sevenDays);
      if (filter !== "all" && bucket !== filter) return false;
      if (!needle) return true;
      const ops = operational.get(String(row.name));
      return [row.name, row.customer, row.status, row.delivery_date, ops?.reservation_state, ops?.production_state, ops?.cut_state]
        .some((value) => String(value ?? "").toLocaleLowerCase("vi").includes(needle));
    });
  }, [filter, operational, query, rows, sevenDays, today]);

  const filters: Array<{ key: QueueFilter; label: string; count: number }> = [
    { key: "all", label: "Tất cả", count: summary.open },
    { key: "overdue", label: "Quá hạn", count: summary.overdue },
    { key: "today", label: "Hôm nay", count: summary.today },
    { key: "upcoming", label: "Sắp tới", count: summary.upcoming },
  ];

  const openDoc = (doctype: string, name: unknown) => navigate(`/app/${encodeURIComponent(doctype)}/${encodeURIComponent(String(name))}`);

  return <div className="h-full w-full max-w-none overflow-auto bg-muted/20 p-3 md:p-4 xl:p-5">
    <div className="w-full max-w-none space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" /><h1 className="text-xl font-semibold">Đơn hàng</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">Work queue Sales Order đã xác nhận: hạn giao, giữ vật tư, phát hành sản xuất và cắt — đọc từ chứng từ canonical trong Công ty đang chọn.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={rows === null}><RefreshCw className={rows === null ? "animate-spin" : ""} /> Làm mới</Button>
          <Button disabled={!company} onClick={() => navigate(`/x/${encodeURIComponent("action:giao-hang-dispatch")}`)}><Truck /> Giao hàng</Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Đơn đang mở</div><div className="mt-1 text-2xl font-bold tabular-nums">{summary.open}</div></div>
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4"><div className="text-xs text-muted-foreground">Quá hạn giao</div><div className="mt-1 text-2xl font-bold tabular-nums text-destructive">{summary.overdue}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><PackageCheck className="size-3.5" />Có giữ vật tư</div><div className="mt-1 text-2xl font-bold tabular-nums">{planningSummary.held}</div><div className="mt-1 text-[11px] text-muted-foreground">{planningSummary.production} đã có yêu cầu sản xuất</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Scissors className="size-3.5" />Đã có phiếu cắt</div><div className="mt-1 text-2xl font-bold tabular-nums">{planningSummary.cut}</div><div className="mt-1 text-[11px] text-muted-foreground">{summary.today} đơn đến hạn hôm nay · {summary.upcoming} trong 7 ngày</div></div>
      </section>

      {operationalError ? <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><strong>Đơn hàng vẫn dùng được.</strong> Chưa đọc được trạng thái planning: {operationalError}</div></div> : null}

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((entry) => <Button key={entry.key} type="button" size="sm" variant={filter === entry.key ? "default" : "outline"} onClick={() => setFilter(entry.key)}>{entry.label} <span className="ml-1 tabular-nums opacity-70">{entry.count}</span></Button>)}
          </div>
          <div className="relative w-full lg:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm đơn, khách, giữ hàng, sản xuất, cắt…" />
          </div>
        </div>

        {rows === null ? <div className="grid min-h-72 place-items-center text-sm text-muted-foreground"><div className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Đang tải đơn hàng…</div></div> : null}
        {error ? <div className="m-3 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
        {rows !== null && !error && visible.length === 0 ? <div className="grid min-h-60 place-items-center p-6 text-center text-sm text-muted-foreground">Không có đơn phù hợp bộ lọc hiện tại.</div> : null}

        {visible.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-sm">
            <thead className="bg-muted/35 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Đơn hàng</th><th className="px-3 py-2 font-medium">Khách hàng</th><th className="px-3 py-2 font-medium">Ngày giao</th><th className="px-3 py-2 font-medium">Giữ hàng</th><th className="px-3 py-2 font-medium">Sản xuất</th><th className="px-3 py-2 font-medium">Cắt</th><th className="px-3 py-2 text-right font-medium">Đã giao</th><th className="px-3 py-2 text-right font-medium">Giá trị đơn</th><th className="w-10 px-2 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((row) => {
                const due = dayKey(row.delivery_date);
                const ops = operational.get(String(row.name));
                return <tr key={String(row.name)} className="group hover:bg-muted/20">
                  <td className="px-3 py-3"><button className="font-semibold text-primary hover:underline" onClick={() => openDoc("Sales Order", row.name)}>{String(row.name)}</button><div className="mt-0.5 text-xs text-muted-foreground">{String(row.status ?? "—")} · đặt {dayKey(row.transaction_date) || "—"}</div></td>
                  <td className="px-3 py-3 font-medium">{String(row.customer ?? "—")}</td>
                  <td className="px-3 py-3"><span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${statusTone(row, today, sevenDays)}`}>{due || "Chưa hẹn"}</span></td>
                  <td className="px-3 py-3"><PlanningBadge value={ops?.reservation_state} title={ops?.reservation_count ? `${ops.reservation_count} phiếu giữ chỗ` : undefined} /></td>
                  <td className="px-3 py-3">{ops?.production_request ? <button className="text-left" onClick={() => openDoc("Production Request", ops.production_request)}><PlanningBadge value={ops.production_state || "Đã có yêu cầu"} title={ops.production_request} /></button> : <PlanningBadge value="Chưa phát hành" />}</td>
                  <td className="px-3 py-3">{ops?.cut_order ? <button className="text-left" onClick={() => openDoc("Cut Order", ops.cut_order)}><PlanningBadge value={ops.cut_state || "Đã có phiếu"} title={ops.cut_order} /></button> : <PlanningBadge value="Chưa cắt" />}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{Number(row.per_delivered ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(row.grand_total, String(row.currency ?? "VND"))}</td>
                  <td className="px-2 py-3"><Button variant="ghost" size="icon-sm" aria-label={`Mở ${String(row.name)}`} onClick={() => openDoc("Sales Order", row.name)}><ChevronRight /></Button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div> : null}
      </section>
    </div>
  </div>;
}
