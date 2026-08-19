import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

// Mặc định của ChartSurface là renderer "canvas"; SVG chỉ dùng khi người gọi xin đích danh.
// Đăng ký sẵn cả hai nghĩa là mọi biểu đồ đều mang theo bộ vẽ nó không dùng.
echarts.use([SVGRenderer]);
