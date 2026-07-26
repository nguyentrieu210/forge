export type OverviewTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface OverviewMetric {
  key: string;
  label: string;
  value: number | string;
  formatted?: string;
  tone?: OverviewTone;
  icon?: string;
  route?: string;
  description?: string;
}

export interface OverviewChartSeries {
  name: string;
  values: number[];
}
export interface OverviewChart {
  key: string;
  label: string;
  type: "line" | "bar" | "donut" | "area";
  labels: string[];
  series: OverviewChartSeries[];
  route?: string;
}

export interface OverviewTask {
  key: string;
  label: string;
  count: number;
  overdue?: number;
  tone?: OverviewTone;
  route?: string;
  description?: string;
}

export interface OverviewActivity {
  key: string;
  label: string;
  description?: string;
  timestamp?: string;
  route?: string;
  actor?: string;
}

export interface OverviewAction {
  key: string;
  label: string;
  icon?: string;
  route: string;
  capability?: string;
}

export interface OverviewDashboard {
  unsupported?: boolean;
  key: string;
  label: string;
  subtitle?: string;
  metrics: OverviewMetric[];
  charts: OverviewChart[];
  tasks: OverviewTask[];
  activities: OverviewActivity[];
  actions: OverviewAction[];
}
