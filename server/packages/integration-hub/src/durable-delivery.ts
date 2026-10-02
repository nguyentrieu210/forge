import type { DomainEvent } from "../../contracts/src/index.js";
import { planWebhookDeliveries, validateDeliveryTask, type WebhookDeliveryTask } from "./delivery-planner.js";
import { executeWebhookTask, type WebhookCredentialResolver, type WebhookTransport } from "./executor.js";
import { normalizeRetryPolicy, stableJsonStringify, type DeliveryDecision, type WebhookSubscription } from "./index.js";

/** Structural D1 subset, also used by the real SQLite regression adapter. */
export interface DeliveryDatabase {
  prepare(sql: string): DeliveryStatement;
  batch(statements: DeliveryStatement[]): Promise<unknown[]>;
}
export interface DeliveryStatement {
  bind(...values: unknown[]): DeliveryStatement;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}
interface DeliveryRow {
  tenant_id: string; delivery_id: string; task_json: string;
  attempts: number; claim_token: string; state: string;
}
export interface ClaimedWebhookDelivery {
  task: WebhookDeliveryTask; attempt: number; claim_token: string;
}
export interface ActiveSubscriptionReader {
  subscriptionsForEvent(event: DomainEvent): Promise<WebhookSubscription[]>;
}

/**
 * Durable provider-neutral intent. Only committed DomainEvents enter this authority.
 * The tenant comes from trusted worker context, never a client-supplied queue field.
 * Physical sends are at-least-once: the same delivery ID accompanies every retry.
 */
export class D1WebhookDeliveryStore {
  constructor(private readonly db: DeliveryDatabase) {}

  async fanoutCount(tenantId: string, eventId: string): Promise<number | null> {
    const row = await this.db.prepare("SELECT json_array_length(tasks_json) AS matched FROM integration_webhook_fanouts WHERE tenant_id=?1 AND event_id=?2").bind(tenantId, eventId).first<{ matched: number }>();
    return row?.matched ?? null;
  }

  async enqueueEvent(tenantId: string, eventId: string, taskInputs: WebhookDeliveryTask[], now = new Date()): Promise<{ matched: number; created: number }> {
    const tasks = taskInputs.map(validateDeliveryTask);
    for (const task of tasks) if (task.tenant_id !== tenantId || task.event_id !== eventId) throw new Error("Webhook fanout identity mismatch");
    if (new Set(tasks.map(task => task.delivery_id)).size !== tasks.length) throw new Error("Duplicate webhook fanout identity");
    const plan = stableJsonStringify(tasks);
    if (new TextEncoder().encode(plan).byteLength > 1_000_000) throw new Error("Webhook fanout exceeds safe bound");
    const at = now.toISOString();
    // Freeze the complete subscription selection and ALL intents in one D1 batch.
    // Retrying after config changes reuses the original plan, including an empty plan.
    const results = await this.db.batch([
      this.db.prepare("INSERT INTO integration_webhook_fanouts (tenant_id,event_id,tasks_json,created_at) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING")
        .bind(tenantId, eventId, plan, at),
      this.db.prepare("INSERT INTO integration_webhook_deliveries (tenant_id,delivery_id,subscription_id,event_id,task_json,state,next_attempt_at,created_at,updated_at) SELECT f.tenant_id,json_extract(j.value,'$.delivery_id'),json_extract(j.value,'$.subscription_id'),f.event_id,j.value,'queued',f.created_at,f.created_at,f.created_at FROM integration_webhook_fanouts f, json_each(f.tasks_json) j WHERE f.tenant_id=?1 AND f.event_id=?2 ON CONFLICT DO NOTHING")
        .bind(tenantId, eventId),
    ]);
    const fanout = await this.db.prepare("SELECT json_array_length(tasks_json) AS matched FROM integration_webhook_fanouts WHERE tenant_id=?1 AND event_id=?2").bind(tenantId, eventId).first<{ matched: number }>();
    const inserted = results[1] as { meta?: { changes?: number } } | undefined;
    return { matched: fanout?.matched ?? 0, created: inserted?.meta?.changes ?? 0 };
  }

