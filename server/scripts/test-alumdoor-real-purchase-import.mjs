#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_PURCHASE_SUPPLIERS,
  extractRealPurchaseRows,
  PURCHASE_SOURCE,
} from "./lib/alumdoor-real-purchase-source.mjs";
import { preflightRealPurchaseRows } from "./lib/alumdoor-real-purchase-preflight.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const markdown = await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8");
const rows = extractRealPurchaseRows(markdown);

assert.equal(rows.length, 14, "real journal must expose exactly 14 purchase rows");
assert.equal(new Set(rows.map((row) => row.supplier)).size, 8);
assert.equal(Object.keys(APPROVED_PURCHASE_SUPPLIERS).length, 8);
assert.equal(rows.filter((row) => row.item_code).length, 13);
assert.deepEqual(rows.slice(0, 2).map((row) => row.source_row), [531, 532]);
assert.equal(rows.at(-1).source_row, 544);
assert.equal(rows.find((row) => row.source_row === 539)?.date, "2026-02-02");
assert.equal(rows.find((row) => row.source_row === 543)?.quantity, 2834000);
assert.equal(rows.find((row) => row.source_row === 544)?.quantity, null);

const report = preflightRealPurchaseRows(rows);
assert.equal(report.verdict, "PURCHASE_IMPORT_BLOCKED");
assert.equal(report.mutation_authorized, false);
assert.deepEqual(report.classification_counts, { PURCHASE_ORDER: 0, PURCHASE_RECEIPT: 14 });
assert.equal(report.supplier.total, 8);
assert.equal(report.supplier.approved_identity, 8);
assert.equal(report.item_uom.total_lines, 14);
assert.equal(report.item_uom.lines_with_item_code, 13);
assert.equal(report.item_uom.approved_source_identity_uom, 13);
assert.equal(report.item_uom.missing_item_code, 1);
assert.equal(report.purchase_order.candidate_documents, 0);
assert.equal(report.purchase_receipt.candidate_documents, 9);
assert.equal(report.purchase_receipt.persisted, 0);
assert.equal(report.purchase_receipt.ready, 0);
assert.equal(report.purchase_receipt.blocked, 9);
for (const blocker of [
  "COMPANY_NOT_RESOLVED",
  "WAREHOUSE_NOT_RESOLVED",
  "STOCK_CUTOFF_NOT_FROZEN_DOUBLE_COUNT_RISK",
  "LIVE_SUPPLIER_MANIFEST_NOT_PROVIDED",
  "LIVE_ITEM_MANIFEST_NOT_PROVIDED",
  "SOURCE_DATE_SEQUENCE_REGRESSION",
  "MISSING_ITEM_CODE",
  "MISSING_OR_NONPOSITIVE_QUANTITY",
  "QUANTITY_OUTLIER_REQUIRES_SOURCE_DISPOSITION",
  "LENGTH_VS_QUANTITY_AXIS_AMBIGUOUS",
]) assert.ok(report.blocker_codes.includes(blocker), `missing blocker ${blocker}`);

const tienDat = report.documents.find((doc) => doc.supplier === "TIẾN ĐẠT");
assert.ok(tienDat);
assert.equal(tienDat.line_count, 4);
assert.deepEqual(tienDat.source_rows, [534, 535, 536, 537]);
assert.ok(tienDat.blockers.includes("LENGTH_VS_QUANTITY_AXIS_AMBIGUOUS"));

const suspiciousDate = report.documents.find((doc) => doc.source_rows.includes(539));
assert.ok(suspiciousDate?.blockers.includes("SOURCE_DATE_SEQUENCE_REGRESSION"));
const outlier = report.documents.find((doc) => doc.source_rows.includes(543));
assert.ok(outlier?.blockers.includes("QUANTITY_OUTLIER_REQUIRES_SOURCE_DISPOSITION"));
const missingQty = report.documents.find((doc) => doc.source_rows.includes(544));
assert.ok(missingQty?.blockers.includes("MISSING_OR_NONPOSITIVE_QUANTITY"));

const rerun = preflightRealPurchaseRows(rows);
assert.deepEqual(
  rerun.documents.map((doc) => doc.import_fingerprint),
  report.documents.map((doc) => doc.import_fingerprint),
  "preflight fingerprints must be deterministic across reruns",
);

console.log(`ALUMDOOR_REAL_PURCHASE_SOURCE_PASS rows=${rows.length} suppliers=${report.supplier.total} receipts=${report.purchase_receipt.candidate_documents}`);
console.log(`ALUMDOOR_REAL_PURCHASE_PREFLIGHT_BLOCKED blockers=${report.blocker_codes.join(",")}`);
