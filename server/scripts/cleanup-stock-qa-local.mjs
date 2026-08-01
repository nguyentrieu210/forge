#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const manifestArg = process.argv.find((value) => value.startsWith("--manifest="));
const manifestPath = manifestArg?.slice("--manifest=".length) || process.env.FORGE_QA_CLEANUP_MANIFEST;
if (!manifestPath) throw new Error("FORGE_QA_CLEANUP_MANIFEST or --manifest=<path> is required");

const configArg = process.argv.find((value) => value.startsWith("--config="));
const config = configArg?.slice("--config=".length) || "apps/tenant-worker/wrangler.purchase-qa.jsonc";
if (/prod|remote/i.test(config)) throw new Error(`Refusing non-local cleanup config: ${config}`);

const database = process.env.FORGE_QA_D1_DATABASE || "cloudforge-demo";
const records = readManifest(resolve(manifestPath));
const tenantIds = new Set(records.map((record) => record.tenant_id));
if (tenantIds.size !== 1) throw new Error("Cleanup manifest must contain exactly one tenant_id");
const tenantId = [...tenantIds][0];
if (!tenantId) throw new Error("Cleanup tenant_id is required");

const documents = dedupe(records.filter((record) => record.kind === "document"), (record) => `${record.doctype}\u0000${record.name}`);
const users = dedupe(records.filter((record) => record.kind === "user"), (record) => record.user_id);
if (documents.length === 0) throw new Error("Cleanup manifest contains no documents");

const documentLookupSql = `SELECT doc_key,doctype,name FROM documents WHERE tenant_id=${quote(tenantId)} AND (${documents
  .map((record) => `(doctype=${quote(record.doctype)} AND name=${quote(record.name)})`)
  .join(" OR ")});`;
const presentDocuments = query(documentLookupSql);
const presentByIdentity = new Map(presentDocuments.map((row) => [`${row.doctype}\u0000${row.name}`, row]));
const missing = documents.filter((record) => !presentByIdentity.has(`${record.doctype}\u0000${record.name}`));
if (missing.length > 0) {
  throw new Error(`Cleanup manifest references missing documents before cleanup: ${missing.map((record) => `${record.doctype}/${record.name}`).join(", ")}`);
}

const docKeys = presentDocuments.map((row) => String(row.doc_key));
const voucherConditions = documents.map((record) => `(voucher_type=${quote(record.doctype)} AND voucher_no=${quote(record.name)})`);
const documentConditions = documents.map((record) => `(doctype=${quote(record.doctype)} AND name=${quote(record.name)})`);
const bundleNames = documents.filter((record) => record.doctype === "Serial and Batch Bundle").map((record) => record.name);

const statements = [
  voucherConditions.length ? `DELETE FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});` : "",
  voucherConditions.length ? `DELETE FROM stock_ledger_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});` : "",
  voucherConditions.length ? `DELETE FROM gl_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});` : "",
  bundleNames.length ? `DELETE FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND bundle_name IN (${bundleNames.map(quote).join(",")});` : "",
  docKeys.length ? `DELETE FROM document_children WHERE tenant_id=${quote(tenantId)} AND parent_key IN (${docKeys.map(quote).join(",")});` : "",
  documentConditions.length ? `DELETE FROM mutation_receipts WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});` : "",
  documentConditions.length ? `DELETE FROM assignments WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});` : "",
  documentConditions.length ? `DELETE FROM document_shares WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});` : "",
  documentConditions.length ? `DELETE FROM document_tags WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});` : "",
  documentConditions.length ? `UPDATE files SET attached_to_doctype=NULL, attached_to_name=NULL WHERE tenant_id=${quote(tenantId)} AND (${documents.map((record) => `(attached_to_doctype=${quote(record.doctype)} AND attached_to_name=${quote(record.name)})`).join(" OR ")});` : "",
  docKeys.length ? `DELETE FROM documents WHERE tenant_id=${quote(tenantId)} AND doc_key IN (${docKeys.map(quote).join(",")});` : "",
  users.length ? `DELETE FROM user_permissions WHERE tenant_id=${quote(tenantId)} AND user IN (${users.map((record) => quote(record.user_id)).join(",")});` : "",
  users.length ? `DELETE FROM user_roles WHERE tenant_id=${quote(tenantId)} AND user_id IN (${users.map((record) => quote(record.user_id)).join(",")});` : "",
  // RBAC audit is intentionally append-only. QA cleanup must not weaken that invariant.
  users.length ? `DELETE FROM users WHERE tenant_id=${quote(tenantId)} AND user_id IN (${users.map((record) => quote(record.user_id)).join(",")});` : "",
].filter(Boolean);

