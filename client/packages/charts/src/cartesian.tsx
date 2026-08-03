/** @jsxImportSource react */
import type { EChartsOption } from "echarts/core";
import { ForgeChartSurface, type ForgeOptionBuilder } from "./ChartSurface.js";
import { chartHasData } from "./model.js";
import { compactMetric } from "./theme.js";
import type { ForgeCartesianChartProps } from "./types.js";

function dataKey(kind: string, props: ForgeCartesianChartProps): string {
  return JSON.stringify([kind, props.labels, props.series.map((item) => [item.name, item.values, item.stack, item.color]), props.showLegend, props.showLabels, props.smooth]);
}

function cartesianOption(kind: "line" | "area" | "bar" | "stacked-bar", props: ForgeCartesianChartProps): ForgeOptionBuilder {
  return ({ tokens, reducedMotion }) => {
    const compact = props.compactValueFormatter ?? compactMetric;
    const full = props.valueFormatter ?? ((value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value));
    const showLegend = props.showLegend ?? props.series.length > 1;
    const showLabels = props.showLabels ?? (props.series.length === 1 && props.labels.length <= 12);
    const isBar = kind === "bar" || kind === "stacked-bar";
    const option = {
      backgroundColor: "transparent",
      color: props.series.map((item, index) => item.color ?? tokens.palette[index % tokens.palette.length]),
      animationDuration: reducedMotion ? 0 : 360,
      animationDurationUpdate: reducedMotion ? 0 : 280,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      aria: { enabled: true, decal: { show: false } },
      grid: { left: 10, right: 14, top: showLegend ? 38 : 20, bottom: 4, containLabel: true },
      legend: showLegend ? { top: 0, left: 0, textStyle: { color: tokens.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 7 } : undefined,
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens.dark ? "rgba(19,21,25,.96)" : "rgba(255,255,255,.98)",
        borderColor: tokens.border,
        borderWidth: 1,
        textStyle: { color: tokens.text, fontSize: 12 },
        valueFormatter: (value: unknown) => full(Number(value)),
        axisPointer: { type: isBar ? "shadow" : "line", lineStyle: { color: tokens.border }, shadowStyle: { color: tokens.surface, opacity: 0.6 } },
      },
      xAxis: {
        type: "category",
        data: props.labels,
        boundaryGap: isBar,
        axisLine: { lineStyle: { color: tokens.border } },
        axisTick: { show: false },
        axisLabel: { color: tokens.muted, fontSize: 11, hideOverlap: true, margin: 10 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: tokens.border, opacity: tokens.dark ? 0.42 : 0.7, type: "dashed" } },
        axisLabel: { color: tokens.muted, fontSize: 11, formatter: (value: number) => compact(Number(value)) },
      },
      series: props.series.map((item, index) => {
        const color = item.color ?? tokens.palette[index % tokens.palette.length];
        if (isBar) {
          return {
            name: item.name,
            type: "bar",
            data: item.values,
            stack: kind === "stacked-bar" ? (item.stack ?? "forge-stack") : item.stack,
            barMaxWidth: 36,
            itemStyle: { color, borderRadius: kind === "stacked-bar" ? 2 : [5, 5, 1, 1] },
            emphasis: { focus: "series", itemStyle: { opacity: 1 } },
            label: showLabels ? { show: true, position: "top", color: tokens.muted, fontSize: 10, formatter: (params: { value?: unknown }) => compact(Number(params.value)) } : { show: false },
            universalTransition: true,
          };
        }
        return {
          name: item.name,
          type: "line",
          data: item.values,
          smooth: props.smooth ?? true,
          showSymbol: props.labels.length <= 40,
          symbolSize: 6,
          lineStyle: { color, width: 2.25 },
          itemStyle: { color, borderColor: tokens.background, borderWidth: 1.5 },
          areaStyle: kind === "area" ? { color, opacity: tokens.dark ? 0.16 : 0.1 } : undefined,
          emphasis: { focus: "series" },
          label: showLabels ? { show: true, position: "top", color: tokens.muted, fontSize: 10, formatter: (params: { value?: unknown }) => compact(Number(params.value)) } : { show: false },
          universalTransition: true,
        };
      }),
    };
    return option as EChartsOption;
  };
}

function CartesianChart({ kind, ...props }: ForgeCartesianChartProps & { kind: "line" | "area" | "bar" | "stacked-bar" }) {
  return (
    <ForgeChartSurface
      {...props}
      hasData={props.labels.length > 0 && chartHasData(props.series)}
      dataKey={dataKey(kind, props)}
      buildOption={cartesianOption(kind, props)}
      labels={props.labels}
      series={props.series}
    />
  );
}

export function ForgeLineChart(props: ForgeCartesianChartProps) {
  return <CartesianChart {...props} kind="line" />;
}

export function ForgeAreaChart(props: ForgeCartesianChartProps) {
  return <CartesianChart {...props} kind="area" />;
}

export function ForgeBarChart(props: ForgeCartesianChartProps) {
  return <CartesianChart {...props} kind="bar" />;
}

export function ForgeStackedBarChart(props: ForgeCartesianChartProps) {
  return <CartesianChart {...props} kind="stacked-bar" />;
}
