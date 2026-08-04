import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { stableJsonStringify } from "./index.js";

export type RecoverableQueueKind = "outbox_domain_event" | "social_event" | "prepared_report";

export interface QueueQuarantineRecord extends JsonObject {
  schema_version: 1;
  dead_letter_id: string;
  queue_kind: RecoverableQueueKind;
  tenant_id: string;
  idempotency_identity: string;
  message_schema_version: number;
  payload_hash: string;
  original_message: JsonObject;
  attempts: number;
  failure_code: string;
  quarantined_at: string;
  replay_count: number;
}

export interface QueueQuarantineInspection extends JsonObject {
  schema_version: 1;
  dead_letter_id: string;
  queue_kind: RecoverableQueueKind;
  tenant_id: string;
  idempotency_identity: string;
  message_schema_version: number;
  payload_hash: string;
  attempts: number;
  failure_code: string;
  quarantined_at: string;
  replay_count: number;
}

export interface QueueReplayRequest extends JsonObject {
  schema_version: 1;
  dead_letter_id: string;
  queue_kind: RecoverableQueueKind;
  tenant_id: string;
  idempotency_identity: string;
  payload_hash: string;
  actor_id: string;
  reason: string;
  requested_at: string;
  replay_count: number;
}

export interface MaterializedQueueReplay extends JsonObject {
  schema_version: 1;
  queue_kind: RecoverableQueueKind;
  tenant_id: string;
  idempotency_identity: string;
  message: JsonObject;
}

interface NormalizedQueueMessage {
  tenant_id: string;
  idempotency_identity: string;
  message_schema_version: number;
  message: JsonObject;
}

const QUEUE_KINDS = new Set<RecoverableQueueKind>(["outbox_domain_event", "social_event", "prepared_report"]);

/**
 * Create an immutable quarantine record from a known Forge queue contract.
 *
 * The original message is retained only inside the quarantine record. Operator
 * inspection deliberately returns metadata only, and replay requests reference
 * the immutable record by identity/hash instead of accepting arbitrary raw payloads.
 */
export async function quarantineQueueMessage(input: {
  queue_kind: RecoverableQueueKind;
  message: unknown;
  attempts: number;
  failure_code: string;
  now: Date;
  replay_count?: number;
}): Promise<QueueQuarantineRecord> {
  const normalized = normalizeQueueMessage(input.queue_kind, input.message);
  const attempts = positiveInteger(input.attempts, "attempts", 1_000_000);
  const failureCode = requireText(input.failure_code, "failure_code", 160);
  const replayCount = input.replay_count ?? 0;
  if (!Number.isSafeInteger(replayCount) || replayCount < 0 || replayCount > 1_000_000) throw new Error("Invalid replay_count");
  const payloadHash = await sha256Hex(stableJsonStringify(normalized.message));
  const deadLetterId = `qdlq_${(await sha256Hex(`${input.queue_kind}\n${normalized.tenant_id}\n${normalized.idempotency_identity}\n${payloadHash}`)).slice(0, 48)}`;
  return {
    schema_version: 1,
    dead_letter_id: deadLetterId,
    queue_kind: input.queue_kind,
    tenant_id: normalized.tenant_id,
    idempotency_identity: normalized.idempotency_identity,
    message_schema_version: normalized.message_schema_version,
    payload_hash: payloadHash,
    original_message: cloneJsonObject(normalized.message),
    attempts,
    failure_code: failureCode,
    quarantined_at: input.now.toISOString(),
    replay_count: replayCount,
  };
}

