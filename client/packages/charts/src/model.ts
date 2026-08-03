import type { ForgeChartSeries } from "./types.js";

export interface CartesianRow extends Record<string, number | string> {
  label: string;
}

export interface WaterfallSegment {
  label: string;
  base: number;
  positive: number;
  negative: number;
  total: number;
}

export function buildCartesianRows(labels: string[], series: ForgeChartSeries[]): CartesianRow[] {
  return labels.map((label, index) => {
    const row: CartesianRow = { label };
    for (const item of series) row[item.name] = Number(item.values[index] ?? 0);
    return row;
  });
}

export function chartHasData(series: ForgeChartSeries[]): boolean {
  return series.some((item) => item.values.length > 0 && item.values.some((value) => Number.isFinite(Number(value))));
}

export function buildWaterfallSegments(labels: string[], values: number[], totalLabel = "Tổng"): WaterfallSegment[] {
  let running = 0;
  const rows: WaterfallSegment[] = labels.map((label, index) => {
    const value = Number(values[index] ?? 0);
    const previous = running;
    running += value;
    return {
      label,
      base: value >= 0 ? previous : running,
      positive: value >= 0 ? value : 0,
      negative: value < 0 ? Math.abs(value) : 0,
      total: running,
    };
  });
  rows.push({ label: totalLabel, base: 0, positive: running >= 0 ? running : 0, negative: running < 0 ? Math.abs(running) : 0, total: running });
  return rows;
}

export function summarizeChart(labels: string[], series: ForgeChartSeries[], formatter: (value: number) => string = String): string {
  if (!labels.length || !series.length) return "Không có dữ liệu";
  const latestIndex = labels.length - 1;
  const latestLabel = labels[latestIndex] ?? "";
  const details = series
    .map((item) => `${item.name}: ${formatter(Number(item.values[latestIndex] ?? 0))}`)
    .join(", ");
  return `${latestLabel}. ${details}`;
}
