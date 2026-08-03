/** @jsxImportSource react */
import { ForgeAreaChart, ForgeBarChart, ForgeLineChart, type ForgeChartSeries } from "@metaforge/charts";
import { AlertBeacon, CommandCenterGrid, DataPanel, EdgeFrame, GlowDivider, MetricNumber, StatusPulse } from "@metaforge/visual";
import type { DashboardCard, DashboardChartData } from "./DashboardView.js";

export interface CommandCenterAlert {
  label: string;
  detail?: string;
  severity?: "info" | "warning" | "danger";
  active?: boolean;
}

export interface CommandCenterViewProps {
  title: string;
  subtitle?: string;
  cards?: DashboardCard[];
  charts?: DashboardChartData[];
  alerts?: CommandCenterAlert[];
  live?: boolean;
  statusLabel?: string;
  updatedAt?: string;
  fullscreen?: boolean;
  onNavigate?: (route: string) => void;
}

function CommandChart({ chart, onNavigate, primary = false }: { chart: DashboardChartData; onNavigate?: (route: string) => void; primary?: boolean }) {
  const series: ForgeChartSeries[] = chart.datasets.map((dataset, index) => ({ name: dataset.name ?? `Chuỗi ${index + 1}`, values: dataset.values }));
  const onActivate = chart.routeByLabel && onNavigate ? ({ label }: { label: string }) => { const route = chart.routeByLabel?.[label]; if (route) onNavigate(route); } : undefined;
  const common = { labels: chart.labels, series, theme: "dark" as const, height: primary ? 340 : 260, ariaLabel: chart.title, onActivate, showLegend: true };
  if (chart.type === "line") return <ForgeLineChart {...common} />;
  if (chart.type === "area") return <ForgeAreaChart {...common} />;
  return <ForgeBarChart {...common} />;
}

export function CommandCenterView({
  title,
  subtitle,
  cards = [],
  charts = [],
  alerts = [],
  live = false,
  statusLabel = "Theo dõi vận hành",
  updatedAt,
  fullscreen = false,
  onNavigate,
}: CommandCenterViewProps) {
  return (
    <CommandCenterGrid fullscreen={fullscreen} className="p-3 sm:p-4 lg:p-5">
      <div className="relative z-10 mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <header className="flex min-w-0 flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="h-px w-7 bg-[var(--forge-primary,#ef332d)]" aria-hidden="true" /><span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/38">Forge Operations</span></div>
            <h1 className="mt-2 truncate text-[clamp(1.35rem,2.5vw,2.25rem)] font-bold tracking-[-0.04em] text-white">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-3xl text-xs leading-5 text-white/42">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-md border border-white/8 bg-white/[0.025] px-3 py-2"><StatusPulse label={statusLabel} active={live} tone={live ? "ok" : "neutral"} />{updatedAt ? <span className="border-l border-white/10 pl-3 text-[10px] tabular-nums text-white/35">{updatedAt}</span> : null}</div>
        </header>

        <GlowDivider />

        {cards.length ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((card, index) => {
              const clickable = card.route && onNavigate;
              const body = <MetricNumber label={card.label} value={card.value} hint={typeof card.trend === "number" ? `${card.trend > 0 ? "↗" : card.trend < 0 ? "↘" : "→"} ${Math.abs(card.trend)}%` : card.description} accent={index === 0} />;
              return <EdgeFrame key={`${card.label}-${index}`} className="min-w-0"><div className={`min-h-28 rounded-md border border-white/8 bg-white/[0.025] p-4 ${clickable ? "transition hover:border-[var(--forge-primary,#ef332d)]/35 hover:bg-white/[0.04] motion-reduce:transition-none" : ""}`}>{clickable ? <button type="button" className="h-full w-full text-left focus-visible:outline-none" onClick={() => onNavigate?.(card.route!)}>{body}</button> : body}</div></EdgeFrame>;
            })}
          </div>
        ) : null}

        {charts.length ? (
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
            {charts.map((chart, index) => <DataPanel key={`${chart.title}-${index}`} title={chart.title} eyebrow={index === 0 ? "Primary analysis" : "Operational view"} className={index === 0 && charts.length > 1 ? "xl:col-span-2" : ""}><CommandChart chart={chart} onNavigate={onNavigate} primary={index === 0 && charts.length > 1} /></DataPanel>)}
          </div>
        ) : null}

        {alerts.length ? (
          <DataPanel title="Ngoại lệ cần chú ý" eyebrow="Exceptions">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">{alerts.map((alert, index) => <AlertBeacon key={`${alert.label}-${index}`} label={alert.label} detail={alert.detail} severity={alert.severity} active={alert.active} />)}</div>
          </DataPanel>
        ) : null}
      </div>
    </CommandCenterGrid>
  );
}