execute(statements.join("\n"));

const residueChecks = [
  `SELECT 'documents' AS source,COUNT(*) AS residue FROM documents WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_children' AS source,COUNT(*) AS residue FROM document_children WHERE tenant_id=${quote(tenantId)} AND parent_key IN (${docKeys.map(quote).join(",")})`,
  `SELECT 'stock_ledger_entries' AS source,COUNT(*) AS residue FROM stock_ledger_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")})`,
  `SELECT 'stock_bundle_usage_entries' AS source,COUNT(*) AS residue FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND ((${voucherConditions.join(" OR ")})${bundleNames.length ? ` OR bundle_name IN (${bundleNames.map(quote).join(",")})` : ""})`,
  users.length ? `SELECT 'users' AS source,COUNT(*) AS residue FROM users WHERE tenant_id=${quote(tenantId)} AND user_id IN (${users.map((record) => quote(record.user_id)).join(",")})` : "",
  users.length ? `SELECT 'user_roles' AS source,COUNT(*) AS residue FROM user_roles WHERE tenant_id=${quote(tenantId)} AND user_id IN (${users.map((record) => quote(record.user_id)).join(",")})` : "",
  users.length ? `SELECT 'user_permissions' AS source,COUNT(*) AS residue FROM user_permissions WHERE tenant_id=${quote(tenantId)} AND user IN (${users.map((record) => quote(record.user_id)).join(",")})` : "",
].filter(Boolean).join(" UNION ALL ");
const residue = query(`${residueChecks};`);
const dirty = residue.filter((row) => Number(row.residue) !== 0);
if (dirty.length > 0) throw new Error(`QA cleanup residue remains: ${JSON.stringify(dirty)}`);

console.log(JSON.stringify({ ok: true, tenant_id: tenantId, documents: documents.length, users: users.length, residue }, null, 2));

function readManifest(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new Error("Cleanup manifest is empty");
  return lines.map((line, index) => validateRecord(JSON.parse(line), index + 1));
}

function validateRecord(value, line) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid manifest record at line ${line}`);
  const tenant_id = safeText(value.tenant_id, `tenant_id line ${line}`, 160);
  if (value.kind === "document") {
    return {
      kind: "document",
      tenant_id,
      doctype: safeText(value.doctype, `doctype line ${line}`, 160),
      name: safeText(value.name, `name line ${line}`, 240),
    };
  }
  if (value.kind === "user") {
    return { kind: "user", tenant_id, user_id: safeText(value.user_id, `user_id line ${line}`, 320) };
  }
  throw new Error(`Unsupported cleanup manifest kind at line ${line}`);
}

function safeText(value, label, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.trim();
}

function dedupe(values, keyOf) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function query(sql) {
  const output = runWrangler(["d1", "execute", database, "--local", "--config", config, "--json", "--command", sql]);
  const parsed = JSON.parse(output);
  const groups = Array.isArray(parsed) ? parsed : [parsed];
  return groups.flatMap((group) => Array.isArray(group?.results) ? group.results : []);
}

function execute(sql) {
  runWrangler(["d1", "execute", database, "--local", "--config", config, "--command", sql]);
}

function runWrangler(args) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["exec", "wrangler", ...args], {
    cwd: resolve(new URL("..", import.meta.url).pathname),
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}
