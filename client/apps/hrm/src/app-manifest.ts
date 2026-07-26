import type { AppManifest } from "@metaforge/core";

/**
 * Kairo Nhân sự — app NGHIỆP VỤ, không phải Desk chung.
 *
 * Trang chủ là màn tác nghiệp (`/x/leave-approval`), không phải một danh sách: người
 * dùng chính là quản lý duyệt đơn trên điện thoại, mở app ra phải thấy việc cần làm
 * chứ không phải một cái bảng để tự tìm.
 *
 * Các DocType vẫn nằm trong nav để tra cứu và nhập liệu đầy đủ — App-mode và Desk-mode
 * dùng chung một nguồn dữ liệu, chỉ khác cách trình bày.
 */
export const APP_MANIFEST: AppManifest = {
  id: "hrm",
  name: "Kairo Nhân sự",
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
