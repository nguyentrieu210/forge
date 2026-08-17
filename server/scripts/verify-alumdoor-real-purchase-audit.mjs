#!/usr/bin/env node
import { execFileSync } from "node:child_process";
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

function persistedD1Project() {
  if (process.platform !== "win32") return [];
  const query = "SELECT name,docstatus,modified_at,payload_json FROM documents WHERE tenant_id='demo' AND doctype='Purchase Receipt' ORDER BY name";
  let stdout;
  try {
    stdout = execFileSync("npx.cmd", ["wrangler", "d1", "execute", "cloudforge-demo", "--local", "--config", "apps/tenant-worker/wrangler.jsonc", "--command", query, "--json"], {
      cwd: "C:\\alumdoor\\server",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`PERSISTED_D1_QUERY_FAILED ${clean(error?.stderr || error?.message)}`);
  }
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error(`PERSISTED_D1_QUERY_NOT_JSON ${stdout.slice(0,300)}`); }
  const rows = [];
  const visit = (value) => {
    if (Array.isArray(value)) for (const item of value) visit(item);
    else if (value && typeof value === "object") {
      if (Array.isArray(value.results)) for (const row of value.results) rows.push(row);
      else for (const child of Object.values(value)) visit(child);
    }
  };
  visit(parsed);
  return rows.flatMap((row) => {
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch { return []; }
    const marker = payload?._alumdoor_real_purchase ?? {};
    if (marker.format !== "alumdoor-real-purchase-history/v1") return [];
    const items = Array.isArray(payload.items) ? payload.items : [];
    return [{
      name: clean(row.name),
      docstatus: Number(row.docstatus ?? 0),
      fingerprint: clean(marker.import_fingerprint),
      source_rows: Array.isArray(marker.source_rows) ? marker.source_rows : [],
      submit_forbidden: marker.submit_forbidden === true,
      line_count: items.length,
      item_signature: items.map((i) => [clean(i?.item_code), Number(i?.qty), clean(i?.uom), Number(i?.rate ?? 0)]),
      item_warehouses: [...new Set(items.map((i) => clean(i?.warehouse)).filter(Boolean))],
      modified: clean(row.modified_at),
    }];
  }).sort((a,b) => a.name.localeCompare(b.name));
}

function verify(label, audit) {
  let actual = project(audit);
  if (actual.length === 0) {
    actual = persistedD1Project();
    if (actual.length) console.log(`${label}_API_RUNTIME_VIEW_STALE_FALLBACK_PERSISTED_D1 receipts=${actual.length}`);
  }
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
