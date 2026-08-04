import type { AppManifest } from "@metaforge/core";

/**
 * Forge Nhân sự — app nghiệp vụ HRM trên shared Forge runtime.
 *
 * `@metaforge/*` remains the technical package namespace; the product-facing
 * brand is Forge. Trang chủ là màn tác nghiệp (`/x/leave-approval`) để quản lý
 * mở app là thấy ngay việc cần xử lý.
 *
 * Các DocType vẫn nằm trong nav để tra cứu và nhập liệu đầy đủ — App-mode và
 * Desk-mode dùng chung một nguồn dữ liệu, chỉ khác cách trình bày.
 */
export const APP_MANIFEST: AppManifest = {
  id: "hrm",
  name: "Forge Nhân sự",
  version: "1.0.0",
  brand: "blue",
  domain: "hr",
  catalogMode: "hybrid",
  home: { route: "/x/leave-approval", doctype: "Leave Application" },
  businessContext: {
    mode: "server-resolved",
    // KHÔNG có `warehouse`. Mẫu scaffold mặc định kèm nó vì được sinh ra cho app kho,
    // và một app nhân sự đòi chọn kho sẽ bị shell chặn ở "Cần chọn phạm vi dữ liệu"
    // trên một chiều không bao giờ có dữ liệu để chọn.
    dimensions: ["company", "fiscal_year"],
  },
  nav: [
    { key: "leave-approval", label: "Duyệt nghỉ phép", kind: "experience", icon: "smartphone", group: "Tác nghiệp" },
    { key: "Leave Application", label: "Đơn nghỉ phép", kind: "doctype", icon: "calendar-off", group: "Nhân sự" },
    { key: "Employee", label: "Nhân viên", kind: "doctype", icon: "users", group: "Nhân sự" },
    { key: "Attendance", label: "Chấm công", kind: "doctype", icon: "clock", group: "Nhân sự" },
    { key: "Employee Advance", label: "Tạm ứng", kind: "doctype", icon: "wallet", group: "Nhân sự" },
    { key: "catalog", label: "Danh mục ứng dụng", kind: "route", route: "/catalog", group: "Hệ thống", icon: "grid-3x3" },
  ],
};
