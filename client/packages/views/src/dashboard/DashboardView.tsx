/** @jsxImportSource react */
import type { BoundFormatters } from "@metaforge/core";
import {
  ForgeAreaChart,
  ForgeBarChart,
  ForgeDashboardPanel,
  ForgeKpiCard,
  ForgeKpiStrip,
  ForgeLineChart,
  ForgeStackedBarChart,
  type ForgeChartSeries,
} from "@metaforge/charts";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button, useT } from "@metaforge/ui";
import { useLocaleFormat } from "../container/provider.js";

export interface DashboardCard {
  label: string;
  value: number | string;
  trend?: number;
  route?: string;
  higherIsBetter?: boolean;
  description?: string;
  sparkline?: number[];
}

export interface DashboardChartData {
  title: string;
  type?: "bar" | "line" | string;
  labels: string[];
  datasets: Array<{ name?: string; values: number[] }>;
  routeByLabel?: Record<string, string>;
}

export interface DashboardViewProps {
  cards?: DashboardCard[];
  charts?: DashboardChartData[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  updatedAt?: string;
  filterSummary?: string;
  onNavigate?: (route: string) => void;
}

export function DashboardView(props: DashboardViewProps) {
  const t = useT();
  const fmt = useLocaleFormat();
  const { cards = [], charts = [], loading } = props;

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-5" aria-busy="true">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border bg-muted/35 motion-reduce:animate-none" />)}</div>
        <div className="h-80 animate-pulse rounded-lg border bg-muted/35 motion-reduce:animate-none" />
        <span className="sr-only">{t("dashboard.loading")}</span>
      </div>
    );
  }

  if (props.error) {
    return <div className="mf-empty-state gap-2"><AlertCircle className="text-destructive" /><div className="font-medium">Không tải được bảng điều hành</div><div className="text-sm text-muted-foreground">{props.error}</div>{props.onRetry ? <Button size="sm" onClick={props.onRetry}><RefreshCw /> Thử lại</Button> : null}</div>;
  }
  if (!cards.length && !charts.length) return <div className="mf-empty-state text-sm text-muted-foreground">{t("common.no_data")}</div>;

  return (
    <div className="space-y-5 p-4 md:p-5">
      {(props.filterSummary || props.updatedAt) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {props.filterSummary ? <span>Bộ lọc: {props.filterSummary}</span> : null}
          {props.updatedAt ? <span>Cập nhật: {props.updatedAt}</span> : null}
        </div>
      ) : null}

      {cards.length > 0 ? (
        <ForgeKpiStrip>
          {cards.map((card, index) => {
            const onActivate = card.route && props.onNavigate ? () => props.onNavigate?.(card.route!) : undefined;
            return <ForgeKpiCard key={`${card.label}-${index}`} label={card.label} value={card.value} trend={card.trend} higherIsBetter={card.higherIsBetter} description={card.description} sparkline={card.sparkline} onActivate={onActivate} />;
          })}
        </ForgeKpiStrip>
      ) : null}

      {charts.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          {charts.map((chart, index) => (
            <ForgeDashboardPanel key={`${chart.title}-${index}`} title={chart.title} className={index === 0 && charts.length > 1 ? "xl:col-span-2" : ""}>
              <MetaChart chart={chart} onNavigate={props.onNavigate} fmt={fmt} height={index === 0 && charts.length > 1 ? 320 : 280} />
            </ForgeDashboardPanel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetaChart({ chart, onNavigate, fmt, height }: { chart: DashboardChartData; onNavigate?: (route: string) => void; fmt?: BoundFormatters; height: number }) {
  const full = (value: number) => fmt ? fmt.number(value) : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
  const compact = (value: number): string => {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1).replace(".", ",")} tỷ`;
    if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} tr`;
    if (absolute >= 10_000) return `${Math.round(value / 1000)}k`;
    return full(value);
  };
  const series: ForgeChartSeries[] = chart.datasets.map((dataset, index) => ({ name: dataset.name ?? `Chuỗi ${index + 1}`, values: dataset.values }));
  const onActivate = chart.routeByLabel && onNavigate ? ({ label }: { label: string }) => { const route = chart.routeByLabel?.[label]; if (route) onNavigate(route); } : undefined;
  const common = {
    title: chart.title,
    labels: chart.labels,
    series,
    height,
    valueFormatter: full,
    compactValueFormatter: compact,
    onActivate,
    ariaLabel: chart.title,
  };

  if (chart.type === "line") return <ForgeLineChart {...common} />;
  if (chart.type === "area") return <ForgeAreaChart {...common} />;
  if (chart.type === "stacked" || chart.type === "stacked_bar") return <ForgeStackedBarChart {...common} />;
  return <ForgeBarChart {...common} />;
}
