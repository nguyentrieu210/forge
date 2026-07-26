import type { AppManifest } from "@metaforge/core";

export const APP_MANIFEST: AppManifest = {
  id: "sample-sales",
  name: "Sample Sales",
  version: "1.0.0",
  brand: "warm",
  domain: "selling",
  catalogMode: "hybrid",
  home: { route: "/overview/selling", doctype: "Sales Order" },
  businessContext: { mode: "server-resolved", dimensions: ["company", "fiscal_year", "warehouse"] },
  nav: [
    { key: "selling", label: "Tổng quan", kind: "overview", group: "Điều hành", icon: "layout-dashboard" },
    { key: "selling-process", label: "Quy trình", kind: "process", route: "/process/selling", group: "Điều hành", icon: "workflow" },
    { key: "catalog", label: "Danh mục ứng dụng", kind: "route", route: "/catalog", group: "Điều hành", icon: "grid-3x3" },
    { key: "Sales Order", label: "Đơn bán hàng", kind: "doctype", group: "Ứng dụng tùy chỉnh", icon: "file-text" },
  ],
};
