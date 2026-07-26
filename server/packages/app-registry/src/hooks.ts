/**
 * Delivering domain events to app Workers.
 *
 * An app cannot ship code into the kernel, so its logic lives in its own Worker in
 * the dispatch namespace. This is the seam that replaces Frappe's `hooks.py`.
 *
 * Three properties are non-negotiable, and each exists because of a specific
 * failure:
 *
 * - **After commit, never before.** A synchronous pre-commit hook would put a
 *   third-party Worker inside the aggregate's write path: one slow app stalls
 *   every write to that aggregate, and a timeout mid-transaction leaves the
 *   platform unable to say whether the write happened. Validation that must block
 *   a write is declared as metadata, not as a hook.
 * - **Isolated.** One app's failure must not affect another's delivery, or the
 *   platform's own event processing.
 * - **At-least-once with per-app idempotency.** The queue already redelivers, so
 *   each (app, event) pair is recorded once and a redelivery is a no-op rather
 *   than a second run of the app's side effects.
 */

import type { DomainEvent } from "../../contracts/src/index.js";
import { deriveAppCallKey } from "../../auth/src/index.js";
import { hookMatches, type AppManifest } from "./manifest.js";

/**
 * Attempts before a delivery is abandoned.
 *
 * Chosen together with the backoff below to span a realistic outage. With 12
 * attempts the schedule covers roughly seven hours, so an app Worker that is down
 * for a morning still receives everything that happened while it was gone. A
 * shorter window looks fine in tests and loses a day's events in production.
 */
export const MAX_HOOK_ATTEMPTS = 12;
/** Per-attempt wall-clock budget for an app Worker. */
export const HOOK_TIMEOUT_MS = 10_000;
/** Longest gap between attempts. */
export const MAX_HOOK_BACKOFF_SECONDS = 3600;
/** First retry gap. Long enough that a redeploy finishes before the next attempt. */
const BASE_HOOK_BACKOFF_SECONDS = 30;

export interface HookTarget {
  appId: string;
  worker: string;
}

export interface HookDeliveryOutcome {
  appId: string;
  status: "delivered" | "failed" | "abandoned" | "skipped";
  attempts: number;
  error?: string;
}

/** Resolves which installed apps want an event. */
export function subscribersFor(manifests: Array<{ app_id: string; manifest: AppManifest }>, eventType: string): HookTarget[] {
  const targets: HookTarget[] = [];
  for (const entry of manifests) {
    const worker = entry.manifest.worker;
    if (!worker) continue;
    if (!entry.manifest.hooks.some((hook) => hookMatches(hook.event, eventType))) continue;
    targets.push({ appId: entry.app_id, worker });
  }
  return targets;
}

/**
 * Exponential backoff: 30s, 1m, 2m, 4m … capped at one hour.
 *
 * The exponent is bounded before the power is taken so the value cannot overflow
 * on a large attempt count, and the cap is then genuinely reachable — an earlier
 * version bounded the exponent so low that its own cap was unreachable dead code,
 * which hid how short the real retry window was.
 */
export function nextAttemptDelaySeconds(attempts: number): number {
  const exponent = Math.min(Math.max(attempts, 1) - 1, 20);
  return Math.min(MAX_HOOK_BACKOFF_SECONDS, BASE_HOOK_BACKOFF_SECONDS * 2 ** exponent);
}

export interface HookDispatcherEnv {
  DISPATCHER?: DispatchNamespace;
  /**
   * Master the per-app call credential is derived from — NOT a secret an app ever
   * receives. `INTERNAL_SERVICE_TOKEN` deliberately does not appear here: it used to
   * be handed to app Workers as their `authorization`, which gave third-party code the
   * platform's own internal credential. See `deriveAppCallKey`.
   */
  INTERNAL_AUTH_SECRET?: string;
}

