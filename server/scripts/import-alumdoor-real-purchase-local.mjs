#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractRealPurchaseRows, PURCHASE_SOURCE } from "./lib/alumdoor-real-purchase-source.mjs";
import { preflightRealPurchaseRows } from "./lib/alumdoor-real-purchase-preflight.mjs";

const clean = (v) => String(v ?? "").normalize("NFC").trim();
const hash = (v) => createHash("sha256").update(String(v)).digest("hex");
const sql = (v) => `'${String(v ?? "").replaceAll("'", "''")}'`;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const rows = extractRealPurchaseRows(await readFile(resolve(repoRoot, PURCHASE_SOURCE), "utf8"));
const importableRows = rows.filter((row) => !row.excluded);
const command = process.argv[2] ?? "";

function supplierPayload(name, audit) {
  const fields = audit?.schema?.Supplier?.fields ?? [];
  const payload = { supplier_name: name, disabled: false };
  for (const field of fields) {
    if (!field?.fieldname || payload[field.fieldname] !== undefined) continue;
    if (field.default !== null && field.default !== undefined && clean(field.default)) payload[field.fieldname] = field.default;
  }
  payload._alumdoor_real_purchase = {
    format: "alumdoor-real-purchase-supplier/v1",
    mode: "historical_source_identity",
    source: PURCHASE_SOURCE,
  };
  return payload;
}