  async enqueue(tenantId: string, taskInput: WebhookDeliveryTask, now = new Date()): Promise<boolean> {
    const task = validateDeliveryTask(taskInput);
    if (task.tenant_id !== tenantId) throw new Error("Webhook delivery tenant mismatch");
    const snapshot = stableJsonStringify(task);
    if (new TextEncoder().encode(snapshot).byteLength > 1_000_000) throw new Error("Webhook snapshot exceeds safe bound");
    const at = now.toISOString();
    const result = await this.db.prepare(
      "INSERT INTO integration_webhook_deliveries (tenant_id,delivery_id,subscription_id,event_id,task_json,state,next_attempt_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,'queued',?6,?6,?6) ON CONFLICT DO NOTHING",
    ).bind(tenantId, task.delivery_id, task.subscription_id, task.event_id, snapshot, at).run();
    // Enqueue is immutable: a redelivered event never rewrites an existing snapshot.
    return (result.meta?.changes ?? 0) === 1;
  }

  async claim(tenantId: string, deliveryId: string, now = new Date()): Promise<ClaimedWebhookDelivery | null> {
    const at = now.toISOString();
    const stale = new Date(now.getTime() - 120_000).toISOString();
    const token = crypto.randomUUID();
    const row = await this.db.prepare(
      "UPDATE integration_webhook_deliveries SET state='in_flight',attempts=attempts+1,claim_token=?3,claimed_at=?4,updated_at=?4 WHERE tenant_id=?1 AND delivery_id=?2 AND ((state IN ('queued','retry_scheduled') AND next_attempt_at<=?4) OR (state='in_flight' AND claimed_at<=?5)) RETURNING tenant_id,delivery_id,task_json,attempts,claim_token,state",
    ).bind(tenantId, deliveryId, token, at, stale).first<DeliveryRow>();
    if (!row) return null;
    const task = validateDeliveryTask(JSON.parse(row.task_json));
    if (task.tenant_id !== tenantId || task.delivery_id !== deliveryId) throw new Error("Persisted webhook identity mismatch");
    await this.db.prepare(
      "INSERT INTO integration_webhook_audit (tenant_id,delivery_id,claim_token,action,attempt,occurred_at) SELECT tenant_id,delivery_id,claim_token,'attempt_started',attempts,?3 FROM integration_webhook_deliveries WHERE tenant_id=?1 AND delivery_id=?2 AND claim_token=?4 AND state='in_flight' ON CONFLICT DO NOTHING",
    ).bind(tenantId, deliveryId, at, token).run();
    return { task, attempt: row.attempts, claim_token: token };
  }

  async finish(tenantId: string, claim: ClaimedWebhookDelivery, decision: DeliveryDecision, httpStatus: number | undefined, now = new Date()): Promise<void> {
    if (claim.task.tenant_id !== tenantId) throw new Error("Webhook claim tenant mismatch");
    const state = decision.action === "retry" ? "retry_scheduled" : decision.action;
    const at = now.toISOString();
    const next = decision.action === "retry"
      ? new Date(now.getTime() + (decision.retry_after_seconds ?? 0) * 1_000).toISOString() : at;
    if (decision.action === "retry" && (!Number.isInteger(decision.retry_after_seconds) || (decision.retry_after_seconds ?? 0) <= 0 || (decision.retry_after_seconds ?? 0) > 86_400)) {
      throw new Error("Invalid webhook retry delay");
    }
    const reason = decision.reason.slice(0, 160);
    // D1 batch is atomic. Stale leases cannot update state or append a completion audit.
    await this.db.batch([
      this.db.prepare("UPDATE integration_webhook_deliveries SET state=?4,next_attempt_at=?5,http_status=?6,reason=?7,updated_at=?8 WHERE tenant_id=?1 AND delivery_id=?2 AND claim_token=?3 AND state='in_flight'")
        .bind(tenantId, claim.task.delivery_id, claim.claim_token, state, next, httpStatus ?? null, reason, at),
      this.db.prepare("INSERT INTO integration_webhook_audit (tenant_id,delivery_id,claim_token,action,attempt,http_status,reason,occurred_at) SELECT tenant_id,delivery_id,claim_token,?4,attempts,http_status,reason,?5 FROM integration_webhook_deliveries WHERE tenant_id=?1 AND delivery_id=?2 AND claim_token=?3 AND state=?4 AND updated_at=?5 ON CONFLICT DO NOTHING")
        .bind(tenantId, claim.task.delivery_id, claim.claim_token, state, at),
    ]);
  }

