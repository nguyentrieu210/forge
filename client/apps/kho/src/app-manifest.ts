import type { AppManifest } from "@metaforge/core";

/**
 * App "Kho" — ĐƠN GIẢN, không dùng Business Context/Overview/Process/Catalog (goal100) vì các phần
 * đó còn nhiều lỗ hổng chưa hoàn thiện (Ctrl+K/i18n/auto-fill một phần). Chỉ List/Form generic từ
 * metadata thật, tương tự workspace Stock của ERPNext — đối chiếu THẬT qua get_desktop_page trên
 * metaforge.localhost (không đoán tên/doctype).
 */
export const APP_MANIFEST: AppManifest = {
  id: "kho",
  name: "Kho",
  version: "1.0.0",
  brand: "blue",
  home: { doctype: "Stock Entry" },
  nav: [
    // Vật tư (khớp card "Items Catalogue" thật của ERPNext Stock workspace)
    { key: "Item", label: "Vật tư/Hàng hoá", kind: "doctype", group: "Vật tư", icon: "package" },
    { key: "Item Group", label: "Nhóm vật tư", kind: "doctype", group: "Vật tư", icon: "folder-tree" },
    { key: "Brand", label: "Thương hiệu", kind: "doctype", group: "Vật tư", icon: "tag" },
    { key: "UOM", label: "Đơn vị tính", kind: "doctype", group: "Vật tư", icon: "ruler" },
    { key: "Price List", label: "Bảng giá", kind: "doctype", group: "Vật tư", icon: "list" },
    { key: "Item Price", label: "Giá vật tư", kind: "doctype", group: "Vật tư", icon: "circle-dollar-sign" },

    // Giao dịch kho (khớp card "Stock Transactions" thật)
    { key: "Stock Entry", label: "Phiếu xuất/nhập/chuyển kho", kind: "doctype", group: "Giao dịch kho", icon: "arrow-left-right" },
    { key: "Material Request", label: "Yêu cầu vật tư", kind: "doctype", group: "Giao dịch kho", icon: "clipboard-list" },
    { key: "Purchase Receipt", label: "Phiếu nhập mua", kind: "doctype", group: "Giao dịch kho", icon: "package-check" },
    { key: "Delivery Note", label: "Phiếu giao hàng", kind: "doctype", group: "Giao dịch kho", icon: "truck" },
    { key: "Pick List", label: "Phiếu lấy hàng", kind: "doctype", group: "Giao dịch kho", icon: "list-checks" },

    // Serial & Lô (khớp card "Serial No and Batch" thật)
    { key: "Serial No", label: "Số serial", kind: "doctype", group: "Serial & Lô", icon: "hash" },
    { key: "Batch", label: "Lô hàng", kind: "doctype", group: "Serial & Lô", icon: "layers" },

    // Công cụ (khớp card "Tools" thật)
    { key: "Stock Reconciliation", label: "Kiểm kê/Điều chỉnh kho", kind: "doctype", group: "Công cụ", icon: "scale" },
    { key: "Quality Inspection", label: "Kiểm tra chất lượng", kind: "doctype", group: "Công cụ", icon: "shield-check" },
    { key: "Landed Cost Voucher", label: "Phân bổ chi phí nhập hàng", kind: "doctype", group: "Công cụ", icon: "receipt" },

    // Cài đặt (khớp card "Settings" thật)
    { key: "Warehouse", label: "Kho hàng", kind: "doctype", group: "Cài đặt", icon: "warehouse" },
    { key: "Stock Settings", label: "Thiết lập Kho", kind: "doctype", group: "Cài đặt", icon: "settings" },
  ],
};
