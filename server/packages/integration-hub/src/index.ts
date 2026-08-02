import type { DomainEvent, JsonObject, JsonValue } from "../../contracts/src/index.js";

export type ConnectorAuthKind = "none" | "api_key" | "oauth2" | "service_account";
export type IntegrationStatus = "draft" | "active" | "disabled" | "error";
export type DeliveryAction = "delivered" | "retry" | "dead_letter";

export interface IntegrationRetryPolicy {
  max_attempts: number;
  base_delay_seconds: number;
  max_delay_seconds: number;
}

export interface IntegrationMappingRule {
  source: string;
  target: string;
  required?: boolean;
}

export interface WebhookSubscription {
  subscription_id: string;
  tenant_id: string;
  event_pattern: string;
  target_url: string;
  status: IntegrationStatus;
  auth_kind: ConnectorAuthKind;
  /** Reference only. The secret value must live behind the WS11 credential boundary. */
  secret_ref?: string;
  allowed_hosts: readonly string[];
  mapping?: readonly IntegrationMappingRule[];
  retry_policy?: Partial<IntegrationRetryPolicy>;
}

export interface WebhookDeliveryEnvelope extends JsonObject {
  schema_version: 1;
  delivery_id: string;
  subscription_id: string;
  event_id: string;
  event_type: string;
  tenant_id: string;
  occurred_at: string;
  aggregate: JsonObject;
  aggregate_version: number;
  data: JsonObject;
}

export interface DeliveryDecision {
  action: DeliveryAction;
  retry_after_seconds: number | null;
  reason: string;
}

export interface DeliveryAttemptResult {
  attempt: number;
  http_status?: number;
  transport_error?: boolean;
  retry_after_seconds?: number;
}

export const DEFAULT_RETRY_POLICY: Readonly<IntegrationRetryPolicy> = Object.freeze({
  max_attempts: 8,
  base_delay_seconds: 2,
  max_delay_seconds: 300,
});

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const BLOCKED_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export function normalizeRetryPolicy(input: Partial<IntegrationRetryPolicy> = {}): IntegrationRetryPolicy {
  const maxAttempts = positiveInteger(input.max_attempts ?? DEFAULT_RETRY_POLICY.max_attempts, "max_attempts", 32);
  const baseDelay = positiveInteger(input.base_delay_seconds ?? DEFAULT_RETRY_POLICY.base_delay_seconds, "base_delay_seconds", 86_400);
  const maxDelay = positiveInteger(input.max_delay_seconds ?? DEFAULT_RETRY_POLICY.max_delay_seconds, "max_delay_seconds", 86_400);
  if (maxDelay < baseDelay) throw new Error("max_delay_seconds must be >= base_delay_seconds");
  return { max_attempts: maxAttempts, base_delay_seconds: baseDelay, max_delay_seconds: maxDelay };
}

export function validateWebhookSubscription(subscription: WebhookSubscription): WebhookSubscription {
  if (!subscription.subscription_id || subscription.subscription_id.length > 160) throw new Error("Invalid subscription_id");
  if (!subscription.tenant_id || subscription.tenant_id.length > 128) throw new Error("Invalid tenant_id");
  validateEventPattern(subscription.event_pattern);
  assertAllowedWebhookTarget(subscription.target_url, subscription.allowed_hosts);
  normalizeRetryPolicy(subscription.retry_policy);
  if (subscription.auth_kind !== "none" && !subscription.secret_ref) {
    throw new Error("Authenticated connector requires secret_ref");
  }
  if (subscription.secret_ref && subscription.secret_ref.length > 320) throw new Error("Invalid secret_ref");
  if ((subscription.mapping?.length ?? 0) > 128) throw new Error("Too many mapping rules");
  for (const rule of subscription.mapping ?? []) validateMappingRule(rule);
  return subscription;
}

