import { errors } from "../../core/src/index.js";
import type { MigrationPlan, MigrationPlannedRow } from "./index.js";
import { decideMigrationDuplicateAction, type MigrationRowOutcome } from "./execution.js";
import { D1MigrationJournal, type MigrationJournalRow } from "./d1-journal.js";

export interface PreparedMigrationCommand {
  target_name: string;
  command_id: string;
  payload_hash: string;
  execute(): Promise<void>;
}

/**
 * Integration port implemented next to the authoritative document API/kernel.
 * `prepareCreate` must resolve autoname before returning, so WS13 can persist the stable
 * target identity and command ID before the command is allowed to execute.
 */
export interface DurableMigrationApplyPort {
  lookup(plan: MigrationPlan, row: MigrationPlannedRow): Promise<{ exists: boolean; target_name?: string }>;
  prepareCreate(plan: MigrationPlan, row: MigrationPlannedRow): Promise<PreparedMigrationCommand>;
  prepareUpdate(plan: MigrationPlan, row: MigrationPlannedRow, targetName: string): Promise<PreparedMigrationCommand>;
}

export interface DurableMigrationSummary {
  run_id: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  processed: number;
  recovered_from_receipt: number;
  outcomes: MigrationRowOutcome[];
}

/**
 * Journal-first migration execution.
 *
 * Order for an authoritative write:
 * 1. resolve stable target identity;
 * 2. reserve source row -> target identity;
 * 3. persist command_id + payload_hash as `applying`;
 * 4. execute the prepared kernel command;
 * 5. persist final outcome.
 *
 * If step 4 throws, the journal queries `mutation_receipts` on first-primary. Receipt found
 * means the command committed and the row is recovered as success. No receipt means the
 * command did not commit, so only then is the row marked failed/retryable.
 */
