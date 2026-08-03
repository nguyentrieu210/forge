/** @jsxImportSource react */
import type { EChartsOption } from "echarts/core";
import { ForgeChartSurface, type ForgeOptionBuilder } from "./ChartSurface.js";
import { buildWaterfallSegments } from "./model.js";
import { compactMetric } from "./theme.js";
import type {
  ForgeChartSeries,
  ForgeDonutChartProps,
  ForgeFunnelProps,
  ForgeGaugeProps,
  ForgeHeatmapProps,
  ForgeMapProps,
  ForgeSankeyProps,
  ForgeScatterChartProps,
  ForgeSparklineProps,
  ForgeTreemapProps,
  ForgeWaterfallProps,
} from "./types.js";

const fullFormatter = (formatter?: (value: number) => string) => formatter ?? ((value: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value));
const keyOf = (...parts: unknown[]) => JSON.stringify(parts);

export function ForgeDonutChart(props: ForgeDonutChartProps) {
  const labels = props.data.map((item) => item.label);
  const series: ForgeChartSeries[] = [{ name: props.title ?? "Giá trị", values: props.data.map((item) => item.value) }];
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    color: props.data.map((item, index) => item.color ?? tokens.palette[index % tokens.palette.length]),
    animationDuration: reducedMotion ? 0 : 360,
    animationDurationUpdate: reducedMotion ? 0 : 280,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { trigger: "item", valueFormatter: (value: unknown) => fullFormatter(props.valueFormatter)(Number(value)), backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    legend: (props.showLegend ?? props.data.length <= 8) ? { type: "scroll", bottom: 0, textStyle: { color: tokens.muted, fontSize: 11 } } : undefined,
    graphic: props.centerValue ? [{ type: "text", left: "center", top: "43%", style: { text: props.centerValue, fill: tokens.text, fontSize: 20, fontWeight: 700, textAlign: "center" } }, ...(props.centerLabel ? [{ type: "text", left: "center", top: "55%", style: { text: props.centerLabel, fill: tokens.muted, fontSize: 11, textAlign: "center" } }] : [])] : undefined,
    series: [{
      name: props.title ?? "Giá trị",
      type: "pie",
      radius: ["52%", "76%"],
      center: ["50%", props.showLegend === false ? "50%" : "45%"],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: tokens.background, borderWidth: 2, borderRadius: 4 },
      label: { show: props.data.length <= 6, color: tokens.muted, formatter: (params: { value?: unknown }) => compactMetric(Number(params.value)) },
      emphasis: { scale: true, scaleSize: 4 },
      data: props.data.map((item) => ({ name: item.label, value: item.value, itemStyle: item.color ? { color: item.color } : undefined })),
      universalTransition: true,
    }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} hasData={props.data.length > 0} dataKey={keyOf("donut", props.data, props.centerValue)} buildOption={buildOption} labels={labels} series={series} />;
}

export function ForgeScatterChart(props: ForgeScatterChartProps) {
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    color: props.series.map((item, index) => item.color ?? tokens.palette[index % tokens.palette.length]),
    animationDuration: reducedMotion ? 0 : 320,
    aria: { enabled: true, decal: { show: false } },
    grid: { left: 10, right: 16, top: props.series.length > 1 ? 38 : 18, bottom: 8, containLabel: true },
    legend: props.series.length > 1 ? { top: 0, textStyle: { color: tokens.muted, fontSize: 11 } } : undefined,
    tooltip: { trigger: "item", backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    xAxis: { type: "value", name: props.xAxisName, nameTextStyle: { color: tokens.muted }, axisLabel: { color: tokens.muted }, splitLine: { lineStyle: { color: tokens.border, type: "dashed" } } },
    yAxis: { type: "value", name: props.yAxisName, nameTextStyle: { color: tokens.muted }, axisLabel: { color: tokens.muted }, splitLine: { lineStyle: { color: tokens.border, type: "dashed" } } },
    series: props.series.map((item, index) => ({ name: item.name, type: "scatter", symbolSize: 9, itemStyle: { color: item.color ?? tokens.palette[index % tokens.palette.length] }, data: item.points.map((point) => ({ name: point.label ?? `${point.x}`, value: [point.x, point.y] })) })),
  }) as EChartsOption;
  const hasData = props.series.some((item) => item.points.length > 0);
  return <ForgeChartSurface {...props} hasData={hasData} dataKey={keyOf("scatter", props.series)} buildOption={buildOption} />;
}

