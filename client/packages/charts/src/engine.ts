import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

let registered = false;

/**
 * Lõi biểu đồ: đường, cột, tròn — ba loại mà app thật sự dùng, cộng bộ vẽ canvas.
 * Các loại nặng (bản đồ, sankey, treemap, funnel, gauge, heatmap, scatter) và bộ vẽ SVG
 * nằm ở module riêng, chỉ nạp khi có người vẽ chúng.
 */
export function getForgeECharts() {
  if (!registered) {
    echarts.use([
      LineChart,
      BarChart,
      PieChart,
      GridComponent,
      DatasetComponent,
      TooltipComponent,
      LegendComponent,
      GraphicComponent,
      TitleComponent,
      AriaComponent,
      DataZoomComponent,
      TransformComponent,
      LabelLayout,
      UniversalTransition,
      CanvasRenderer,
    ]);
    registered = true;
  }
  return echarts;
}

let specializedCharts: Promise<void> | null = null;

/** Bật nhóm biểu đồ nặng. Gọi bao nhiêu lần cũng chỉ nạp một lần. */
export function ensureSpecializedCharts(): Promise<void> {
  specializedCharts ??= import("./specialized-engine.js").then(() => undefined);
  return specializedCharts;
}

let svgRenderer: Promise<void> | null = null;

/** Bật bộ vẽ SVG cho người gọi xin đích danh `renderer="svg"`. */
export function ensureSvgRenderer(): Promise<void> {
  svgRenderer ??= import("./svg-renderer.js").then(() => undefined);
  return svgRenderer;
}

export type ForgeEChartsEngine = ReturnType<typeof getForgeECharts>;
