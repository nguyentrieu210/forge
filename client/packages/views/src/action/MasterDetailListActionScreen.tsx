/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, PackageCheck, RefreshCw, Search } from "lucide-react";
import type { AppAction, Doc } from "@metaforge/core";
import { Button, Input } from "@metaforge/ui";
import { useLocaleFormat, useMetaForge } from "../container/provider.js";
import type { ActionScreenProps } from "./ActionScreen.js";

const CONFIG_PREFIX = "MasterDetailList:";
const PAGE_SIZE = 200;
const MAX_RECORDS = 10_000;
type Json = Record<string, unknown>;
type State = "complete" | "short" | "overdue";
type StatusFilter = "all" | State;
type LineStatusFilter = "missing" | "all" | "complete" | "overdue";
type PredicateOperator = "<" | "<=" | "=" | "!=" | ">" | ">=";

export interface MasterDetailListConfig {
  sourceDoctype: string;
  submittedOnly?: boolean;
  keyField: string;
  valueField: string;
  progressField: string;
  dueDateField: string;
  exceptionPredicate: { field: string; operator: PredicateOperator; value: string | number | boolean };
  detailCollection: string;
  detailCodeField: string;
  detailTitleField: string;
  detailParentField: string;
  detailOrderDateField: string;
  detailDueDateField: string;
  detailOrderedField: string;
  detailReceivedField: string;
  detailRemainingField: string;
  detailStatusField: string;
  openDoctype: string;
  summaryOpenField?: string;
  summaryOverdueField?: string;
  summaryRemainingField?: string;
  remainingUnit?: string;
  labels?: Partial<Record<
    "key" | "searchKey" | "count" | "value" | "exceptionCount" | "progress" | "complete" | "short" | "overdue" |
    "shortKeys" | "overdueKeys" | "detail" | "detailOpen" | "detailRemaining" | "code" | "parent" | "orderDate" |
    "dueDate" | "ordered" | "received" | "remaining",
    string
  >>;
}

