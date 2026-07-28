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
      className="h-auto min-w-0 flex-col items-stretch rounded-lg border p-3 text-left font-normal transition hover:border-primary/30 hover:bg-card disabled:pointer-events-none"
    >
      <div className="text-sm font-medium">{chart.label}</div>
      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">{content}</ResponsiveContainer>
      </div>
    </Button>
  );
}
