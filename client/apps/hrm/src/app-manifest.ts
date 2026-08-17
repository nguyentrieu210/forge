import type { AppManifest } from "@metaforge/core";

/**
 * Kairo Nhân sự — app NGHIỆP VỤ, không phải Desk chung.
 *
 * Alumdoor Lite ưu tiên một luồng vận hành nhỏ và tự động:
 * Nhân viên -> ca/lịch làm -> công tự động -> phép -> khoản cộng/trừ -> kỳ lương -> phiếu lương.
 *
 * `AlumDoor Attendance Day` là nguồn công chuẩn dùng cho payroll Alumdoor. Generic
 * `Attendance`, `Attendance Request` và `Overtime Request` vẫn tồn tại trong catalog để
 * tương thích HRM chung nhưng không nằm trên navigation Lite. OT của Alumdoor được hệ thống
 * tính trực tiếp từ scan + Shift Assignment, không có màn duyệt OT hay phiếu sửa lương.
 *
 * `Employee Advance` enterprise vẫn còn trong catalog để tương thích nhưng không nằm trên
 * đường vận hành Lite. Tạm ứng đơn giản được ghi như một khoản Deduction trong Additional Salary.
 */
export const APP_MANIFEST: AppManifest = {
  id: "hrm",
  name: "Kairo Nhân sự",
  version: "1.0.0",
  brand: "enterprise",
  domain: "hr",
  catalogMode: "hybrid",
  home: { route: "/x/leave-approval", doctype: "Leave Application" },
  businessContext: {
    mode: "server-resolved",
    dimensions: ["company", "fiscal_year"],
  },
  nav: [
    { key: "leave-approval", label: "Duyệt nghỉ phép", kind: "experience", icon: "smartphone", group: "Tác nghiệp" },

    { key: "Employee", label: "Nhân viên", kind: "doctype", icon: "users", group: "Nhân sự" },
    { key: "Shift Type", label: "Ca làm", kind: "doctype", icon: "clock", group: "Nhân sự" },
    { key: "Shift Assignment", label: "Phân ca", kind: "doctype", icon: "calendar", group: "Nhân sự" },
    { key: "AlumDoor Pay Profile", label: "Mức lương", kind: "doctype", icon: "badge-dollar-sign", group: "Nhân sự" },

    { key: "AlumDoor Attendance Day", label: "Bảng công", kind: "doctype", icon: "calendar-check", group: "Chấm công" },
    { key: "Leave Application", label: "Nghỉ phép", kind: "doctype", icon: "calendar-off", group: "Chấm công" },

    { key: "Additional Salary", label: "Thưởng / khấu trừ / tạm ứng", kind: "doctype", icon: "circle-dollar-sign", group: "Tính lương" },
    { key: "Payroll Entry", label: "Kỳ lương", kind: "doctype", icon: "calculator", group: "Tính lương" },
    { key: "Salary Slip", label: "Phiếu lương", kind: "doctype", icon: "receipt-text", group: "Tính lương" },

    { key: "catalog", label: "Danh mục ứng dụng", kind: "route", route: "/catalog", group: "Hệ thống", icon: "grid-3x3" },
  ],
};
