import type { AppManifest } from "@metaforge/core";

export const APP_MANIFEST: AppManifest = {
  id: "sample-wms",
  name: "Sample WMS",
  version: "1.0.0",
  brand: "blue",
  domain: "stock",
  catalogMode: "hybrid",
  home: { route: "/overview/stock", doctype: "Stock Entry" },
  businessContext: { mode: "server-resolved", dimensions: ["company", "fiscal_year", "warehouse"] },
  nav: [
    { key: "stock", label: "Tổng quan", kind: "overview", group: "Điều hành", icon: "layout-dashboard" },
    { key: "stock-process", label: "Quy trình", kind: "process", route: "/process/stock", group: "Điều hành", icon: "workflow" },
    { key: "catalog", label: "Danh mục ứng dụng", kind: "route", route: "/catalog", group: "Điều hành", icon: "grid-3x3" },
    { key: "Stock Entry", label: "Phiếu kho", kind: "doctype", group: "Ứng dụng tùy chỉnh", icon: "boxes" },
  ],
};
