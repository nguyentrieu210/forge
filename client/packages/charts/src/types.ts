export type ForgeChartTheme = "auto" | "light" | "dark";
export type ForgeChartRenderer = "canvas" | "svg";

export interface ForgeChartSeries {
  name: string;
  values: number[];
  stack?: string;
  color?: string;
}

export interface ForgeChartPoint {
  label: string;
  value: number;
  color?: string;
}

export interface ForgeScatterPoint {
  x: number | string;
  y: number;
  label?: string;
}

export interface ForgeHeatmapPoint {
  x: string;
  y: string;
  value: number;
}

export interface ForgeTreeNode {
  name: string;
  value?: number;
  children?: ForgeTreeNode[];
}

export interface ForgeSankeyNode {
  name: string;
}

export interface ForgeSankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface ForgeMapDatum {
  name: string;
  value: number;
}

export interface ForgeChartInteraction {
  label: string;
  index: number;
  seriesName?: string;
  value?: number;
}

export interface ForgeChartBaseProps {
  title?: string;
  height?: number;
  className?: string;
  theme?: ForgeChartTheme;
  renderer?: ForgeChartRenderer;
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
  ariaLabel?: string;
  onRetry?: () => void;
  onActivate?: (interaction: ForgeChartInteraction) => void;
  valueFormatter?: (value: number) => string;
  compactValueFormatter?: (value: number) => string;
  animation?: boolean;
}

export interface ForgeCartesianChartProps extends ForgeChartBaseProps {
  labels: string[];
  series: ForgeChartSeries[];
  showLegend?: boolean;
  showLabels?: boolean;
  smooth?: boolean;
}

export interface ForgeDonutChartProps extends ForgeChartBaseProps {
  data: ForgeChartPoint[];
  showLegend?: boolean;
  centerLabel?: string;
  centerValue?: string;
}

export interface ForgeScatterChartProps extends ForgeChartBaseProps {
  series: Array<{ name: string; points: ForgeScatterPoint[]; color?: string }>;
  xAxisName?: string;
  yAxisName?: string;
}

export interface ForgeHeatmapProps extends ForgeChartBaseProps {
  data: ForgeHeatmapPoint[];
  min?: number;
  max?: number;
}

export interface ForgeGaugeProps extends ForgeChartBaseProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
}

export interface ForgeTreemapProps extends ForgeChartBaseProps {
  data: ForgeTreeNode[];
}

export interface ForgeFunnelProps extends ForgeChartBaseProps {
  data: ForgeChartPoint[];
}

export interface ForgeSankeyProps extends ForgeChartBaseProps {
  nodes: ForgeSankeyNode[];
  links: ForgeSankeyLink[];
}

export interface ForgeMapProps extends ForgeChartBaseProps {
  mapName: string;
  geoJson: object;
  data: ForgeMapDatum[];
  min?: number;
  max?: number;
}

export interface ForgeSparklineProps extends Omit<ForgeChartBaseProps, "title" | "onRetry"> {
  values: number[];
  labels?: string[];
  strokeWidth?: number;
}

export interface ForgeWaterfallProps extends ForgeChartBaseProps {
  labels: string[];
  values: number[];
  totalLabel?: string;
}
