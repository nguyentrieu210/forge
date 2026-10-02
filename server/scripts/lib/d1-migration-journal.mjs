import { createHash, randomUUID } from "node:crypto";

const table = "forge_d1_migration_journal";
export const journalSql = Object.freeze({
  exists: `SELECT COUNT(*) AS total FROM sqlite_schema WHERE type='table' AND name='${table}'`,
  read: `SELECT name, content_sha256, state FROM ${table} ORDER BY name`,
  create: `CREATE TABLE IF NOT EXISTS ${table} (
    name TEXT PRIMARY KEY NOT NULL,
    content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
    state TEXT NOT NULL CHECK(state IN ('reserved','applied')),
    reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT,
    CHECK((state='reserved' AND applied_at IS NULL) OR (state='applied' AND applied_at IS NOT NULL))
  );
  CREATE TRIGGER IF NOT EXISTS forge_d1_migration_identity_immutable
  BEFORE UPDATE ON ${table}
  WHEN NEW.name IS NOT OLD.name OR NEW.content_sha256 IS NOT OLD.content_sha256
    OR NEW.reserved_at IS NOT OLD.reserved_at OR OLD.state='applied'
    OR NEW.state!='applied'
  BEGIN SELECT RAISE(ABORT,'migration identity/state is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS forge_d1_migration_no_delete
  BEFORE DELETE ON ${table}
  BEGIN SELECT RAISE(ABORT,'migration journal is append-only'); END;`,
});
const literal = (value) => "'" + String(value).replace(/'/g, "''") + "'";

export const reconciliationSql = Object.freeze({
  exists: "SELECT COUNT(*) AS total FROM sqlite_schema WHERE type='table' AND name='forge_d1_migration_reconciliations'",
  read: "SELECT * FROM forge_d1_migration_reconciliations ORDER BY sequence",
  create: `CREATE TABLE IF NOT EXISTS forge_d1_migration_reconciliations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
    prior_attempt TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('verified_applied','verified_not_applied')),
    artifact_sha256 TEXT NOT NULL CHECK(length(artifact_sha256)=64),
    evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
    consumed_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TRIGGER IF NOT EXISTS forge_d1_reconciliation_no_delete
  BEFORE DELETE ON forge_d1_migration_reconciliations
  BEGIN SELECT RAISE(ABORT,'reconciliation is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS forge_d1_reconciliation_attempt_guard
  BEFORE INSERT ON forge_d1_migration_reconciliations
  WHEN NOT (
    (NEW.prior_attempt='legacy' AND NEW.outcome='verified_applied'
      AND NOT EXISTS (SELECT 1 FROM forge_d1_migration_journal WHERE name=NEW.name)
      AND EXISTS (SELECT 1 FROM d1_migrations WHERE name=NEW.name))
    OR (
      EXISTS (SELECT 1 FROM forge_d1_migration_journal
        WHERE name=NEW.name AND content_sha256=NEW.content_sha256 AND state='reserved')
      AND NEW.prior_attempt=COALESCE((SELECT consumed_by FROM forge_d1_migration_reconciliations WHERE name=NEW.name ORDER BY sequence DESC LIMIT 1),'initial')
      AND (NEW.outcome='verified_applied' OR NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name=NEW.name))
    )
  )
  BEGIN SELECT RAISE(ABORT,'reconciliation prior attempt changed or evidence conflicts'); END;
  CREATE TRIGGER IF NOT EXISTS forge_d1_reconciliation_immutable
  BEFORE UPDATE ON forge_d1_migration_reconciliations
  WHEN OLD.consumed_by IS NOT NULL OR NEW.consumed_by IS NULL
    OR NEW.sequence IS NOT OLD.sequence OR NEW.decision_id IS NOT OLD.decision_id
    OR NEW.name IS NOT OLD.name OR NEW.content_sha256 IS NOT OLD.content_sha256
    OR NEW.prior_attempt IS NOT OLD.prior_attempt OR NEW.outcome IS NOT OLD.outcome
    OR NEW.artifact_sha256 IS NOT OLD.artifact_sha256 OR NEW.evidence_json IS NOT OLD.evidence_json
    OR NEW.created_at IS NOT OLD.created_at OR OLD.outcome!='verified_not_applied'
  BEGIN SELECT RAISE(ABORT,'reconciliation evidence is immutable'); END;`,
});
export function readReconciliations({ database, query }) {
  return Number(query(database, reconciliationSql.exists)?.[0]?.total ?? 0) > 0
    ? query(database, reconciliationSql.read) : [];
}
export function latestDecision(rows, name) { return rows.filter((row) => row.name === name).at(-1); }

export function migrationContentIdentity(name, content) {
  if (!/^[0-9A-Za-z._-]+\.sql$/.test(name)) throw new Error(`Unsafe migration filename: ${name}`);
  return { name, content, sha256: createHash("sha256").update(content).digest("hex") };
}

/** Preflight is read-only, including when both bookkeeping tables are absent. */
export function inspectMigrationJournal({ database, query, migrations, appliedNames }) {
  const present = Number(query(database, journalSql.exists)?.[0]?.total ?? 0) > 0;
  const receipts = present ? query(database, journalSql.read) : [];
  const decisions = receipts.some((row) => row.state !== "applied") ? readReconciliations({ database, query }) : [];
  const retryable = new Set();
  const byName = new Map(migrations.map((item) => [item.name, item]));
  for (const receipt of receipts) {
    const source = byName.get(receipt.name);
    if (!source) throw new Error(`Recorded migration source is missing: ${receipt.name}`);
    if (source.sha256 !== receipt.content_sha256) throw new Error(`Migration content identity mismatch: ${receipt.name}`);
    if (receipt.state !== "applied") {
      const decision = latestDecision(decisions, receipt.name);
      if (decision?.content_sha256 === source.sha256 && decision.outcome === "verified_not_applied" && !decision.consumed_by) {
        retryable.add(receipt.name);
        continue;
      }
      throw new Error(`Migration outcome is uncertain: ${receipt.name}; inspect database/backup evidence before operator reconciliation. Automatic replay is refused.`);
    }
  }
  const recorded = new Set(receipts.map((receipt) => receipt.name));
  for (const name of appliedNames) {
    if (!recorded.has(name)) throw new Error(`Legacy migration lacks exact-content evidence: ${name}; explicit operator reconciliation is required. No checksum is inferred from today's source.`);
  }
  return { present, pending: migrations.filter((item) => !recorded.has(item.name) || retryable.has(item.name)) };
}

/**
 * Reserve exact bytes before sending SQL. A crash, transport error or receipt-write
 * failure leaves a reservation and blocks automatic replay. This deliberately does
 * not claim SQL+receipt atomicity from Wrangler's remote file-import transport.
 */
export function applyJournaledMigration({ database, query, execute, migration }) {
  query(database, journalSql.create);
  const existing = query(database, journalSql.read).find((row) => row.name === migration.name);
  if (existing) {
    const decision = latestDecision(readReconciliations({ database, query }), migration.name);
    if (existing.state !== "reserved" || existing.content_sha256 !== migration.sha256
      || decision?.content_sha256 !== migration.sha256 || decision.outcome !== "verified_not_applied" || decision.consumed_by) {
      throw new Error(`Migration already reserved/applied: ${migration.name}; replay refused`);
    }
    const attempt = randomUUID();
    query(database, `UPDATE forge_d1_migration_reconciliations SET consumed_by=${literal(attempt)} WHERE decision_id=${literal(decision.decision_id)} AND consumed_by IS NULL`);
    const claimed = readReconciliations({ database, query }).find((row) => row.decision_id === decision.decision_id);
    if (claimed?.consumed_by !== attempt) throw new Error("Recovery decision was claimed by another attempt");
  } else {
    query(database, `INSERT INTO ${table}(name,content_sha256,state) VALUES (${literal(migration.name)},${literal(migration.sha256)},'reserved')`);
  }
  execute(migration);
  // Keep the existing Wrangler-compatible ledger; either write failing leaves
  // 'reserved', so successful SQL can never be blindly retried.
  query(database, `INSERT INTO d1_migrations(name) VALUES (${literal(migration.name)})`);
  query(database, `UPDATE ${table} SET state='applied',applied_at=CURRENT_TIMESTAMP WHERE name=${literal(migration.name)} AND content_sha256=${literal(migration.sha256)} AND state='reserved'`);
  const receipt = query(database, journalSql.read).find((row) => row.name === migration.name);
  if (receipt?.state !== "applied" || receipt.content_sha256 !== migration.sha256) {
    throw new Error(`Migration receipt could not be verified: ${migration.name}; automatic replay is refused.`);
  }
}
