import assert from "node:assert/strict";
import {
  buildWorkspaceModules,
  findWorkspaceModule,
  workspaceItemsForTabs,
} from "./workspace-navigation.js";
import { productNavigation } from "./workspace-product-policy.js";

const modules = buildWorkspaceModules([
  { key: "__overview", label: "Tổng quan", group: "Điều hành" },
  { key: "permissions", label: "Phân quyền", group: "Hệ thống" },
  { key: "sales-order", label: "Đơn bán hàng", group: "Bán hàng" },
  { key: "delivery-note", label: "Phiếu giao hàng", group: "Bán hàng" },
  { key: "purchase-order", label: "Đơn mua hàng", group: "Mua hàng" },
]);

assert.deepEqual(modules.map((module) => module.label), ["Bán hàng", "Mua hàng"]);
assert.equal(findWorkspaceModule(modules, "delivery-note")?.label, "Bán hàng");
assert.deepEqual(workspaceItemsForTabs(modules[0]!).map((item) => item.key), ["sales-order", "delivery-note"]);

const pureFrappeNav = productNavigation([
  { key: "__overview", label: "Tổng quan", group: "Điều hành" },
  { key: "Configured Product", label: "Sản phẩm đã cấu hình", group: "Bán hàng" },
  { key: "Sales Package", label: "Gói bán hàng", group: "Bán hàng" },
  { key: "Door Type", label: "Loại cửa", group: "Cấu hình cửa" },
  { key: "Door System", label: "Hệ cửa", group: "Cấu hình cửa" },
  { key: "Configuration Attribute", label: "Thuộc tính cấu hình", group: "Cấu hình cửa" },
  { key: "Door Formula", label: "Công thức cửa", group: "Cấu hình cửa" },
  { key: "Component Rule", label: "Quy tắc linh kiện", group: "Cấu hình cửa" },
  { key: "Alumdoor Pricing Rule", label: "Quy tắc giá", group: "Giá bán" },
  { key: "__master-data", label: "Danh mục", group: "Danh mục" },
  { key: "Alumdoor Item", label: "Vật tư hàng hóa", group: "Danh mục" },
  { key: "Alumdoor Item Group", label: "Nhóm vật tư", group: "Danh mục" },
  { key: "Alumdoor UOM", label: "Đơn vị tính", group: "Danh mục" },
  { key: "Alumdoor Warehouse", label: "Kho", group: "Danh mục" },
  { key: "__catalog", label: "Danh mục ứng dụng", group: "Điều hành" },
]);

assert.deepEqual(
  pureFrappeNav.map((item) => item.key),
  [
    "__overview", "Configured Product", "Sales Package", "Door Type", "Door System",
    "Configuration Attribute", "Door Formula", "Component Rule", "Alumdoor Pricing Rule",
    "__master-data", "Alumdoor Item", "Alumdoor Item Group", "Alumdoor UOM", "Alumdoor Warehouse",
  ],
);
assert.deepEqual(
  buildWorkspaceModules(pureFrappeNav).map((module) => module.label),
  ["Bán hàng", "Cấu hình cửa", "Giá bán"],
);

console.log("workspace navigation selfcheck: PASS");
