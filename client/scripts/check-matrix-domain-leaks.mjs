import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const clientRoot = process.cwd();
const viewsRoot = path.join(clientRoot, "packages/views/src");
const legacyPanel = path.normalize(path.join(viewsRoot, "bulk/ItemPriceMatrixPanel.tsx"));
const legacyRouter = path.normalize(path.join(viewsRoot, "bulk/BulkGridContainer.tsx"));

const productionExtensions = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"]);
const ignoredName = /(?:\.test|\.spec|selfcheck|fixture|__tests__)/i;
const forbiddenBusinessTerms = [
  "Item Price",
  "Price List",
  "Supplier Item",
  "Warehouse",
  "Alumdoor",
  "UOM",
];
const directBusinessMutationPatterns = [
  ["adapter.updateDoc", /\badapter\.updateDoc\s*\(/],
  ["adapter.createDoc", /\badapter\.createDoc\s*\(/],
  ["adapter.deleteDoc", /\badapter\.deleteDoc\s*\(/],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (productionExtensions.has(path.extname(entry.name)) && !ignoredName.test(entry.name)) result.push(full);
  }
  return result;
}

function rel(file) {
  return path.relative(clientRoot, file).replaceAll(path.sep, "/");
}

let failed = false;
const files = walk(viewsRoot);

// The current Item Price route is a declared legacy exception until the convergence gate passes.
// Any additional business-name doctype conditional in shared views is architectural leakage.
for (const file of files) {
  if (path.normalize(file) === legacyPanel) continue;
  const source = fs.readFileSync(file, "utf8");
  const conditionals = [...source.matchAll(/(?:props\.)?doctype\s*={2,3}\s*["'`]([^"'`]+)["'`]/g)];
  for (const match of conditionals) {
    const value = match[1];
    const isLegacyItemPrice = path.normalize(file) === legacyRouter && value === "Item Price";
    if (isLegacyItemPrice) continue;
    if (!forbiddenBusinessTerms.some((term) => value.toLowerCase().includes(term.toLowerCase()))) continue;
    console.error(`Matrix domain-leak check failed: business doctype conditional ${JSON.stringify(value)} in ${rel(file)}`);
    failed = true;
  }
}

// Generic Matrix production sources may be introduced under any shared view path. Scan files whose
// name/path contains "matrix", while excluding the declared legacy ItemPriceMatrixPanel specimen.
const genericMatrixFiles = files.filter((file) => {
  if (path.normalize(file) === legacyPanel) return false;
  return rel(file).toLowerCase().includes("matrix");
});

for (const file of genericMatrixFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const term of forbiddenBusinessTerms) {
    if (!source.toLowerCase().includes(term.toLowerCase())) continue;
    console.error(`Matrix domain-leak check failed: ${JSON.stringify(term)} appears in generic source ${rel(file)}`);
    failed = true;
  }
  for (const [label, pattern] of directBusinessMutationPatterns) {
    if (!pattern.test(source)) continue;
    console.error(`Matrix domain-leak check failed: generic renderer contains direct mutation ${label} in ${rel(file)}`);
    failed = true;
  }
  if (/ItemPriceMatrixPanel/.test(source)) {
    console.error(`Matrix domain-leak check failed: generic Matrix source imports/references legacy ItemPriceMatrixPanel in ${rel(file)}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else {
  const legacyState = fs.existsSync(legacyRouter) && fs.readFileSync(legacyRouter, "utf8").includes('props.doctype === "Item Price"')
    ? "legacy Item Price route still present (allowed until parity gate)"
    : "legacy Item Price route removed";
  console.log(`Matrix domain-leak contract OK; scanned ${genericMatrixFiles.length} generic Matrix source file(s); ${legacyState}.`);
}
