/**
 * Danh bạ icon TĨNH.
 *
 * Vì sao không `import * as LucideIcons from "lucide-react"` nữa: cách đó tra được MỌI tên icon,
 * nhưng đổi lại trình đóng gói không thể rung bỏ cây (tree-shake) — nó phải nhét cả ~1500 icon vào
 * bundle. Đo thật trên app Kho: 777 KB thô / 135 KB sau gzip, chỉ để hiển thị 36 cái icon.
 *
 * Với thủ kho cầm điện thoại sóng yếu giữa kho, 135 KB đó là vài giây nhìn màn hình trắng. Đổi lấy
 * sự tiện lợi "gõ tên nào cũng ra" của lập trình viên là một cái giá sai.
 *
 * Import CÓ TÊN như dưới đây thì rung bỏ cây chạy đúng: chỉ những icon thật sự liệt kê mới vào
 * bundle. Tên nào không có ở đây sẽ hiện ô trống VÀ ghi cảnh báo ra console (xem icon.ts) — hỏng
 * thì thấy ngay, không mất âm thầm như bản CLI cũ từng bị review bắt lỗi.
 *
 * THÊM ICON MỚI: khai báo thêm một dòng ở đây. Ba giây, và bundle chỉ to thêm ~0.4 KB.
 */
import type { ComponentType } from "react";
import {
  ArrowLeftRight, BarChart3, Boxes, CircleDollarSign, ClipboardList, Factory,
  FileSpreadsheet, FileText, FolderTree, Forklift, Gauge, Grid3x3, Hash,
  Layers, Layers3, LayoutDashboard, LayoutGrid, List, ListChecks, Lock,
  Package, PackageCheck, PackagePlus, PackageSearch, Printer, Receipt, Ruler, ScanBarcode,
  ScanLine, Scale, ScrollText, Settings, ShieldCheck, Smartphone, Table2, Tag,
  TrendingUp, Truck, Users, Warehouse, Workflow,
  // Hay gặp ở danh mục ứng dụng do SERVER trả về — khai sẵn để đỡ hiện ô trống.
  Building2, Calendar, ChartPie, CheckCheck, ClipboardCheck, Cog, Contact,
  CreditCard, Database, FileBarChart, Folder, Home, Inbox, Landmark,
  Mail, MapPin, Percent, Phone, ShoppingCart, Star, Wallet, Wrench,
} from "lucide-react";

export const ICON_REGISTRY: Record<string, ComponentType> = {
  "arrow-left-right": ArrowLeftRight,
  "bar-chart-3": BarChart3,
  boxes: Boxes,
  "circle-dollar-sign": CircleDollarSign,
  "clipboard-list": ClipboardList,
  factory: Factory,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  "folder-tree": FolderTree,
  forklift: Forklift,
  gauge: Gauge,
  "grid-3x3": Grid3x3,
  hash: Hash,
  layers: Layers,
  "layers-3": Layers3,
  "layout-dashboard": LayoutDashboard,
  "layout-grid": LayoutGrid,
  list: List,
  "list-checks": ListChecks,
  lock: Lock,
  package: Package,
  "package-check": PackageCheck,
  "package-plus": PackagePlus,
  "package-search": PackageSearch,
  printer: Printer,
  receipt: Receipt,
  ruler: Ruler,
  "scan-barcode": ScanBarcode,
  "scan-line": ScanLine,
  scale: Scale,
  "scroll-text": ScrollText,
  "table-2": Table2,
  settings: Settings,
  "shield-check": ShieldCheck,
  smartphone: Smartphone,
  tag: Tag,
  "trending-up": TrendingUp,
  truck: Truck,
  users: Users,
  warehouse: Warehouse,
  workflow: Workflow,

  "building-2": Building2,
  calendar: Calendar,
  "chart-pie": ChartPie,
  "check-check": CheckCheck,
  "clipboard-check": ClipboardCheck,
  cog: Cog,
  contact: Contact,
  "credit-card": CreditCard,
  database: Database,
  "file-bar-chart": FileBarChart,
  folder: Folder,
  home: Home,
  inbox: Inbox,
  landmark: Landmark,
  mail: Mail,
  "map-pin": MapPin,
  percent: Percent,
  phone: Phone,
  "shopping-cart": ShoppingCart,
  star: Star,
  wallet: Wallet,
  wrench: Wrench,
};