export function ForgeHeatmap(props: ForgeHeatmapProps) {
  const x = Array.from(new Set(props.data.map((item) => item.x)));
  const y = Array.from(new Set(props.data.map((item) => item.y)));
  const values = props.data.map((item) => item.value);
  const min = props.min ?? Math.min(0, ...values);
  const max = props.max ?? Math.max(1, ...values);
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    animationDuration: reducedMotion ? 0 : 300,
    aria: { enabled: true, decal: { show: false } },
    grid: { left: 12, right: 18, top: 14, bottom: 44, containLabel: true },
    tooltip: { position: "top", valueFormatter: (value: unknown) => fullFormatter(props.valueFormatter)(Number(Array.isArray(value) ? value[2] : value)), backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    xAxis: { type: "category", data: x, splitArea: { show: true }, axisLabel: { color: tokens.muted, hideOverlap: true } },
    yAxis: { type: "category", data: y, splitArea: { show: true }, axisLabel: { color: tokens.muted, hideOverlap: true } },
    visualMap: { min, max, calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: [tokens.surface, tokens.primary] }, textStyle: { color: tokens.muted } },
    series: [{ name: props.title ?? "Mật độ", type: "heatmap", data: props.data.map((item) => [x.indexOf(item.x), y.indexOf(item.y), item.value]), label: { show: x.length * y.length <= 36, color: tokens.text, formatter: (params: { value?: unknown }) => compactMetric(Number(Array.isArray(params.value) ? params.value[2] : 0)) }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: tokens.primary } } }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} hasData={props.data.length > 0} dataKey={keyOf("heatmap", props.data, min, max)} buildOption={buildOption} />;
}

export function ForgeGauge(props: ForgeGaugeProps) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    animationDuration: reducedMotion ? 0 : 420,
    aria: { enabled: true, decal: { show: false } },
    series: [{
      type: "gauge",
      min,
      max,
      startAngle: 210,
      endAngle: -30,
      progress: { show: true, width: 12, itemStyle: { color: tokens.primary } },
      axisLine: { lineStyle: { width: 12, color: [[1, tokens.border]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: tokens.muted, distance: 22, fontSize: 10 },
      pointer: { itemStyle: { color: tokens.text }, length: "58%", width: 4 },
      anchor: { show: true, size: 8, itemStyle: { color: tokens.primary } },
      title: { color: tokens.muted, fontSize: 11, offsetCenter: [0, "72%"] },
      detail: { valueAnimation: !reducedMotion, color: tokens.text, fontSize: 24, fontWeight: 700, offsetCenter: [0, "38%"], formatter: (value: number) => fullFormatter(props.valueFormatter)(Number(value)) },
      data: [{ value: props.value, name: props.label ?? props.title ?? "" }],
    }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} hasData={Number.isFinite(props.value)} dataKey={keyOf("gauge", props.value, min, max, props.label)} buildOption={buildOption}><span className="sr-only">{props.label ?? props.title}: {fullFormatter(props.valueFormatter)(props.value)}</span></ForgeChartSurface>;
}

export function ForgeTreemap(props: ForgeTreemapProps) {
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    color: tokens.palette,
    animationDuration: reducedMotion ? 0 : 360,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { valueFormatter: (value: unknown) => fullFormatter(props.valueFormatter)(Number(value)), backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    series: [{ type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false }, label: { color: tokens.text, fontSize: 11 }, upperLabel: { show: true, height: 24, color: tokens.text }, itemStyle: { borderColor: tokens.background, borderWidth: 2, gapWidth: 2 }, data: props.data }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} hasData={props.data.length > 0} dataKey={keyOf("treemap", props.data)} buildOption={buildOption} />;
}

export function ForgeFunnel(props: ForgeFunnelProps) {
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    color: props.data.map((item, index) => item.color ?? tokens.palette[index % tokens.palette.length]),
    animationDuration: reducedMotion ? 0 : 360,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { trigger: "item", valueFormatter: (value: unknown) => fullFormatter(props.valueFormatter)(Number(value)), backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    series: [{ type: "funnel", left: "8%", top: 10, bottom: 10, width: "84%", minSize: "18%", maxSize: "100%", sort: "descending", gap: 4, label: { color: tokens.text, fontSize: 11 }, labelLine: { lineStyle: { color: tokens.border } }, itemStyle: { borderColor: tokens.background, borderWidth: 1 }, data: props.data.map((item) => ({ name: item.label, value: item.value, itemStyle: item.color ? { color: item.color } : undefined })) }],
  }) as EChartsOption;
  const labels = props.data.map((item) => item.label);
  const series: ForgeChartSeries[] = [{ name: props.title ?? "Giá trị", values: props.data.map((item) => item.value) }];
  return <ForgeChartSurface {...props} hasData={props.data.length > 0} dataKey={keyOf("funnel", props.data)} buildOption={buildOption} labels={labels} series={series} />;
}

export function ForgeSankey(props: ForgeSankeyProps) {
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    color: tokens.palette,
    animationDuration: reducedMotion ? 0 : 380,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { trigger: "item", backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    series: [{ type: "sankey", left: 8, right: 8, top: 8, bottom: 8, nodeWidth: 14, nodeGap: 12, layoutIterations: 24, emphasis: { focus: "adjacency" }, lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.42 }, label: { color: tokens.text, fontSize: 11 }, data: props.nodes, links: props.links }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} hasData={props.nodes.length > 0 && props.links.length > 0} dataKey={keyOf("sankey", props.nodes, props.links)} buildOption={buildOption} />;
}

