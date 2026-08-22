import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const script = fileURLToPath(new URL("../scripts/build-alumdoor-profile-specifications.mjs", import.meta.url));

function build() {
  const output = mkdtempSync(join(tmpdir(), "alumdoor-profile-spec-"));
  const sqlPath = join(output, "profile-spec.sql");
  const auditPath = join(output, "profile-spec.audit.json");
  execFileSync(process.execPath, [script, "demo", sqlPath, auditPath], { cwd: repoRoot, stdio: "pipe" });
  return {
    sql: readFileSync(sqlPath, "utf8"),
    audit: JSON.parse(readFileSync(auditPath, "utf8")),
  };
}

test("legacy profile-spec command delegates to the seventeen-row canonical material catalog", () => {
  const { audit } = build();
  assert.equal(audit.canonical_specs, 17);
  assert.equal(audit.authority, "server/scripts/lib/alumdoor-material-specification-catalog.mjs");
  assert.equal(new Set(audit.item_links.map((row) => row.item_code)).size, 17);
  assert.equal(audit.retired_legacy_profile_map, true);
});

test("profile specification migration is bounded and idempotent", () => {
  const { sql } = build();
  assert.equal((sql.match(/INSERT INTO documents/g) ?? []).length, 17);
  assert.equal((sql.match(/UPDATE documents/g) ?? []).length, 17);
  assert.match(sql, /ON CONFLICT\(tenant_id,doc_key\) DO UPDATE/);
  assert.match(sql, /documents\.payload_json<>excluded\.payload_json/);
  assert.doesNotMatch(sql, /DELETE|stock_ledger_entries|general_ledger_entries/i);
});
