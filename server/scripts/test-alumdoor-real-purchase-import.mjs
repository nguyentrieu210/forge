#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_PURCHASE_SUPPLIERS, extractRealPurchaseRows, PURCHASE_SOURCE } from "./lib/alumdoor-real-purchase-source.mjs";
import { preflightRealPurchaseRows } from "./lib/alumdoor-real-purchase-preflight.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const rows = extractRealPurchaseRows(await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8"));

assert.equal(rows.length, 14);
assert.equal(new Set(rows.map((row) => row.supplier)).size, 8);
assert.equal(Object.keys(APPROVED_PURCHASE_SUPPLIERS).length, 8);
assert.deepEqual(rows.slice(0, 2).map((row) => row.source_row), [531, 532]);
assert.equal(rows.at(-1).source_row, 544);

const row538 = rows.find((row) => row.source_row === 538);
assert.equal(row538?.source_item_code, "NVL-BO1VIS AL71");
assert.equal(row538?.excluded, true);
assert.equal(row538?.exclusion_reason, "SOURCE_ITEM_IDENTITY_NOT_CANONICAL_587");

const row539 = rows.find((row) => row.source_row === 539);
assert.equal(row539?.date, "2026-02-02");
assert.equal(row539?.source_item_code, "");
assert.equal(row539?.canonical_item_code, "TP-RAYHOP");
assert.equal(row539?.canonical_uom, "Kg");

const expectedMeters = new Map([[534, 554.4], [535, 374.4], [536, 381.6], [537, 539]]);
for (const [sourceRow, expected] of expectedMeters) {
  const row = rows.find((entry) => entry.source_row === sourceRow);
  assert.equal(row?.canonical_uom, "Mét");
  assert.ok(Math.abs(Number(row?.canonical_quantity) - expected) < 1e-9);
  assert.equal(row?.source_disposition?.quantity_rule, "LENGTH_M_X_PIECE_COUNT");
}
assert.equal(rows.find((row) => row.source_row === 543)?.exclusion_reason, "SOURCE_QUANTITY_OUTLIER_2834000_KG_UNPROVEN");
assert.equal(rows.find((row) => row.source_row === 544)?.exclusion_reason, "SOURCE_QUANTITY_MISSING");

const blocked = preflightRealPurchaseRows(rows);
assert.equal(blocked.verdict, "PURCHASE_IMPORT_BLOCKED");
assert.equal(blocked.mutation_authorized, false);
assert.deepEqual(blocked.classification_counts, { PURCHASE_ORDER: 0, PURCHASE_RECEIPT: 11, SOURCE_DEFECT_EXCLUDED: 3 });
assert.equal(blocked.supplier.total, 5);
assert.equal(blocked.supplier.approved_identity, 5);
assert.equal(blocked.item_uom.total_lines, 11);
assert.equal(blocked.item_uom.lines_with_item_code, 11);
assert.equal(blocked.item_uom.approved_source_identity_uom, 11);
assert.equal(blocked.item_uom.missing_item_code, 0);
assert.equal(blocked.source_exclusions.row_count, 3);
assert.equal(blocked.source_exclusions.document_count, 3);
assert.deepEqual(blocked.source_exclusions.rows.map((row) => row.source_row), [538, 543, 544]);
assert.equal(blocked.purchase_order.candidate_documents, 0);
assert.equal(blocked.purchase_receipt.candidate_documents, 6);
assert.equal(blocked.purchase_receipt.persisted, 0);
for (const blocker of ["COMPANY_NOT_RESOLVED", "WAREHOUSE_NOT_RESOLVED", "LIVE_SUPPLIER_MANIFEST_NOT_PROVIDED", "LIVE_ITEM_MANIFEST_NOT_PROVIDED"]) assert.ok(blocked.blocker_codes.includes(blocker));

const importableRows = rows.filter((row) => !row.excluded);
const supplierManifest = [...new Set(importableRows.map((row) => row.supplier))].map((supplier_name) => ({ supplier_name, name: supplier_name }));
const itemManifest = [...new Map(importableRows.map((row) => [row.canonical_item_code, row.canonical_uom])).entries()].map(([item_code, stock_uom]) => ({ item_code, name: item_code, stock_uom, default_purchase_uom: stock_uom, is_purchase_item: true, disabled: false, uom_conversions: [] }));

const operationalNoWarehouse = preflightRealPurchaseRows(rows, { company: "Alumdoor", supplier_manifest: supplierManifest, item_manifest: itemManifest });
assert.equal(operationalNoWarehouse.verdict, "PURCHASE_IMPORT_BLOCKED");
assert.ok(operationalNoWarehouse.blocker_codes.includes("WAREHOUSE_NOT_RESOLVED"));

const ready = preflightRealPurchaseRows(rows, { company: "Alumdoor", historical_draft: true, supplier_manifest: supplierManifest, item_manifest: itemManifest });
assert.equal(ready.mode, "historical_draft");
assert.equal(ready.verdict, "PURCHASE_IMPORT_DRAFT_PREFLIGHT_PASS");
assert.equal(ready.draft_mutation_authorized, true);
assert.equal(ready.submit_authorized, false);
assert.equal(ready.purchase_receipt.ready, 6);
assert.equal(ready.purchase_receipt.blocked, 0);
assert.equal(ready.blocker_codes.length, 0);
assert.deepEqual(ready.submit_blockers, ["STOCK_CUTOFF_NOT_FROZEN_DOUBLE_COUNT_RISK", "HISTORICAL_DRAFT_SUBMIT_FORBIDDEN"]);

const tienDat = ready.documents.find((doc) => doc.supplier === "TIẾN ĐẠT");
assert.ok(tienDat);
assert.equal(tienDat.line_count, 4);
assert.deepEqual(tienDat.source_rows, [534, 535, 536, 537]);
const transport = ready.documents.find((doc) => doc.source_rows.includes(539));
assert.ok(transport);
assert.equal(transport.lines[0].canonical_item_code, "TP-RAYHOP");
assert.equal(transport.lines[0].canonical_uom, "Kg");

const rerun = preflightRealPurchaseRows(rows, { company: "Alumdoor", historical_draft: true, supplier_manifest: supplierManifest, item_manifest: itemManifest });
assert.deepEqual(rerun.documents.map((doc) => doc.import_fingerprint), ready.documents.map((doc) => doc.import_fingerprint));

console.log(`ALUMDOOR_REAL_PURCHASE_SOURCE_PASS rows=${rows.length} importable=${importableRows.length} excluded=${blocked.source_exclusions.row_count}`);
console.log(`ALUMDOOR_REAL_PURCHASE_HISTORICAL_DRAFT_PASS receipts=${ready.purchase_receipt.candidate_documents} lines=${importableRows.length} submit_blocked=${ready.submit_blockers.join(",")}`);