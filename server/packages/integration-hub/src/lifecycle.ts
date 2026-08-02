import {
  decideDelivery,
  normalizeRetryPolicy,
  type DeliveryAttemptResult,
  type IntegrationRetryPolicy,
} from "./index.js";

export type DeliveryState = "queued" | "in_flight" | "retry_scheduled" | "delivered" | "dead_letter";

export interface ConnectorDeliveryRecord {
  delivery_id: string;
  tenant_id: string;
  subscription_id: string;
  event_id: string;
  event_type: string;
  state: DeliveryState;
  attempts: number;
  replay_count: number;
  queued_at: string;
  updated_at: string;
  next_attempt_at?: string;
  delivered_at?: string;
  dead_lettered_at?: string;
  last_http_status?: number;
  last_error_code?: string;
}

export interface ConnectorDeliveryAudit {
  delivery_id: string;
  tenant_id: string;
  sequence: number;
  action: "queued" | "attempt_started" | "delivered" | "retry_scheduled" | "dead_lettered" | "replayed";
  occurred_at: string;
  actor_id?: string;
  attempt?: number;
  http_status?: number;
  error_code?: string;
  reason?: string;
  next_attempt_at?: string;
}

export interface DeliveryTransition {
  record: ConnectorDeliveryRecord;
  audit: ConnectorDeliveryAudit;
}

export function createDeliveryRecord(input: {
  delivery_id: string;
  tenant_id: string;
  subscription_id: string;
  event_id: string;
  event_type: string;
  now: Date;
}): DeliveryTransition {
  assertIdentifier(input.delivery_id, "delivery_id", 160);
  assertIdentifier(input.tenant_id, "tenant_id", 128);
  assertIdentifier(input.subscription_id, "subscription_id", 160);
  assertIdentifier(input.event_id, "event_id", 240);
  assertIdentifier(input.event_type, "event_type", 160);
  const occurredAt = input.now.toISOString();
  const record: ConnectorDeliveryRecord = {
    delivery_id: input.delivery_id,
    tenant_id: input.tenant_id,
    subscription_id: input.subscription_id,
    event_id: input.event_id,
    event_type: input.event_type,
    state: "queued",
    attempts: 0,
    replay_count: 0,
    queued_at: occurredAt,
    updated_at: occurredAt,
  };
  return {
    record,
    audit: {
      delivery_id: record.delivery_id,
      tenant_id: record.tenant_id,
      sequence: 1,
      action: "queued",
      occurred_at: occurredAt,
    },
  };
}

export function startDeliveryAttempt(record: ConnectorDeliveryRecord, now: Date): DeliveryTransition {
  validateDeliveryRecord(record);
  if (record.state !== "queued" && record.state !== "retry_scheduled") {
    throw new Error(`Cannot start delivery attempt from state ${record.state}`);
  }
  if (record.next_attempt_at && Date.parse(record.next_attempt_at) > now.getTime()) {
    throw new Error("Delivery retry is not due yet");
  }
  const occurredAt = now.toISOString();
  const attempt = record.attempts + 1;
  const next: ConnectorDeliveryRecord = {
    ...record,
    state: "in_flight",
    attempts: attempt,
    updated_at: occurredAt,
  };
  delete next.next_attempt_at;
  delete next.last_http_status;
  delete next.last_error_code;
  return {
    record: next,
    audit: {
      delivery_id: record.delivery_id,
      tenant_id: record.tenant_id,
      sequence: auditSequence(next),
      action: "attempt_started",
      occurred_at: occurredAt,
      attempt,
    },
  };
}

