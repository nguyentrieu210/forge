import type { DomainEvent, JsonObject } from "../../contracts/src/index.js";
import {
  buildWebhookEnvelope,
  normalizeRetryPolicy,
  selectWebhookSubscriptions,
  validateWebhookSubscription,
  type ConnectorAuthKind,
  type IntegrationRetryPolicy,
  type WebhookDeliveryEnvelope,
  type WebhookSubscription,
} from "./index.js";

export interface WebhookDeliveryTask extends JsonObject {
  schema_version: 1;
  delivery_id: string;
  tenant_id: string;
  subscription_id: string;
  event_id: string;
  target_url: string;
  auth_kind: ConnectorAuthKind;
  secret_ref?: string;
  allowed_hosts: string[];
  retry_policy: JsonObject;
  envelope: WebhookDeliveryEnvelope;
}

export async function planWebhookDeliveries(
  event: DomainEvent,
  subscriptions: readonly WebhookSubscription[],
): Promise<WebhookDeliveryTask[]> {
  const selected = selectWebhookSubscriptions(event, subscriptions);
  const tasks: WebhookDeliveryTask[] = [];
  for (const subscription of selected) tasks.push(await buildDeliveryTask(event, subscription));
  return tasks;
}

export async function buildDeliveryTask(event: DomainEvent, subscription: WebhookSubscription): Promise<WebhookDeliveryTask> {
  validateWebhookSubscription(subscription);
  if (event.tenant_id !== subscription.tenant_id) throw new Error("Delivery task tenant mismatch");
  if (subscription.status !== "active") throw new Error("Only active subscriptions can create delivery tasks");
  const envelope = await buildWebhookEnvelope(event, subscription);
  const policy = normalizeRetryPolicy(subscription.retry_policy);
  return {
    schema_version: 1,
    delivery_id: envelope.delivery_id,
    tenant_id: event.tenant_id,
    subscription_id: subscription.subscription_id,
    event_id: event.event_id,
    target_url: subscription.target_url,
    auth_kind: subscription.auth_kind,
    ...(subscription.secret_ref ? { secret_ref: subscription.secret_ref } : {}),
    allowed_hosts: [...subscription.allowed_hosts],
    retry_policy: retryPolicyJson(policy),
    envelope,
  };
}

export function validateDeliveryTask(value: unknown): WebhookDeliveryTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid webhook delivery task");
  const task = value as Partial<WebhookDeliveryTask>;
  if (task.schema_version !== 1) throw new Error("Unsupported webhook delivery task schema_version");
  const deliveryId = requireText(task.delivery_id, "delivery_id", 160);
  const tenantId = requireText(task.tenant_id, "tenant_id", 128);
  const subscriptionId = requireText(task.subscription_id, "subscription_id", 160);
  const eventId = requireText(task.event_id, "event_id", 240);
  const targetUrl = requireText(task.target_url, "target_url", 2_048);
  const authKind = requireAuthKind(task.auth_kind);
  const allowedHosts = requireStringArray(task.allowed_hosts, "allowed_hosts", 64, 253);
  const envelope = requireEnvelope(task.envelope);
  if (envelope.delivery_id !== deliveryId || envelope.tenant_id !== tenantId
    || envelope.subscription_id !== subscriptionId || envelope.event_id !== eventId) {
    throw new Error("Webhook delivery task envelope identity mismatch");
  }
  const retryPolicy = requireRetryPolicy(task.retry_policy);
  const subscription: WebhookSubscription = {
    subscription_id: subscriptionId,
    tenant_id: tenantId,
    event_pattern: envelope.event_type,
    target_url: targetUrl,
    status: "active",
    auth_kind: authKind,
    allowed_hosts: allowedHosts,
    ...(task.secret_ref === undefined ? {} : { secret_ref: requireText(task.secret_ref, "secret_ref", 320) }),
    retry_policy: retryPolicy,
  };
  validateWebhookSubscription(subscription);
  return {
    schema_version: 1,
    delivery_id: deliveryId,
    tenant_id: tenantId,
    subscription_id: subscriptionId,
    event_id: eventId,
    target_url: targetUrl,
    auth_kind: authKind,
    ...(subscription.secret_ref ? { secret_ref: subscription.secret_ref } : {}),
    allowed_hosts: allowedHosts,
    retry_policy: retryPolicyJson(retryPolicy),
    envelope,
  };
}

export function taskToSubscription(task: WebhookDeliveryTask): WebhookSubscription {
  const valid = validateDeliveryTask(task);
  return {
    subscription_id: valid.subscription_id,
    tenant_id: valid.tenant_id,
    event_pattern: valid.envelope.event_type,
    target_url: valid.target_url,
    status: "active",
    auth_kind: valid.auth_kind,
    allowed_hosts: [...valid.allowed_hosts],
    ...(valid.secret_ref ? { secret_ref: valid.secret_ref } : {}),
    retry_policy: requireRetryPolicy(valid.retry_policy),
  };
}

function requireEnvelope(value: unknown): WebhookDeliveryEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid delivery envelope");
  const envelope = value as Partial<WebhookDeliveryEnvelope>;
  if (envelope.schema_version !== 1) throw new Error("Invalid delivery envelope schema_version");
  requireText(envelope.delivery_id, "envelope.delivery_id", 160);
  requireText(envelope.subscription_id, "envelope.subscription_id", 160);
  requireText(envelope.event_id, "envelope.event_id", 240);
  requireText(envelope.event_type, "envelope.event_type", 160);
  requireText(envelope.tenant_id, "envelope.tenant_id", 128);
  requireText(envelope.occurred_at, "envelope.occurred_at", 80);
  if (!Number.isSafeInteger(envelope.aggregate_version) || (envelope.aggregate_version ?? 0) <= 0) throw new Error("Invalid envelope.aggregate_version");
  if (!envelope.aggregate || typeof envelope.aggregate !== "object" || Array.isArray(envelope.aggregate)) throw new Error("Invalid envelope.aggregate");
  if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new Error("Invalid envelope.data");
  return envelope as WebhookDeliveryEnvelope;
}

function requireRetryPolicy(value: unknown): IntegrationRetryPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid retry_policy");
  const record = value as Record<string, unknown>;
  return normalizeRetryPolicy({
    max_attempts: requirePositiveInteger(record.max_attempts, "max_attempts"),
    base_delay_seconds: requirePositiveInteger(record.base_delay_seconds, "base_delay_seconds"),
    max_delay_seconds: requirePositiveInteger(record.max_delay_seconds, "max_delay_seconds"),
  });
}

function retryPolicyJson(policy: IntegrationRetryPolicy): JsonObject {
  return {
    max_attempts: policy.max_attempts,
    base_delay_seconds: policy.base_delay_seconds,
    max_delay_seconds: policy.max_delay_seconds,
  };
}

function requireAuthKind(value: unknown): ConnectorAuthKind {
  if (value !== "none" && value !== "api_key" && value !== "oauth2" && value !== "service_account") throw new Error("Invalid auth_kind");
  return value;
}

function requireStringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) throw new Error(`Invalid ${field}`);
  const output = value.map((item, index) => requireText(item, `${field}[${index}]`, maxLength).toLowerCase());
  if (new Set(output).size !== output.length) throw new Error(`Duplicate ${field}`);
  return output;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}
