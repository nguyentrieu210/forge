import { strict as assert } from "node:assert";
import { matchesWorkspaceTab } from "./DemoShell.js";
import { WORKSPACE_META } from "./workspace-meta.js";

console.log("workspace navigation selfcheck:");

for (const module of WORKSPACE_META.modules) {
  assert.ok(module.tabs.length >= 2, `${module.key}: phải có ít nhất Quy trình và Tổng quan`);
  assert.equal(module.tabs[0]?.kind, "process", `${module.key}: tab đầu phải là process`);
  assert.equal(module.tabs[1]?.kind, "overview", `${module.key}: tab thứ hai phải là overview`);
  assert.ok(module.tabs.slice(2).every((tab) => tab.kind === "doctype"), `${module.key}: tab từ vị trí 3 phải là doctype`);
}

const operations = WORKSPACE_META.modules.find((module) => module.key === "operations");
const taskTab = operations?.tabs.find((tab) => tab.key === "task");
assert.ok(taskTab, "thiếu tab Task");
assert.equal(matchesWorkspaceTab(taskTab!, "list"), true);
assert.equal(matchesWorkspaceTab(taskTab!, "form"), true);
assert.equal(matchesWorkspaceTab(taskTab!, "kanban"), true);
assert.equal(matchesWorkspaceTab(taskTab!, "dashboard"), false);

const overviewTab = operations?.tabs.find((tab) => tab.kind === "overview");
assert.ok(overviewTab, "thiếu tab Báo cáo tổng quan");
assert.equal(matchesWorkspaceTab(overviewTab!, "dashboard"), true);
assert.equal(matchesWorkspaceTab(overviewTab!, "report"), true);

const meta = WORKSPACE_META.modules.find((module) => module.key === "meta");
assert.deepEqual(meta?.tabs.map((tab) => tab.label), [
  "Quy trình nghiệp vụ",
  "Báo cáo tổng quan",
  "DocType",
  "Workflow",
  "Print Format",
  "Dashboard",
]);

console.log("  ✓ tab order process → overview → doctype");
console.log("  ✓ route aliases giữ đúng tab active");
console.log("  ✓ phân hệ Meta đủ sáu tab bắt buộc");
