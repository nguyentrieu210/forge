import type { Actor } from "../../contracts/src/index.js";
import { cronMatches } from "./cron.js";
import type { AppManifest, AppSchedulerEvents, AppSchedulerFrequency } from "./manifest.js";

const DEFAULT_ALL_INTERVAL_MINUTES = 4;

export type SchedulerFrequency = AppSchedulerFrequency | "cron";

export interface AppScheduledJob {
  appId: string;
  worker: string;
  method: string;
  frequency: SchedulerFrequency;
  cronFormat?: string;
  definitionModifiedAt: string;
}

export interface SchedulerInvocation {
  tenantId: string;
  appId: string;
  worker: string;
  method: string;
  frequency: SchedulerFrequency;
  cronFormat?: string;
  dueKey: string;
  actor: Actor;
}

export interface AppSchedulerResult {
  declared: number;
  due: number;
  started: number;
  completed: number;
  failed: number;
  skipped: number;
  pruned: number;
}

interface SchedulerStateRow {
  app_id: string;
  method: string;
  last_due_key: string;
}

interface LocalClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  date: string;
}

/**
 * Merge scheduler_events from every installed app and execute each due method once.
 *
 * The jobs Worker calls tenant maintenance every minute. last_due_key is the D1
 * idempotency boundary: overlapping maintenance calls race on one conditional UPSERT,
 * so at most one owns a due slot. The slot is claimed before the app Worker is called,
 * mirroring Frappe Scheduled Job Type updating last_execution at job start.
 */
export async function runAppScheduler(input: {
  db: D1Database;
  tenantId: string;
  now: string;
  timeZone: string;
  invoke: (job: SchedulerInvocation) => Promise<void>;
}): Promise<AppSchedulerResult> {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs)) throw new Error("Scheduler now must be an ISO timestamp");
  clockAt(input.now, input.timeZone);

  const installed = await input.db.prepare(
    "SELECT app_id,manifest_json,modified_at FROM installed_apps WHERE tenant_id=?1 ORDER BY app_id",
  ).bind(input.tenantId).all<{ app_id: string; manifest_json: string; modified_at: string }>();

  const jobs: AppScheduledJob[] = [];
  for (const row of installed.results ?? []) {
    let manifest: AppManifest;
    try {
      manifest = JSON.parse(row.manifest_json) as AppManifest;
    } catch {
      continue;
    }
    if (!manifest.worker) continue;
    jobs.push(...flattenSchedulerEvents(
      row.app_id,
      manifest.worker,
      manifest.scheduler_events ?? {},
      row.modified_at,
    ));
  }

  const active = new Set(jobs.map((job) => job.appId + "\u0000" + job.method));
  const existing = await input.db.prepare(
    "SELECT app_id,method,last_due_key FROM app_scheduler_runs WHERE tenant_id=?1",
  ).bind(input.tenantId).all<SchedulerStateRow>();
  const state = new Map((existing.results ?? []).map((row) => [
    row.app_id + "\u0000" + row.method,
    row,
  ]));

  let pruned = 0;
  const stale = (existing.results ?? []).filter((row) => !active.has(row.app_id + "\u0000" + row.method));
  if (stale.length) {
    const results = await input.db.batch(stale.map((row) => input.db.prepare(
      "DELETE FROM app_scheduler_runs WHERE tenant_id=?1 AND app_id=?2 AND method=?3",
    ).bind(input.tenantId, row.app_id, row.method)));
    pruned = results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0);
  }

  const result: AppSchedulerResult = {
    declared: jobs.length,
    due: 0,
    started: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    pruned,
  };
  const actor: Actor = { user_id: "Administrator", roles: ["Administrator", "System Manager"] };

  for (const job of jobs) {
    const dueKey = dueKeyFor(job, input.now, input.timeZone);
    if (!dueKey) {
      result.skipped += 1;
      continue;
    }
    result.due += 1;

    const key = job.appId + "\u0000" + job.method;
    const previous = state.get(key);
    // A newly-installed/changed definition does not retroactively execute the current
    // period. This matches Frappe using Scheduled Job Type creation as its cold-start
    // fallback for last_execution.
    if (!previous && definitionDueKey(job, input.timeZone) === dueKey) {
      result.skipped += 1;
      continue;
    }
    if (previous?.last_due_key === dueKey) {
      result.skipped += 1;
      continue;
    }

    const claim = await input.db.prepare(
      "INSERT INTO app_scheduler_runs(" +
      "tenant_id,app_id,method,frequency,cron_format,last_due_key," +
      "last_started_at,last_completed_at,last_status,last_error" +
      ") VALUES(?1,?2,?3,?4,?5,?6,?7,NULL,'running',NULL) " +
      "ON CONFLICT(tenant_id,app_id,method) DO UPDATE SET " +
      "frequency=excluded.frequency,cron_format=excluded.cron_format," +
      "last_due_key=excluded.last_due_key,last_started_at=excluded.last_started_at," +
      "last_completed_at=NULL,last_status='running',last_error=NULL " +
      "WHERE app_scheduler_runs.last_due_key<>excluded.last_due_key",
    ).bind(
      input.tenantId,
      job.appId,
      job.method,
      job.frequency,
      job.cronFormat ?? null,
      dueKey,
      input.now,
    ).run();
    if (Number(claim.meta?.changes ?? 0) !== 1) {
      result.skipped += 1;
      continue;
    }
    result.started += 1;

    try {
      await input.invoke({
        tenantId: input.tenantId,
        appId: job.appId,
        worker: job.worker,
        method: job.method,
        frequency: job.frequency,
        ...(job.cronFormat ? { cronFormat: job.cronFormat } : {}),
        dueKey,
        actor,
      });
      await input.db.prepare(
        "UPDATE app_scheduler_runs SET last_completed_at=?5,last_status='success',last_error=NULL " +
        "WHERE tenant_id=?1 AND app_id=?2 AND method=?3 AND last_due_key=?4",
      ).bind(input.tenantId, job.appId, job.method, dueKey, input.now).run();
      result.completed += 1;
    } catch (error) {
      const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await input.db.prepare(
        "UPDATE app_scheduler_runs SET last_completed_at=?5,last_status='failed',last_error=?6 " +
        "WHERE tenant_id=?1 AND app_id=?2 AND method=?3 AND last_due_key=?4",
      ).bind(input.tenantId, job.appId, job.method, dueKey, input.now, detail).run();
      result.failed += 1;
    }
  }

  return result;
}

