import type { JsonObject } from "../../contracts/src/index.js";
import { validateDeliveryTask, type WebhookDeliveryTask } from "./delivery-planner.js";

export interface WebhookDeadLetterMessage extends JsonObject {
  schema_version: 1;
  dead_letter_id: string;
  delivery_id: string;
  tenant_id: string;
  task: WebhookDeliveryTask;
  attempts: number;
  reason: string;
  dead_lettered_at: string;
  replay_count: number;
}

export interface WebhookReplayRequest extends JsonObject {
  schema_version: 1;
  dead_letter_id: string;
  delivery_id: string;
  tenant_id: string;
  actor_id: string;
  reason: string;
  requested_at: string;
  replay_count: number;
  task: WebhookDeliveryTask;
}

export async function createWebhookDeadLetter(input: {
  task: WebhookDeliveryTask;
  attempts: number;
  reason: string;
  now: Date;
}): Promise<WebhookDeadLetterMessage> {
  const task = validateDeliveryTask(input.task);
  if (!Number.isSafeInteger(input.attempts) || input.attempts <= 0 || input.attempts > 1_000_000) {
    throw new Error("Invalid dead-letter attempts");
  }
  const reason = requireText(input.reason, "dead-letter reason", 1_000);
  return {
    schema_version: 1,
    dead_letter_id: `dlq_${(await sha256Hex(`${task.tenant_id}\n${task.delivery_id}`)).slice(0, 48)}`,
    delivery_id: task.delivery_id,
    tenant_id: task.tenant_id,
    task,
    attempts: input.attempts,
    reason,
    dead_lettered_at: input.now.toISOString(),
    replay_count: 0,
  };
}

export function validateWebhookDeadLetter(value: unknown): WebhookDeadLetterMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid webhook dead-letter message");
  const record = value as Partial<WebhookDeadLetterMessage>;
  if (record.schema_version !== 1) throw new Error("Unsupported webhook dead-letter schema_version");
  const task = validateDeliveryTask(record.task);
  const deadLetterId = requireText(record.dead_letter_id, "dead_letter_id", 160);
  const deliveryId = requireText(record.delivery_id, "delivery_id", 160);
  const tenantId = requireText(record.tenant_id, "tenant_id", 128);
  if (task.delivery_id !== deliveryId || task.tenant_id !== tenantId) throw new Error("Dead-letter task identity mismatch");
  if (!Number.isSafeInteger(record.attempts) || (record.attempts ?? 0) <= 0) throw new Error("Invalid dead-letter attempts");
  if (!Number.isSafeInteger(record.replay_count) || (record.replay_count ?? -1) < 0) throw new Error("Invalid dead-letter replay_count");
  const deadLetteredAt = requireIso(record.dead_lettered_at, "dead_lettered_at");
  return {
    schema_version: 1,
    dead_letter_id: deadLetterId,
    delivery_id: deliveryId,
    tenant_id: tenantId,
    task,
    attempts: record.attempts as number,
    reason: requireText(record.reason, "dead-letter reason", 1_000),
    dead_lettered_at: deadLetteredAt,
    replay_count: record.replay_count as number,
  };
}

export function requestWebhookReplay(
  deadLetter: WebhookDeadLetterMessage,
  actorId: string,
  reason: string,
  now: Date,
): WebhookReplayRequest {
  const record = validateWebhookDeadLetter(deadLetter);
  return {
    schema_version: 1,
    dead_letter_id: record.dead_letter_id,
    delivery_id: record.delivery_id,
    tenant_id: record.tenant_id,
    actor_id: requireText(actorId, "actor_id", 320),
    reason: requireText(reason, "replay reason", 1_000),
    requested_at: now.toISOString(),
    replay_count: record.replay_count + 1,
    // Replay preserves the original immutable delivery snapshot and logical id.
    // The executor resolves the credential reference again, so credential rotation
    // applies without mutating historical payload/target semantics.
    task: record.task,
  };
}

export function validateWebhookReplay(value: unknown): WebhookReplayRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid webhook replay request");
  const record = value as Partial<WebhookReplayRequest>;
  if (record.schema_version !== 1) throw new Error("Unsupported webhook replay schema_version");
  const task = validateDeliveryTask(record.task);
  const deliveryId = requireText(record.delivery_id, "delivery_id", 160);
  const tenantId = requireText(record.tenant_id, "tenant_id", 128);
  if (task.delivery_id !== deliveryId || task.tenant_id !== tenantId) throw new Error("Replay task identity mismatch");
  if (!Number.isSafeInteger(record.replay_count) || (record.replay_count ?? 0) <= 0) throw new Error("Invalid replay_count");
  return {
    schema_version: 1,
    dead_letter_id: requireText(record.dead_letter_id, "dead_letter_id", 160),
    delivery_id: deliveryId,
    tenant_id: tenantId,
    actor_id: requireText(record.actor_id, "actor_id", 320),
    reason: requireText(record.reason, "replay reason", 1_000),
    requested_at: requireIso(record.requested_at, "requested_at"),
    replay_count: record.replay_count as number,
    task,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireIso(value: unknown, field: string): string {
  const text = requireText(value, field, 80);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Invalid ${field}`);
  return text;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}
