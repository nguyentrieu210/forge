import * as echarts from "echarts/core";
import {
  BarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from "echarts/charts";
import {
  AriaComponent,
  DataZoomComponent,
  DatasetComponent,
  GeoComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

let registered = false;

export function getForgeECharts() {
  if (!registered) {
    echarts.use([
      LineChart,
      BarChart,
      PieChart,
      ScatterChart,
      HeatmapChart,
      GaugeChart,
      TreemapChart,
      FunnelChart,
      SankeyChart,
      MapChart,
      GridComponent,
      DatasetComponent,
      TooltipComponent,
      LegendComponent,
      VisualMapComponent,
      GeoComponent,
      TitleComponent,
      AriaComponent,
      DataZoomComponent,
      TransformComponent,
      LabelLayout,
      UniversalTransition,
      CanvasRenderer,
      SVGRenderer,
    ]);
    registered = true;
  }
  return echarts;
}

export type ForgeEChartsEngine = ReturnType<typeof getForgeECharts>;
