import { createHash } from "node:crypto";
import { journalSql, reconciliationSql, readReconciliations, latestDecision } from "./d1-migration-journal.mjs";
const literal = (value) => "'" + String(value).replace(/'/g, "''") + "'";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const text = (value, label) => { if (typeof value !== "string" || !value.trim()) throw new Error(label + " is required"); };

/** An operator approval is supplied, never inferred from local files or schema presence. */
export function planReconciliation({ artifactBytes, database, sourceSha, migrations, appliedNames, receipts, decisions }) {
  const artifact = JSON.parse(artifactBytes.toString());
  if (artifact.schema_version !== 1) throw new Error("Unsupported reconciliation artifact");
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || artifact.source_sha !== sourceSha) throw new Error("Approval source SHA differs from the exact checked-out source");
  if (!database.id || artifact.database_id !== database.id || artifact.database_name !== database.name) throw new Error("Approval database identity mismatch");
  for (const key of ["approved_by", "approved_at", "approval_ref", "reason"]) text(artifact[key], key);
  if (!Number.isFinite(Date.parse(artifact.approved_at))) throw new Error("Invalid approval timestamp");
  if (!Array.isArray(artifact.entries) || !artifact.entries.length) throw new Error("Approval entries are required");
  const identities = new Set();
  const names = new Set();
  const artifactHash = sha(artifactBytes);
  return artifact.entries.map((entry) => {
    text(entry.decision_id, "decision_id");
    if (identities.has(entry.decision_id) || names.has(entry.name)) throw new Error("Duplicate approval identity/name");
    identities.add(entry.decision_id); names.add(entry.name);
    const source = migrations.find((item) => item.name === entry.name);
    if (!source || entry.content_sha256 !== source.sha256) throw new Error("Approval content identity mismatch: " + entry.name);
    if (!["verified_applied", "verified_not_applied"].includes(entry.outcome)) throw new Error("An explicit verified outcome is required");
    if (!Array.isArray(entry.evidence) || !entry.evidence.length) throw new Error("Per-migration receipt evidence is required");
    for (const evidence of entry.evidence) {
      if (!["provider_receipt", "backup_diff", "schema_and_data_verification"].includes(evidence.kind)) throw new Error("Unsupported evidence kind");
      text(evidence.reference, "evidence reference");
      if (!/^[a-f0-9]{64}$/.test(evidence.sha256)) throw new Error("Evidence digest is required");
    }
    const receipt = receipts.find((row) => row.name === entry.name);
    if (receipt && receipt.content_sha256 !== entry.content_sha256) throw new Error("Recorded content identity mismatch");
    const existingDecision = decisions.find((row) => row.decision_id === entry.decision_id);
    if (existingDecision) {
      if (existingDecision.artifact_sha256 !== artifactHash || existingDecision.name !== entry.name) throw new Error("Decision identity already bound to different approval");
      return { entry, artifact, artifactHash, alreadyRecorded: true };
    }
    if (receipt?.state === "applied") throw new Error("Migration is already verified applied");
    const previous = latestDecision(decisions, entry.name);
    const expectedAttempt = receipt ? (previous?.consumed_by || "initial") : "legacy";
    if (entry.prior_attempt !== expectedAttempt) throw new Error("Approval prior-attempt identity mismatch");
    if (!receipt && !appliedNames.includes(entry.name)) throw new Error("Legacy adoption requires existing provider bookkeeping");
    if (entry.outcome === "verified_not_applied") {
      if (!receipt || appliedNames.includes(entry.name)) throw new Error("Not-applied evidence conflicts with durable applied bookkeeping");
      if (entry.no_partial_effects !== true) throw new Error("Verified absence of all partial SQL effects is required before retry");
    }
    return { entry, artifact, artifactHash, alreadyRecorded: false };
  });
}

export function executeReconciliation({ database, query, plan }) {
  query(database, journalSql.create);
  query(database, reconciliationSql.create);
  for (const item of plan) {
    const { entry, artifactHash, artifact } = item;
    if (!item.alreadyRecorded) {
      query(database, `INSERT INTO forge_d1_migration_reconciliations(decision_id,name,content_sha256,prior_attempt,outcome,artifact_sha256,evidence_json)
        VALUES (${literal(entry.decision_id)},${literal(entry.name)},${literal(entry.content_sha256)},${literal(entry.prior_attempt)},${literal(entry.outcome)},${literal(artifactHash)},${literal(JSON.stringify({ source_sha: artifact.source_sha, database_id: artifact.database_id, approved_by: artifact.approved_by, approved_at: artifact.approved_at, approval_ref: artifact.approval_ref, reason: artifact.reason, evidence: entry.evidence, no_partial_effects: entry.no_partial_effects }))})`);
    }
    if (entry.outcome === "verified_applied") {
      const receipt = query(database, journalSql.read).find((row) => row.name === entry.name);
      if (!receipt) {
        query(database, `INSERT INTO forge_d1_migration_journal(name,content_sha256,state,applied_at) VALUES (${literal(entry.name)},${literal(entry.content_sha256)},'applied',CURRENT_TIMESTAMP)`);
      } else if (receipt.state === "reserved") {
        query(database, `UPDATE forge_d1_migration_journal SET state='applied',applied_at=CURRENT_TIMESTAMP WHERE name=${literal(entry.name)} AND content_sha256=${literal(entry.content_sha256)} AND state='reserved'`);
      }
      query(database, `INSERT OR IGNORE INTO d1_migrations(name) VALUES (${literal(entry.name)})`);
    }
    const recorded = readReconciliations({ database, query }).find((row) => row.decision_id === entry.decision_id);
    if (recorded?.artifact_sha256 !== artifactHash) throw new Error("Reconciliation receipt could not be verified");
  }
}