  async due(tenantId: string, now = new Date(), limit = 25): Promise<string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid webhook runner limit");
    const result = await this.db.prepare("SELECT delivery_id FROM integration_webhook_deliveries WHERE tenant_id=?1 AND ((state IN ('queued','retry_scheduled') AND next_attempt_at<=?2) OR (state='in_flight' AND claimed_at<=?3)) ORDER BY next_attempt_at,delivery_id LIMIT ?4")
      .bind(tenantId, now.toISOString(), new Date(now.getTime() - 120_000).toISOString(), limit).all<{ delivery_id: string }>();
    return (result.results ?? []).map(row => row.delivery_id);
  }

  /** Authorization belongs to the caller; the store additionally requires audit attribution. */
  async replay(tenantId: string, deliveryId: string, actorId: string, reason: string, now = new Date()): Promise<boolean> {
    if (!actorId.trim() || !reason.trim() || actorId.length > 320 || reason.length > 1_000 || /[\r\n\0]/.test(actorId + reason)) throw new Error("Webhook replay requires bounded actor and reason");
    const token = crypto.randomUUID();
    const at = now.toISOString();
    await this.db.batch([
      this.db.prepare("UPDATE integration_webhook_deliveries SET state='retry_scheduled',attempts=0,replay_count=replay_count+1,claim_token=?3,next_attempt_at=?4,updated_at=?4 WHERE tenant_id=?1 AND delivery_id=?2 AND state='dead_letter'")
        .bind(tenantId, deliveryId, token, at),
      this.db.prepare("INSERT INTO integration_webhook_audit (tenant_id,delivery_id,claim_token,action,attempt,reason,actor_id,occurred_at) SELECT tenant_id,delivery_id,claim_token,'replayed',attempts,?4,?5,?6 FROM integration_webhook_deliveries WHERE tenant_id=?1 AND delivery_id=?2 AND claim_token=?3")
        .bind(tenantId, deliveryId, token, reason.trim(), actorId.trim(), at),
    ]);
    const row = await this.db.prepare("SELECT claim_token FROM integration_webhook_deliveries WHERE tenant_id=?1 AND delivery_id=?2").bind(tenantId, deliveryId).first<{ claim_token: string }>();
    return row?.claim_token === token;
  }
}

export async function enqueueCommittedWebhookEvent(
  tenantId: string, event: DomainEvent, subscriptions: ActiveSubscriptionReader,
  store: D1WebhookDeliveryStore, now = new Date(),
): Promise<{ matched: number; created: number }> {
  if (event.tenant_id !== tenantId) throw new Error("Committed webhook event tenant mismatch");
  const existing = await store.fanoutCount(tenantId, event.event_id);
  if (existing !== null) return { matched: existing, created: 0 };
  const tasks = await planWebhookDeliveries(event, await subscriptions.subscriptionsForEvent(event));
  return store.enqueueEvent(tenantId, event.event_id, tasks, now);
}

export async function runDurableWebhookDeliveries(input: {
  tenant_id: string; store: D1WebhookDeliveryStore;
  credential_resolver: WebhookCredentialResolver; transport: WebhookTransport;
  now?: Date; limit?: number;
}): Promise<{ claimed: number; delivered: number; retry: number; dead_letter: number }> {
  const clock = () => input.now ?? new Date();
  const now = clock();
  const result = { claimed: 0, delivered: 0, retry: 0, dead_letter: 0 };
  for (const id of await input.store.due(input.tenant_id, now, input.limit ?? 25)) {
    const claim = await input.store.claim(input.tenant_id, id, clock());
    if (!claim) continue;
    result.claimed++;
    const policy = normalizeRetryPolicy(claim.task.retry_policy as Partial<import("./index.js").IntegrationRetryPolicy>);
    let decision: DeliveryDecision;
    let status: number | undefined;
    if (claim.attempt > policy.max_attempts) {
      decision = { action: "dead_letter", retry_after_seconds: null, reason: "attempt_limit_exhausted" };
    } else {
      try {
        const execution = await executeWebhookTask({ task: claim.task, attempt: claim.attempt,
          credential_resolver: input.credential_resolver, transport: input.transport, now: clock() });
        decision = execution.decision;
        status = execution.http_status;
      } catch {
        // Credential/configuration errors are quarantined without recording secret-bearing errors.
        decision = { action: "dead_letter", retry_after_seconds: null, reason: "credential_or_configuration_error" };
      }
    }
    await input.store.finish(input.tenant_id, claim, decision, status, clock());
    result[decision.action]++;
  }
  return result;
}
