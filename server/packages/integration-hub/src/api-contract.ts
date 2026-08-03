import type { Actor, JsonObject } from "../../contracts/src/index.js";
import {
  validateWebhookSubscription,
  type ConnectorAuthKind,
  type IntegrationMappingRule,
  type IntegrationRetryPolicy,
  type IntegrationStatus,
  type WebhookSubscription,
} from "./index.js";

export type IntegrationHubAction = "read" | "manage" | "replay";

export interface ReplayDeliveryInput {
  schema_version: 1;
  delivery_id: string;
  reason: string;
}

export interface SubscriptionStatusChange {
  schema_version: 1;
  subscription_id: string;
  expected_status: IntegrationStatus;
  next_status: IntegrationStatus;
  reason: string;
}

const MANAGER_ROLES = new Set(["System Manager", "Integration Admin"]);
const CREATE_KEYS = new Set([
  "schema_version", "subscription_id", "event_pattern", "target_url", "auth_kind", "secret_ref", "allowed_hosts", "mapping", "retry_policy",
]);
const REPLAY_KEYS = new Set(["schema_version", "delivery_id", "reason"]);
const STATUS_KEYS = new Set(["schema_version", "subscription_id", "expected_status", "next_status", "reason"]);
const STATUS_VALUES = new Set<IntegrationStatus>(["draft", "active", "disabled", "error"]);
const AUTH_VALUES = new Set<ConnectorAuthKind>(["none", "api_key", "oauth2", "service_account"]);

export function assertIntegrationHubPermission(actor: Actor, _action: IntegrationHubAction): void {
  if (!actor.user_id || !actor.roles.some((role) => MANAGER_ROLES.has(role))) {
    throw new Error("Integration Hub permission denied");
  }
}

export function parseCreateWebhookSubscription(value: unknown, trustedTenantId: string): WebhookSubscription {
  assertTenant(trustedTenantId);
  const input = strictObject(value, CREATE_KEYS, "webhook subscription");
  requireSchemaVersion(input.schema_version);
  const authKind = requireEnum(input.auth_kind, AUTH_VALUES, "auth_kind");
  const subscription: WebhookSubscription = {
    subscription_id: requireText(input.subscription_id, "subscription_id", 160),
    tenant_id: trustedTenantId,
    event_pattern: requireText(input.event_pattern, "event_pattern", 160),
    target_url: requireText(input.target_url, "target_url", 2_048),
    // Network side effects require a separate explicit status transition after creation.
    status: "draft",
    auth_kind: authKind,
    allowed_hosts: requireStringArray(input.allowed_hosts, "allowed_hosts", 64, 253),
    ...(input.secret_ref === undefined ? {} : { secret_ref: requireText(input.secret_ref, "secret_ref", 320) }),
    ...(input.mapping === undefined ? {} : { mapping: parseMapping(input.mapping) }),
    ...(input.retry_policy === undefined ? {} : { retry_policy: parseRetryPolicy(input.retry_policy) }),
  };
  return validateWebhookSubscription(subscription);
}

export function parseReplayDelivery(value: unknown): ReplayDeliveryInput {
  const input = strictObject(value, REPLAY_KEYS, "delivery replay");
  requireSchemaVersion(input.schema_version);
  return {
    schema_version: 1,
    delivery_id: requireText(input.delivery_id, "delivery_id", 160),
    reason: requireText(input.reason, "reason", 1_000),
  };
}

export function parseSubscriptionStatusChange(value: unknown): SubscriptionStatusChange {
  const input = strictObject(value, STATUS_KEYS, "subscription status change");
  requireSchemaVersion(input.schema_version);
  const expected = requireEnum(input.expected_status, STATUS_VALUES, "expected_status");
  const next = requireEnum(input.next_status, STATUS_VALUES, "next_status");
  assertStatusTransition(expected, next);
  return {
    schema_version: 1,
    subscription_id: requireText(input.subscription_id, "subscription_id", 160),
    expected_status: expected,
    next_status: next,
    reason: requireText(input.reason, "reason", 1_000),
  };
}

export function assertSubscriptionStatusTransition(current: IntegrationStatus, change: SubscriptionStatusChange): void {
  if (current !== change.expected_status) throw new Error("Subscription status changed concurrently");
  assertStatusTransition(change.expected_status, change.next_status);
}

function assertStatusTransition(current: IntegrationStatus, next: IntegrationStatus): void {
  if (current === next) throw new Error("Subscription status transition must change state");
  const allowed = current === "draft"
    ? new Set<IntegrationStatus>(["active", "disabled"])
    : current === "active"
      ? new Set<IntegrationStatus>(["disabled", "error"])
      : current === "disabled"
        ? new Set<IntegrationStatus>(["active"])
        : new Set<IntegrationStatus>(["disabled", "active"]);
  if (!allowed.has(next)) throw new Error(`Invalid subscription status transition: ${current} -> ${next}`);
}

function parseMapping(value: unknown): readonly IntegrationMappingRule[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Invalid mapping");
  return value.map((item, index) => {
    const object = strictObject(item, new Set(["source", "target", "required"]), `mapping[${index}]`);
    if (object.required !== undefined && typeof object.required !== "boolean") throw new Error(`Invalid mapping[${index}].required`);
    return {
      source: requireText(object.source, `mapping[${index}].source`, 128),
      target: requireText(object.target, `mapping[${index}].target`, 128),
      ...(object.required === undefined ? {} : { required: object.required }),
    };
  });
}

function parseRetryPolicy(value: unknown): Partial<IntegrationRetryPolicy> {
  const input = strictObject(value, new Set(["max_attempts", "base_delay_seconds", "max_delay_seconds"]), "retry_policy");
  return {
    ...(input.max_attempts === undefined ? {} : { max_attempts: requirePositiveInteger(input.max_attempts, "max_attempts") }),
    ...(input.base_delay_seconds === undefined ? {} : { base_delay_seconds: requirePositiveInteger(input.base_delay_seconds, "base_delay_seconds") }),
    ...(input.max_delay_seconds === undefined ? {} : { max_delay_seconds: requirePositiveInteger(input.max_delay_seconds, "max_delay_seconds") }),
  };
}

function strictObject(value: unknown, allowedKeys: ReadonlySet<string>, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${field}`);
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) if (!allowedKeys.has(key)) throw new Error(`Unsupported ${field} field: ${key}`);
  return object;
}

function requireSchemaVersion(value: unknown): void {
  if (value !== 1) throw new Error("Unsupported integration API schema_version");
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, field: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`Invalid ${field}`);
  return value as T;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}

function requireStringArray(value: unknown, field: string, maxItems: number, maxText: number): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) throw new Error(`Invalid ${field}`);
  const normalized = value.map((item, index) => requireText(item, `${field}[${index}]`, maxText));
  if (new Set(normalized.map((item) => item.toLowerCase())).size !== normalized.length) throw new Error(`Duplicate ${field}`);
  return normalized;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
}

function assertTenant(value: string): void {
  if (!value || value.length > 128 || /[\r\n\0]/.test(value)) throw new Error("Invalid trusted tenant");
}

export function integrationHubAuditContext(actor: Actor, tenantId: string, action: string): JsonObject {
  assertTenant(tenantId);
  if (!actor.user_id) throw new Error("Missing integration actor");
  return { actor_id: actor.user_id, tenant_id: tenantId, action: requireText(action, "audit action", 160) };
}
