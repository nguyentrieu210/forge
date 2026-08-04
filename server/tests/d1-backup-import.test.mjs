import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { rewriteOversizedInstalledAppRows } from "../scripts/lib/d1-backup-import.mjs";

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

function largeManifest(version = "2.0.0") {
  return {
    id: "alumdoor",
    version,
    description: `Cửa nhôm ${"rất dài ".repeat(1_000)}`,
    doctypes: Array.from({ length: 12 }, (_, index) => ({
      name: `DocType ${index}`,
      fields: Array.from({ length: 10 }, (__, field) => ({
        fieldname: `field_${field}`,
        label: `Nhãn ${index}-${field} ${"x".repeat(200)}`,
      })),
    })),
    client: { navigation: ["Kho", "Mua hàng", "Bán hàng"] },
  };
}

test("oversized installed app manifests are restored as valid chunked JSON", () => {
  const manifest = largeManifest();
  const columns =
    '"tenant_id","app_id","app_name","version","content_hash","manifest_json","installed_by","installed_at","modified_at"';
  const values = [
    "alu",
    "alumdoor",
    "Alumdoor",
    "2.0.0",
    "a".repeat(64),
    JSON.stringify(manifest),
    "admin",
    "2026-07-30T00:00:00.000Z",
    "2026-07-30T00:00:00.000Z",
  ].map(sqlString);
  const source = `INSERT INTO "installed_apps" (${columns}) VALUES(${values.join(",")});`;
  const result = rewriteOversizedInstalledAppRows(source, { maxStatementBytes: 6_000 });

  assert.equal(result.rewrittenRows, 1);
  assert.deepEqual(result.rewrittenByTable, { installed_apps: 1 });
  assert.ok(result.generatedStatements > 10);
  assert.ok(result.maxGeneratedStatementBytes <= 6_000);

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE installed_apps (
      tenant_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      version TEXT NOT NULL,
      content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
      manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
      installed_by TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, app_id)
    );
    ${result.sql}
  `);
  const restored = database
    .prepare("SELECT manifest_json FROM installed_apps WHERE tenant_id=? AND app_id=?")
    .get("alu", "alumdoor");
  assert.deepEqual(JSON.parse(restored.manifest_json), manifest);
});

test("oversized app revision history manifests are restored without losing append-only identity", () => {
  const manifest = largeManifest("2.2.3");
  manifest.history = Array.from({ length: 40 }, (_, index) => ({
    revision: index + 1,
    note: `revision ${index + 1} ${"lịch sử ".repeat(250)}`,
  }));
  const columns =
    '"tenant_id","app_id","revision_no","version","content_hash","manifest_json","recorded_at"';
  const values = [
    sqlString("alu"),
    sqlString("alumdoor"),
    "7",
    sqlString("2.2.3"),
    sqlString("b".repeat(64)),
    sqlString(JSON.stringify(manifest)),
    sqlString("2026-08-04T00:00:00.000Z"),
  ];
  const source = `INSERT INTO "app_revisions" (${columns}) VALUES(${values.join(",")});`;
  assert.ok(Buffer.byteLength(source) > 6_000);

  const result = rewriteOversizedInstalledAppRows(source, { maxStatementBytes: 6_000 });

  assert.equal(result.rewrittenRows, 1);
  assert.deepEqual(result.rewrittenByTable, { app_revisions: 1 });
  assert.ok(result.generatedStatements > 10);
  assert.ok(result.maxGeneratedStatementBytes <= 6_000);

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE app_revisions (
      tenant_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      revision_no INTEGER NOT NULL CHECK (revision_no > 0),
      version TEXT NOT NULL,
      content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
      manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
      recorded_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, app_id, revision_no),
      UNIQUE (tenant_id, app_id, content_hash, manifest_json)
    );
    ${result.sql}
  `);
  const restored = database
    .prepare("SELECT revision_no, version, content_hash, manifest_json FROM app_revisions WHERE tenant_id=? AND app_id=?")
    .get("alu", "alumdoor");
  assert.equal(restored.revision_no, 7);
  assert.equal(restored.version, "2.2.3");
  assert.equal(restored.content_hash, "b".repeat(64));
  assert.deepEqual(JSON.parse(restored.manifest_json), manifest);
});