export class AppHookDispatcher {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database, private readonly env: HookDispatcherEnv) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  /**
   * Records intent to deliver, then delivers.
   *
   * The row is written FIRST so a crash between recording and delivering leaves
   * work the sweep will finish, rather than an event silently dropped. The
   * opposite order would lose deliveries on any failure after the call.
   */
  async fanOut(tenantId: string, event: DomainEvent, targets: HookTarget[], now: string): Promise<HookDeliveryOutcome[]> {
    if (!targets.length) return [];
    await this.db.batch(targets.map((target) => this.db.prepare(
      `INSERT INTO app_hook_deliveries(tenant_id,app_id,event_id,event_type,status,attempts,next_attempt_at,created_at,modified_at)
       VALUES(?1,?2,?3,?4,'pending',0,?5,?5,?5)
       ON CONFLICT(tenant_id,app_id,event_id) DO NOTHING`,
    ).bind(tenantId, target.appId, event.event_id, event.event_type, now)));

    const outcomes: HookDeliveryOutcome[] = [];
    for (const target of targets) {
      // Sequential and individually guarded: one app's failure must not abort the
      // loop and starve the apps after it.
      outcomes.push(await this.deliverOne(tenantId, event, target, now));
    }
    return outcomes;
  }

  /**
   * Retries deliveries that are due.
   *
   * Bounded per sweep so a large backlog cannot exhaust the Worker's CPU budget
   * and fail the whole run — the remainder is simply picked up next time.
   */
  async sweep(tenantId: string, now: string, limit = 20): Promise<HookDeliveryOutcome[]> {
    const due = await this.db.prepare(
      `SELECT d.app_id AS app_id, d.event_id AS event_id, d.event_type AS event_type, d.attempts AS attempts,
              a.manifest_json AS manifest_json
       FROM app_hook_deliveries d
       JOIN installed_apps a ON a.tenant_id=d.tenant_id AND a.app_id=d.app_id
       WHERE d.tenant_id=?1 AND d.next_attempt_at IS NOT NULL AND d.next_attempt_at<=?2
       ORDER BY d.next_attempt_at
       LIMIT ?3`,
    ).bind(tenantId, now, limit).all<{ app_id: string; event_id: string; event_type: string; attempts: number; manifest_json: string }>();

    const outcomes: HookDeliveryOutcome[] = [];
    for (const row of due.results ?? []) {
      const manifest = JSON.parse(row.manifest_json) as AppManifest;
      if (!manifest.worker) {
        // The app dropped its worker in an upgrade; there is nowhere to deliver, so
        // the row is closed rather than retried forever.
        await this.abandon(tenantId, row.app_id, row.event_id, "App no longer declares a worker", row.attempts, now);
        outcomes.push({ appId: row.app_id, status: "abandoned", attempts: row.attempts });
        continue;
      }
      const event = await this.loadEvent(tenantId, row.event_id);
      if (!event) {
        await this.abandon(tenantId, row.app_id, row.event_id, "Source event is no longer available", row.attempts, now);
        outcomes.push({ appId: row.app_id, status: "abandoned", attempts: row.attempts });
        continue;
      }
      outcomes.push(await this.deliverOne(tenantId, event, { appId: row.app_id, worker: manifest.worker }, now));
    }
    return outcomes;
  }

  private async deliverOne(tenantId: string, event: DomainEvent, target: HookTarget, now: string): Promise<HookDeliveryOutcome> {
    const current = await this.db.prepare(
      `SELECT status, attempts FROM app_hook_deliveries WHERE tenant_id=?1 AND app_id=?2 AND event_id=?3`,
    ).bind(tenantId, target.appId, event.event_id).first<{ status: string; attempts: number }>();
    // Already finished: a redelivery from the queue must not run the app's side
    // effects a second time.
    if (!current || current.status === "delivered" || current.status === "abandoned") {
      return { appId: target.appId, status: "skipped", attempts: current?.attempts ?? 0 };
    }

    const attempts = current.attempts + 1;
    try {
      if (!this.env.DISPATCHER) throw new Error("DISPATCHER binding is required to deliver app hooks");
      const worker = this.env.DISPATCHER.get(target.worker, {}, {
        // An app runs on its own CPU budget. Without a limit, a runaway app Worker
        // would burn the platform's budget instead of its own.
        limits: { cpuMs: 200, subRequests: 50 },
      });
      const response = await this.withTimeout(worker.fetch("https://app.internal/hooks/event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cloudforge-tenant": tenantId,
          "x-cloudforge-app": target.appId,
          "x-cloudforge-idempotency-key": event.event_id,
          // A credential derived for THIS tenant and THIS app. It proves the call came
          // from the platform and nothing more; it grants no access back into the
          // platform's internals, which is what sending INTERNAL_SERVICE_TOKEN did.
          ...(this.env.INTERNAL_AUTH_SECRET
            ? { authorization: `Bearer ${await deriveAppCallKey(this.env.INTERNAL_AUTH_SECRET, tenantId, target.appId)}` }
            : {}),
        },
        body: JSON.stringify(event),
      }));
      if (!response.ok) throw new Error(`App worker responded ${response.status}`);

      await this.db.prepare(
        `UPDATE app_hook_deliveries SET status='delivered', attempts=?4, last_error=NULL, next_attempt_at=NULL, modified_at=?5
         WHERE tenant_id=?1 AND app_id=?2 AND event_id=?3`,
      ).bind(tenantId, target.appId, event.event_id, attempts, now).run();
      return { appId: target.appId, status: "delivered", attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delivery failed";
      if (attempts >= MAX_HOOK_ATTEMPTS) {
        await this.abandon(tenantId, target.appId, event.event_id, message, attempts, now);
        return { appId: target.appId, status: "abandoned", attempts, error: message };
      }
      const retryAt = new Date(new Date(now).getTime() + nextAttemptDelaySeconds(attempts) * 1000).toISOString();
      await this.db.prepare(
        `UPDATE app_hook_deliveries SET status='failed', attempts=?4, last_error=?5, next_attempt_at=?6, modified_at=?7
         WHERE tenant_id=?1 AND app_id=?2 AND event_id=?3`,
      ).bind(tenantId, target.appId, event.event_id, attempts, message.slice(0, 500), retryAt, now).run();
      return { appId: target.appId, status: "failed", attempts, error: message };
    }
  }

  private async abandon(tenantId: string, appId: string, eventId: string, reason: string, attempts: number, now: string): Promise<void> {
    await this.db.prepare(
      `UPDATE app_hook_deliveries SET status='abandoned', attempts=?4, last_error=?5, next_attempt_at=NULL, modified_at=?6
       WHERE tenant_id=?1 AND app_id=?2 AND event_id=?3`,
    ).bind(tenantId, appId, eventId, attempts, reason.slice(0, 500), now).run();
  }

  private async loadEvent(tenantId: string, eventId: string): Promise<DomainEvent | null> {
    const row = await this.db.prepare(
      `SELECT payload_json FROM inbound_events WHERE tenant_id=?1 AND event_id=?2`,
    ).bind(tenantId, eventId).first<{ payload_json: string }>();
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as DomainEvent;
    } catch {
      return null;
    }
  }

  /**
   * Bounds one attempt.
   *
   * A Worker subrequest can hang; without a timeout the platform's own event
   * processing would wait on a third party's Worker indefinitely.
   */
  private async withTimeout(promise: Promise<Response>): Promise<Response> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<Response>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`App worker did not respond within ${HOOK_TIMEOUT_MS}ms`)), HOOK_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
