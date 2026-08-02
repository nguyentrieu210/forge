import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertRestoreVerification,
  inspectTenantBackup,
} from "../scripts/lib/tenant-backup-verification.mjs";

function fixture({ tenant = "alu", crossTenant = false } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "forge-backup-test-"));
  const sqlPath = path.join(dir, `${tenant}-backup.sql`);
  const sql = `
CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at TEXT NOT NULL);
INSERT INTO d1_migrations (id,name,applied_at) VALUES (1,'0001_init.sql','2026-08-03T00:00:00Z');
CREATE TABLE documents (tenant_id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (tenant_id,name));
INSERT INTO documents (tenant_id,name) VALUES ('${crossTenant ? "other" : tenant}','DOC-1');
CREATE TABLE doctype_definitions (tenant_id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (tenant_id,name));
INSERT INTO doctype_definitions (tenant_id,name) VALUES ('${tenant}','DocType');
CREATE TABLE installed_apps (tenant_id TEXT NOT NULL, app_id TEXT NOT NULL, manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), PRIMARY KEY (tenant_id,app_id));
INSERT INTO installed_apps (tenant_id,app_id,manifest_json) VALUES ('${tenant}','core','{}');
`;
  writeFileSync(sqlPath, sql);
  const sha256 = createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
  const manifest = {
    format: "forge-d1-backup/v1",
    tenant,
    database_name: `cloudforge-${tenant}`,
    database_id: "11111111-1111-1111-1111-111111111111",
    created_at: "2026-08-03T00:00:00.000Z",
    sql_file: path.basename(sqlPath),
    bytes: statSync(sqlPath).size,
    sha256,
    encrypted: false,
  };
  writeFileSync(`${sqlPath}.json`, `${JSON.stringify(manifest)}\n`);
  return { dir, sqlPath, manifest };
}

test("backup manifest validation binds tenant, filename, bytes and checksum", () => {
  const item = fixture();
  try {
    const inspected = inspectTenantBackup({ sqlPath: item.sqlPath, tenant: "alu" });
    assert.equal(inspected.manifestVerified, true);
    assert.equal(inspected.sha256, item.manifest.sha256);

    const broken = { ...item.manifest, bytes: item.manifest.bytes + 1 };
    writeFileSync(`${item.sqlPath}.json`, `${JSON.stringify(broken)}\n`);
    assert.throws(
      () => inspectTenantBackup({ sqlPath: item.sqlPath, tenant: "alu" }),
      /byte count mismatch/,
    );
  } finally {
    rmSync(item.dir, { recursive: true, force: true });
  }
});

test("unmanifested backups fail closed unless explicitly overridden", () => {
  const item = fixture();
  try {
    rmSync(`${item.sqlPath}.json`);
    assert.throws(
      () => inspectTenantBackup({ sqlPath: item.sqlPath, tenant: "alu" }),
      /manifest missing/,
    );
    const inspected = inspectTenantBackup({
      sqlPath: item.sqlPath,
      tenant: "alu",
      allowUnmanifested: true,
    });
    assert.equal(inspected.manifestVerified, false);
  } finally {
    rmSync(item.dir, { recursive: true, force: true });
  }
});

test("restore verification fails on corrupt, foreign-key-invalid, or empty restores", () => {
  assert.doesNotThrow(() =>
    assertRestoreVerification({
      quickCheckRows: [{ quick_check: "ok" }],
      foreignKeyRows: [],
      tableCount: 3,
    }),
  );
  assert.throws(
    () =>
      assertRestoreVerification({
        quickCheckRows: [{ quick_check: "bad" }],
        foreignKeyRows: [],
        tableCount: 3,
      }),
    /quick_check/,
  );
  assert.throws(
    () =>
      assertRestoreVerification({
        quickCheckRows: [{ quick_check: "ok" }],
        foreignKeyRows: [{ table: "x" }],
        tableCount: 3,
      }),
    /foreign-key/,
  );
  assert.throws(
    () =>
      assertRestoreVerification({
        quickCheckRows: [{ quick_check: "ok" }],
        foreignKeyRows: [],
        tableCount: 0,
      }),
    /no application tables/,
  );
});

test("offline verifier replays a backup and writes immutable evidence", () => {
  const item = fixture();
  const evidencePath = path.join(item.dir, "verify.json");
  try {
    const serverRoot = path.resolve(new URL("..", import.meta.url).pathname);
    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-tenant-backup.mjs",
        "--tenant",
        "alu",
        "--file",
        item.sqlPath,
        "--output",
        evidencePath,
      ],
      { cwd: serverRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.equal(evidence.manifest_verified, true);
    assert.equal(evidence.quick_check, "ok");
    assert.equal(evidence.foreign_key_violations, 0);
    assert.deepEqual(evidence.tenant_scope_violations, {
      documents: 0,
      doctype_definitions: 0,
      installed_apps: 0,
    });
    assert.equal(evidence.cloudflare_mutated, false);
  } finally {
    rmSync(item.dir, { recursive: true, force: true });
  }
});

test("offline verifier rejects cross-tenant core rows", () => {
  const item = fixture({ crossTenant: true });
  try {
    const serverRoot = path.resolve(new URL("..", import.meta.url).pathname);
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-tenant-backup.mjs", "--tenant", "alu", "--file", item.sqlPath],
      { cwd: serverRoot, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cross-tenant core rows/);
  } finally {
    rmSync(item.dir, { recursive: true, force: true });
  }
});
