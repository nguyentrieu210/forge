/** @jsxImportSource react */
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import type { OverviewChart } from "@metaforge/core";
import { Button } from "@metaforge/ui";

function chartRows(chart: OverviewChart): Array<Record<string, number | string>> {
  return chart.labels.map((label, index) => {
    const row: Record<string, number | string> = { label };
    for (const series of chart.series) row[series.name] = series.values[index] ?? 0;
    return row;
  });
}

function shortNum(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "";
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(1).replace(".", ",")} tỷ`;
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toFixed(1).replace(".", ",")} tr`;
  if (absolute >= 10_000) return `${Math.round(number / 1000)}k`;
  return new Intl.NumberFormat("vi-VN").format(number);
}

export function OverviewChartCard({ chart, onNavigate }: { chart: OverviewChart; onNavigate: (route: string) => void }) {
  const rows = chartRows(chart);
  const totals = chart.series.slice(0, 3).map((series) => ({
    name: series.name,
    value: series.values.reduce((sum, value) => sum + Number(value || 0), 0),
  }));
  const content = chart.type === "line" || chart.type === "area" ? (
    <LineChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
      <ChartTooltip />
      <Legend />
      {chart.series.map((series, index) => (
        <Line key={series.name} type="monotone" dataKey={series.name} stroke={`var(--chart-${index % 5 + 1})`} strokeWidth={2} dot={{ r: 2.5 }}>
          <LabelList dataKey={series.name} position="top" fontSize={11} formatter={shortNum} />
        </Line>
      ))}
    </LineChart>
  ) : chart.type === "donut" ? (
    <PieChart>
      <ChartTooltip />
      <Legend />
      <Pie
        data={rows.map((row) => ({ name: row.label, value: Number(row[chart.series[0]?.name ?? ""] ?? 0) }))}
        dataKey="value"
        nameKey="name"
        innerRadius="45%"
        outerRadius="75%"
        label={(entry: { value?: number }) => shortNum(entry.value)}
        labelLine={false}
      >
        {rows.map((row, index) => <Cell key={String(row.label)} fill={`var(--chart-${index % 5 + 1})`} />)}
      </Pie>
    </PieChart>
  ) : (
    <BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
      <ChartTooltip />
      <Legend />
      {chart.series.map((series, index) => (
        <Bar key={series.name} dataKey={series.name} fill={`var(--chart-${index % 5 + 1})`} radius={[4, 4, 0, 0]}>
          <LabelList dataKey={series.name} position="top" fontSize={11} formatter={shortNum} />
        </Bar>
      ))}
    </BarChart>
  );

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!chart.route}
      onClick={() => chart.route && onNavigate(chart.route)}
      className="h-auto min-w-0 flex-col items-stretch rounded-md border bg-card p-4 text-left font-normal shadow-sm transition hover:border-primary/30 hover:bg-card disabled:pointer-events-none"
    >
      <div className="flex items-center gap-3"><span className="text-base font-semibold">{chart.label}</span><span className="ml-auto text-xs text-muted-foreground">Năm nay</span></div>
      {totals.length ? <div className="mt-4 grid grid-cols-3 gap-3">{totals.map((total, index) => (
        <div key={total.name} className="min-w-0">
          <div className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: `var(--chart-${index % 5 + 1})` }} /><span className="truncate text-[11px] uppercase text-muted-foreground">{total.name}</span></div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{shortNum(total.value) || "0"}</div>
        </div>
      ))}</div> : null}
      <div className="mt-3 h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">{content}</ResponsiveContainer>
      </div>
    </Button>
  );
}
