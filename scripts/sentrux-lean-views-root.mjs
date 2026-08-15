import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const rootIndex = "client/packages/views/src/index.ts";
let index = await readFile(rootIndex, "utf8");
const exportsToRemove = [
  'export { BulkGridContainer, type BulkGridContainerProps } from "./bulk/BulkGridContainer.js";\n',
  'export { KanbanContainer, type KanbanContainerProps } from "./kanban/KanbanContainer.js";\n',
  'export { TreeContainer, type TreeContainerProps } from "./tree/TreeContainer.js";\n',
  'export { ReportContainer } from "./report/ReportContainer.js";\n',
  'export { PrintContainer, type PrintContainerProps } from "./print/PrintContainer.js";\n',
  'export { CalendarContainer, type CalendarContainerProps } from "./calendar/CalendarContainer.js";\n',
  'export { MetaForgeProvider, useMetaForge, useLocaleFormat, type MetaForgeContextValue, type MetaForgeProviderProps } from "./container/provider.js";\n',
  'export { DoctypeWorkspace, type DoctypeWorkspaceProps } from "./app/DoctypeWorkspace.js";\n',
  'export { FormContainer, type FormContainerProps } from "./container/FormContainer.js";\n',
  'export { ListContainer, type ListContainerProps } from "./container/ListContainer.js";\n',
  'export { ContextContainer, type ContextContainerProps } from "./container/ContextContainer.js";\n',
  'export { NewFormContainer, type NewFormContainerProps } from "./container/NewFormContainer.js";\n',
  'export { WorkspaceContainer, type WorkspaceContainerProps } from "./container/WorkspaceContainer.js";\n',
  'export { createFullRegistry } from "./registry.js";\n',
  'export { ApplicationCatalogContainer } from "./catalog/ApplicationCatalogContainer.js";\n',
  'export { OverviewContainer } from "./overview/OverviewContainer.js";\n',
  'export { ProcessContainer } from "./process/ProcessContainer.js";\n',
  'export { ScreenView, type ScreenViewProps } from "./screen/ScreenView.js";\n',
  'export { PermissionCenter } from "./access/PermissionCenter.js";\n',
  'export { ImportContent } from "./system/Import.js";\n',
];
for (const statement of exportsToRemove) {
  if (!index.includes(statement)) throw new Error(`Expected views root export missing: ${statement.trim()}`);
  index = index.replace(statement, "");
}
await writeFile(rootIndex, index, "utf8");

const packagePath = "client/packages/views/package.json";
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
pkg.exports ??= {};
const packageExports = {
  "./bulk": ["./dist/bulk/BulkGridContainer.d.ts", "./dist/bulk/BulkGridContainer.js"],
  "./kanban": ["./dist/kanban/KanbanContainer.d.ts", "./dist/kanban/KanbanContainer.js"],
  "./tree": ["./dist/tree/TreeContainer.d.ts", "./dist/tree/TreeContainer.js"],
  "./print": ["./dist/print/PrintContainer.d.ts", "./dist/print/PrintContainer.js"],
  "./form-container": ["./dist/container/FormContainer.d.ts", "./dist/container/FormContainer.js"],
  "./list-container": ["./dist/container/ListContainer.d.ts", "./dist/container/ListContainer.js"],
  "./context-container": ["./dist/container/ContextContainer.d.ts", "./dist/container/ContextContainer.js"],
  "./new-form": ["./dist/container/NewFormContainer.d.ts", "./dist/container/NewFormContainer.js"],
};
for (const [key, [types, imp]] of Object.entries(packageExports)) {
  pkg.exports[key] = { types, import: imp };
}
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

const route = new Map();
const add = (target, ...symbols) => symbols.forEach((s) => route.set(s, target));
add("@metaforge/views/bulk", "BulkGridContainer", "BulkGridContainerProps");
add("@metaforge/views/kanban", "KanbanContainer", "KanbanContainerProps");
add("@metaforge/views/tree", "TreeContainer", "TreeContainerProps");
add("@metaforge/views/report", "ReportContainer");
add("@metaforge/views/print", "PrintContainer", "PrintContainerProps");
add("@metaforge/views/calendar", "CalendarContainer", "CalendarContainerProps");
add("@metaforge/views/provider", "MetaForgeProvider", "useMetaForge", "useLocaleFormat", "MetaForgeContextValue", "MetaForgeProviderProps");
add("@metaforge/views/doctype-workspace", "DoctypeWorkspace", "DoctypeWorkspaceProps");
add("@metaforge/views/form-container", "FormContainer", "FormContainerProps");
add("@metaforge/views/list-container", "ListContainer", "ListContainerProps");
add("@metaforge/views/context-container", "ContextContainer", "ContextContainerProps");
add("@metaforge/views/new-form", "NewFormContainer", "NewFormContainerProps");
add("@metaforge/views/workspace", "WorkspaceContainer", "WorkspaceContainerProps");
add("@metaforge/views/registry", "createFullRegistry");
add("@metaforge/views/catalog", "ApplicationCatalogContainer");
add("@metaforge/views/overview", "OverviewContainer");
add("@metaforge/views/process", "ProcessContainer");
add("@metaforge/views/screen", "ScreenView", "ScreenViewProps");
add("@metaforge/views/permissions", "PermissionCenter");
add("@metaforge/views/import", "ImportContent");

function symbolName(specifier) {
  return specifier.replace(/^type\s+/, "").trim().split(/\s+as\s+/)[0].trim();
}

function migrateRootImports(source, path) {
  const importPattern = /import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["']@metaforge\/views["'];/g;
  return source.replace(importPattern, (full, wholeType = "", body) => {
    const specs = body.split(",").map((s) => s.trim()).filter(Boolean);
    const kept = [];
    const moved = new Map();
    for (const spec of specs) {
      const target = route.get(symbolName(spec));
      if (!target) { kept.push(spec); continue; }
      if (!moved.has(target)) moved.set(target, []);
      moved.get(target).push(spec);
    }
    if (moved.size === 0) return full;
    const statements = [];
    const prefix = wholeType ? "import type" : "import";
    if (kept.length) statements.push(`${prefix} { ${kept.join(", ")} } from "@metaforge/views";`);
    for (const [target, names] of moved) statements.push(`${prefix} { ${names.join(", ")} } from "${target}";`);
    console.log(`migrate ${path}: ${[...moved.values()].flat().join(", ")}`);
    return statements.join("\n");
  });
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".turbo", ".vite"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    const next = migrateRootImports(source, path);
    if (next !== source) await writeFile(path, next, "utf8");
  }
}
await walk("client/apps");
await walk("client/packages");

const heavy = new Set(route.keys());
const leftovers = [];
async function verify(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".turbo", ".vite"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await verify(path); continue; }
    if (!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    const rootImports = [...source.matchAll(/import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']@metaforge\/views["'];/g)];
    for (const match of rootImports) {
      const names = match[1].split(",").map((x) => symbolName(x)).filter(Boolean);
      if (names.some((n) => heavy.has(n))) leftovers.push(path);
    }
  }
}
await verify("client/apps");
await verify("client/packages");
if (leftovers.length) throw new Error(`Heavy views root imports remain: ${[...new Set(leftovers)].join(", ")}`);
