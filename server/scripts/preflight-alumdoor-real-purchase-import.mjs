#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractRealPurchaseRows, PURCHASE_SOURCE } from "./lib/alumdoor-real-purchase-source.mjs";
import { preflightRealPurchaseRows } from "./lib/alumdoor-real-purchase-preflight.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
const outputArg = args.find((arg) => !arg.startsWith("--"));
const outputPath = resolve(outputArg || resolve(repoRoot, "local-imports", "alumdoor-real-purchase-preflight.json"));
const sourcePath = resolve(repoRoot, PURCHASE_SOURCE);
const itemManifestPath = option("--item-manifest");
const supplierManifestPath = option("--supplier-manifest");
const loadJson = async (path) => path ? JSON.parse(await readFile(resolve(path), "utf8")) : null;

const markdown = await readFile(sourcePath, "utf8");
const rows = extractRealPurchaseRows(markdown);
const report = preflightRealPurchaseRows(rows, {
  item_manifest: await loadJson(itemManifestPath),
  supplier_manifest: await loadJson(supplierManifestPath),
  company: option("--company"),
  warehouse: option("--warehouse"),
  stock_cutoff_frozen: args.includes("--stock-cutoff-frozen"),
});

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  source_purchase_rows: report.source_purchase_row_count,
  source_exclusions: report.source_exclusions,
  suppliers: report.supplier,
  item_uom: report.item_uom,
  purchase_order: report.purchase_order,
  purchase_receipt: report.purchase_receipt,
  blocker_codes: report.blocker_codes,
  submit_blockers: report.submit_blockers,
  output: outputPath,
  verdict: report.verdict,
}, null, 2));

const passed = report.verdict === "PURCHASE_IMPORT_DRAFT_PREFLIGHT_PASS";
if (!passed && !args.includes("--expect-blocked")) {
  throw new Error(`PURCHASE_IMPORT_BLOCKED blockers=${report.blocker_codes.join(",")}`);
}
if (passed) {
  console.log(`PURCHASE_IMPORT_DRAFT_PREFLIGHT_PASS receipts=${report.purchase_receipt.candidate_documents} excluded=${report.source_exclusions.row_count}`);
} else {
  console.log(`PURCHASE_IMPORT_EXPECTED_BLOCKED receipts=${report.purchase_receipt.candidate_documents} excluded=${report.source_exclusions.row_count}`);
}