export function flattenSchedulerEvents(
  appId: string,
  worker: string,
  events: AppSchedulerEvents,
  definitionModifiedAt: string,
): AppScheduledJob[] {
  const jobs: AppScheduledJob[] = [];
  const frequencies: AppSchedulerFrequency[] = [
    "all", "hourly", "hourly_long", "hourly_maintenance",
    "daily", "daily_long", "daily_maintenance",
    "weekly", "weekly_long", "monthly", "monthly_long", "yearly", "annual",
  ];
  for (const frequency of frequencies) {
    for (const method of events[frequency] ?? []) {
      jobs.push({ appId, worker, method, frequency, definitionModifiedAt });
    }
  }
  for (const [cronFormat, methods] of Object.entries(events.cron ?? {})) {
    for (const method of methods) {
      jobs.push({ appId, worker, method, frequency: "cron", cronFormat, definitionModifiedAt });
    }
  }
  return jobs;
}

function dueKeyFor(job: AppScheduledJob, now: string, timeZone: string): string | null {
  if (job.frequency === "cron") {
    const clock = clockAt(now, timeZone);
    if (!job.cronFormat || !cronMatches(job.cronFormat, clock)) return null;
    return "cron:" + job.cronFormat + ":" + clock.date + "T" + two(clock.hour) + ":" + two(clock.minute);
  }
  return fixedDueKey(job.frequency, now, timeZone);
}

function definitionDueKey(job: AppScheduledJob, timeZone: string): string | null {
  if (job.frequency === "cron") {
    const clock = clockAt(job.definitionModifiedAt, timeZone);
    if (!job.cronFormat || !cronMatches(job.cronFormat, clock)) return null;
    return "cron:" + job.cronFormat + ":" + clock.date + "T" + two(clock.hour) + ":" + two(clock.minute);
  }
  return fixedDueKey(job.frequency, job.definitionModifiedAt, timeZone);
}

function fixedDueKey(frequency: AppSchedulerFrequency, iso: string, timeZone: string): string {
  if (frequency === "all") {
    const bucket = Math.floor(Date.parse(iso) / (DEFAULT_ALL_INTERVAL_MINUTES * 60_000));
    return "all:" + bucket;
  }
  const clock = clockAt(iso, timeZone);
  if (frequency.startsWith("hourly")) return frequency + ":" + clock.date + "T" + two(clock.hour);
  if (frequency.startsWith("daily")) return frequency + ":" + clock.date;
  if (frequency.startsWith("weekly")) return frequency + ":" + weekStart(clock);
  if (frequency.startsWith("monthly")) return frequency + ":" + clock.year + "-" + two(clock.month);
  return frequency + ":" + clock.year;
}

function weekStart(clock: LocalClock): string {
  const utc = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - clock.weekday));
  return utc.getUTCFullYear() + "-" + two(utc.getUTCMonth() + 1) + "-" + two(utc.getUTCDate());
}

function clockAt(iso: string, timeZone: string): LocalClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const date = year + "-" + two(month) + "-" + two(day);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday,
    date,
  };
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}