interface SummaryRow {
  key: string;
  count: number;
  value: number;
  exceptionCount: number;
  progress: number;
  state: State;
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function dateInRange(value: unknown, from: string, to: string): boolean {
  const raw = text(value).slice(0, 10);
  return !raw || ((!from || raw >= from) && (!to || raw <= to));
}

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isOverdue(value: unknown): boolean {
  const raw = text(value).slice(0, 10);
  return Boolean(raw && raw < todayLocal());
}

function formatDate(value: unknown): string {
  const raw = text(value).slice(0, 10);
  if (!raw) return "—";
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function matchesPredicate(row: Json, predicate: MasterDetailListConfig["exceptionPredicate"]): boolean {
  const left = row[predicate.field];
  const right = predicate.value;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const a = numeric ? leftNumber : text(left);
  const b = numeric ? rightNumber : text(right);
  switch (predicate.operator) {
    case "<": return a < b;
    case "<=": return a <= b;
    case "=": return a === b;
    case "!=": return a !== b;
    case ">": return a > b;
    case ">=": return a >= b;
  }
}

function configField(action: AppAction) {
  return action.fields.find((field) => field.fieldtype === "Text" && field.options?.startsWith(CONFIG_PREFIX));
}

export function masterDetailListConfig(action: AppAction): MasterDetailListConfig | undefined {
  const raw = configField(action)?.options?.slice(CONFIG_PREFIX.length);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as MasterDetailListConfig;
    const required: Array<keyof MasterDetailListConfig> = [
      "sourceDoctype", "keyField", "valueField", "progressField", "dueDateField", "exceptionPredicate",
      "detailCollection", "detailCodeField", "detailTitleField", "detailParentField", "detailOrderDateField", "detailDueDateField",
      "detailOrderedField", "detailReceivedField", "detailRemainingField", "detailStatusField", "openDoctype",
    ];
    if (!required.every((key) => parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== "")) return undefined;
    if (!parsed.exceptionPredicate.field || !["<", "<=", "=", "!=", ">", ">="].includes(parsed.exceptionPredicate.operator)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

async function loadSourceRows(adapter: ReturnType<typeof useMetaForge>["adapter"], config: MasterDetailListConfig): Promise<Doc[]> {
  const fields = [...new Set(["name", "docstatus", config.keyField, config.valueField, config.progressField, config.dueDateField, config.exceptionPredicate.field])];
  const rows: Doc[] = [];
  for (let start = 0; start < MAX_RECORDS; start += PAGE_SIZE) {
    const page = await adapter.getList(config.sourceDoctype, {
      fields,
      ...(config.submittedOnly ? { filters: [["docstatus", "=", 1]] as [string, "=", unknown][] } : {}),
      orderBy: `${config.keyField} asc`,
      limitStart: start,
      pageLength: PAGE_SIZE,
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${config.sourceDoctype} vượt ${MAX_RECORDS} bản ghi; từ chối cắt cụt số liệu.`);
}

export function MasterDetailListActionScreen(props: ActionScreenProps) {
  const config = useMemo(() => masterDetailListConfig(props.action), [props.action]);
  if (!config) return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Metadata MasterDetailList không hợp lệ.</div>;
  return <ConfiguredMasterDetailList {...props} config={config} />;
}

function ConfiguredMasterDetailList({ action, onOpen, config }: ActionScreenProps & { config: MasterDetailListConfig }) {
  const { adapter } = useMetaForge();
  const fmt = useLocaleFormat();
  const [sourceRows, setSourceRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [keyQuery, setKeyQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>();
  const [detail, setDetail] = useState<Json>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [itemQuery, setItemQuery] = useState("");
  const [parentQuery, setParentQuery] = useState("");
  const [lineStatus, setLineStatus] = useState<LineStatusFilter>("missing");

  const labels = {
    key: "Đối tượng", searchKey: "Tìm đối tượng", count: "Số chứng từ", value: "Tổng giá trị", exceptionCount: "Còn mở",
    progress: "Tiến độ", complete: "Đã đủ", short: "Còn thiếu", overdue: "Quá hạn", shortKeys: "Đối tượng còn thiếu",
    overdueKeys: "Đối tượng quá hạn", detail: "Chi tiết còn thiếu", detailOpen: "Chứng từ đang thiếu", detailRemaining: "Còn phải giao",
    code: "Mã", parent: "Chứng từ", orderDate: "Ngày đặt", dueDate: "Hẹn giao", ordered: "Đã đặt", received: "Đã nhận", remaining: "Còn thiếu",
    ...(config.labels ?? {}),
  };

  const reloadSummary = useCallback(() => {
    setLoading(true);
    setError(undefined);
    loadSourceRows(adapter, config)
      .then(setSourceRows)
      .catch((caught) => setError(adapter.mapError(caught).message))
      .finally(() => setLoading(false));
  }, [adapter, config]);

  useEffect(() => { reloadSummary(); }, [reloadSummary]);

  useEffect(() => {
    if (!selectedKey) { setDetail(undefined); setDetailError(undefined); return; }
    let active = true;
    setDetailLoading(true);
    setDetailError(undefined);
    adapter.callPost<Json>(action.commit.method, { [config.keyField]: selectedKey })
      .then((answer) => { if (active) setDetail(answer); })
      .catch((caught) => { if (active) { setDetail(undefined); setDetailError(adapter.mapError(caught).message); } })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [adapter, action.commit.method, config.keyField, selectedKey]);

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const inRange = sourceRows.filter((row) => dateInRange(row[config.dueDateField], fromDate, toDate));
    const grouped = new Map<string, Doc[]>();
    for (const row of inRange) {
      const key = text(row[config.keyField]);
      if (!key) continue;
      const rows = grouped.get(key) ?? [];
      rows.push(row);
      grouped.set(key, rows);
    }
    return [...grouped.entries()].map(([key, rows]) => {
      const open = rows.filter((row) => matchesPredicate(row, config.exceptionPredicate));
      const late = open.some((row) => isOverdue(row[config.dueDateField]));
      const progress = rows.length ? rows.reduce((sum, row) => sum + Math.max(0, Math.min(100, number(row[config.progressField]))), 0) / rows.length : 100;
      const state: State = !open.length ? "complete" : late ? "overdue" : "short";
      return {
        key,
        count: rows.length,
        value: rows.reduce((sum, row) => sum + number(row[config.valueField]), 0),
        exceptionCount: open.length,
        progress,
        state,
      };
    })
      .filter((row) => !keyQuery || row.key.toLocaleLowerCase("vi").includes(keyQuery.toLocaleLowerCase("vi")))
      .filter((row) => statusFilter === "all" || row.state === statusFilter || (statusFilter === "short" && row.state === "overdue"))
      .sort((left, right) => Number(right.state === "overdue") - Number(left.state === "overdue") || right.exceptionCount - left.exceptionCount || left.key.localeCompare(right.key, "vi"));
  }, [sourceRows, config, keyQuery, statusFilter, fromDate, toDate]);

  const stats = useMemo(() => ({
    shortKeys: summaryRows.filter((row) => row.state !== "complete").length,
    exceptions: summaryRows.reduce((sum, row) => sum + row.exceptionCount, 0),
    overdueKeys: summaryRows.filter((row) => row.state === "overdue").length,
  }), [summaryRows]);

  const detailRows = useMemo(() => {
    const rows = Array.isArray(detail?.[config.detailCollection]) ? detail[config.detailCollection] as Json[] : [];
    const itemNeedle = itemQuery.toLocaleLowerCase("vi");
    const parentNeedle = parentQuery.toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const remaining = number(row[config.detailRemainingField]);
      const late = remaining > 0 && isOverdue(row[config.detailDueDateField]);
      const item = `${text(row[config.detailCodeField])} ${text(row[config.detailTitleField])}`.toLocaleLowerCase("vi");
      if (itemNeedle && !item.includes(itemNeedle)) return false;
      if (parentNeedle && !text(row[config.detailParentField]).toLocaleLowerCase("vi").includes(parentNeedle)) return false;
      if (!dateInRange(row[config.detailDueDateField] ?? row[config.detailOrderDateField], fromDate, toDate)) return false;
      if (lineStatus === "missing" && remaining <= 0) return false;
      if (lineStatus === "complete" && remaining > 0) return false;
      if (lineStatus === "overdue" && !late) return false;
      return true;
    }).sort((left, right) => number(right[config.detailRemainingField]) - number(left[config.detailRemainingField]) || text(left[config.detailDueDateField]).localeCompare(text(right[config.detailDueDateField])));
  }, [detail, config, itemQuery, parentQuery, lineStatus, fromDate, toDate]);

  const detailSummary = detail?.summary && typeof detail.summary === "object" && !Array.isArray(detail.summary) ? detail.summary as Json : {};
  const detailOverdue = config.summaryOverdueField ? number(detailSummary[config.summaryOverdueField]) : detailRows.filter((row) => number(row[config.detailRemainingField]) > 0 && isOverdue(row[config.detailDueDateField])).length;

  return <section className="space-y-4" aria-label={action.label}>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={keyQuery} onChange={(event) => setKeyQuery(event.target.value)} placeholder={labels.searchKey} /></div>
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">Tất cả trạng thái</option><option value="short">{labels.short}</option><option value="overdue">{labels.overdue}</option><option value="complete">{labels.complete}</option></select>
      <Input className="w-[145px]" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Hẹn giao từ ngày" />
      <Input className="w-[145px]" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Hẹn giao đến ngày" />
      <Button variant="outline" size="sm" onClick={reloadSummary} disabled={loading}><RefreshCw className="mr-1.5 size-3.5" />Làm mới</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-3"><StatCard label={labels.shortKeys} value={stats.shortKeys} icon={<PackageCheck className="size-4" />} /><StatCard label={labels.exceptionCount} value={stats.exceptions} icon={<AlertTriangle className="size-4" />} /><StatCard label={labels.overdueKeys} value={stats.overdueKeys} icon={<AlertTriangle className="size-4" />} danger={stats.overdueKeys > 0} /></div>

    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-3 text-sm font-semibold">{labels.key}</div>
      {loading ? <p className="p-4 text-sm text-muted-foreground">Đang tổng hợp số liệu…</p> : error ? <p className="p-4 text-sm text-destructive">{error}</p> : summaryRows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Không có dữ liệu phù hợp bộ lọc.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/45 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">{labels.key}</th><th className="px-3 py-2 text-right font-medium">{labels.count}</th><th className="px-3 py-2 text-right font-medium">{labels.value}</th><th className="px-3 py-2 text-right font-medium">{labels.exceptionCount}</th><th className="px-3 py-2 text-right font-medium">{labels.progress}</th><th className="px-4 py-2 font-medium">Trạng thái</th></tr></thead><tbody>{summaryRows.map((row) => <tr key={row.key} className={`cursor-pointer border-t transition-colors hover:bg-muted/40 ${selectedKey === row.key ? "bg-primary/5" : ""}`} onClick={() => setSelectedKey(row.key)}><td className="px-4 py-2.5 font-semibold">{row.key}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(row.count, 0)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.currency(row.value, 0)}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmt.number(row.exceptionCount, 0)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(row.progress, 1)}%</td><td className="px-4 py-2.5"><StatusText state={row.state} labels={labels} /></td></tr>)}</tbody></table></div>}
    </div>

    {selectedKey ? <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs text-muted-foreground">{labels.detail}</div><h2 className="text-lg font-semibold">{selectedKey}</h2></div><Button variant="ghost" size="sm" onClick={() => setSelectedKey(undefined)}>Đóng chi tiết</Button></div>
      {detailLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Đang đọc dữ liệu chi tiết…</p> : detailError ? <p className="py-4 text-sm text-destructive">{detailError}</p> : detail ? <>
        <div className="grid gap-3 sm:grid-cols-3"><StatCard label={labels.detailOpen} value={config.summaryOpenField ? fmt.number(number(detailSummary[config.summaryOpenField]), 0) : fmt.number(detailRows.length, 0)} icon={<PackageCheck className="size-4" />} /><StatCard label={labels.detailRemaining} value={`${fmt.number(config.summaryRemainingField ? number(detailSummary[config.summaryRemainingField]) : detailRows.reduce((sum, row) => sum + number(row[config.detailRemainingField]), 0), 2)}${config.remainingUnit ? ` ${config.remainingUnit}` : ""}`} icon={<AlertTriangle className="size-4" />} /><StatCard label={labels.overdue} value={fmt.number(detailOverdue, 0)} icon={<AlertTriangle className="size-4" />} danger={detailOverdue > 0} /></div>
        <div className="grid gap-2 md:grid-cols-4"><Input value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder={`${labels.code} / tên`} /><Input value={parentQuery} onChange={(event) => setParentQuery(event.target.value)} placeholder={labels.parent} /><select className="h-9 rounded-md border bg-background px-3 text-sm" value={lineStatus} onChange={(event) => setLineStatus(event.target.value as LineStatusFilter)}><option value="missing">Chỉ {labels.short.toLocaleLowerCase("vi")}</option><option value="overdue">Chỉ {labels.overdue.toLocaleLowerCase("vi")}</option><option value="complete">{labels.complete}</option><option value="all">Tất cả</option></select><div className="flex items-center justify-end text-xs text-muted-foreground">{detailRows.length} dòng</div></div>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[920px] text-sm"><thead className="bg-muted/45 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">{labels.code}</th><th className="px-3 py-2 font-medium">{labels.parent}</th><th className="px-3 py-2 font-medium">{labels.orderDate}</th><th className="px-3 py-2 font-medium">{labels.dueDate}</th><th className="px-3 py-2 text-right font-medium">{labels.ordered}</th><th className="px-3 py-2 text-right font-medium">{labels.received}</th><th className="px-3 py-2 text-right font-medium">{labels.remaining}</th><th className="px-3 py-2 font-medium">Trạng thái</th></tr></thead><tbody>{detailRows.map((row, index) => {
          const remaining = number(row[config.detailRemainingField]);
          const state: State = remaining <= 0 ? "complete" : isOverdue(row[config.detailDueDateField]) ? "overdue" : "short";
          const parent = text(row[config.detailParentField]);
          return <tr key={`${parent}:${text(row[config.detailCodeField])}:${index}`} className="border-t"><td className="px-3 py-2.5"><div className="font-medium">{text(row[config.detailCodeField]) || "—"}</div><div className="max-w-[320px] truncate text-[11px] text-muted-foreground">{text(row[config.detailTitleField])}</div></td><td className="px-3 py-2.5">{onOpen && parent ? <Button variant="link" className="h-auto p-0 font-medium" onClick={() => onOpen(config.openDoctype, parent)}>{parent}</Button> : parent || "—"}</td><td className="px-3 py-2.5">{formatDate(row[config.detailOrderDateField])}</td><td className="px-3 py-2.5">{formatDate(row[config.detailDueDateField])}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(number(row[config.detailOrderedField]), 2)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt.number(number(row[config.detailReceivedField]), 2)}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmt.number(remaining, 2)}</td><td className="px-3 py-2.5"><StatusText state={state} labels={labels} fallback={text(row[config.detailStatusField])} /></td></tr>;
        })}{detailRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">Không có dòng phù hợp bộ lọc.</td></tr> : null}</tbody></table></div>
      </> : null}
    </div> : null}
  </section>;
}

function StatCard({ label, value, icon, danger = false }: { label: string; value: string | number; icon: ReactNode; danger?: boolean }) {
  return <div className="rounded-xl border bg-card px-4 py-3"><div className={`flex items-center gap-2 text-xs font-medium ${danger ? "text-destructive" : "text-muted-foreground"}`}>{icon}{label}</div><div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div></div>;
}

function StatusText({ state, labels, fallback }: { state: State; labels: Record<string, string>; fallback?: string }) {
  const complete = state === "complete";
  const late = state === "overdue";
  const Icon = complete ? CheckCircle2 : AlertTriangle;
  const label = complete ? labels.complete : late ? labels.overdue : fallback || labels.short;
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${late ? "text-destructive" : complete ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}><Icon className="size-3.5" />{label}</span>;
}
