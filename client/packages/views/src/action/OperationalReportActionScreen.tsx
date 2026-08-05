/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ForgeBarChart, ForgeDashboardPanel } from "@metaforge/charts";
import { AlertTriangle, ClipboardList, RefreshCw, Search, TrendingUp } from "lucide-react";
import type { AppAction, Doc } from "@metaforge/core";
import { Button, Input } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";

const CONFIG_PREFIX = "OperationalReport:";
const PAGE_SIZE = 250;
const MAX_RECORDS = 10_000;
type Json = Record<string, unknown>;
type FilterMode = "all" | "open" | "overdue";

export interface OperationalReportConfig {
  sourceDoctype: string;
  submittedOnly?: boolean;
  dateField: string;
  keyField: string;
  valueField: string;
  statusField?: string;
  progressField?: string;
  dueDateField?: string;
  currencyField?: string;
  companyField?: string;
  openDoctype: string;
  chartTop?: number;
  labels?: Partial<Record<"key" | "value" | "documents" | "open" | "overdue" | "progress" | "search" | "detail", string>>;
}

interface GroupRow {
  key: string;
  documents: number;
  value: number;
  open: number;
  overdue: number;
  progress: number;
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function day(value: unknown): string { return text(value).slice(0, 10); }
function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function isClosedStatus(value: unknown): boolean {
  return ["completed", "closed", "cancelled", "canceled", "đã hoàn tất", "đã đóng", "đã huỷ", "đã hủy"]
    .includes(text(value).toLocaleLowerCase("vi"));
}
function isOpen(row: Doc, config: OperationalReportConfig): boolean {
  if (config.progressField) return number(row[config.progressField]) < 100;
  if (config.statusField) return !isClosedStatus(row[config.statusField]);
  return Number(row.docstatus ?? 0) !== 2;
}
function isOverdue(row: Doc, config: OperationalReportConfig): boolean {
  const due = config.dueDateField ? day(row[config.dueDateField]) : "";
  return Boolean(due && due < todayLocal() && isOpen(row, config));
}
function dateInRange(value: unknown, from: string, to: string): boolean {
  const raw = day(value);
  if (!raw) return true;
  return (!from || raw >= from) && (!to || raw <= to);
}

function configField(action: AppAction) {
  return action.fields.find((field) => field.fieldtype === "Text" && field.options?.startsWith(CONFIG_PREFIX));
}

export function operationalReportConfig(action: AppAction): OperationalReportConfig | undefined {
  const raw = configField(action)?.options?.slice(CONFIG_PREFIX.length);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as OperationalReportConfig;
    if (!parsed.sourceDoctype || !parsed.dateField || !parsed.keyField || !parsed.valueField || !parsed.openDoctype) return undefined;
    if (parsed.chartTop !== undefined && (!Number.isInteger(parsed.chartTop) || parsed.chartTop < 1 || parsed.chartTop > 20)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function loadRows(
  adapter: ReturnType<typeof useMetaForge>["adapter"],
  config: OperationalReportConfig,
  company: string,
): Promise<Doc[]> {
  const fields = [...new Set([
    "name", "docstatus", config.dateField, config.keyField, config.valueField,
    config.statusField, config.progressField, config.dueDateField, config.currencyField, config.companyField,
  ].filter((field): field is string => Boolean(field)))];
  const rows: Doc[] = [];
  for (let start = 0; start < MAX_RECORDS; start += PAGE_SIZE) {
    const filters: [string, "=", unknown][] = [];
    if (config.submittedOnly) filters.push(["docstatus", "=", 1]);
    if (company && config.companyField) filters.push([config.companyField, "=", company]);
    const page = await adapter.getList(config.sourceDoctype, {
      fields,
      ...(filters.length ? { filters } : {}),
      orderBy: `${config.dateField} desc`,
      limitStart: start,
      pageLength: PAGE_SIZE,
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${config.sourceDoctype} vượt ${MAX_RECORDS} bản ghi; từ chối cắt cụt báo cáo.`);
}

export function OperationalReportActionScreen(props: ActionScreenProps) {
  const config = useMemo(() => operationalReportConfig(props.action), [props.action]);
  if (!config) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Metadata OperationalReport không hợp lệ.</div>;
  return <ConfiguredOperationalReport {...props} config={config} />;
}

function ConfiguredOperationalReport({ action, onOpen, config }: ActionScreenProps & { config: OperationalReportConfig }) {
  const { adapter, businessContext } = useMetaForge();
  const company = text(businessContext.company);
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedKey, setSelectedKey] = useState<string>();

  const labels = {
    key: "Đối tượng", value: "Giá trị", documents: "Chứng từ", open: "Đang mở", overdue: "Quá hạn",
    progress: "Tiến độ", search: "Tìm kiếm", detail: "Chi tiết chứng từ",
    ...(config.labels ?? {}),
  };

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    loadRows(adapter, config, company)
      .then(setRows)
      .catch((caught) => { setRows([]); setError(adapter.mapError(caught).message); })
      .finally(() => setLoading(false));
  }, [adapter, company, config]);

  useEffect(() => { reload(); }, [reload]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (!dateInRange(row[config.dateField], fromDate, toDate)) return false;
    if (filter === "open" && !isOpen(row, config)) return false;
    if (filter === "overdue" && !isOverdue(row, config)) return false;
    const needle = query.trim().toLocaleLowerCase("vi");
    if (!needle) return true;
    return [row.name, row[config.keyField], config.statusField ? row[config.statusField] : undefined]
      .some((value) => text(value).toLocaleLowerCase("vi").includes(needle));
  }), [config, filter, fromDate, query, rows, toDate]);

  const groups = useMemo<GroupRow[]>(() => {
    const grouped = new Map<string, Doc[]>();
    for (const row of filteredRows) {
      const key = text(row[config.keyField]) || "Chưa xác định";
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return [...grouped.entries()].map(([key, source]) => ({
      key,
      documents: source.length,
      value: source.reduce((sum, row) => sum + number(row[config.valueField]), 0),
      open: source.filter((row) => isOpen(row, config)).length,
      overdue: source.filter((row) => isOverdue(row, config)).length,
      progress: config.progressField && source.length
        ? source.reduce((sum, row) => sum + Math.max(0, Math.min(100, number(row[config.progressField!]))), 0) / source.length
        : 0,
    })).sort((left, right) => right.value - left.value || left.key.localeCompare(right.key, "vi"));
  }, [config, filteredRows]);

  const stats = useMemo(() => ({
    documents: filteredRows.length,
    value: filteredRows.reduce((sum, row) => sum + number(row[config.valueField]), 0),
    open: filteredRows.filter((row) => isOpen(row, config)).length,
    overdue: filteredRows.filter((row) => isOverdue(row, config)).length,
  }), [config, filteredRows]);

  const currencies = useMemo(() => config.currencyField
    ? [...new Set(filteredRows.map((row) => text(row[config.currencyField!])).filter(Boolean))]
    : [], [config.currencyField, filteredRows]);
  const singleCurrency = currencies.length === 1 ? currencies[0] : undefined;
  const formatValue = (value: number) => singleCurrency
    ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: singleCurrency, maximumFractionDigits: 0 }).format(value)
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value) + (currencies.length > 1 ? " · đa tiền tệ" : "");
  const topGroups = groups.slice(0, config.chartTop ?? 8);
  const detailRows = selectedKey ? filteredRows.filter((row) => (text(row[config.keyField]) || "Chưa xác định") === selectedKey) : [];

  return <section className="space-y-4" aria-label={action.label}>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} /></div>
      <Input type="date" className="w-auto" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Từ ngày" />
      <Input type="date" className="w-auto" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Đến ngày" />
      <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Tất cả</Button>
      <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>{labels.open}</Button>
      {config.dueDateField ? <Button size="sm" variant={filter === "overdue" ? "default" : "outline"} onClick={() => setFilter("overdue")}>{labels.overdue}</Button> : null}
      <Button size="sm" variant="outline" onClick={reload} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Làm mới</Button>
    </div>

    {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label={labels.documents} value={stats.documents.toLocaleString("vi-VN")} icon={<ClipboardList className="size-4" />} />
      <StatCard label={labels.value} value={formatValue(stats.value)} icon={<TrendingUp className="size-4" />} />
      <StatCard label={labels.open} value={stats.open.toLocaleString("vi-VN")} icon={<ClipboardList className="size-4" />} />
      <StatCard label={labels.overdue} value={stats.overdue.toLocaleString("vi-VN")} icon={<AlertTriangle className="size-4" />} danger={stats.overdue > 0} />
    </div>

    {!loading && !error && topGroups.length ? <div className={`grid min-w-0 grid-cols-1 gap-4 ${config.progressField ? "xl:grid-cols-2" : ""}`}>
      <ForgeDashboardPanel title={`${labels.value} theo ${labels.key.toLocaleLowerCase("vi")}`}>
        <ForgeBarChart title={`${labels.value} theo ${labels.key}`} labels={topGroups.map((row) => row.key)} series={[{ name: labels.value, values: topGroups.map((row) => row.value) }]} height={270} valueFormatter={formatValue} onActivate={({ label }: { label: string }) => setSelectedKey(label)} ariaLabel={`${labels.value} theo ${labels.key}`} />
      </ForgeDashboardPanel>
      {config.progressField ? <ForgeDashboardPanel title={`${labels.progress} theo ${labels.key.toLocaleLowerCase("vi")}`}>
        <ForgeBarChart title={`${labels.progress} theo ${labels.key}`} labels={topGroups.map((row) => row.key)} series={[{ name: labels.progress, values: topGroups.map((row) => row.progress) }]} height={270} valueFormatter={(value) => `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`} onActivate={({ label }: { label: string }) => setSelectedKey(label)} ariaLabel={`${labels.progress} theo ${labels.key}`} />
      </ForgeDashboardPanel> : null}
    </div> : null}

    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">Tổng hợp theo {labels.key.toLocaleLowerCase("vi")}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/35 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">{labels.key}</th><th className="px-3 py-2 text-right">{labels.documents}</th><th className="px-3 py-2 text-right">{labels.value}</th><th className="px-3 py-2 text-right">{labels.open}</th><th className="px-3 py-2 text-right">{labels.overdue}</th>{config.progressField ? <th className="px-3 py-2 text-right">{labels.progress}</th> : null}</tr></thead><tbody className="divide-y">{groups.map((row) => <tr key={row.key} className="cursor-pointer hover:bg-muted/20" onClick={() => setSelectedKey(row.key)}><td className="px-3 py-2 font-medium">{row.key}</td><td className="px-3 py-2 text-right tabular-nums">{row.documents}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{formatValue(row.value)}</td><td className="px-3 py-2 text-right tabular-nums">{row.open}</td><td className="px-3 py-2 text-right tabular-nums">{row.overdue}</td>{config.progressField ? <td className="px-3 py-2 text-right tabular-nums">{row.progress.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td> : null}</tr>)}</tbody></table></div>
      {!loading && groups.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Không có dữ liệu phù hợp bộ lọc.</div> : null}
    </div>

    {selectedKey ? <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2"><div className="text-sm font-semibold">{labels.detail} · {selectedKey}</div><Button size="sm" variant="ghost" onClick={() => setSelectedKey(undefined)}>Đóng</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="bg-muted/35 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Chứng từ</th><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Trạng thái</th>{config.dueDateField ? <th className="px-3 py-2">Hạn</th> : null}<th className="px-3 py-2 text-right">{labels.value}</th>{config.progressField ? <th className="px-3 py-2 text-right">{labels.progress}</th> : null}</tr></thead><tbody className="divide-y">{detailRows.map((row) => <tr key={text(row.name)} className="hover:bg-muted/20"><td className="px-3 py-2"><button className="font-semibold text-primary hover:underline" onClick={() => onOpen?.(config.openDoctype, text(row.name))}>{text(row.name)}</button></td><td className="px-3 py-2">{day(row[config.dateField]) || "—"}</td><td className="px-3 py-2">{config.statusField ? text(row[config.statusField]) || "—" : "—"}</td>{config.dueDateField ? <td className="px-3 py-2">{day(row[config.dueDateField]) || "—"}</td> : null}<td className="px-3 py-2 text-right font-medium tabular-nums">{formatValue(number(row[config.valueField]))}</td>{config.progressField ? <td className="px-3 py-2 text-right tabular-nums">{number(row[config.progressField]).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td> : null}</tr>)}</tbody></table></div>
    </div> : null}
  </section>;
}

function StatCard({ label, value, icon, danger }: { label: string; value: string; icon: ReactNode; danger?: boolean }) {
  return <div className={`rounded-xl border bg-card p-4 ${danger ? "border-destructive/30 bg-destructive/5" : ""}`}><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</div></div>;
}
