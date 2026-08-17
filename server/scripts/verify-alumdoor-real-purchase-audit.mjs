#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const clean = (v) => String(v ?? "").normalize("NFC").trim();
const expected = JSON.parse(await readFile(resolve(process.argv[2]), "utf8"));
const first = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
const second = process.argv[4] ? JSON.parse(await readFile(resolve(process.argv[4]), "utf8")) : null;

function project(audit) {
  return (audit.purchase_receipts ?? [])
    .filter((r) => r?.import_marker?.format === "alumdoor-real-purchase-history/v1")
    .map((r) => ({
      name: clean(r.name),
      docstatus: Number(r.docstatus ?? 0),
      fingerprint: clean(r.import_marker?.import_fingerprint),
      source_rows: r.import_marker?.source_rows ?? [],
      submit_forbidden: r.import_marker?.submit_forbidden === true,
      line_count: Number(r.item_count ?? 0),
      item_signature: r.item_signature ?? [],
      item_warehouses: r.item_warehouses ?? [],
      modified: clean(r.modified),
    }))
    .sort((a,b) => a.name.localeCompare(b.name));
}

function verify(label, audit) {
  const actual = project(audit);
  if (actual.length !== expected.receipt_count) throw new Error(`${label}_RECEIPT_COUNT expected=${expected.receipt_count} actual=${actual.length}`);
  let lines = 0;
  for (const exp of expected.receipts) {
    const matches = actual.filter((r) => r.name === exp.name);
    if (matches.length !== 1) throw new Error(`${label}_DUPLICATE_OR_MISSING name=${exp.name} count=${matches.length}`);
    const row = matches[0];
    if (row.docstatus !== 0) throw new Error(`${label}_NOT_DRAFT name=${exp.name} docstatus=${row.docstatus}`);
    if (!row.submit_forbidden) throw new Error(`${label}_SUBMIT_GUARD_MISSING name=${exp.name}`);
    if (row.fingerprint !== exp.fingerprint) throw new Error(`${label}_FINGERPRINT_CONFLICT name=${exp.name}`);
    if (row.line_count !== exp.line_count) throw new Error(`${label}_LINE_COUNT name=${exp.name} expected=${exp.line_count} actual=${row.line_count}`);
    if (JSON.stringify(row.source_rows) !== JSON.stringify(exp.source_rows)) throw new Error(`${label}_SOURCE_ROWS name=${exp.name}`);
    if (row.item_warehouses.length !== 0) throw new Error(`${label}_UNPROVEN_WAREHOUSE_PRESENT name=${exp.name}`);
    lines += row.line_count;
  }
  if (lines !== expected.line_count) throw new Error(`${label}_TOTAL_LINES expected=${expected.line_count} actual=${lines}`);
  return actual;
}

const a = verify("FIRST", first);
if (second) {
  const b = verify("SECOND", second);
  const stableA = a.map(({ modified, ...rest }) => rest);
  const stableB = b.map(({ modified, ...rest }) => rest);
  if (JSON.stringify(stableA) !== JSON.stringify(stableB)) throw new Error("SECOND_PASS_CONTENT_CHANGED");
  const comparableModified = a.every((row) => row.modified) && b.every((row) => row.modified);
  if (comparableModified && JSON.stringify(a.map(r=>[r.name,r.modified])) !== JSON.stringify(b.map(r=>[r.name,r.modified]))) throw new Error("SECOND_PASS_MODIFIED_CHANGED");
  console.log(`ALUMDOOR_REAL_PURCHASE_IDEMPOTENCY_PASS receipts=${b.length} lines=${expected.line_count} duplicates=0 mismatches=0 docstatus=0 submit=forbidden`);
} else {
  console.log(`ALUMDOOR_REAL_PURCHASE_FIRST_PASS_PASS receipts=${a.length} lines=${expected.line_count} duplicates=0 mismatches=0 docstatus=0 submit=forbidden`);
}