import type { AppManifest } from "@metaforge/core";

/** App kho dùng catalog Workspace thật; nav dưới đây chỉ giữ Experience và màn hệ thống bổ sung. */
export const APP_MANIFEST: AppManifest = {
  id: "aphvh-wms",
  name: "APHVH — Kho",
  version: "1.0.0",
  brand: "blue",
  domain: "stock",
  catalogMode: "hybrid",
  home: { route: "/overview/stock", doctype: "Warehouse Transfer" },
  businessContext: {
    mode: "server-resolved",
    dimensions: ["company", "fiscal_year", "warehouse"],
  },
  nav: [
    { key: "Warehouse Transfer", label: "Chuyển kho", icon: "arrow-left-right", group: "Nghiệp vụ mở rộng" },
    { key: "Inventory Discrepancy", label: "Chênh lệch kiểm kê", icon: "clipboard-list", group: "Nghiệp vụ mở rộng" },
    { key: "Lot Hold", label: "Giữ lô", icon: "lock", group: "Nghiệp vụ mở rộng" },
    { key: "Warehouse Kind", label: "Loại kho", icon: "boxes", group: "Danh mục mở rộng" },
    { key: "receive", label: "Nhận/Giao (App)", icon: "smartphone", group: "Vận hành nhanh", kind: "experience" },
    { key: "__import", label: "Nhập dữ liệu", icon: "file-spreadsheet", group: "Hệ thống", kind: "system", route: "/import" },
    { key: "__permissions", label: "Trung tâm phân quyền", icon: "shield-check", group: "Hệ thống", kind: "system", route: "/permissions" },
    { key: "__settings", label: "Thiết lập", icon: "settings", group: "Hệ thống", kind: "system", route: "/settings" },
  ],
};