export function assertAllowedWebhookTarget(target: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("Invalid webhook URL");
  }
  if (url.protocol !== "https:") throw new Error("Webhook target must use HTTPS");
  if (url.username || url.password) throw new Error("Webhook target must not contain credentials");
  if (url.hash) throw new Error("Webhook target must not contain a fragment");
  if (!url.hostname || isLocalOrPrivateHost(url.hostname)) throw new Error("Webhook target host is not allowed");
  const normalized = new Set(allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (normalized.size === 0 || !normalized.has(url.hostname.toLowerCase())) throw new Error("Webhook target is outside the outbound allowlist");
  return url;
}

export function matchesEventPattern(pattern: string, eventType: string): boolean {
  validateEventPattern(pattern);
  if (!eventType || eventType.length > 160) return false;
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
  return pattern === eventType;
}

export function selectWebhookSubscriptions(event: DomainEvent, subscriptions: readonly WebhookSubscription[]): WebhookSubscription[] {
  return subscriptions.filter((subscription) => subscription.status === "active"
    && subscription.tenant_id === event.tenant_id
    && matchesEventPattern(subscription.event_pattern, event.event_type))
    .map(validateWebhookSubscription);
}

export async function buildWebhookEnvelope(event: DomainEvent, subscription: WebhookSubscription): Promise<WebhookDeliveryEnvelope> {
  validateWebhookSubscription(subscription);
  if (event.tenant_id !== subscription.tenant_id) throw new Error("Subscription tenant mismatch");
  if (!matchesEventPattern(subscription.event_pattern, event.event_type)) throw new Error("Subscription does not match event");
  const deliveryId = await deriveDeliveryId(subscription.subscription_id, event.event_id);
  const mapped = subscription.mapping?.length ? mapIntegrationPayload(event, subscription.mapping) : cloneJsonObject(event.payload);
  return {
    schema_version: 1,
    delivery_id: deliveryId,
    subscription_id: subscription.subscription_id,
    event_id: event.event_id,
    event_type: event.event_type,
    tenant_id: event.tenant_id,
    occurred_at: event.occurred_at,
    aggregate: { doctype: event.aggregate.doctype, name: event.aggregate.name },
    aggregate_version: event.aggregate_version,
    data: mapped,
  };
}

export function mapIntegrationPayload(event: DomainEvent, rules: readonly IntegrationMappingRule[]): JsonObject {
  if (rules.length > 128) throw new Error("Too many mapping rules");
  const root: JsonObject = {
    event_id: event.event_id,
    event_type: event.event_type,
    tenant_id: event.tenant_id,
    command_id: event.command_id,
    actor: event.actor,
    occurred_at: event.occurred_at,
    schema_version: event.schema_version,
    aggregate_version: event.aggregate_version,
    aggregate: { doctype: event.aggregate.doctype, name: event.aggregate.name },
    payload: event.payload,
  };
  const output: JsonObject = {};
  for (const rule of rules) {
    validateMappingRule(rule);
    const value = readJsonPath(root, rule.source);
    if (value === undefined) {
      if (rule.required) throw new Error(`Required mapping source is missing: ${rule.source}`);
      continue;
    }
    writeJsonPath(output, rule.target, cloneJsonValue(value));
  }
  return output;
}

export function computeRetryDelaySeconds(attempt: number, policyInput: Partial<IntegrationRetryPolicy> = {}): number {
  const policy = normalizeRetryPolicy(policyInput);
  const normalizedAttempt = positiveInteger(attempt, "attempt", policy.max_attempts);
  const exponent = Math.max(0, normalizedAttempt - 1);
  return Math.min(policy.max_delay_seconds, policy.base_delay_seconds * (2 ** exponent));
}

