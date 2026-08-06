/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, FileClock, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { AppAction, Doc } from "@metaforge/core";
import { Button, Input } from "@metaforge/ui";
import { useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";

const CONFIG_PREFIX = "DocumentHistory:";
const PAGE_SIZE = 250;
const MAX_RECORDS_PER_SOURCE = 10_000;

interface HistorySource {
  doctype: string;
  label: string;
  dateField: string;
  partyField: string;
  valueField?: string;
  currencyField?: string;
  statusField?: string;
  referenceField?: string;
  companyField?: string;
}

export interface DocumentHistoryConfig {
  sources: HistorySource[];
  labels?: Partial<Record<"search" | "party" | "reference" | "value" | "status" | "date" | "type", string>>;
}

interface HistoryRow {
  source: HistorySource;
  doc: Doc;
  date: string;
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function day(value: unknown): string { return text(value).slice(0, 10); }

function configField(action: AppAction) {
  return action.fields.find((field) => field.fieldtype === "Text" && field.options?.startsWith(CONFIG_PREFIX));
}

export function documentHistoryConfig(action: AppAction): DocumentHistoryConfig | undefined {
  const raw = configField(action)?.options?.slice(CONFIG_PREFIX.length);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as DocumentHistoryConfig;
    if (!Array.isArray(parsed.sources) || !parsed.sources.length) return undefined;
    if (!parsed.sources.every((source) => source.doctype && source.label && source.dateField && source.partyField)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function loadSource(
  adapter: ReturnType<typeof useMetaForge>["adapter"],
  source: HistorySource,
  company: string,
): Promise<Doc[]> {
  const fields = [...new Set([
    "name", "docstatus", source.dateField, source.partyField, source.valueField, source.currencyField,
    source.statusField, source.referenceField, source.companyField,
  ].filter((field): field is string => Boolean(field)))];
  const rows: Doc[] = [];
  for (let start = 0; start < MAX_RECORDS_PER_SOURCE; start += PAGE_SIZE) {
    const filters: [string, "=", unknown][] = [];
    if (company && source.companyField) filters.push([source.companyField, "=", company]);
    const page = await adapter.getList(source.doctype, {
      fields,
      ...(filters.length ? { filters } : {}),
      orderBy: `${source.dateField} desc`,
      limitStart: start,
      pageLength: PAGE_SIZE,
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${source.doctype} vượt ${MAX_RECORDS_PER_SOURCE} bản ghi; từ chối cắt cụt lịch sử.`);
}

export function DocumentHistoryActionScreen(props: ActionScreenProps) {
  const config = useMemo(() => documentHistoryConfig(props.action), [props.action]);
  if (!config) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Metadata DocumentHistory không hợp lệ.</div>;
  return <ConfiguredDocumentHistory {...props} config={config} />;
}

function ConfiguredDocumentHistory({ action, onOpen, config }: ActionScreenProps & { config: DocumentHistoryConfig }) {
  const { adapter, businessContext } = useMetaForge();
  const company = text(businessContext.company);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const labels = {
    search: "Tìm mã chứng từ, đối tác, tham chiếu…", party: "Đối tác", reference: "Tham chiếu",
    value: "Giá trị", status: "Trạng thái", date: "Ngày", type: "Loại chứng từ",
    ...(config.labels ?? {}),
  };

  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setWarnings([]);
    if (config.sources.some((source) => source.companyField) && !company) {
      setRows([]);
      setError("Cần chọn Công ty trên thanh ngữ cảnh trước khi xem lịch sử.");
      setLoading(false);
      return;
    }
    Promise.allSettled(config.sources.map(async (source) => ({
      source,
      docs: await loadSource(adapter, source, company),
    }))).then((results) => {
      const loaded: HistoryRow[] = [];
      const failed: string[] = [];
      for (const [index, result] of results.entries()) {
        const source = config.sources[index]!;
        if (result.status === "fulfilled") {
          loaded.push(...result.value.docs.map((doc) => ({ source, doc, date: day(doc[source.dateField]) })));
        } else {
          failed.push(`${source.label}: ${adapter.mapError(result.reason).message}`);
        }
      }
      loaded.sort((left, right) => right.date.localeCompare(left.date) || text(right.doc.name).localeCompare(text(left.doc.name), "vi"));
      setRows(loaded);
      if (!loaded.length && failed.length === config.sources.length) setError(`Không đọc được nguồn lịch sử nào. ${failed.join(" · ")}`);
      else setWarnings(failed);
    }).catch((caught) => {
      setRows([]);
      setError(adapter.mapError(caught).message);
    }).finally(() => setLoading(false));
  }, [adapter, company, config]);

  useEffect(() => { reload(); }, [reload]);

  const matchingRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      if (fromDate && row.date && row.date < fromDate) return false;
      if (toDate && row.date && row.date > toDate) return false;
      if (!needle) return true;
      const source = row.source;
      return [row.doc.name, row.doc[source.partyField], source.referenceField ? row.doc[source.referenceField] : undefined, source.statusField ? row.doc[source.statusField] : undefined]
        .some((value) => text(value).toLocaleLowerCase("vi").includes(needle));
    });
  }, [fromDate, query, rows, toDate]);

  const visible = useMemo(() => sourceFilter === "all"
    ? matchingRows
    : matchingRows.filter((row) => row.source.doctype === sourceFilter), [matchingRows, sourceFilter]);

  const sourceCounts = useMemo(() => Object.fromEntries(config.sources.map((source) => [source.doctype, matchingRows.filter((row) => row.source.doctype === source.doctype).length])), [config.sources, matchingRows]);
  const submitted = visible.filter((row) => Number(row.doc.docstatus ?? 0) === 1).length;
  const cancelled = visible.filter((row) => Number(row.doc.docstatus ?? 0) === 2).length;

  const formatValue = (row: HistoryRow) => {
    if (!row.source.valueField) return "—";
    const value = number(row.doc[row.source.valueField]);
    const currency = row.source.currencyField ? text(row.doc[row.source.currencyField]) : "";
    if (!currency) return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
    try {
      return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
    }
  };

  return <section className="space-y-4" aria-label={action.label}>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} /></div>
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Tất cả chứng từ</option>{config.sources.map((source) => <option key={source.doctype} value={source.doctype}>{source.label}</option>)}</select>
      <Input type="date" className="w-auto" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Từ ngày" />
      <Input type="date" className="w-auto" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Đến ngày" />
      <Button size="sm" variant="outline" onClick={reload} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Làm mới</Button>
    </div>

    {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
    {warnings.length ? <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div><strong>Một số nguồn không đọc được; dữ liệu còn lại vẫn hiển thị.</strong>{warnings.map((warning) => <div key={warning} className="mt-1 text-xs">{warning}</div>)}</div></div> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Tổng chứng từ" value={visible.length} icon={<FileClock className="size-4" />} />
      <Metric label="Đã xác nhận" value={submitted} icon={<CalendarDays className="size-4" />} />
      <Metric label="Đã huỷ" value={cancelled} icon={<FileClock className="size-4" />} />
      <Metric label="Ngày gần nhất" value={visible[0]?.date || "—"} icon={<CalendarDays className="size-4" />} />
    </div>

    <div className="flex flex-wrap gap-2"><button type="button" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sourceFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`} onClick={() => setSourceFilter("all")}>Tất cả <span className="ml-1 tabular-nums opacity-75">{matchingRows.length}</span></button>{config.sources.map((source) => <button key={source.doctype} type="button" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${sourceFilter === source.doctype ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`} onClick={() => setSourceFilter(source.doctype)}>{source.label} <span className="ml-1 tabular-nums opacity-75">{sourceCounts[source.doctype] ?? 0}</span></button>)}</div>

    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-3 py-2 text-sm font-semibold">Dòng thời gian chứng từ</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/35 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">{labels.date}</th><th className="px-3 py-2">{labels.type}</th><th className="px-3 py-2">Chứng từ</th><th className="px-3 py-2">{labels.party}</th><th className="px-3 py-2">{labels.reference}</th><th className="px-3 py-2">{labels.status}</th><th className="px-3 py-2 text-right">{labels.value}</th></tr></thead><tbody className="divide-y">{visible.map((row) => {
        const source = row.source;
        const name = text(row.doc.name);
        const docstatus = Number(row.doc.docstatus ?? 0);
        const status = source.statusField ? text(row.doc[source.statusField]) : docstatus === 2 ? "Đã huỷ" : docstatus === 1 ? "Đã xác nhận" : "Nháp";
        return <tr key={`${source.doctype}:${name}`} className="hover:bg-muted/20"><td className="px-3 py-2 tabular-nums">{row.date || "—"}</td><td className="px-3 py-2"><span className="rounded-md border bg-muted/25 px-2 py-1 text-xs font-medium">{source.label}</span></td><td className="px-3 py-2"><button className="font-semibold text-primary hover:underline" onClick={() => onOpen?.(source.doctype, name)}>{name}</button></td><td className="px-3 py-2 font-medium">{text(row.doc[source.partyField]) || "—"}</td><td className="px-3 py-2">{source.referenceField ? text(row.doc[source.referenceField]) || "—" : "—"}</td><td className="px-3 py-2">{status || "—"}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{formatValue(row)}</td></tr>;
      })}</tbody></table></div>
      {!loading && visible.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Không có chứng từ phù hợp bộ lọc.</div> : null}
    </div>
  </section>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString("vi-VN") : value}</div></div>;
}
