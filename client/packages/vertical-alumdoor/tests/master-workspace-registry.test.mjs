import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "src");

/**
 * Test kiến trúc tĩnh: ghim escape hatch generic, danh sách workbench chuyên dụng và đường
 * fall-through về operational extension cũ. Không render React, không cần CI/browser.
 */
test("master workspace registry preserves generic and operational fallthrough", () => {
  const registry = readFileSync(path.join(ROOT, "master-workspaces", "registry.tsx"), "utf8");
  const combined = readFileSync(path.join(ROOT, "combined-workspace-extension.tsx"), "utf8");
  const index = readFileSync(path.join(ROOT, "index.ts"), "utf8");

  assert.match(registry, /bridge\.get\("master_ui"\) === "generic"/);
  assert.match(registry, /doctype === "Item"/);
  assert.match(registry, /doctype === "Geometry Profile"/);
  assert.match(registry, /DoorGeometryWorkbench/);
  for (const doctype of ["Item Price", "Pricing Scope", "Pricing Rule"]) assert.match(registry, new RegExp(doctype));
  assert.match(registry, /return undefined/);
  assert.match(combined, /resolveAlumdoorMasterWorkspace\(context\) \?\? operationalWorkspaceExtension\.resolve\(context\)/);
  assert.match(index, /\.\/combined-workspace-extension\.js/);
});

test("Item workbench keeps an explicit route back to the full generic form", () => {
  const item = readFileSync(path.join(ROOT, "master-workspaces", "ItemMasterWorkbench.tsx"), "utf8");
  assert.match(item, /\?master_ui=generic/);
  assert.match(item, /Form đầy đủ/);
  assert.match(item, /uom_conversions/);
  assert.match(item, /material_specification/);
  assert.match(item, /geometry_profile/);
});

test("Door Geometry workbench owns the configuration job without becoming a formula engine", () => {
  const door = readFileSync(path.join(ROOT, "master-workspaces", "DoorGeometryWorkbench.tsx"), "utf8");
  assert.match(door, /data-surface="alumdoor-door-geometry-workbench"/);
  assert.match(door, /Trường nhập bán hàng/);
  assert.match(door, /runtime_fieldname/);
  assert.match(door, /role/);
  assert.match(door, /required/);
  assert.match(door, /visible/);
  assert.match(door, /editable/);
  assert.match(door, /sequence/);
  assert.match(door, /Cutting Policy/);
  assert.match(door, /Item đang sử dụng cấu hình/);
  assert.match(door, /\?master_ui=generic/);
  assert.doesNotMatch(door, /if\s*\(\s*doorType\s*===/);
  assert.doesNotMatch(door, /Cửa Đài Loan|Cửa Đức|Cửa Lưới|Cửa Siêu Trường/);
});

test("pricing workbench validates scope and delegates preview to the server pricing engine", () => {
  const pricing = readFileSync(path.join(ROOT, "master-workspaces", "PricingMasterWorkbench.tsx"), "utf8");
  assert.match(pricing, /Phạm vi phải có ít nhất một mặt hàng hoặc nhóm hàng/);
  assert.match(pricing, /Tôi chủ đích áp dụng toàn bộ/);
  assert.match(pricing, /metaforge\.api\.preview_sales_commercial_line/);
  assert.match(pricing, /MOI-DIEN-TICH/);
  assert.match(pricing, /RATE_OVERRIDE/);
  assert.match(pricing, /ADJUSTMENT/);
  assert.match(pricing, /\?master_ui=generic/);
});