export async function executeDurableMigrationPlan(input: {
  tenant_id: string;
  actor: string;
  now: () => string;
  plan: MigrationPlan;
  journal: D1MigrationJournal;
  port: DurableMigrationApplyPort;
  manifest_id?: string;
  stop_on_error?: boolean;
}): Promise<DurableMigrationSummary> {
  const run = await input.journal.ensureRun(input.tenant_id, input.plan, input.actor, input.now(), input.manifest_id);
  let runState = run.state;
  if (runState === "draft") {
    runState = (await input.journal.transitionRun(input.tenant_id, run.run_id, "validated", input.now())).state;
  }
  if (runState === "validated" || runState === "failed") {
    runState = (await input.journal.transitionRun(input.tenant_id, run.run_id, "applying", input.now())).state;
  }
  if (runState !== "applying") throw errors.lifecycle(`Migration run cannot execute from ${runState}`);

  const outcomes: MigrationRowOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let recoveredFromReceipt = 0;

  for (const row of input.plan.rows) {
    const existing = await input.journal.getRow(input.tenant_id, run.run_id, row.row_key);
    if (existing) {
      if (existing.row_fingerprint !== row.fingerprint) throw errors.idempotency();
      if (isFinal(existing)) {
        const outcome = rowOutcome(existing);
        outcomes.push(outcome);
        ({ imported, updated, skipped, failed } = increment(outcome, imported, updated, skipped, failed));
        continue;
      }
      if (existing.status === "applying") {
        const recovery = await input.journal.recoverApplyingRow(input.tenant_id, run.run_id, row.row_key, input.now());
        if (recovery.recovered) {
          recoveredFromReceipt += 1;
          const outcome = rowOutcome(recovery.row);
          outcomes.push(outcome);
          ({ imported, updated, skipped, failed } = increment(outcome, imported, updated, skipped, failed));
          continue;
        }
        // A first-primary receipt check found no commit. Converting to failed now is safe;
        // the next prepared command must reuse the same reserved identity/command contract.
        await input.journal.recordOutcome(input.tenant_id, run.run_id, {
          row_key: row.row_key,
          fingerprint: row.fingerprint,
          status: "failed",
          target_name: existing.target_name ?? undefined,
          error: existing.error ?? "Previous applying attempt has no kernel receipt",
        }, input.now());
      }
    }

    let lookup: { exists: boolean; target_name?: string };
    try {
      lookup = await input.port.lookup(input.plan, row);
      if (lookup.exists && !lookup.target_name?.trim()) throw errors.validation(`Existing target requires target_name for row ${row.row_key}`);
    } catch (error) {
      const failedRow = await input.journal.recordPreflightFailure(
        input.tenant_id, run.run_id, row, message(error), input.now(),
      );
      const outcome = rowOutcome(failedRow);
      outcomes.push(outcome);
      failed += 1;
      if (input.stop_on_error) break;
      continue;
    }

    const action = decideMigrationDuplicateAction(input.plan.duplicate_policy, lookup.exists);
    if (action === "error") {
      const reserved = await input.journal.reserveRow(input.tenant_id, run.run_id, row, "error", lookup.target_name ?? null, input.now());
      const final = await input.journal.recordOutcome(input.tenant_id, run.run_id, {
        row_key: row.row_key,
        fingerprint: row.fingerprint,
        status: "failed",
        target_name: reserved.target_name ?? undefined,
        error: `Target already exists for migration row ${row.row_key}`,
      }, input.now());
      const outcome = rowOutcome(final);
      outcomes.push(outcome);
      failed += 1;
      if (input.stop_on_error) break;
      continue;
    }
    if (action === "skip") {
      await input.journal.reserveRow(input.tenant_id, run.run_id, row, "skip", lookup.target_name ?? null, input.now());
      const final = await input.journal.recordOutcome(input.tenant_id, run.run_id, {
        row_key: row.row_key,
        fingerprint: row.fingerprint,
        status: "skipped",
        target_name: lookup.target_name,
      }, input.now());
      const outcome = rowOutcome(final);
      outcomes.push(outcome);
      skipped += 1;
      continue;
    }

    let prepared: PreparedMigrationCommand;
    try {
      prepared = action === "update"
        ? await input.port.prepareUpdate(input.plan, row, lookup.target_name!)
        : await input.port.prepareCreate(input.plan, row);
      validatePrepared(prepared, action === "update" ? lookup.target_name : undefined);
      await input.journal.reserveRow(input.tenant_id, run.run_id, row, action, prepared.target_name, input.now());
      await input.journal.markApplying(
        input.tenant_id, run.run_id, row.row_key, prepared.command_id, prepared.payload_hash, input.now(),
      );
    } catch (error) {
      const failedRow = await input.journal.recordPreflightFailure(
        input.tenant_id, run.run_id, row, message(error), input.now(),
      );
      const outcome = rowOutcome(failedRow);
      outcomes.push(outcome);
      failed += 1;
      if (input.stop_on_error) break;
      continue;
    }

    try {
      await prepared.execute();
    } catch (error) {
      const recovery = await input.journal.recoverApplyingRow(input.tenant_id, run.run_id, row.row_key, input.now());
      if (recovery.recovered) {
        recoveredFromReceipt += 1;
        const outcome = rowOutcome(recovery.row);
        outcomes.push(outcome);
        ({ imported, updated, skipped, failed } = increment(outcome, imported, updated, skipped, failed));
        continue;
      }
      const failedRow = await input.journal.recordOutcome(input.tenant_id, run.run_id, {
        row_key: row.row_key,
        fingerprint: row.fingerprint,
        status: "failed",
        target_name: prepared.target_name,
        error: message(error),
      }, input.now());
      const outcome = rowOutcome(failedRow);
      outcomes.push(outcome);
      failed += 1;
      if (input.stop_on_error) break;
      continue;
    }

    // The write returned success. If this final journal update fails, throw instead of
    // moving to another row: the persisted `applying` command can be recovered by receipt.
    const final = await input.journal.recordOutcome(input.tenant_id, run.run_id, {
      row_key: row.row_key,
      fingerprint: row.fingerprint,
      status: action === "update" ? "updated" : "imported",
      target_name: prepared.target_name,
    }, input.now());
    const outcome = rowOutcome(final);
    outcomes.push(outcome);
    if (outcome.status === "updated") updated += 1; else imported += 1;
  }

  if (failed > 0) await input.journal.transitionRun(input.tenant_id, run.run_id, "failed", input.now());
  else await input.journal.transitionRun(input.tenant_id, run.run_id, "applied", input.now());

  return {
    run_id: run.run_id,
    imported,
    updated,
    skipped,
    failed,
    processed: outcomes.length,
    recovered_from_receipt: recoveredFromReceipt,
    outcomes,
  };
}

function validatePrepared(prepared: PreparedMigrationCommand, expectedTarget?: string): void {
  if (!prepared.target_name?.trim()) throw errors.validation("Prepared migration command requires target_name");
  if (expectedTarget && prepared.target_name !== expectedTarget) throw errors.idempotency();
  if (!prepared.command_id?.trim()) throw errors.validation("Prepared migration command requires command_id");
  if (!/^[a-f0-9]{64}$/.test(prepared.payload_hash)) throw errors.validation("Prepared migration command requires SHA-256 payload_hash");
}

function rowOutcome(row: MigrationJournalRow): MigrationRowOutcome {
  if (row.status === "reserved" || row.status === "applying") throw errors.lifecycle(`Migration row ${row.row_key} is not final`);
  return {
    row_key: row.row_key,
    fingerprint: row.row_fingerprint,
    status: row.status,
    ...(row.target_name ? { target_name: row.target_name } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

function isFinal(row: MigrationJournalRow): boolean {
  return row.status === "imported" || row.status === "updated" || row.status === "skipped";
}

function increment(
  outcome: MigrationRowOutcome,
  imported: number,
  updated: number,
  skipped: number,
  failed: number,
): { imported: number; updated: number; skipped: number; failed: number } {
  if (outcome.status === "imported") imported += 1;
  else if (outcome.status === "updated") updated += 1;
  else if (outcome.status === "skipped") skipped += 1;
  else failed += 1;
  return { imported, updated, skipped, failed };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Migration row failed";
}
