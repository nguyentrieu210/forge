/** @jsxImportSource react */
import { useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Clock3, RefreshCw, ShieldAlert, Workflow,
} from "lucide-react";
import type { ProcessCatalog, ProcessDefinition, ProcessStage } from "@metaforge/core";
import { Badge, Button, Tabs, TabsList, TabsTrigger, cn, Skeleton, useT } from "@metaforge/ui";

export function ProcessView({ data, loading, error, onNavigate, onRefresh }: { data?: ProcessCatalog; loading?: boolean; error?: string; onNavigate: (route: string) => void; onRefresh?: () => void }) {
  const t = useT();
  const [active, setActive] = useState<string>();
  if (loading) return <ProcessSkeleton />;
  if (error) return <div className="grid min-h-80 place-items-center rounded-xl border bg-card"><div className="text-center"><AlertTriangle className="mx-auto size-7 text-destructive" /><div className="mt-2 font-medium">{t("process.load_error")}</div><div className="text-sm text-muted-foreground">{error}</div>{onRefresh ? <Button className="mt-4" variant="outline" onClick={onRefresh}><RefreshCw className="size-4" /> {t("common.retry")}</Button> : null}</div></div>;
  const processes = data?.processes ?? [];
  if (data?.unsupported) return <div className="grid min-h-80 place-items-center rounded-xl border border-dashed bg-card p-8 text-center"><div><Workflow className="mx-auto size-8 text-muted-foreground" /><div className="mt-3 font-medium">{t("process.undeclared_title")}</div><p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("process.undeclared_hint")}</p></div></div>;
  if (!processes.length) return <div className="grid min-h-80 place-items-center rounded-xl border border-dashed text-muted-foreground">{t("process.no_match")}</div>;
  const selected = processes.find((p) => p.key === active) ?? processes[0]!;
  return <div className="mf-process mx-auto max-w-[1700px] space-y-5">
    <div className="flex flex-wrap items-start gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Workflow className="size-6 text-primary" /> {t("process.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("process.subtitle")}</p></div>{onRefresh ? <Button className="ml-auto" size="sm" variant="outline" onClick={onRefresh}><RefreshCw className="size-4" /> {t("common.refresh")}</Button> : null}</div>
    <Tabs value={selected.key} onValueChange={setActive}><TabsList className="h-auto flex-wrap justify-start">{processes.map((p) => <TabsTrigger key={p.key} value={p.key}>{p.label}</TabsTrigger>)}</TabsList></Tabs>
    <ProcessCanvas process={selected} onNavigate={onNavigate} />
  </div>;
}

function ProcessCanvas({ process, onNavigate }: { process: ProcessDefinition; onNavigate: (route: string) => void }) {
  const t = useT();
  const total = process.stages.reduce((sum, stage) => sum + (stage.counter?.count ?? 0), 0);
  const overdue = process.stages.reduce((sum, stage) => sum + (stage.counter?.overdue ?? 0), 0);
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="flex flex-wrap items-start gap-3 border-b bg-muted/20 px-5 py-4"><div><h2 className="text-lg font-semibold">{process.label}</h2>{process.description ? <p className="text-sm text-muted-foreground">{process.description}</p> : null}</div><div className="ml-auto flex flex-wrap gap-2"><Badge variant={total ? "secondary" : "outline"}>{total} {t("process.pending_suffix")}</Badge>{overdue ? <Badge variant="destructive">{overdue} {t("process.overdue_suffix")}</Badge> : null}{process.requiredContexts?.map((context) => <Badge key={context} variant="outline">{context}</Badge>)}</div></div>
    <div className="overflow-x-auto p-5 pb-7">
      <div className="flex min-w-max items-stretch gap-0">
        {process.stages.map((stage, index) => <div key={stage.key} className="flex items-center"><StageCard stage={stage} index={index + 1} onNavigate={onNavigate} />{index < process.stages.length - 1 ? <ProcessConnector warning={Boolean(stage.counter?.count || stage.counter?.overdue)} /> : null}</div>)}
      </div>
    </div>
  </section>;
}
function ProcessConnector({ warning }: { warning?: boolean }) {
  return <div className="mx-2 flex w-14 items-center" aria-hidden="true"><div className={cn("h-0.5 flex-1", warning ? "bg-amber-400/70" : "bg-border")} /><ArrowRight className={cn("size-4", warning ? "text-amber-500" : "text-muted-foreground")} /></div>;
}
function StageCard({ stage, index, onNavigate }: { stage: ProcessStage; index: number; onNavigate: (r: string) => void }) {
  const t = useT();
  const count = stage.counter?.count ?? 0;
  const overdue = stage.counter?.overdue ?? 0;
  const errors = stage.counter?.error ?? 0;
  const blocked = stage.status === "blocked";
  return <Button type="button" variant="ghost" disabled={blocked || !stage.route} onClick={() => onNavigate(stage.route)} className={cn(
    "group relative flex min-h-52 w-60 flex-col rounded-xl border bg-background p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md disabled:pointer-events-none disabled:opacity-60",
    (stage.status === "warning" || overdue) && "border-amber-400/60",
    blocked && "border-destructive/50 bg-destructive/5",
  )}>
    <span className="absolute -left-2 -top-2 grid size-7 place-items-center rounded-full border bg-card text-xs font-semibold shadow-sm">{index}</span>
    <div className="flex items-start gap-3"><span className={cn("mt-0.5 grid size-9 place-items-center rounded-lg bg-muted", blocked ? "text-destructive" : errors ? "text-destructive" : count ? "text-amber-600" : "text-emerald-600")}>{blocked ? <ShieldAlert className="size-4" /> : count ? <CircleDot className="size-4" /> : <CheckCircle2 className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{stage.label}</span><span className="block truncate text-xs text-muted-foreground">{stage.source}</span></span></div>
    <div className="mt-4 flex flex-wrap gap-2"><Badge variant={count ? "secondary" : "outline"}>{count} {t("process.waiting_suffix")}</Badge>{overdue ? <Badge variant="destructive">{overdue} {t("process.overdue_suffix")}</Badge> : null}{errors ? <Badge variant="destructive">{errors} {t("process.errors_suffix")}</Badge> : null}</div>
    {stage.counter?.averageMinutes ? <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> {t("process.avg_prefix")} {Math.round(stage.counter.averageMinutes)} {t("process.minutes_suffix")}</div> : null}
    {stage.description ? <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{stage.description}</p> : null}
    <div className="mt-auto pt-4 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">{t("process.open_filtered_list")}</div>
  </Button>;
}
function ProcessSkeleton() { return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-10 w-full" /><div className="flex gap-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 w-60 shrink-0" />)}</div></div>; }