export function decideDelivery(result: DeliveryAttemptResult, policyInput: Partial<IntegrationRetryPolicy> = {}): DeliveryDecision {
  const policy = normalizeRetryPolicy(policyInput);
  const attempt = positiveInteger(result.attempt, "attempt", 10_000);
  const status = result.http_status;
  if (!result.transport_error && status !== undefined && status >= 200 && status < 300) {
    return { action: "delivered", retry_after_seconds: null, reason: "accepted" };
  }

  const retryable = result.transport_error === true || status === undefined || status === 408 || status === 425 || status === 429 || status >= 500;
  if (!retryable) return { action: "dead_letter", retry_after_seconds: null, reason: `permanent_http_${status}` };
  if (attempt >= policy.max_attempts) return { action: "dead_letter", retry_after_seconds: null, reason: "attempt_limit_exhausted" };

  const computed = computeRetryDelaySeconds(attempt, policy);
  const requested = result.retry_after_seconds;
  const retryAfter = requested === undefined
    ? computed
    : Math.min(policy.max_delay_seconds, Math.max(computed, positiveInteger(requested, "retry_after_seconds", 86_400)));
  return { action: "retry", retry_after_seconds: retryAfter, reason: result.transport_error ? "transport_error" : `retryable_http_${status ?? "unknown"}` };
}

export async function deriveDeliveryId(subscriptionId: string, eventId: string): Promise<string> {
  if (!subscriptionId || !eventId) throw new Error("Delivery identity requires subscription and event ids");
  return `dlv_${(await sha256Hex(`${subscriptionId}\n${eventId}`)).slice(0, 40)}`;
}

export function stableJsonStringify(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  const parts: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${stableJsonStringify(item)}`);
  }
  return `{${parts.join(",")}}`;
}

export async function signWebhookBody(body: string, secret: string): Promise<string> {
  if (!secret || secret.length < 16) throw new Error("Webhook signing secret is too short");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${hex(new Uint8Array(signature))}`;
}

export async function buildWebhookHeaders(envelope: WebhookDeliveryEnvelope, secret: string): Promise<Record<string, string>> {
  const body = stableJsonStringify(envelope);
  return {
    "content-type": "application/json; charset=utf-8",
    "x-cloudforge-delivery-id": envelope.delivery_id,
    "x-cloudforge-event-id": envelope.event_id,
    "x-cloudforge-event-type": envelope.event_type,
    "x-cloudforge-idempotency-key": envelope.delivery_id,
    "x-cloudforge-signature-256": await signWebhookBody(body, secret),
  };
}

function validateEventPattern(pattern: string): void {
  if (!pattern || pattern.length > 160) throw new Error("Invalid event pattern");
  if (pattern === "*") return;
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*)?$/.test(pattern)) throw new Error("Invalid event pattern");
  if (pattern.includes("*") && !pattern.endsWith(".*")) throw new Error("Wildcard is only allowed as a trailing segment");
}

function validateMappingRule(rule: IntegrationMappingRule): void {
  if (!rule.source || !rule.target || !SAFE_KEY.test(rule.source) || !SAFE_KEY.test(rule.target)) throw new Error("Invalid mapping rule");
  for (const segment of [...rule.source.split("."), ...rule.target.split(".")]) {
    if (BLOCKED_PATH_SEGMENTS.has(segment)) throw new Error("Unsafe mapping path");
  }
}

function readJsonPath(root: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const segment of path.split(".")) {
    if (BLOCKED_PATH_SEGMENTS.has(segment)) throw new Error("Unsafe mapping path");
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function writeJsonPath(root: JsonObject, path: string, value: JsonValue): void {
  const segments = path.split(".");
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment || BLOCKED_PATH_SEGMENTS.has(segment)) throw new Error("Unsafe mapping path");
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    const existing = current[segment];
    if (existing === undefined) {
      const next: JsonObject = {};
      current[segment] = next;
      current = next;
      continue;
    }
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error("Mapping target collides with a scalar value");
    current = existing;
  }
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a = 0, b = 0] = octets;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function positiveInteger(value: number, field: string, max: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > max) throw new Error(`${field} must be a positive integer <= ${max}`);
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
  return hex(new Uint8Array(digest));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
