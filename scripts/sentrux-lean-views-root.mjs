import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const rootIndex = "client/packages/views/src/index.ts";
let index = await readFile(rootIndex, "utf8");
const exportsToRemove = [
  'export { DoctypeWorkspace, type DoctypeWorkspaceProps } from "./app/DoctypeWorkspace.js";\n',
  'export { ScreenView, type ScreenViewProps } from "./screen/ScreenView.js";\n',
];
for (const statement of exportsToRemove) {
  if (!index.includes(statement)) throw new Error(`Expected views root export missing: ${statement.trim()}`);
  index = index.replace(statement, "");
}
await writeFile(rootIndex, index, "utf8");

const route = new Map([
  ["DoctypeWorkspace", "@metaforge/views/doctype-workspace"],
  ["DoctypeWorkspaceProps", "@metaforge/views/doctype-workspace"],
  ["ScreenView", "@metaforge/views/screen"],
  ["ScreenViewProps", "@metaforge/views/screen"],
]);

function symbolName(specifier) {
  return specifier
    .replace(/^type\s+/, "")
    .trim()
    .split(/\s+as\s+/)[0]
    .trim();
}

function migrateRootImports(source, path) {
  const importPattern = /import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["']@metaforge\/views["'];/g;
  return source.replace(importPattern, (full, wholeType = "", body) => {
    const specs = body.split(",").map((s) => s.trim()).filter(Boolean);
    const kept = [];
    const moved = new Map();
    for (const spec of specs) {
      const target = route.get(symbolName(spec));
      if (!target) {
        kept.push(spec);
        continue;
      }
      if (!moved.has(target)) moved.set(target, []);
      moved.get(target).push(spec);
    }
    if (moved.size === 0) return full;

    const statements = [];
    const prefix = wholeType ? "import type" : "import";
    if (kept.length) statements.push(`${prefix} { ${kept.join(", ")} } from "@metaforge/views";`);
    for (const [target, names] of moved) {
      statements.push(`${prefix} { ${names.join(", ")} } from "${target}";`);
    }
    console.log(`migrate ${path}: ${[...moved.values()].flat().join(", ")}`);
    return statements.join("\n");
  });
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".turbo", ".vite"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    const next = migrateRootImports(source, path);
    if (next !== source) await writeFile(path, next, "utf8");
  }
}

await walk("client/apps");
await walk("client/packages");

// Prove no source consumer still asks the root barrel for either heavyweight screen.
const leftovers = [];
async function verify(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (["node_modules", "dist", ".turbo", ".vite"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await verify(path); continue; }
    if (!/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    if (/import\s+(?:type\s+)?\{[\s\S]*?\b(?:DoctypeWorkspace|ScreenView)\b[\s\S]*?\}\s+from\s+["']@metaforge\/views["'];/.test(source)) leftovers.push(path);
  }
}
await verify("client/apps");
await verify("client/packages");
if (leftovers.length) throw new Error(`Heavy views root imports remain: ${leftovers.join(", ")}`);
