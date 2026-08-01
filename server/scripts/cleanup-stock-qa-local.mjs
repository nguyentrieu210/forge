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

// `documentKey()` in the kernel is `${doctype}:${name}`. Derive it from the manifest
// instead of looking it up first so cleanup is idempotent after a prior partial run.
// A missing document must not prevent removal/checking of its children, versions or
// other dependent state that may still exist.
const docKeys = documents.map((record) => `${record.doctype}:${record.name}`);
const voucherConditions = documents.map((record) => `(voucher_type=${quote(record.doctype)} AND voucher_no=${quote(record.name)})`);
const documentConditions = documents.map((record) => `(doctype=${quote(record.doctype)} AND name=${quote(record.name)})`);
const fileConditions = documents.map((record) => `(attached_to_doctype=${quote(record.doctype)} AND attached_to_name=${quote(record.name)})`);
const bundleNames = documents.filter((record) => record.doctype === "Serial and Batch Bundle").map((record) => record.name);
const userIds = users.map((record) => record.user_id);

// Fail before the first DELETE when a migration changes any cleanup contract. The old
// script discovered schema drift halfway through a multi-statement mutation, leaving a
// half-clean local database that could not be retried. This is intentionally strict:
// silently skipping a table would make "residue = 0" meaningless.
assertSchema({
  documents: ["tenant_id", "doc_key", "doctype", "name"],
  document_children: ["tenant_id", "parent_key"],
  versions: ["tenant_id", "doc_key"],
  document_comments: ["tenant_id", "doctype", "name"],
  document_views: ["tenant_id", "doctype", "name"],
  document_search: ["tenant_id", "doctype", "name"],
  mutation_receipts: ["tenant_id", "doctype", "name"],
  assignments: ["tenant_id", "doctype", "name"],
  document_shares: ["tenant_id", "doctype", "name"],
  document_tags: ["tenant_id", "doctype", "name"],
  files: ["tenant_id", "attached_to_doctype", "attached_to_name"],
  stock_ledger_entries: ["tenant_id", "voucher_type", "voucher_no"],
  stock_bundle_usage_entries: ["tenant_id", "voucher_type", "voucher_no", "bundle_name"],
  gl_entries: ["tenant_id", "voucher_type", "voucher_no"],
  users: ["tenant_id", "user_id"],
  user_roles: ["tenant_id", "user_id"],
  user_permissions: ["tenant_id", "user"],
  rbac_audit_events: ["tenant_id", "target_user_id"],
});

