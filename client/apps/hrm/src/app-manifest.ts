import type { AppManifest } from "@metaforge/core";

/**
 * Nhân sự tối giản cho vận hành xưởng: chỉ giữ hai việc người dùng cần hằng ngày.
 * Các DocType HRM mở rộng vẫn có thể tồn tại phía server, nhưng không chen vào trải nghiệm
 * Alumdoor chỉ để chứng minh rằng phần mềm biết nhiều thuật ngữ nhân sự hơn con người cần.
 */
export const APP_MANIFEST: AppManifest = {
  id: "hrm",
  name: "Nhân sự",
  version: "1.0.1",
  brand: "blue",
  domain: "hr",
  catalogMode: "hybrid",
  home: { route: "/app/Employee", doctype: "Employee" },
  businessContext: {
    mode: "server-resolved",
    dimensions: ["company"],
  },
  nav: [
    { key: "Employee", label: "Nhân viên", kind: "doctype", icon: "users", group: "Nhân sự" },
    { key: "Attendance", label: "Chấm công", kind: "doctype", icon: "clock", group: "Nhân sự" },
  ],
};