export function ForgeMap(props: ForgeMapProps) {
  const values = props.data.map((item) => item.value);
  const min = props.min ?? Math.min(0, ...values);
  const max = props.max ?? Math.max(1, ...values);
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    animationDuration: reducedMotion ? 0 : 360,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { trigger: "item", valueFormatter: (value: unknown) => fullFormatter(props.valueFormatter)(Number(value)), backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text } },
    visualMap: { min, max, left: 10, bottom: 10, calculable: true, inRange: { color: [tokens.surface, tokens.primary] }, textStyle: { color: tokens.muted } },
    series: [{ name: props.title ?? "Bản đồ", type: "map", map: props.mapName, roam: true, scaleLimit: { min: 1, max: 8 }, label: { show: false }, itemStyle: { areaColor: tokens.surface, borderColor: tokens.border }, emphasis: { label: { show: true, color: tokens.text }, itemStyle: { areaColor: tokens.primary } }, data: props.data }],
  }) as EChartsOption;
  const prepareEngine = (engine: { registerMap: (name: string, geoJson: object) => void }) => engine.registerMap(props.mapName, props.geoJson);
  return <ForgeChartSurface {...props} hasData={props.data.length > 0} dataKey={keyOf("map", props.mapName, props.data)} buildOption={buildOption} prepareEngine={prepareEngine as never} />;
}

export function ForgeSparkline({ values, labels = [], strokeWidth = 2, height = 48, ...props }: ForgeSparklineProps) {
  const actualLabels = values.map((_, index) => labels[index] ?? String(index + 1));
  const series: ForgeChartSeries[] = [{ name: props.ariaLabel ?? "Xu hướng", values }];
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    animationDuration: reducedMotion ? 0 : 220,
    grid: { left: 1, right: 1, top: 3, bottom: 3 },
    tooltip: { show: false },
    xAxis: { type: "category", data: actualLabels, show: false, boundaryGap: false },
    yAxis: { type: "value", show: false, scale: true },
    series: [{ type: "line", data: values, showSymbol: false, silent: true, smooth: true, lineStyle: { color: tokens.primary, width: strokeWidth }, areaStyle: { color: tokens.primary, opacity: tokens.dark ? 0.16 : 0.08 } }],
  }) as EChartsOption;
  return <ForgeChartSurface {...props} height={height} hasData={values.length > 0} dataKey={keyOf("sparkline", values, actualLabels)} buildOption={buildOption} labels={actualLabels} series={series} />;
}

export function ForgeWaterfall({ labels, values, totalLabel, ...props }: ForgeWaterfallProps) {
  const rows = buildWaterfallSegments(labels, values, totalLabel);
  const compact = props.compactValueFormatter ?? compactMetric;
  const full = fullFormatter(props.valueFormatter);
  const buildOption: ForgeOptionBuilder = ({ tokens, reducedMotion }) => ({
    animationDuration: reducedMotion ? 0 : 360,
    aria: { enabled: true, decal: { show: false } },
    grid: { left: 10, right: 14, top: 18, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: tokens.background, borderColor: tokens.border, textStyle: { color: tokens.text }, formatter: (params: unknown) => {
      const list = Array.isArray(params) ? params as Array<{ dataIndex?: number }> : [];
      const row = rows[list[0]?.dataIndex ?? 0];
      return row ? `${row.label}<br/>${full(row.total)}` : "";
    } },
    xAxis: { type: "category", data: rows.map((row) => row.label), axisLine: { lineStyle: { color: tokens.border } }, axisTick: { show: false }, axisLabel: { color: tokens.muted, hideOverlap: true } },
    yAxis: { type: "value", axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: tokens.border, type: "dashed" } }, axisLabel: { color: tokens.muted, formatter: (value: number) => compact(value) } },
    series: [
      { name: "base", type: "bar", stack: "waterfall", silent: true, itemStyle: { color: "transparent" }, emphasis: { itemStyle: { color: "transparent" } }, data: rows.map((row) => row.base) },
      { name: "Tăng", type: "bar", stack: "waterfall", itemStyle: { color: tokens.success, borderRadius: [4, 4, 0, 0] }, data: rows.map((row) => row.positive), label: { show: rows.length <= 12, position: "top", color: tokens.muted, formatter: (params: { value?: unknown }) => Number(params.value) ? compact(Number(params.value)) : "" } },
      { name: "Giảm", type: "bar", stack: "waterfall", itemStyle: { color: tokens.danger, borderRadius: [0, 0, 4, 4] }, data: rows.map((row) => row.negative), label: { show: rows.length <= 12, position: "bottom", color: tokens.muted, formatter: (params: { value?: unknown }) => Number(params.value) ? `−${compact(Number(params.value))}` : "" } },
    ],
  }) as EChartsOption;
  const a11ySeries: ForgeChartSeries[] = [{ name: props.title ?? "Biến động", values: rows.map((row) => row.total) }];
  return <ForgeChartSurface {...props} hasData={values.length > 0} dataKey={keyOf("waterfall", labels, values, totalLabel)} buildOption={buildOption} labels={rows.map((row) => row.label)} series={a11ySeries} />;
}
