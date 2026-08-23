import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "src");

/**
 * Đây là test kiến trúc tĩnh, không render React. Mục đích là ghim ba hợp đồng dễ bị làm hỏng
 * khi thêm workbench thứ hai/thứ ba: registry có escape hatch generic, chỉ nhận Item ở P1,
 * và combined extension phải fall-through về operational extension cũ.
 */
test("master workspace registry preserves generic and operational fallthrough", () => {
  const registry = readFileSync(path.join(ROOT, "master-workspaces", "registry.tsx"), "utf8");
  const combined = readFileSync(path.join(ROOT, "combined-workspace-extension.tsx"), "utf8");
  const index = readFileSync(path.join(ROOT, "index.ts"), "utf8");

  assert.match(registry, /bridge\.get\("master_ui"\) === "generic"/);
  assert.match(registry, /doctype !== "Item"/);
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
