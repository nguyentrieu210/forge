export type WorkspaceAffinityKind = "reports" | "masters";

const REPORT_WORKSPACES: Record<string, string[]> = {
  "report:Đơn hàng theo khách": ["Bán hàng"],
  "report:Báo giá theo khách": ["Bán hàng"],
  "report:Lắp đặt theo đội": ["Bán hàng"],
  "report:Mua hàng theo nhà cung cấp": ["Mua hàng"],
  "report:Đơn mua chưa nhận đủ": ["Mua hàng"],
  "report:Stock Balance": ["Kho"],
  "report:Stock Ledger": ["Kho"],
  "report:Lệnh sản xuất theo mặt hàng": ["Sản xuất"],
  "report:Work Order Progress": ["Sản xuất"],
  "report:Công nợ theo khách hàng": ["Công nợ"],
  "report:Accounts Receivable": ["Công nợ"],
  "report:Accounts Payable": ["Công nợ"],
};

const MASTER_WORKSPACES: Record<string, string[]> = {
  Item: ["Bán hàng", "Kho", "Mua hàng", "Sản xuất", "Bảo hành"],
  "Item Group": ["Kho", "Sản xuất"],
  UOM: ["Kho", "Mua hàng", "Sản xuất"],
  Warehouse: ["Kho", "Mua hàng", "Sản xuất"],
  Customer: ["Bán hàng", "Công nợ", "Bảo hành"],
  Supplier: ["Mua hàng", "Công nợ", "Bảo hành"],
  "Price List": ["Bán hàng"],
  "Item Price": ["Bán hàng"],
  "Pricing Rule": ["Bán hàng"],
  "Cutting Policy": ["Sản xuất"],
  "Measurement Profile": ["Kho", "Sản xuất"],
  "Item Color": ["Kho", "Sản xuất"],
  "Material Grade": ["Kho", "Sản xuất"],
  "Material Specification": ["Kho", "Sản xuất"],
  "Item Attribute": ["Kho", "Sản xuất"],
  "Supplier Item": ["Mua hàng"],
  Brand: ["Bán hàng", "Mua hàng"],
  Manufacturer: ["Mua hàng"],
  "Lý do huỷ": ["Kho"],
  "Nguyên nhân chênh lệch": ["Kho"],
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

/**
 * Quan hệ hiển thị nhanh của Alumdoor. Đây chỉ là presentation metadata: các mục vẫn nằm
 * nguyên trong Danh mục/Báo cáo tổng, còn workspace chỉ lấy những mục thật sự liên quan.
 */
export function alumdoorWorkspaceKeywords(key: string, kind: WorkspaceAffinityKind): string[] {
  const workspaces = (kind === "reports" ? REPORT_WORKSPACES : MASTER_WORKSPACES)[key] ?? [];
  return workspaces.map((workspace) => `workspace:${normalize(workspace)}`);
}

export function isAlumdoorForeignNavAllowed(owner: string | undefined, key: string): boolean {
  return owner === "vn-accounting" && key.startsWith("Warehouse Cash ");
}
