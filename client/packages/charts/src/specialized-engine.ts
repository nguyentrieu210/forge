import * as echarts from "echarts/core";
import { FunnelChart, GaugeChart, HeatmapChart, MapChart, SankeyChart, ScatterChart, TreemapChart } from "echarts/charts";
import { GeoComponent, VisualMapComponent } from "echarts/components";

// Bảy loại biểu đồ này trước đây được đăng ký sẵn cùng lõi, nên MỌI biểu đồ — kể cả cái
// đường kẻ đơn giản nhất — đều kéo theo MapChart và GeoComponent, phần nặng nhất của echarts.
// Không màn nào trong app đang dùng chúng. Tách ra module riêng để chỉ nạp khi thật sự vẽ.
// Đăng ký ngay lúc module được nạp: nạp module này CHÍNH LÀ hành động bật chúng lên.
echarts.use([
  ScatterChart,
  HeatmapChart,
  GaugeChart,
  TreemapChart,
  FunnelChart,
  SankeyChart,
  MapChart,
  GeoComponent,
  VisualMapComponent,
]);