export async function validateQueueQuarantine(value: unknown): Promise<QueueQuarantineRecord> {
  const record = requireObject(value, "queue quarantine") as Partial<QueueQuarantineRecord>;
  if (record.schema_version !== 1) throw new Error("Unsupported queue quarantine schema_version");
  const queueKind = normalizeQueueKind(record.queue_kind);
  const normalized = normalizeQueueMessage(queueKind, record.original_message);
  const tenantId = requireText(record.tenant_id, "tenant_id", 128);
  const identity = requireText(record.idempotency_identity, "idempotency_identity", 320);
  if (normalized.tenant_id !== tenantId || normalized.idempotency_identity !== identity) {
    throw new Error("Queue quarantine identity mismatch");
  }
  if (record.message_schema_version !== normalized.message_schema_version) throw new Error("Queue quarantine message schema mismatch");
  const payloadHash = requireHash(record.payload_hash, "payload_hash");
  const expectedHash = await sha256Hex(stableJsonStringify(normalized.message));
  if (!constantTimeEqual(payloadHash, expectedHash)) throw new Error("Queue quarantine payload hash mismatch");
  const expectedDeadLetterId = `qdlq_${(await sha256Hex(`${queueKind}\n${tenantId}\n${identity}\n${payloadHash}`)).slice(0, 48)}`;
  const deadLetterId = requireText(record.dead_letter_id, "dead_letter_id", 160);
  if (!constantTimeEqual(deadLetterId, expectedDeadLetterId)) throw new Error("Queue quarantine dead-letter identity mismatch");
  const attempts = positiveInteger(record.attempts, "attempts", 1_000_000);
  const replayCount = record.replay_count;
  if (!Number.isSafeInteger(replayCount) || (replayCount ?? -1) < 0 || (replayCount ?? 0) > 1_000_000) throw new Error("Invalid replay_count");
  return {
    schema_version: 1,
    dead_letter_id: deadLetterId,
    queue_kind: queueKind,
    tenant_id: tenantId,
    idempotency_identity: identity,
    message_schema_version: normalized.message_schema_version,
    payload_hash: payloadHash,
    original_message: cloneJsonObject(normalized.message),
    attempts,
    failure_code: requireText(record.failure_code, "failure_code", 160),
    quarantined_at: requireIso(record.quarantined_at, "quarantined_at"),
    replay_count: replayCount as number,
  };
}

/** Safe operator view. It never exposes raw social bodies/report filters/event payloads. */
export async function inspectQueueQuarantine(value: unknown): Promise<QueueQuarantineInspection> {
  const record = await validateQueueQuarantine(value);
  return {
    schema_version: 1,
    dead_letter_id: record.dead_letter_id,
    queue_kind: record.queue_kind,
    tenant_id: record.tenant_id,
    idempotency_identity: record.idempotency_identity,
    message_schema_version: record.message_schema_version,
    payload_hash: record.payload_hash,
    attempts: record.attempts,
    failure_code: record.failure_code,
    quarantined_at: record.quarantined_at,
    replay_count: record.replay_count,
  };
}

/**
 * A replay request contains no caller-supplied queue payload. The operator must bind
 * the request to the exact immutable payload hash observed during inspection.
 */
export async function requestQueueReplay(
  quarantine: unknown,
  input: { actor_id: string; reason: string; expected_payload_hash: string; now: Date },
): Promise<QueueReplayRequest> {
  const record = await validateQueueQuarantine(quarantine);
  const expectedHash = requireHash(input.expected_payload_hash, "expected_payload_hash");
  if (!constantTimeEqual(record.payload_hash, expectedHash)) throw new Error("Replay payload hash does not match quarantined message");
  return {
    schema_version: 1,
    dead_letter_id: record.dead_letter_id,
    queue_kind: record.queue_kind,
    tenant_id: record.tenant_id,
    idempotency_identity: record.idempotency_identity,
    payload_hash: record.payload_hash,
    actor_id: requireText(input.actor_id, "actor_id", 320),
    reason: requireText(input.reason, "reason", 1_000),
    requested_at: input.now.toISOString(),
    replay_count: record.replay_count + 1,
  };
}

export async function validateQueueReplayRequest(value: unknown): Promise<QueueReplayRequest> {
  const record = requireObject(value, "queue replay request") as Partial<QueueReplayRequest>;
  if (record.schema_version !== 1) throw new Error("Unsupported queue replay schema_version");
  const replayCount = record.replay_count;
  if (!Number.isSafeInteger(replayCount) || (replayCount ?? 0) <= 0 || (replayCount ?? 0) > 1_000_000) throw new Error("Invalid replay_count");
  return {
    schema_version: 1,
    dead_letter_id: requireText(record.dead_letter_id, "dead_letter_id", 160),
    queue_kind: normalizeQueueKind(record.queue_kind),
    tenant_id: requireText(record.tenant_id, "tenant_id", 128),
    idempotency_identity: requireText(record.idempotency_identity, "idempotency_identity", 320),
    payload_hash: requireHash(record.payload_hash, "payload_hash"),
    actor_id: requireText(record.actor_id, "actor_id", 320),
    reason: requireText(record.reason, "reason", 1_000),
    requested_at: requireIso(record.requested_at, "requested_at"),
    replay_count: replayCount as number,
  };
}

/**
 * Trusted recovery tooling calls this only after loading the quarantine record from
 * durable storage. This is the sole operation that materializes the original payload.
 */
