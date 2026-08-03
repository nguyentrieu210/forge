/** @jsxImportSource react */
import type { OverviewChart } from "@metaforge/core";
import { ForgeAreaChart, ForgeBarChart, ForgeDonutChart, ForgeLineChart, compactMetric, type ForgeChartSeries } from "@metaforge/charts";

const CHART_DOT_CLASSES = [
  "bg-[var(--forge-primary,var(--chart-1,#e52521))]",
  "bg-[var(--chart-2,#2563eb)]",
  "bg-[var(--chart-3,#168a4f)]",
  "bg-[var(--chart-4,#c47a09)]",
  "bg-[var(--chart-5,#7c3aed)]",
] as const;

function shortNum(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return number === 0 ? "0" : "";
  return compactMetric(number);
}

export function OverviewChartCard({ chart, onNavigate }: { chart: OverviewChart; onNavigate: (route: string) => void }) {
  const totals = chart.series.slice(0, 3).map((series) => ({
    name: series.name,
    value: series.values.reduce((sum, value) => sum + Number(value || 0), 0),
  }));
  const forgeSeries: ForgeChartSeries[] = chart.series.map((series) => ({ name: series.name, values: series.values }));
  const hasRows = chart.labels.length > 0 && chart.series.some((series) => series.values.length > 0);

  const chartBody = chart.type === "line" ? (
    <ForgeLineChart labels={chart.labels} series={forgeSeries} height={245} ariaLabel={chart.label} compactValueFormatter={(value) => shortNum(value)} />
  ) : chart.type === "area" ? (
    <ForgeAreaChart labels={chart.labels} series={forgeSeries} height={245} ariaLabel={chart.label} compactValueFormatter={(value) => shortNum(value)} />
  ) : chart.type === "donut" ? (
    <ForgeDonutChart data={chart.labels.map((label, index) => ({ label, value: Number(chart.series[0]?.values[index] ?? 0) }))} height={245} ariaLabel={chart.label} showLegend />
  ) : (
    <ForgeBarChart labels={chart.labels} series={forgeSeries} height={245} ariaLabel={chart.label} compactValueFormatter={(value) => shortNum(value)} />
  );

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3"><span className="truncate text-base font-semibold tracking-[-0.01em]">{chart.label}</span><span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Năm nay</span></div>
      {totals.length ? <div className="mt-4 grid grid-cols-3 gap-3 border-b pb-4">{totals.map((total, index) => (
        <div key={total.name} className="min-w-0">
          <div className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${CHART_DOT_CLASSES[index % CHART_DOT_CLASSES.length]}`} /><span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{total.name}</span></div>
          <div className="mt-1.5 truncate text-lg font-semibold tracking-[-0.02em] tabular-nums">{shortNum(total.value)}</div>
        </div>
      ))}</div> : null}
      {hasRows ? <div className="mt-3 min-w-0">{chartBody}</div> : chart.emptyFallback === "table" ? (
        <div className="mt-3 min-h-60 overflow-hidden rounded-md border" role="table" aria-label={`${chart.label} chưa có dữ liệu`}>
          <div className="grid grid-cols-[minmax(8rem,1fr)_repeat(3,minmax(5rem,auto))] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground" role="row">
            <span role="columnheader">Nhóm</span>
            {chart.series.slice(0, 3).map((series) => <span key={series.name} role="columnheader" className="text-right">{series.name}</span>)}
          </div>
          <div className="grid min-h-48 place-items-center px-4 text-sm text-muted-foreground" role="row">Chưa có dữ liệu để lập biểu đồ</div>
        </div>
      ) : <div className="mt-3 grid min-h-60 place-items-center rounded-md border border-dashed px-4 text-sm text-muted-foreground">Chưa có dữ liệu để lập biểu đồ</div>}
    </>
  );

  const classes = "min-w-0 rounded-lg border bg-card p-4 text-left shadow-[0_1px_0_rgba(0,0,0,.025)] transition-[border-color,box-shadow,transform] motion-reduce:transition-none";
  return chart.route ? (
    <button type="button" onClick={() => onNavigate(chart.route!)} className={`${classes} hover:-translate-y-px hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}>{content}</button>
  ) : <div className={classes}>{content}</div>;
}
