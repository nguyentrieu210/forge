import assert from "node:assert/strict";
import {
  buildWorkspaceModules,
  findWorkspaceModule,
  workspaceItemsForTabs,
} from "./workspace-navigation.js";

const modules = buildWorkspaceModules([
  { key: "__overview", label: "Tổng quan", group: "Điều hành" },
  { key: "permissions", label: "Phân quyền", group: "Hệ thống" },
  { key: "sales-order", label: "Đơn bán hàng", group: "Bán hàng" },
  { key: "delivery-note", label: "Phiếu giao hàng", group: "Bán hàng" },
  { key: "purchase-order", label: "Đơn mua hàng", group: "Mua hàng" },
]);

assert.deepEqual(modules.map((module) => module.label), ["Bán hàng", "Mua hàng", "Điều hành", "Hệ thống"]);
assert.equal(findWorkspaceModule(modules, "delivery-note")?.label, "Bán hàng");
assert.deepEqual(workspaceItemsForTabs(modules[2]!).map((item) => item.key), []);
assert.deepEqual(workspaceItemsForTabs(modules[0]!).map((item) => item.key), ["sales-order", "delivery-note"]);

console.log("workspace navigation selfcheck: PASS");
