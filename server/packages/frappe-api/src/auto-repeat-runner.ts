/**
 * Creating the documents an Auto Repeat schedule owes.
 *
 * The date arithmetic and the due-list rules are pure (`auto-repeat` in frappe-model).
 * This is the part that reads the schedules, copies the source document, and — only
 * after a successful create — advances the date.
 *
 * WHY THE ORDER MATTERS, again: advancing first would turn any failure into a silently
 * skipped period. Nobody notices a document that was never created; they notice a
 * quarter later when the totals are short. So the sequence is create → record the new
 * name → advance, and a crash anywhere in it leaves the same period due next sweep.
 *
 * WHY IT RUNS IN MAINTENANCE: it needs a scheduler, and the tenant Worker's own cron
 * never fires inside a dispatch namespace. The jobs Worker drives it, the same way it
 * drives the outbox drain.
 */

import type { Actor, CanonicalDocument, JsonObject, MutationCommand, MutationReceipt } from "../../contracts/src/index.js";
import { dueSchedules, isCompleted, nextScheduleDate, type AutoRepeatRule } from "../../frappe-model/src/index.js";

export interface AutoRepeatRunResult {
  due: number;
  created: number;
  failed: number;
  completed: number;
}

export interface AutoRepeatContext {
  db: D1Database;
  tenantId: string;
  today: string;
  now: string;
  /** Loads the document a schedule copies from. */
  loadSource(doctype: string, name: string): Promise<CanonicalDocument<JsonObject> | null>;
  /** Runs a create through the ordinary command path, so permissions and validators apply. */
  runCommand(command: MutationCommand): Promise<MutationReceipt>;
  /** Builds the create command for a copied document. */
  buildCreate(doctype: string, document: JsonObject, actor: Actor): Promise<MutationCommand>;
  /**
   * The identity a scheduled creation runs as — the schedule's OWNER, with their real
   * roles loaded from the directory.
   *
   * Not a system superuser: a repeat must not be able to create what the person who set
   * it up could not, and a role revoked from that person must stop their schedules too.
   */
  actorFor(ownerId: string): Promise<Actor>;
}

/**
 * Fields that must never be copied into the next period's document.
 *
 * The framework owns them, and carrying one over would make the copy claim to be the
 * original — same name, same version, same amendment lineage.
 */
const NEVER_COPIED = new Set([
  "name", "owner", "creation", "modified", "modified_by", "docstatus", "idx",
  "doctype", "version", "amended_from", "workflow_state",
]);

export async function runAutoRepeat(context: AutoRepeatContext, limit = 20): Promise<AutoRepeatRunResult> {
  const rows = await context.db.prepare(
    `SELECT name, reference_doctype, reference_name, frequency, start_date, end_date,
            next_schedule_date, status, owner
     FROM auto_repeat
     WHERE tenant_id=?1 AND status='Active' AND next_schedule_date<=?2
     ORDER BY next_schedule_date
     LIMIT ?3`,
  ).bind(context.tenantId, context.today, limit).all<AutoRepeatRule & { owner: string }>();

  const candidates = rows.results ?? [];
  // Re-filtered through the pure rule so the SQL and the decision cannot drift: the
  // query is an index hint, `dueSchedules` is the definition.
  const due = dueSchedules(candidates, context.today);

  const result: AutoRepeatRunResult = { due: due.length, created: 0, failed: 0, completed: 0 };

  for (const schedule of due) {
    const owner = candidates.find((row) => row.name === schedule.name)?.owner ?? "";
    try {
      const source = await context.loadSource(schedule.reference_doctype, schedule.reference_name);
      if (!source) {
        // The source is gone. Stopping is right — recreating from nothing would invent a
        // document — and it must be recorded, because a schedule that silently stops is
        // indistinguishable from one that never ran.
        await stop(context, schedule.name, "Source document no longer exists");
        result.failed += 1;
        continue;
      }

      const copy: JsonObject = {};
      for (const [key, value] of Object.entries(source.data)) {
        if (NEVER_COPIED.has(key) || key.startsWith("_")) continue;
        copy[key] = structuredClone(value);
      }

      const command = await context.buildCreate(schedule.reference_doctype, copy, await context.actorFor(owner));
      const receipt = await context.runCommand(command);
      const createdName = String((receipt as unknown as JsonObject).name ?? command.aggregate.name);

      const next = nextScheduleDate(schedule.next_schedule_date, schedule.frequency);
      const finished = isCompleted(schedule, next);
      // Written in ONE statement after the create succeeded: the new name and the new
      // date move together, so a crash between them is impossible.
      await context.db.prepare(
        `UPDATE auto_repeat
         SET next_schedule_date=?3, last_created_name=?4, last_error=NULL, status=?5, modified_at=?6
         WHERE tenant_id=?1 AND name=?2`,
      ).bind(context.tenantId, schedule.name, next, createdName, finished ? "Completed" : "Active", context.now).run();

      result.created += 1;
      if (finished) result.completed += 1;
    } catch (error) {
      // The date is NOT advanced, so the same period is retried next sweep. The error is
      // recorded so a repeatedly failing schedule is visible rather than merely quiet.
      const message = error instanceof Error ? error.message : String(error);
      await context.db.prepare(
        `UPDATE auto_repeat SET last_error=?3, modified_at=?4 WHERE tenant_id=?1 AND name=?2`,
      ).bind(context.tenantId, schedule.name, message.slice(0, 500), context.now).run();
      result.failed += 1;
    }
  }

  return result;
}

async function stop(context: AutoRepeatContext, name: string, reason: string): Promise<void> {
  await context.db.prepare(
    `UPDATE auto_repeat SET status='Stopped', last_error=?3, modified_at=?4 WHERE tenant_id=?1 AND name=?2`,
  ).bind(context.tenantId, name, reason, context.now).run();
}