function supplierSql(audit) {
  const suppliers = [...new Set(importableRows.map((row) => row.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
  const statements = ["BEGIN TRANSACTION;"];
  for (const name of suppliers) {
    const payload = JSON.stringify(supplierPayload(name, audit));
    statements.push(`INSERT INTO master_records (tenant_id,record_type,name,disabled,data_json,modified_at)\nSELECT 'demo','Supplier',${sql(name)},0,${sql(payload)},CURRENT_TIMESTAMP\nWHERE NOT EXISTS (SELECT 1 FROM master_records WHERE tenant_id='demo' AND record_type='Supplier' AND name=${sql(name)});`);
    statements.push(`INSERT INTO documents (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)\nSELECT 'demo',${sql(`Supplier:${name}`)},'Supplier',${sql(name)},'admin',0,'Draft',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'admin',${sql(payload)}\nWHERE NOT EXISTS (SELECT 1 FROM documents WHERE tenant_id='demo' AND doc_key=${sql(`Supplier:${name}`)});`);
    statements.push(`INSERT INTO document_search (tenant_id,doctype,name,title,content,modified_at)\nSELECT 'demo','Supplier',${sql(name)},${sql(name)},${sql(name)},CURRENT_TIMESTAMP\nWHERE NOT EXISTS (SELECT 1 FROM document_search WHERE tenant_id='demo' AND doctype='Supplier' AND name=${sql(name)});`);
  }
  statements.push("COMMIT;");
  return { suppliers, text: `${statements.join("\n\n")}\n` };
}

function liveManifests(audit) {
  const supplierManifest = [];
  for (const entry of audit?.suppliers ?? []) {
    for (const match of entry?.matches ?? []) supplierManifest.push({ ...match, supplier_name: clean(match.supplier_name || match.name) });
  }
  const itemManifest = (audit?.items ?? []).filter((entry) => entry?.exists && entry?.doc).map((entry) => entry.doc);
  return { supplierManifest, itemManifest };
}

function resolveCompany(audit) {
  const matches = (audit?.companies ?? []).filter((row) => clean(row.name).toLocaleLowerCase("vi") === "alumdoor" && ![true, 1, "1"].includes(row.disabled));
  if (matches.length !== 1) throw new Error(`COMPANY_AUTHORITY_NOT_EXACT_ALUMDOOR matches=${matches.length}`);
  return matches[0];
}

function receiptName(doc) {
  return `PR-HIST-${hash(doc.source_group_key).slice(0, 12).toUpperCase()}`;
}

function buildReceiptPayload(doc, company) {
  const items = doc.lines.map((line) => {
    const item = {
      item_code: line.canonical_item_code,
      item_name: line.item_name || line.canonical_item_code,
      qty: line.canonical_quantity,
      uom: line.canonical_uom,
    };
    if (Number.isFinite(line.rate)) item.rate = line.rate;
    if (Number.isFinite(line.pre_tax_amount)) item.amount = line.pre_tax_amount;
    item._alumdoor_source = {
      row: line.source_row,
      source_qty: line.source_quantity,
      source_uom: line.uom,
      source_rate: line.rate,
      source_amount: line.pre_tax_amount,
      canonical_fingerprint: line.canonical_fingerprint,
    };
    return item;
  });
  return {
    supplier: doc.supplier,
    company: company.name,
    currency: clean(company.default_currency) || "VND",
    posting_date: doc.posting_date,
    posting_at: `${doc.posting_date}T12:00:00.000Z`,
    supplier_invoice_no: doc.source_voucher,
    items,
    _alumdoor_real_purchase: {
      format: "alumdoor-real-purchase-history/v1",
      mode: "historical_draft",
      import_fingerprint: doc.import_fingerprint,
      source: PURCHASE_SOURCE,
      source_group_key: doc.source_group_key,
      source_rows: doc.source_rows,
      warehouse_authority: "unproven_omitted",
      goods_photo_authority: "not_in_source_omitted",
      submit_forbidden: true,
    },
  };
}

function receiptSql(audit) {
  const company = resolveCompany(audit);
  const { supplierManifest, itemManifest } = liveManifests(audit);
  const report = preflightRealPurchaseRows(rows, {
    company: company.name,
    historical_draft: true,
    supplier_manifest: supplierManifest,
    item_manifest: itemManifest,
  });
  if (!report.draft_mutation_authorized || report.purchase_receipt.ready !== 7 || report.source_exclusions.row_count !== 2) {
    throw new Error(`PURCHASE_IMPORT_DRAFT_PREFLIGHT_BLOCKED blockers=${report.blocker_codes.join(",")} ready=${report.purchase_receipt.ready}`);
  }
  if (report.submit_authorized) throw new Error("historical draft must never authorize submit");
  const expected = [];
  const statements = ["BEGIN TRANSACTION;"];
  for (const doc of report.documents) {
    const name = receiptName(doc);
    const payload = buildReceiptPayload(doc, company);
    const payloadJson = JSON.stringify(payload);
    expected.push({ name, fingerprint: doc.import_fingerprint, line_count: doc.line_count, source_rows: doc.source_rows });
    statements.push(`INSERT INTO documents (tenant_id,doc_key,doctype,name,owner,docstatus,status,version,created_at,modified_at,modified_by,payload_json)\nSELECT 'demo',${sql(`Purchase Receipt:${name}`)},'Purchase Receipt',${sql(name)},'admin',0,'Draft',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'admin',${sql(payloadJson)}\nWHERE NOT EXISTS (SELECT 1 FROM documents WHERE tenant_id='demo' AND doc_key=${sql(`Purchase Receipt:${name}`)});`);
    const content = `${doc.supplier} ${doc.source_voucher} ${doc.lines.map((line) => line.canonical_item_code).join(" ")}`;
    statements.push(`INSERT INTO document_search (tenant_id,doctype,name,title,content,modified_at)\nSELECT 'demo','Purchase Receipt',${sql(name)},${sql(`${doc.supplier} · ${doc.source_voucher}`)},${sql(content)},CURRENT_TIMESTAMP\nWHERE NOT EXISTS (SELECT 1 FROM document_search WHERE tenant_id='demo' AND doctype='Purchase Receipt' AND name=${sql(name)});`);
  }
  statements.push("COMMIT;");
  return {
    report,
    expected: { format: "alumdoor-real-purchase-expected/v1", receipt_count: expected.length, line_count: expected.reduce((n, row) => n + row.line_count, 0), receipts: expected },
    text: `${statements.join("\n\n")}\n`,
  };
}

function flattenResults(value, out = []) {
  if (Array.isArray(value)) for (const item of value) flattenResults(item, out);
  else if (value && typeof value === "object") {
    if (typeof value.name === "string" && ("fingerprint" in value || "docstatus" in value)) out.push(value);
    for (const child of Object.values(value)) flattenResults(child, out);
  }
  return out;
}

if (command === "suppliers-sql") {
  const audit = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  const output = resolve(process.argv[4]);
  const built = supplierSql(audit);
  await writeFile(output, built.text, "utf8");
  console.log(`ALUMDOOR_REAL_PURCHASE_SUPPLIER_SQL_PASS suppliers=${built.suppliers.length} output=${output}`);
} else if (command === "receipts-sql") {
  const audit = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  const sqlOutput = resolve(process.argv[4]);
  const expectedOutput = resolve(process.argv[5]);
  const built = receiptSql(audit);
  await writeFile(sqlOutput, built.text, "utf8");
  await writeFile(expectedOutput, `${JSON.stringify(built.expected, null, 2)}\n`, "utf8");
  console.log(`ALUMDOOR_REAL_PURCHASE_RECEIPT_SQL_PASS receipts=${built.expected.receipt_count} lines=${built.expected.line_count} excluded=${built.report.source_exclusions.row_count}`);
} else if (command === "verify") {
  const expected = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  const snapshot = JSON.parse(await readFile(resolve(process.argv[4]), "utf8"));
  const actual = flattenResults(snapshot).filter((row) => clean(row.fingerprint));
  if (actual.length !== expected.receipt_count) throw new Error(`POSTVERIFY_RECEIPT_COUNT expected=${expected.receipt_count} actual=${actual.length}`);
  let lines = 0;
  for (const receipt of expected.receipts) {
    const matches = actual.filter((row) => row.name === receipt.name);
    if (matches.length !== 1) throw new Error(`POSTVERIFY_DUPLICATE_OR_MISSING name=${receipt.name} count=${matches.length}`);
    const row = matches[0];
    if (Number(row.docstatus) !== 0) throw new Error(`POSTVERIFY_NOT_DRAFT name=${receipt.name} docstatus=${row.docstatus}`);
    if (clean(row.fingerprint) !== receipt.fingerprint) throw new Error(`POSTVERIFY_FINGERPRINT_CONFLICT name=${receipt.name}`);
    if (Number(row.line_count) !== receipt.line_count) throw new Error(`POSTVERIFY_LINE_COUNT name=${receipt.name} expected=${receipt.line_count} actual=${row.line_count}`);
    lines += Number(row.line_count);
  }
  if (lines !== expected.line_count) throw new Error(`POSTVERIFY_TOTAL_LINES expected=${expected.line_count} actual=${lines}`);
  console.log(`ALUMDOOR_REAL_PURCHASE_POSTVERIFY_PASS receipts=${actual.length} lines=${lines} docstatus=0 duplicates=0 mismatches=0`);
} else {
  throw new Error("Usage: import-alumdoor-real-purchase-local.mjs suppliers-sql <audit.json> <out.sql> | receipts-sql <audit.json> <out.sql> <expected.json> | verify <expected.json> <d1-query.json>");
}