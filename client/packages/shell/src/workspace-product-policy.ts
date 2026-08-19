import type { NavItem } from "./AppShell.js";
import { isAlumdoorSurface } from "./BrandLogo.js";
import type { WorkspaceModule } from "./workspace-navigation.js";

function normalized(label: string | undefined): string {
  return (label ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

const SIDEBAR_GROUPS = new Set(["dieu hanh", "ban hang", "kho", "mua hang", "san xuat", "cong no", "bao hanh", "bao cao", "danh muc", "he thong", "quy kho", "luong"]);
const ALUMDOOR_SALES_WORKSPACE_KEYS = new Set(["Sales Order", "Delivery Note", "action:don-ban-thanh-phieu-xuat"]);
const ALUMDOOR_PURCHASE_ROUTE_ALIASES = new Set(["action:don-mua-thanh-phieu-nhap", "action:nhap-nhom-fifo"]);
const ALUMDOOR_NAV_SENTINELS = new Set(["action:don-ban-thanh-phieu-xuat", "action:giao-nhieu-don-fifo", "action:nhap-nhom-fifo", "action:cat-nhom", "Cutting Policy"]);
const HR_GROUPS = new Set(["nhan su", "vong doi nhan su", "cham cong qr", "nhan su & tien luong"]);
const HR_KEY_ORDER = ["Employee", "AlumDoor Pay Profile", "AlumDoor Attendance Day", "AlumDoor Attendance Device", "AlumDoor QR Station", "AlumDoor Attendance Policy", "alumdoor-attendance:scan", "alumdoor-attendance:today", "alumdoor-attendance:month", "alumdoor-attendance:exceptions"];
const HR_KEYS = new Set(HR_KEY_ORDER);

const REPORT_AFFINITY: Record<string, string[]> = {
  "report:Đơn hàng theo khách": ["Bán hàng"], "report:Báo giá theo khách": ["Bán hàng"], "report:Lắp đặt theo đội": ["Bán hàng"], "report:Mua hàng theo nhà cung cấp": ["Mua hàng"], "report:Đơn mua chưa nhận đủ": ["Mua hàng"], "report:Stock Balance": ["Kho"], "report:Stock Ledger": ["Kho"], "report:Lệnh sản xuất theo mặt hàng": ["Sản xuất"], "report:Work Order Progress": ["Sản xuất"], "report:Công nợ theo khách hàng": ["Công nợ"], "report:Accounts Receivable": ["Công nợ"], "report:Accounts Payable": ["Công nợ"],
};
const MASTER_AFFINITY: Record<string, string[]> = {
  Item: ["Bán hàng", "Kho", "Mua hàng", "Sản xuất", "Bảo hành"], "Item Group": ["Kho", "Sản xuất"], UOM: ["Kho", "Mua hàng", "Sản xuất"], Warehouse: ["Kho", "Mua hàng", "Sản xuất"], Customer: ["Bán hàng", "Công nợ", "Bảo hành"], Supplier: ["Mua hàng", "Công nợ", "Bảo hành"], "Price List": ["Bán hàng"], "Item Price": ["Bán hàng"], "Pricing Scope": ["Bán hàng"], "Pricing Rule": ["Bán hàng"], "Cutting Policy": ["Sản xuất"], "Measurement Profile": ["Kho", "Sản xuất"], "Item Color": ["Kho", "Sản xuất"], "Material Specification": ["Kho", "Sản xuất"], "Supplier Item": ["Mua hàng"], "Lý do huỷ": ["Kho"], "Nguyên nhân chênh lệch": ["Kho"],
};

function catalog(item: NavItem): boolean { return item.key === "__catalog" || normalized(item.group).startsWith("ung dung · "); }

/** Product identity is determined from manifest navigation too, so alternate hosts work before DOM branding is applied. */
function isAlumdoorProduct(items: NavItem[]): boolean { return isAlumdoorSurface() || items.some((item) => ALUMDOOR_NAV_SENTINELS.has(item.key)); }

/** Product-specific sidebar filtering/sorting kept outside the generic shell composition. */
export function productNavigation(items: NavItem[]): NavItem[] {
  const alumdoor = isAlumdoorProduct(items);
  const visible = items.filter((item) => {
    if (!alumdoor) return !catalog(item);
    if (item.key === "catalog") return false;
    const group = normalized(item.group);
    if (HR_GROUPS.has(group)) return HR_KEYS.has(item.key);
    if (group === "ban hang") return ALUMDOOR_SALES_WORKSPACE_KEYS.has(item.key);
    if (group === "mua hang") return !ALUMDOOR_PURCHASE_ROUTE_ALIASES.has(item.key);
    return !catalog(item) && SIDEBAR_GROUPS.has(group);
  });
  if (!alumdoor) return visible;
  const hr = [...visible.filter((item) => HR_KEYS.has(item.key))].sort((a, b) => HR_KEY_ORDER.indexOf(a.key) - HR_KEY_ORDER.indexOf(b.key));
  let cursor = 0;
  return visible.map((item) => HR_KEYS.has(item.key) ? hr[cursor++]! : item);
}

function scoped(items: NavItem[], module: WorkspaceModule, affinity: Record<string, string[]>): NavItem[] {
  if (!isAlumdoorProduct(items)) return items;
  const target = normalized(module.label);
  return items.filter((item) => (affinity[item.key] ?? []).some((workspace) => normalized(workspace) === target));
}
export function productReportItems(items: NavItem[], module: WorkspaceModule): NavItem[] { return scoped(items, module, REPORT_AFFINITY); }
export function productMasterItems(items: NavItem[], module: WorkspaceModule): NavItem[] { return scoped(items, module, MASTER_AFFINITY); }
