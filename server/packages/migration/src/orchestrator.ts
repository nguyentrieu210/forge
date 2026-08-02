import { errors } from "../../core/src/index.js";
import type { MigrationPlan, MigrationPlannedRow } from "./index.js";
import { decideMigrationDuplicateAction, type MigrationRowOutcome } from "./execution.js";

export interface MigrationTargetLookup {
  exists: boolean;
  target_name?: string;
}

export interface MigrationApplyPort {
  /** Must enforce tenant permission and authoritative lookup rules. */
  lookup(plan: MigrationPlan, row: MigrationPlannedRow): Promise<MigrationTargetLookup>;
  /** Must write through the document kernel/domain authoritative path. */
  create(plan: MigrationPlan, row: MigrationPlannedRow): Promise<{ target_name: string }>;
  /** Must use OCC/domain validation; never patch storage directly. */
  update(plan: MigrationPlan, row: MigrationPlannedRow, targetName: string): Promise<{ target_name: string }>;
}

export interface MigrationOutcomeSink {
  /** Persist one confirmed row outcome before orchestration advances to the next row. */
  record(plan: MigrationPlan, outcome: MigrationRowOutcome): Promise<void>;
}

export interface MigrationApplySummary {
  plan_id: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  processed: number;
  stopped_early: boolean;
  outcomes: MigrationRowOutcome[];
}

/**
 * Executes a plan sequentially with partial-success semantics.
 *
 * Sequential execution is deliberate for the generic engine: transaction migrations may
 * have ordering effects and D1/DO writes are not a throughput benchmark. Adapter-specific
 * batching can be added only when a domain proves independence.
 *
 * The sink is mandatory. If an authoritative write succeeds but recording its outcome
 * fails, this function throws immediately; the row is then explicitly unresolved and must
 * be reconciled from authoritative receipts before any retry.
 */
export async function executeMigrationPlan(
  plan: MigrationPlan,
  port: MigrationApplyPort,
  sink: MigrationOutcomeSink,
  options: { stop_on_error?: boolean } = {},
): Promise<MigrationApplySummary> {
  const outcomes: MigrationRowOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let stoppedEarly = false;

  for (const row of plan.rows) {
    let outcome: MigrationRowOutcome;
    try {
      const lookup = await port.lookup(plan, row);
      if (lookup.exists && !lookup.target_name?.trim()) {
        throw errors.validation(`Existing migration target requires target_name for row ${row.row_key}`);
      }
      const action = decideMigrationDuplicateAction(plan.duplicate_policy, lookup.exists);
      if (action === "error") {
        outcome = failure(row, `Target already exists for migration row ${row.row_key}`);
      } else if (action === "skip") {
        outcome = {
          row_key: row.row_key,
          fingerprint: row.fingerprint,
          status: "skipped",
          ...(lookup.target_name?.trim() ? { target_name: lookup.target_name.trim() } : {}),
        };
      } else if (action === "update") {
        const result = await port.update(plan, row, lookup.target_name!);
        outcome = success(row, "updated", result.target_name);
      } else {
        const result = await port.create(plan, row);
        outcome = success(row, "imported", result.target_name);
      }
    } catch (error) {
      outcome = failure(row, error instanceof Error ? error.message : "Migration row failed");
    }

    try {
      await sink.record(plan, outcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : "outcome sink failed";
      throw errors.database(`Migration outcome persistence failed for row ${row.row_key}; reconcile before retry: ${message}`);
    }

    outcomes.push(outcome);
    if (outcome.status === "imported") imported += 1;
    else if (outcome.status === "updated") updated += 1;
    else if (outcome.status === "skipped") skipped += 1;
    else failed += 1;

    if (outcome.status === "failed" && options.stop_on_error === true) {
      stoppedEarly = true;
      break;
    }
  }

  return {
    plan_id: plan.plan_id,
    imported,
    updated,
    skipped,
    failed,
    processed: outcomes.length,
    stopped_early: stoppedEarly,
    outcomes,
  };
}

function success(
  row: MigrationPlannedRow,
  status: "imported" | "updated",
  targetName: string,
): MigrationRowOutcome {
  if (!targetName?.trim()) throw errors.validation(`Migration ${status} did not return target_name for row ${row.row_key}`);
  return { row_key: row.row_key, fingerprint: row.fingerprint, status, target_name: targetName.trim() };
}

function failure(row: MigrationPlannedRow, message: string): MigrationRowOutcome {
  return {
    row_key: row.row_key,
    fingerprint: row.fingerprint,
    status: "failed",
    error: message.slice(0, 2000),
  };
}