export function finishDeliveryAttempt(
  record: ConnectorDeliveryRecord,
  result: Omit<DeliveryAttemptResult, "attempt"> & { error_code?: string },
  now: Date,
  retryPolicyInput: Partial<IntegrationRetryPolicy> = {},
): DeliveryTransition {
  validateDeliveryRecord(record);
  if (record.state !== "in_flight" || record.attempts <= 0) throw new Error("Delivery attempt is not in flight");
  const retryPolicy = normalizeRetryPolicy(retryPolicyInput);
  const decision = decideDelivery({ attempt: record.attempts, ...result }, retryPolicy);
  const occurredAt = now.toISOString();
  const common = {
    ...record,
    updated_at: occurredAt,
    ...(result.http_status === undefined ? {} : { last_http_status: result.http_status }),
    ...(result.error_code === undefined ? {} : { last_error_code: boundedText(result.error_code, "error_code", 160) }),
  };

  if (decision.action === "delivered") {
    const next: ConnectorDeliveryRecord = { ...common, state: "delivered", delivered_at: occurredAt };
    delete next.next_attempt_at;
    delete next.dead_lettered_at;
    return {
      record: next,
      audit: {
        delivery_id: record.delivery_id,
        tenant_id: record.tenant_id,
        sequence: auditSequence(next),
        action: "delivered",
        occurred_at: occurredAt,
        attempt: record.attempts,
        ...(result.http_status === undefined ? {} : { http_status: result.http_status }),
      },
    };
  }

  if (decision.action === "retry") {
    if (decision.retry_after_seconds === null) throw new Error("Retry decision is missing delay");
    const nextAttemptAt = new Date(now.getTime() + decision.retry_after_seconds * 1_000).toISOString();
    const next: ConnectorDeliveryRecord = {
      ...common,
      state: "retry_scheduled",
      next_attempt_at: nextAttemptAt,
    };
    delete next.delivered_at;
    delete next.dead_lettered_at;
    return {
      record: next,
      audit: {
        delivery_id: record.delivery_id,
        tenant_id: record.tenant_id,
        sequence: auditSequence(next),
        action: "retry_scheduled",
        occurred_at: occurredAt,
        attempt: record.attempts,
        ...(result.http_status === undefined ? {} : { http_status: result.http_status }),
        ...(result.error_code === undefined ? {} : { error_code: boundedText(result.error_code, "error_code", 160) }),
        reason: decision.reason,
        next_attempt_at: nextAttemptAt,
      },
    };
  }

  const next: ConnectorDeliveryRecord = {
    ...common,
    state: "dead_letter",
    dead_lettered_at: occurredAt,
  };
  delete next.next_attempt_at;
  delete next.delivered_at;
  return {
    record: next,
    audit: {
      delivery_id: record.delivery_id,
      tenant_id: record.tenant_id,
      sequence: auditSequence(next),
      action: "dead_lettered",
      occurred_at: occurredAt,
      attempt: record.attempts,
      ...(result.http_status === undefined ? {} : { http_status: result.http_status }),
      ...(result.error_code === undefined ? {} : { error_code: boundedText(result.error_code, "error_code", 160) }),
      reason: decision.reason,
    },
  };
}

export function replayDeadLetter(
  record: ConnectorDeliveryRecord,
  actorId: string,
  reason: string,
  now: Date,
): DeliveryTransition {
  validateDeliveryRecord(record);
  if (record.state !== "dead_letter") throw new Error("Only dead-letter deliveries can be replayed");
  const actor = boundedText(actorId, "actor_id", 320);
  const replayReason = boundedText(reason, "replay reason", 1_000);
  const occurredAt = now.toISOString();
  const next: ConnectorDeliveryRecord = {
    ...record,
    state: "retry_scheduled",
    replay_count: record.replay_count + 1,
    updated_at: occurredAt,
    next_attempt_at: occurredAt,
  };
  delete next.dead_lettered_at;
  delete next.delivered_at;
  delete next.last_http_status;
  delete next.last_error_code;
  return {
    record: next,
    audit: {
      delivery_id: record.delivery_id,
      tenant_id: record.tenant_id,
      sequence: auditSequence(next),
      action: "replayed",
      occurred_at: occurredAt,
      actor_id: actor,
      reason: replayReason,
      next_attempt_at: occurredAt,
    },
  };
}

export function validateDeliveryRecord(record: ConnectorDeliveryRecord): ConnectorDeliveryRecord {
  assertIdentifier(record.delivery_id, "delivery_id", 160);
  assertIdentifier(record.tenant_id, "tenant_id", 128);
  assertIdentifier(record.subscription_id, "subscription_id", 160);
  assertIdentifier(record.event_id, "event_id", 240);
  assertIdentifier(record.event_type, "event_type", 160);
  if (!["queued", "in_flight", "retry_scheduled", "delivered", "dead_letter"].includes(record.state)) {
    throw new Error("Invalid delivery state");
  }
  if (!Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts > 1_000_000) throw new Error("Invalid delivery attempts");
  if (!Number.isSafeInteger(record.replay_count) || record.replay_count < 0 || record.replay_count > 1_000_000) throw new Error("Invalid delivery replay_count");
  for (const [field, value] of [["queued_at", record.queued_at], ["updated_at", record.updated_at]] as const) {
    if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${field}`);
  }
  return record;
}

function auditSequence(record: ConnectorDeliveryRecord): number {
  // Deterministic monotonic lower bound for persistence implementations. A store may
  // use a stronger sequence, but attempts/replays always move this number forward.
  return 2 + (record.attempts * 2) + record.replay_count;
}

function assertIdentifier(value: string, field: string, max: number): void {
  if (!value || value.length > max || /[\r\n\0]/.test(value)) throw new Error(`Invalid ${field}`);
}

function boundedText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}
