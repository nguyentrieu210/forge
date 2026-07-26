import type { AppManifest } from "@metaforge/core";

/**
 * App "Kho" cho doanh nghiệp Việt — theo BRD-APHVH-ERP-001 v1.4 (§9 tổ chức/dữ liệu nền, §10 kho,
 * §19 dashboard & báo cáo).
 *
 * Nguyên tắc sắp nav: theo VIỆC PHẢI LÀM và AI LÀM, không theo cây DocType của ERPNext.
 * `apps/kho` cũ soi đúng workspace Stock nên có Bảng giá, Giá vật tư, Landed Cost, Stock Settings…
 * trộn lẫn với việc hằng ngày của thủ kho.
 *
 * Tuân thủ §6 Nguyên tắc giải pháp: #2 không sửa lõi Frappe/ERPNext · #3/#4 không có sổ kho thứ hai,
 * mọi thay đổi tồn đi qua chứng từ ERPNext chuẩn · #9 tách Company và kho bằng User Permission.
 */
export const APP_MANIFEST: AppManifest = {
  id: "kho-vn",
  name: "Quản lý kho",
  version: "2.0.0",
  brand: "blue",
  domain: "stock",
  home: { route: "/ton-kho" },

  /**
   * §9 ORG-001…008 — đa công ty, đa kho.
   * Server (metaforge.api.get_business_context) trả về danh sách Company/Warehouse mà CHÍNH user
   * này được phép thấy, dựa trên Role + User Permission. Client chỉ hiển thị và gửi lựa chọn kèm
   * mọi truy vấn; không tự suy diễn quyền. Đổi Company ⇒ mọi list/report/tạo mới đổi theo.
   */
  businessContext: {
    mode: "server-resolved",
    dimensions: ["company", "warehouse"],
    /**
     * CHỦ Ý: chỉ LỌC DANH SÁCH theo `company`, còn `warehouse` chỉ dùng để ĐIỀN SẴN khi tạo mới.
     * Lý do: kho trên chứng từ có thể đặt ở từng DÒNG hàng, không chỉ ở field kho mặc định trên
     * đầu chứng từ. Lọc danh sách theo kho mặc định sẽ giấu mất những phiếu có hàng vào đúng kho
     * đó nhưng khai ở dòng — người dùng tưởng mất phiếu. Lọc theo company thì luôn chính xác.
     */
    policies: {
      "Purchase Receipt": {
        supported: ["company", "warehouse"],
        listFilters: { company: "company" },
        createDefaults: { company: "company", warehouse: "set_warehouse" },
        dateField: "posting_date",
      },
      "Stock Entry": {
        supported: ["company"],
        listFilters: { company: "company" },
        createDefaults: { company: "company" },
        dateField: "posting_date",
      },
      "Delivery Note": {
        supported: ["company", "warehouse"],
        listFilters: { company: "company" },
        createDefaults: { company: "company", warehouse: "set_warehouse" },
        dateField: "posting_date",
      },
      "Material Request": {
        supported: ["company", "warehouse"],
        listFilters: { company: "company" },
        createDefaults: { company: "company", warehouse: "set_warehouse" },
        dateField: "transaction_date",
      },
      "Stock Reconciliation": {
        supported: ["company", "warehouse"],
        listFilters: { company: "company" },
        createDefaults: { company: "company", warehouse: "set_warehouse" },
        dateField: "posting_date",
      },
      Warehouse: {
        supported: ["company"],
        listFilters: { company: "company" },
        createDefaults: { company: "company" },
      },
    },
  },

  nav: [
    // ══ Hằng ngày ═══════════════════════════════════════════════════════════
    // Tổng quan (§19 DSH-002): chỉ số + biểu đồ + việc cần xử lý, do server tính theo domain
    // "stock" và theo Công ty/Kho đang chọn. kind="overview" → route /overview/<key>.
    { key: "stock", label: "Tổng quan", kind: "overview", group: "Hằng ngày", icon: "gauge" },
    { key: "ton-kho", label: "Tồn kho", kind: "route", route: "/ton-kho", group: "Hằng ngày", icon: "layout-dashboard" },
    // Màn nhập kiểu bán lẻ: quét mã → số lượng → lưu. Đặt TRƯỚC "Nhập hàng" (form đầy đủ) vì
    // đây là đường đi của 90% lần nhập thường ngày; form đầy đủ chỉ cần khi phải khai thuế,
    // chi phí nhập kho, hay sửa chứng từ cũ.
    { key: "nhap-nhanh", label: "Nhập hàng nhanh", kind: "route", route: "/nhap-nhanh", group: "Hằng ngày", icon: "scan-barcode" },
    { key: "Purchase Receipt", label: "Nhập hàng (đầy đủ)", kind: "doctype", group: "Hằng ngày", icon: "package-check" },
    { key: "Stock Entry", label: "Chuyển kho", kind: "doctype", group: "Hằng ngày", icon: "arrow-left-right" },
    { key: "Delivery Note", label: "Xuất hàng", kind: "doctype", group: "Hằng ngày", icon: "truck" },
    { key: "Material Request", label: "Yêu cầu vật tư", kind: "doctype", group: "Hằng ngày", icon: "clipboard-list" },
    // Nhập hàng loạt từ file mẫu MISA — dùng khi chuyển số liệu từ phần mềm cũ sang, hoặc khi
    // kế toán đã có sẵn file và không muốn gõ lại từng phiếu.
    { key: "nhap-excel", label: "Nhập từ Excel", kind: "route", route: "/nhap-excel", group: "Hằng ngày", icon: "file-spreadsheet" },

    // ══ Ngoài kho (công nhân) ═══════════════════════════════════════════════
    // kind="experience" → route /x/<key>, chạy trong MobileShell: nút to, quét mã, thao tác 1 tay.
    // Dành cho người đứng giữa kho cầm điện thoại, không phải ngồi bàn với chuột.
    { key: "tra-ton", label: "Quét tra tồn", kind: "experience", group: "Ngoài kho", icon: "scan-line" },
    { key: "chuyen-nhanh", label: "Chuyển kho nhanh", kind: "experience", group: "Ngoài kho", icon: "forklift" },

    // ══ Lô & Chất lượng ═════════════════════════════════════════════════════
    { key: "Batch", label: "Lô hàng", kind: "doctype", group: "Lô & Chất lượng", icon: "layers" },
    { key: "Quality Inspection", label: "Kiểm tra chất lượng", kind: "doctype", group: "Lô & Chất lượng", icon: "shield-check" },
    { key: "Stock Reconciliation", label: "Kiểm kê", kind: "doctype", group: "Lô & Chất lượng", icon: "scale" },

    // ══ Báo cáo (§19) ═══════════════════════════════════════════════════════
    // Query Report chuẩn của ERPNext, chạy qua ReportContainer — không tự tính lại số liệu.
    // Biểu kế toán kho hay dùng nhất — để ĐẦU nhóm. Màn riêng (không qua ReportContainer) vì phải
    // dựng đúng mẫu VN: tiêu đề hai tầng, dòng tổng, xuất Excel đúng biểu. Số liệu vẫn lấy từ
    // report `Stock Balance` của ERPNext, không tự cộng sổ.
    { key: "bc-xnt", label: "Nhập xuất tồn", kind: "route", route: "/bao-cao/xuat-nhap-ton", group: "Báo cáo", icon: "table-2" },
    { key: "bc-so-chi-tiet", label: "Sổ chi tiết / Thẻ kho", kind: "route", route: "/bao-cao/so-chi-tiet", group: "Báo cáo", icon: "scroll-text" },
    { key: "bc-doi-tuong", label: "Nhập/xuất theo đối tác", kind: "route", route: "/bao-cao/tong-hop-doi-tuong", group: "Báo cáo", icon: "users" },
    { key: "bc-ton-kho", label: "Tồn kho chi tiết", kind: "route", route: "/bao-cao/stock-balance", group: "Báo cáo", icon: "bar-chart-3" },
    { key: "bc-so-kho", label: "Sổ kho", kind: "route", route: "/bao-cao/stock-ledger", group: "Báo cáo", icon: "scroll-text" },
    { key: "bc-du-kien", label: "Tồn dự kiến", kind: "route", route: "/bao-cao/stock-projected-qty", group: "Báo cáo", icon: "trending-up" },
    { key: "bc-lo", label: "Tồn theo lô", kind: "route", route: "/bao-cao/batch-wise-balance-history", group: "Báo cáo", icon: "layers-3" },

    // ══ Danh mục ════════════════════════════════════════════════════════════
    { key: "Item", label: "Vật tư", kind: "doctype", group: "Danh mục", icon: "package" },
    { key: "Item Group", label: "Nhóm vật tư", kind: "doctype", group: "Danh mục", icon: "folder-tree" },
    { key: "Brand", label: "Thương hiệu", kind: "doctype", group: "Danh mục", icon: "tag" },
    { key: "UOM", label: "Đơn vị tính", kind: "doctype", group: "Danh mục", icon: "ruler" },
    // In tem: điều kiện CẦN để luồng "quét là xong" chạy được. Hàng không có tem thì không quét.
    { key: "in-tem", label: "In tem mã vạch", kind: "route", route: "/in-tem", group: "Danh mục", icon: "printer" },
    // Warehouse là DocType dạng CÂY (nested set: is_group + parent_warehouse). Hiện dạng bảng phẳng
    // thì mất hẳn quan hệ cha–con giữa kho tổng, khu và vị trí — thứ quan trọng nhất của cây kho.
    { key: "cay-kho", label: "Kho hàng", kind: "route", route: "/cay-kho", group: "Danh mục", icon: "warehouse" },
    { key: "Supplier", label: "Nhà cung cấp", kind: "doctype", group: "Danh mục", icon: "factory" },
    { key: "Customer", label: "Khách hàng", kind: "doctype", group: "Danh mục", icon: "users" },

    // ══ Quản trị ════════════════════════════════════════════════════════════
    // Trung tâm phân quyền: xem/sửa Role, phạm vi dữ liệu (User Permission) và PHÂN TÍCH quyền
    // hiệu lực của một user cụ thể (§9 ORG-008). Ghi thẳng vào Role/User Permission chuẩn Frappe.
    { key: "phan-quyen", label: "Phân quyền", kind: "route", route: "/phan-quyen", group: "Quản trị", icon: "shield-check" },
    // Vào lại được BẤT CỨ LÚC NÀO, không chỉ lần đầu: dựng thêm kho/đơn vị tính cho công ty mới
    // là việc lặp lại, và người dùng cần biết chỗ để quay lại kiểm tra dữ liệu nền còn thiếu gì.
    { key: "thiet-lap", label: "Thiết lập ban đầu", kind: "route", route: "/thiet-lap", group: "Quản trị", icon: "cog" },
  ],
};

