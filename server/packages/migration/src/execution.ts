import { errors } from "../../core/src/index.js";
import type { MigrationDuplicatePolicy, MigrationPlan, MigrationPlannedRow } from "./index.js";

export type MigrationApplyOutcomeStatus = "imported" | "updated" | "skipped" | "failed";

export interface MigrationRowOutcome {
  row_key: string;
  fingerprint: string;
  status: MigrationApplyOutcomeStatus;
  target_name?: string;
  error?: string;
}

export interface MigrationRetryPlan {
  plan_id: string;
  retryable_rows: MigrationPlannedRow[];
  unresolved_rows: MigrationPlannedRow[];
  completed_rows: number;
}

/**
 * Builds a safe retry set from persisted/confirmed row outcomes.
 *
 * Only rows explicitly recorded as `failed` are automatically retryable. A row with no
 * outcome is *unresolved*, not failed: the previous process may have committed it and lost
 * the response. Replaying unresolved rows blindly is exactly how autonamed documents become
 * duplicates, so callers must resolve them from authoritative receipts first.
 */
export function buildMigrationRetryPlan(
  plan: MigrationPlan,
  outcomes: readonly MigrationRowOutcome[],
): MigrationRetryPlan {
  const planned = new Map(plan.rows.map((row) => [row.row_key, row]));
  const seen = new Set<string>();
  const byKey = new Map<string, MigrationRowOutcome>();
  for (const outcome of outcomes) {
    if (seen.has(outcome.row_key)) throw errors.validation(`Duplicate migration outcome: ${outcome.row_key}`);
    seen.add(outcome.row_key);
    const row = planned.get(outcome.row_key);
    if (!row) throw errors.validation(`Migration outcome references unknown row: ${outcome.row_key}`);
    if (outcome.fingerprint !== row.fingerprint) {
      throw errors.validation(`Migration outcome fingerprint changed for row: ${outcome.row_key}`);
    }
    if ((outcome.status === "imported" || outcome.status === "updated") && !outcome.target_name?.trim()) {
      throw errors.validation(`Successful migration outcome requires target_name: ${outcome.row_key}`);
    }
    byKey.set(outcome.row_key, outcome);
  }

  const retryableRows: MigrationPlannedRow[] = [];
  const unresolvedRows: MigrationPlannedRow[] = [];
  let completedRows = 0;
  for (const row of plan.rows) {
    const outcome = byKey.get(row.row_key);
    if (!outcome) { unresolvedRows.push(row); continue; }
    if (outcome.status === "failed") retryableRows.push(row);
    else completedRows += 1;
  }
  return {
    plan_id: plan.plan_id,
    retryable_rows: retryableRows,
    unresolved_rows: unresolvedRows,
    completed_rows: completedRows,
  };
}

export type MigrationDuplicateAction = "create" | "update" | "skip" | "error";

/** Pure policy decision. The authoritative executor still owns permission/OCC/lifecycle. */
export function decideMigrationDuplicateAction(
  policy: MigrationDuplicatePolicy,
  targetExists: boolean,
): MigrationDuplicateAction {
  if (!targetExists) return "create";
  if (policy === "skip") return "skip";
  if (policy === "update") return "update";
  return "error";
}

export interface MigrationCheckpoint {
  source_id: string;
  adapter: string;
  sequence: number;
  cursor: string;
  batch_fingerprint: string;
  high_watermark?: string;
}

/**
 * Advances an incremental-import checkpoint without permitting gaps or source switching.
 * Persistence is intentionally outside this primitive; WS00/WS12 own the shared durable
 * receipt/safety boundary. This contract makes the rule testable before that storage lands.
 */
export function advanceMigrationCheckpoint(
  current: MigrationCheckpoint | null,
  next: MigrationCheckpoint,
): MigrationCheckpoint {
  const sourceId = requireText(next.source_id, "source_id", 240);
  const adapter = requireText(next.adapter, "adapter", 120);
  const cursor = requireText(next.cursor, "cursor", 1000);
  const fingerprint = requireFingerprint(next.batch_fingerprint);
  if (!Number.isSafeInteger(next.sequence) || next.sequence < 1) {
    throw errors.validation("Migration checkpoint sequence must be a positive integer");
  }
  if (current) {
    if (current.source_id !== sourceId || current.adapter !== adapter) {
      throw errors.validation("Migration checkpoint cannot switch source or adapter");
    }
    if (next.sequence !== current.sequence + 1) {
      throw errors.validation(`Migration checkpoint sequence must advance from ${current.sequence} to ${current.sequence + 1}`);
    }
    if (next.cursor === current.cursor && next.batch_fingerprint === current.batch_fingerprint) {
      throw errors.validation("Migration checkpoint must advance to a new batch");
    }
  } else if (next.sequence !== 1) {
    throw errors.validation("First migration checkpoint must use sequence 1");
  }
  return {
    source_id: sourceId,
    adapter,
    sequence: next.sequence,
    cursor,
    batch_fingerprint: fingerprint,
    ...(next.high_watermark?.trim() ? { high_watermark: next.high_watermark.trim() } : {}),
  };
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${label} is required`);
  const text = value.trim();
  if (text.length > max) throw errors.validation(`${label} must be at most ${max} characters`);
  return text;
}

function requireFingerprint(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw errors.validation("batch_fingerprint must be a lowercase SHA-256 hex value");
  }
  return value;
}
