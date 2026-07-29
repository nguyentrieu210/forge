import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { rewriteOversizedInstalledAppRows } from "../scripts/lib/d1-backup-import.mjs";

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

test("oversized installed app manifests are restored as valid chunked JSON", () => {
  const manifest = {
    id: "alumdoor",
    version: "2.0.0",
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
