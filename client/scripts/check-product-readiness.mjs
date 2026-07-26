import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function requireText(name, file, patterns) {
  const source = read(file);
  const missing = patterns.filter((pattern) => typeof pattern === "string" ? !source.includes(pattern) : !pattern.test(source));
  checks.push({ name, ok: missing.length === 0, detail: missing.map(String).join(", ") });
}
function forbidText(name, file, patterns) {
  const source = read(file);
  const found = patterns.filter((pattern) => typeof pattern === "string" ? source.includes(pattern) : pattern.test(source));
  checks.push({ name, ok: found.length === 0, detail: found.map(String).join(", ") });
}

requireText("role-aware business context", "frappe-app/metaforge/metaforge/api.py", [
  "def _role_context_dimensions", "frappe.has_permission(doctype, \"read\")", "requested = [key for key in requested if key in allowed_dimensions]",
]);
requireText("server contextual list/count", "frappe-app/metaforge/metaforge/api.py", [
  "def get_contextual_list", "def get_contextual_count", "def _warehouse_parent_names", "_contextual_filters",
]);
forbidText("no unknown-domain stock fallback", "frappe-app/metaforge/metaforge/api.py", [
  /_domain_key\(domain\)\s+or\s+["']stock["']/, /_PROCESS_TEMPLATES\.get\([^\n]+["']stock["']/,
]);
requireText("process stages have filters", "frappe-app/metaforge/metaforge/api.py", [
  "_valid_stage_filters", '"filters": filters', "_safe_context_count",
]);
requireText("selected user permission analysis", "packages/views/src/access/PermissionCenter.tsx", [
  "adapter.explainPermission", "user.trim() || profile?.user", "adapter.setUserRoles", "adapter.addUserPermission",
]);
requireText("native Role Profile access profiles", "packages/views/src/access/PermissionCenter.tsx", ["Role Profile", "assignedRoles", "roleProfile"]);
requireText("advanced KPI/process filters preserved", "packages/views/src/list/useListState.ts", [
  "routeFilters", "operators.has", "JSON.parse(routeFilters)",
]);
requireText("list/count use contextual endpoints", "packages/views/src/container/hooks.ts", [
  "adapter.getContextualList", "adapter.getContextualCount", "businessContext",
]);
requireText("reports receive business context", "packages/views/src/report/ReportContainer.tsx", [
  "contextToReportFilters", "adapter.runReport(report, filters)", "resolveDisplayValues",
]);
requireText("link filter is autocomplete", "packages/views/src/list/ListToolbar.tsx", [
  "function LinkFilter", "searchLink", "CommandItem",
]);
forbidText("table multiselect rejects free identifiers", "packages/views/src/form/table-controls.tsx", [
  /add\(txt\)/, /add\(text\)/,
]);
requireText("workspace renders all native artifact groups", "packages/views/src/workspace/WorkspaceView.tsx", [
  "number_cards", "charts", "quick_lists", "onboardings", "custom_blocks", "artifactSections",
]);
requireText("unsupported app domains fail visibly", "packages/views/src/overview/OverviewView.tsx", ["data.unsupported"]);
requireText("unsupported processes fail visibly", "packages/views/src/process/ProcessView.tsx", ["data?.unsupported"]);
requireText("sidebar has strong active state", "packages/shell/src/AppShell.tsx", [
  "aria-current", "font-semibold", "bg-primary/12",
]);
requireText("new documents use dedicated modal", "packages/views/src/app/DoctypeWorkspace.tsx", [
  "DialogContent", "max-w", "NewFormContainer",
]);
requireText("new document modal has explicit save action", "packages/views/src/container/NewFormContainer.tsx", ["Lưu và mở", "onCancel"]);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
console.log(`\n${checks.length - failed.length}/${checks.length} product gates passed.`);
if (failed.length) process.exit(1);
