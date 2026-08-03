import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, applyBrand } from "@metaforge/shell";
import { CommandCenterView, DashboardView } from "@metaforge/views";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "command" ? "command" : "dashboard";
const dark = mode === "command" || params.get("theme") === "dark";

document.documentElement.classList.toggle("dark", dark);
document.documentElement.dataset.theme = dark ? "dark" : "light";
applyBrand("rose");

const labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const revenue = [820, 910, 865, 1_040, 1_120, 1_080, 1_240, 1_330, 1_290, 1_410, 1_520, 1_680];
const cost = [610, 650, 640, 700, 760, 735, 810, 860, 845, 900, 940, 1_010];
const orders = [48, 52, 46, 61, 66, 64, 72, 78, 76, 81, 88, 96];

const cards = [
  { label: "Doanh thu", value: "1,68 tỷ", trend: 10.5, description: "Tháng hiện tại", sparkline: revenue.slice(-7) },
  { label: "Đơn hàng", value: 96, trend: 9.1, description: "12 đơn cần xử lý", sparkline: orders.slice(-7) },
  { label: "Biên lợi nhuận", value: "39,9%", trend: 2.4, description: "Sau giá vốn" },
  { label: "Cảnh báo", value: 3, trend: -25, higherIsBetter: false, description: "1 cảnh báo mức cao" },
];

const charts = [
  {
    title: "Doanh thu và chi phí",
    type: "line",
    labels,
    datasets: [
      { name: "Doanh thu", values: revenue },
      { name: "Chi phí", values: cost },
    ],
  },
  {
    title: "Đơn hàng theo tháng",
    type: "bar",
    labels,
    datasets: [{ name: "Đơn", values: orders }],
  },
  {
    title: "Xu hướng hiệu suất",
    type: "area",
    labels,
    datasets: [{ name: "Hiệu suất", values: [68, 70, 72, 71, 75, 78, 80, 79, 83, 85, 87, 91] }],
  },
];

function EvidenceApp() {
  if (mode === "command") {
    return (
      <div data-testid="v3-05-command-center">
        <CommandCenterView
          title="Trung tâm điều hành Forge"
          subtitle="Bề mặt trình bày command-center dùng dữ liệu mock cô lập để kiểm chứng responsive, fullscreen, resize và reduced-motion."
          fullscreen
          live
          statusLabel="Luồng vận hành"
          updatedAt="04/08/2026 09:30"
          cards={cards}
          charts={charts}
          alerts={[
            { label: "Đơn hàng chậm SLA", detail: "2 đơn vượt ngưỡng xử lý nội bộ.", severity: "danger", active: true },
            { label: "Tồn kho cần chú ý", detail: "Một nhóm hàng xuống dưới mức cảnh báo.", severity: "warning" },
            { label: "Đồng bộ dữ liệu", detail: "Luồng gần nhất hoàn tất bình thường.", severity: "info" },
          ]}
        />
      </div>
    );
  }

  return (
    <div data-testid="v3-05-dashboard" className="min-h-screen bg-background text-foreground">
      <DashboardView
        cards={cards}
        charts={charts}
        filterSummary="Năm 2026 · Toàn công ty"
        updatedAt="04/08/2026 09:30"
      />
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <EvidenceApp />
    </I18nProvider>
  </StrictMode>,
);