export async function materializeQueueReplay(
  quarantine: unknown,
  replayRequest: unknown,
): Promise<MaterializedQueueReplay> {
  const record = await validateQueueQuarantine(quarantine);
  const request = await validateQueueReplayRequest(replayRequest);
  if (
    record.dead_letter_id !== request.dead_letter_id
    || record.queue_kind !== request.queue_kind
    || record.tenant_id !== request.tenant_id
    || record.idempotency_identity !== request.idempotency_identity
    || !constantTimeEqual(record.payload_hash, request.payload_hash)
  ) {
    throw new Error("Replay request does not match quarantined queue message");
  }
  if (request.replay_count !== record.replay_count + 1) throw new Error("Replay count is stale or out of sequence");
  return {
    schema_version: 1,
    queue_kind: record.queue_kind,
    tenant_id: record.tenant_id,
    idempotency_identity: record.idempotency_identity,
    message: cloneJsonObject(record.original_message),
  };
}

function normalizeQueueMessage(kind: RecoverableQueueKind, value: unknown): NormalizedQueueMessage {
  const message = requireObject(value, `${kind} message`);
  if (kind === "outbox_domain_event") return normalizeDomainEvent(message);
  if (kind === "social_event") return normalizeSocialEvent(message);
  return normalizePreparedReport(message);
}

function normalizeDomainEvent(message: JsonObject): NormalizedQueueMessage {
  if (message.schema_version !== 1) throw new Error("Unsupported DomainEvent schema_version");
  const tenantId = requireText(message.tenant_id, "tenant_id", 128);
  const eventId = requireText(message.event_id, "event_id", 320);
  requireText(message.event_type, "event_type", 160);
  requireText(message.command_id, "command_id", 320);
  requireText(message.actor, "actor", 320);
  requireIso(message.occurred_at, "occurred_at");
  positiveInteger(message.aggregate_version, "aggregate_version", Number.MAX_SAFE_INTEGER);
  const aggregate = requireObject(message.aggregate, "aggregate");
  requireText(aggregate.doctype, "aggregate.doctype", 320);
  requireText(aggregate.name, "aggregate.name", 320);
  requireObject(message.payload, "payload");
  return { tenant_id: tenantId, idempotency_identity: eventId, message_schema_version: 1, message: cloneJsonObject(message) };
}

function normalizeSocialEvent(message: JsonObject): NormalizedQueueMessage {
  if (message.schema_version !== 1) throw new Error("Unsupported social event schema_version");
  if (message.provider !== "facebook") throw new Error("Unsupported social event provider");
  const tenantId = requireText(message.tenant_id, "tenant_id", 128);
  const eventId = requireText(message.event_id, "event_id", 320);
  requireText(message.worker_name, "worker_name", 320);
  requireText(message.page_key_hmac, "page_key_hmac", 256);
  requireIso(message.received_at, "received_at");
  requireRawBody(message.raw_body, "raw_body", 1_000_000);
  return { tenant_id: tenantId, idempotency_identity: eventId, message_schema_version: 1, message: cloneJsonObject(message) };
}

function normalizePreparedReport(message: JsonObject): NormalizedQueueMessage {
  const tenantId = requireText(message.tenant_id, "tenant_id", 128);
  const jobId = requireText(message.job_id, "job_id", 320);
  requireText(message.actor_id, "actor_id", 320);
  requireObject(message.request, "request");
  if (message.bookmark !== undefined) requireText(message.bookmark, "bookmark", 4_096);
  return { tenant_id: tenantId, idempotency_identity: jobId, message_schema_version: 1, message: cloneJsonObject(message) };
}

function normalizeQueueKind(value: unknown): RecoverableQueueKind {
  if (typeof value !== "string" || !QUEUE_KINDS.has(value as RecoverableQueueKind)) throw new Error("Unsupported queue_kind");
  return value as RecoverableQueueKind;
}

function requireObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${field}`);
  return value as JsonObject;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}

function requireRawBody(value: unknown, field: string, maxBytes: number): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new Error(`Invalid ${field}`);
  if (new TextEncoder().encode(value).byteLength > maxBytes) throw new Error(`${field} exceeds payload limit`);
  return value;
}

function requireIso(value: unknown, field: string): string {
  const text = requireText(value, field, 80);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Invalid ${field}`);
  return text;
}

function requireHash(value: unknown, field: string): string {
  const text = requireText(value, field, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`Invalid ${field}`);
  return text;
}

function positiveInteger(value: unknown, field: string, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error(`Invalid ${field}`);
  return value;
}

function cloneJsonObject(value: JsonObject): JsonObject {
  return cloneJsonValue(value) as JsonObject;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) output[key] = cloneJsonValue(item);
  return output;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
