/** @jsxImportSource react */
import { lazy, Suspense } from "react";
import {
  AlertTriangle, BarChart3, Boxes, CalendarClock, CheckCircle2, Clock3,
  Coins, FileText, Loader2, Package, Plus, RefreshCw, TrendingUp, Truck, Users, Warehouse,
} from "lucide-react";
import type { OverviewAction, OverviewDashboard, OverviewTone } from "@metaforge/core";
import { Badge, Button, cn, Skeleton, useI18n } from "@metaforge/ui";

const LazyOverviewChartCard = lazy(async () => {
  const module = await import("./OverviewChartCard.js");
  return { default: module.OverviewChartCard };
});

export interface OverviewViewProps {
  data?: OverviewDashboard;
  loading?: boolean;
  error?: string;
  onNavigate: (route: string) => void;
  /** Cho container xử lý action đặc biệt (ví dụ mở quick-create) trước khi fallback sang điều hướng. */
  onAction?: (action: OverviewAction) => void;
  busyActionKey?: string;
  onRefresh?: () => void;
}
const TONE: Record<OverviewTone, string> = {
  neutral: "bg-muted text-foreground",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function MetricIcon({ name }: { name?: string }) {
  const cls = "size-4";
  switch (name) {
    case "boxes": return <Boxes className={cls} />;
    case "coins": return <Coins className={cls} />;
    case "package": return <Package className={cls} />;
    case "warehouse": return <Warehouse className={cls} />;
    case "truck": return <Truck className={cls} />;
    case "users": return <Users className={cls} />;
    case "calendar-clock": return <CalendarClock className={cls} />;
    case "file-text": return <FileText className={cls} />;
    default: return <TrendingUp className={cls} />;
  }
}

function formatActivityTime(raw: string | undefined, tag: string): string {
  if (!raw) return "";
  const date = new Date(raw.replace(" ", "T").replace(/(\.\d{3})\d+$/, "$1"));
  if (Number.isNaN(date.getTime())) return raw;
  const diff = Date.now() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  if (Math.abs(diff) < 60_000) return rtf.format(-Math.round(diff / 1_000), "second");
  if (Math.abs(diff) < 3_600_000) return rtf.format(-Math.round(diff / 60_000), "minute");
  if (Math.abs(diff) < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), "hour");
  if (Math.abs(diff) < 604_800_000) return rtf.format(-Math.round(diff / 86_400_000), "day");
  return new Intl.DateTimeFormat(tag, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function OverviewView({ data, loading, error, onNavigate, onAction, busyActionKey, onRefresh }: OverviewViewProps) {
  const { locale, t } = useI18n();
  const tag = locale === "en" ? "en-US" : "vi-VN";
  if (loading) return <OverviewSkeleton />;
  if (error) return <div className="grid min-h-80 place-items-center rounded-xl border bg-card p-8 text-center"><div><AlertTriangle className="mx-auto mb-2 size-7 text-destructive" /><div className="font-medium">{t("overview.load_error")}</div><div className="mt-1 text-sm text-muted-foreground">{error}</div>{onRefresh ? <Button className="mt-4" variant="outline" onClick={onRefresh}><RefreshCw className="size-4" /> {t("common.retry")}</Button> : null}</div></div>;
  if (!data) return null;
  if (data.unsupported) return <div className="grid min-h-80 place-items-center rounded-xl border border-dashed bg-card p-8 text-center"><div><BarChart3 className="mx-auto size-8 text-muted-foreground" /><div className="mt-3 font-medium">{t("overview.undeclared_title")}</div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("overview.undeclared_hint")}</p></div></div>;
  return (
    <div className="mf-overview mx-auto w-full max-w-[1700px] space-y-3">
      <div className="flex flex-wrap items-center gap-3 border-b border-primary/25 pb-3">
        <div><h1 className="text-lg font-semibold tracking-tight">{data.label}</h1>{data.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p> : null}</div>
        <div className="ml-auto flex flex-wrap gap-2">
          {data.actions.map((a) => {
            const busy = busyActionKey === a.key;
            return (
              <Button
                key={a.key}
                size="sm"
                disabled={Boolean(busyActionKey)}
                onClick={() => onAction ? onAction(a) : onNavigate(a.route)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" />}
                {a.label}
              </Button>
            );
          })}
          {onRefresh ? <Button size="icon-sm" variant="outline" onClick={onRefresh} aria-label={t("common.refresh")}><RefreshCw className="size-4" /></Button> : null}
        </div>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        {data.metrics.map((m) => (
          <Button key={m.key} type="button" variant="ghost" disabled={!m.route} onClick={() => m.route && onNavigate(m.route)} className="group h-auto min-h-24 w-full flex-col items-stretch rounded-md border border-l-[3px] border-l-primary bg-card p-3 text-left font-normal shadow-sm transition hover:border-primary/50 hover:bg-card disabled:pointer-events-none">
            <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{m.label}</span><span className={cn("grid size-7 place-items-center rounded-md", TONE[m.tone ?? "neutral"])}><MetricIcon name={m.icon} /></span></div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{m.formatted ?? (typeof m.value === "number" ? new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(m.value) : m.value)}</div>
            {m.description ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{m.description}</div> : <div className="mt-1 text-[11px] text-muted-foreground">Dữ liệu hiện tại</div>}

          </Button>
        ))}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2">
        {data.charts.length ? (
          <Suspense fallback={<><Skeleton className="h-80 w-full" /><Skeleton className="h-80 w-full" /></>}>
            {data.charts.map((chart) => <LazyOverviewChartCard key={chart.key} chart={chart} onNavigate={onNavigate} />)}
          </Suspense>
        ) : <div className="grid min-h-72 place-items-center rounded-md border border-dashed bg-card text-sm text-muted-foreground">{t("overview.no_chart")}</div>}
        <section className="rounded-md border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2"><Clock3 className="size-4 text-primary" /><h2 className="text-sm font-semibold">{t("overview.todo")}</h2></div>
          <div className="space-y-2">
            {data.tasks.length ? data.tasks.map((task) => (
              <Button type="button" key={task.key} variant="ghost" onClick={() => task.route && onNavigate(task.route)} disabled={!task.route} className="h-auto w-full justify-start gap-2 rounded-md border px-2.5 py-1.5 text-left font-normal transition hover:border-primary/30 hover:bg-accent disabled:pointer-events-none">
                {task.count ? <AlertTriangle className="size-4 shrink-0 text-amber-500" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.label}</span>{task.description ? <span className="block truncate text-xs text-muted-foreground">{task.description}</span> : null}</span>
                <Badge variant={task.count ? "secondary" : "outline"}>{task.count}</Badge>
                {task.overdue ? <Badge variant="destructive">{task.overdue} {t("overview.overdue_suffix")}</Badge> : null}
              </Button>
            )) : <div className="py-10 text-center text-sm text-muted-foreground">{t("overview.no_todo")}</div>}
          </div>
        </section>
        <section className="rounded-md border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold">{t("overview.recent")}</h2>
          {data.activities.length ? <div className="divide-y">{data.activities.map((a) => <Button key={a.key} type="button" variant="ghost" disabled={!a.route} className="h-auto w-full justify-start gap-3 rounded-md px-2 py-3 text-left font-normal transition hover:bg-accent/50 disabled:pointer-events-none" onClick={() => a.route && onNavigate(a.route)}><span className="size-2 rounded-full bg-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.label}</span>{a.description ? <span className="block truncate text-xs text-muted-foreground">{a.description}</span> : null}</span><time className="text-xs text-muted-foreground" title={a.timestamp}>{formatActivityTime(a.timestamp, tag)}</time></Button>)}</div> : <div className="py-8 text-center text-sm text-muted-foreground">{t("overview.no_recent")}</div>}
        </section>
      </div>
    </div>
  );
}

function OverviewSkeleton() { return <div className="space-y-4"><Skeleton className="h-10 w-80" /><div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>; }