const steps = [
  step("bundle usage by voucher", `DELETE FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});`),
  step("stock ledger", `DELETE FROM stock_ledger_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});`),
  step("general ledger", `DELETE FROM gl_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")});`),
  ...(bundleNames.length ? [step("bundle usage by bundle", `DELETE FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND bundle_name IN (${bundleNames.map(quote).join(",")});`)] : []),
  step("document versions", `DELETE FROM versions WHERE tenant_id=${quote(tenantId)} AND doc_key IN (${docKeys.map(quote).join(",")});`),
  step("document comments", `DELETE FROM document_comments WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("document views", `DELETE FROM document_views WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("document children", `DELETE FROM document_children WHERE tenant_id=${quote(tenantId)} AND parent_key IN (${docKeys.map(quote).join(",")});`),
  step("mutation receipts", `DELETE FROM mutation_receipts WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("assignments", `DELETE FROM assignments WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("document shares", `DELETE FROM document_shares WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("document tags", `DELETE FROM document_tags WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("document search", `DELETE FROM document_search WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")});`),
  step("file attachments", `UPDATE files SET attached_to_doctype=NULL, attached_to_name=NULL WHERE tenant_id=${quote(tenantId)} AND (${fileConditions.join(" OR ")});`),
  step("documents", `DELETE FROM documents WHERE tenant_id=${quote(tenantId)} AND doc_key IN (${docKeys.map(quote).join(",")});`),
  ...(userIds.length ? [
    step("user permissions", `DELETE FROM user_permissions WHERE tenant_id=${quote(tenantId)} AND user IN (${userIds.map(quote).join(",")});`),
    step("user role grants", `DELETE FROM user_roles WHERE tenant_id=${quote(tenantId)} AND user_id IN (${userIds.map(quote).join(",")});`),
    step("users", `DELETE FROM users WHERE tenant_id=${quote(tenantId)} AND user_id IN (${userIds.map(quote).join(",")});`),
  ] : []),
];

// Validate every generated statement, including trigger compilation, before mutation.
// This catches stale column/trigger assumptions without deleting the first half of the
// fixture. The mutation itself remains retry-safe because every DELETE/UPDATE is exact
// and the manifest-derived identities remain valid after records disappear.
for (const entry of steps) preflight(entry);
for (const entry of steps) executeStep(entry);

const residueChecks = [
  `SELECT 'documents' AS source,COUNT(*) AS residue FROM documents WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_children' AS source,COUNT(*) AS residue FROM document_children WHERE tenant_id=${quote(tenantId)} AND parent_key IN (${docKeys.map(quote).join(",")})`,
  `SELECT 'versions' AS source,COUNT(*) AS residue FROM versions WHERE tenant_id=${quote(tenantId)} AND doc_key IN (${docKeys.map(quote).join(",")})`,
  `SELECT 'document_comments' AS source,COUNT(*) AS residue FROM document_comments WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_views' AS source,COUNT(*) AS residue FROM document_views WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_search' AS source,COUNT(*) AS residue FROM document_search WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'mutation_receipts' AS source,COUNT(*) AS residue FROM mutation_receipts WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'assignments' AS source,COUNT(*) AS residue FROM assignments WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_shares' AS source,COUNT(*) AS residue FROM document_shares WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'document_tags' AS source,COUNT(*) AS residue FROM document_tags WHERE tenant_id=${quote(tenantId)} AND (${documentConditions.join(" OR ")})`,
  `SELECT 'files_attached' AS source,COUNT(*) AS residue FROM files WHERE tenant_id=${quote(tenantId)} AND (${fileConditions.join(" OR ")})`,
  `SELECT 'stock_ledger_entries' AS source,COUNT(*) AS residue FROM stock_ledger_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")})`,
  `SELECT 'gl_entries' AS source,COUNT(*) AS residue FROM gl_entries WHERE tenant_id=${quote(tenantId)} AND (${voucherConditions.join(" OR ")})`,
  `SELECT 'stock_bundle_usage_entries' AS source,COUNT(*) AS residue FROM stock_bundle_usage_entries WHERE tenant_id=${quote(tenantId)} AND ((${voucherConditions.join(" OR ")})${bundleNames.length ? ` OR bundle_name IN (${bundleNames.map(quote).join(",")})` : ""})`,
  ...(userIds.length ? [
    `SELECT 'users' AS source,COUNT(*) AS residue FROM users WHERE tenant_id=${quote(tenantId)} AND user_id IN (${userIds.map(quote).join(",")})`,
    `SELECT 'user_roles' AS source,COUNT(*) AS residue FROM user_roles WHERE tenant_id=${quote(tenantId)} AND user_id IN (${userIds.map(quote).join(",")})`,
    `SELECT 'user_permissions' AS source,COUNT(*) AS residue FROM user_permissions WHERE tenant_id=${quote(tenantId)} AND user IN (${userIds.map(quote).join(",")})`,
  ] : []),
].join(" UNION ALL ");
const residue = query(`${residueChecks};`);
const dirty = residue.filter((row) => Number(row.residue) !== 0);
if (dirty.length > 0) throw new Error(`QA cleanup residue remains: ${JSON.stringify(dirty)}`);

// RBAC audit is deliberately NOT cleanup residue. Migration 0030 makes it append-only
// and rejects DELETE/UPDATE. Keeping the immutable record of a QA user's creation while
// deleting the user/grants is the same security semantic production relies on: history
// survives, authorization does not.
const retainedAudit = userIds.length
  ? query(`SELECT COUNT(*) AS count FROM rbac_audit_events WHERE tenant_id=${quote(tenantId)} AND target_user_id IN (${userIds.map(quote).join(",")});`)[0]?.count ?? 0
  : 0;

console.log(JSON.stringify({
  ok: true,
  tenant_id: tenantId,
  documents: documents.length,
  users: users.length,
  retained_rbac_audit_events: Number(retainedAudit),
  residue,
}, null, 2));

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

function step(label, sql) {
  return { label, sql };
}

function assertSchema(expectations) {
  const probes = Object.keys(expectations).map((table) =>
    `SELECT ${quote(table)} AS table_name,name AS column_name FROM pragma_table_info(${quote(table)})`);
  const rows = query(`${probes.join(" UNION ALL ")};`);
  const actual = new Map();
  for (const row of rows) {
    const table = String(row.table_name ?? "");
    const column = String(row.column_name ?? "");
    if (!actual.has(table)) actual.set(table, new Set());
    actual.get(table).add(column);
  }
  const problems = [];
  for (const [table, columns] of Object.entries(expectations)) {
    const found = actual.get(table);
    if (!found) {
      problems.push(`${table}: table missing`);
      continue;
    }
    const missing = columns.filter((column) => !found.has(column));
    if (missing.length) problems.push(`${table}: missing ${missing.join(",")}`);
  }
  if (problems.length) throw new Error(`QA cleanup schema preflight failed: ${problems.join("; ")}`);
}

function preflight(entry) {
  try {
    query(`EXPLAIN ${entry.sql}`);
  } catch (error) {
    throw new Error(`QA cleanup preflight failed at ${entry.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function executeStep(entry) {
  try {
    execute(entry.sql);
  } catch (error) {
    throw new Error(`QA cleanup failed at ${entry.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
