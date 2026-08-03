import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SHA256_RE = /^[0-9a-f]{64}$/;
export const RESERVED_METADATA_TENANTS = Object.freeze(["demo", "__standard__"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`backup manifest is not valid JSON: ${error.message}`);
  }
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), "backup manifest must be a JSON object");
  return manifest;
}

export function allowedTenantIdsForBackupTable({ table, tenant }) {
  assert(typeof table === "string" && table.length > 0, "backup table name is required");
  assert(tenant && /^[a-z][a-z0-9-]*$/.test(tenant), "tenant id is invalid");
  return table === "doctype_definitions"
    ? [tenant, ...RESERVED_METADATA_TENANTS]
    : [tenant];
}

export function inspectTenantBackup({ sqlPath, tenant, allowUnmanifested = false }) {
  const resolvedSqlPath = path.resolve(sqlPath);
  assert(tenant && /^[a-z][a-z0-9-]*$/.test(tenant), "tenant id is invalid");
  assert(existsSync(resolvedSqlPath), `backup file not found: ${resolvedSqlPath}`);
  const stat = statSync(resolvedSqlPath);
  assert(stat.isFile(), `backup path is not a file: ${resolvedSqlPath}`);

  const sql = readFileSync(resolvedSqlPath);
  const sha256 = createHash("sha256").update(sql).digest("hex");
  const manifestPath = `${resolvedSqlPath}.json`;
  if (!existsSync(manifestPath)) {
    assert(
      allowUnmanifested,
      `backup manifest missing: ${manifestPath}; use --allow-unmanifested only for a deliberate legacy drill`,
    );
    return {
      sqlPath: resolvedSqlPath,
      manifestPath: null,
      manifest: null,
      manifestVerified: false,
      bytes: stat.size,
      sha256,
    };
  }

  const manifest = parseManifest(manifestPath);
  assert(manifest.format === "forge-d1-backup/v1", `unsupported backup manifest format: ${String(manifest.format)}`);
  assert(manifest.tenant === tenant, `backup belongs to tenant ${String(manifest.tenant)}, not ${tenant}`);
  assert(manifest.database_name === `cloudforge-${tenant}`, `backup database_name must be cloudforge-${tenant}`);
  assert(typeof manifest.database_id === "string" && manifest.database_id.length > 0, "backup manifest has no database_id");
  assert(
    manifest.sql_file === path.basename(resolvedSqlPath),
    `backup manifest sql_file does not match ${path.basename(resolvedSqlPath)}`,
  );
  assert(Number.isSafeInteger(manifest.bytes) && manifest.bytes >= 0, "backup manifest bytes is invalid");
  assert(manifest.bytes === stat.size, `backup byte count mismatch: manifest ${manifest.bytes}, actual ${stat.size}`);
  assert(typeof manifest.sha256 === "string" && SHA256_RE.test(manifest.sha256), "backup manifest sha256 is invalid");
  assert(manifest.sha256 === sha256, "backup checksum does not match its manifest");
  assert(manifest.encrypted === false, "forge-d1-backup/v1 expects a plaintext SQL export before verification");
  assert(
    typeof manifest.created_at === "string" && Number.isFinite(Date.parse(manifest.created_at)),
    "backup manifest created_at is invalid",
  );

  return {
    sqlPath: resolvedSqlPath,
    manifestPath,
    manifest,
    manifestVerified: true,
    bytes: stat.size,
    sha256,
  };
}

function firstScalar(row) {
  if (!row || typeof row !== "object") return undefined;
  return Object.values(row)[0];
}

export function assertRestoreVerification({ quickCheckRows, foreignKeyRows, tableCount }) {
  assert(Array.isArray(quickCheckRows), "quick_check result is not an array");
  assert(
    quickCheckRows.length === 1 && String(firstScalar(quickCheckRows[0])).toLowerCase() === "ok",
    "restored database failed PRAGMA quick_check",
  );
  assert(Array.isArray(foreignKeyRows), "foreign_key_check result is not an array");
  assert(
    foreignKeyRows.length === 0,
    `restored database has ${foreignKeyRows.length} foreign-key violation(s)`,
  );
  assert(Number.isSafeInteger(tableCount) && tableCount > 0, "restored database has no application tables");
}