/**
 * Phân quyền hiển thị nav theo Role.
 *
 * ⚠️ ĐÂY CHỈ LÀ LỚP GIAO DIỆN — dọn menu cho gọn theo đúng việc của từng người.
 * RANH GIỚI QUYỀN THẬT NẰM Ở SERVER: Frappe kiểm DocPerm + User Permission trên MỌI request, kể cả
 * khi ai đó gõ thẳng URL hay gọi API. Ẩn menu KHÔNG bảo vệ được gì; đừng bao giờ dựa vào nó để
 * giữ dữ liệu nhạy cảm (BRD §9 ORG-008, §6 nguyên tắc #9).
 *
 * Quy ước: key không có trong bảng ⇒ ai cũng thấy. Rỗng `[]` ⇒ chỉ System Manager.
 */
export const NAV_ROLES: Record<string, string[]> = {
  // Danh mục = quyền sửa dữ liệu nền, chỉ quản lý kho và quản trị hệ thống.
  Item: ["Stock Manager", "Item Manager", "System Manager"],
  "Item Group": ["Stock Manager", "Item Manager", "System Manager"],
  Brand: ["Stock Manager", "Item Manager", "System Manager"],
  UOM: ["Stock Manager", "Item Manager", "System Manager"],
  "cay-kho": ["Stock Manager", "System Manager"],
  Warehouse: ["Stock Manager", "System Manager"],
  Supplier: ["Stock Manager", "Purchase Manager", "Purchase User", "System Manager"],
  Customer: ["Stock Manager", "Sales Manager", "Sales User", "System Manager"],

  // Kiểm kê điều chỉnh trực tiếp sổ kho — WMS-013 yêu cầu tách người đếm ↔ người duyệt.
  "Stock Reconciliation": ["Stock Manager", "System Manager"],

  // Báo cáo tổng hợp: cấp quản lý.
  "bc-ton-kho": ["Stock Manager", "System Manager"],
  "bc-so-kho": ["Stock Manager", "System Manager"],
  "bc-du-kien": ["Stock Manager", "System Manager"],
  "bc-lo": ["Stock Manager", "System Manager"],

  // Phân quyền động tới quyền của người khác — chỉ quản trị hệ thống.
  "phan-quyen": ["System Manager"],
};

/** Báo cáo: key nav → tên Query Report chuẩn ERPNext. */
export const REPORTS: Record<string, { report: string; title: string }> = {
  "stock-balance": { report: "Stock Balance", title: "Tồn kho chi tiết" },
  "stock-ledger": { report: "Stock Ledger", title: "Sổ kho" },
  "stock-projected-qty": { report: "Stock Projected Qty", title: "Tồn dự kiến" },
  "batch-wise-balance-history": { report: "Batch-Wise Balance History", title: "Tồn theo lô" },
};
