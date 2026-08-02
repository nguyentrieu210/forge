import type { DomainEvent } from "../../contracts/src/index.js";
import {
  assertAllowedWebhookTarget,
  buildWebhookEnvelope,
  decideDelivery,
  signWebhookBody,
  stableJsonStringify,
  validateWebhookSubscription,
  type DeliveryDecision,
  type WebhookDeliveryEnvelope,
  type WebhookSubscription,
} from "./index.js";

export interface ResolvedWebhookCredential {
  /** Optional HMAC signing material. Never return or log this value from executor results. */
  signing_secret?: string;
  /** Provider auth headers such as Authorization or x-api-key. */
  headers?: Readonly<Record<string, string>>;
}

export interface WebhookCredentialResolver {
  resolve(subscription: WebhookSubscription): Promise<ResolvedWebhookCredential>;
}

export interface WebhookTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface ExecuteWebhookInput {
  event: DomainEvent;
  subscription: WebhookSubscription;
  attempt: number;
  credential_resolver: WebhookCredentialResolver;
  transport: WebhookTransport;
  now?: Date;
}

export interface WebhookExecutionResult {
  envelope: WebhookDeliveryEnvelope;
  body: string;
  decision: DeliveryDecision;
  attempt: number;
  http_status?: number;
  transport_error?: boolean;
  retry_after_seconds?: number;
}

const PROTECTED_HEADERS = new Set([
  "content-type",
  "content-length",
  "host",
  "cookie",
  "x-cloudforge-delivery-id",
  "x-cloudforge-event-id",
  "x-cloudforge-event-type",
  "x-cloudforge-idempotency-key",
  "x-cloudforge-signature-256",
]);
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export async function executeWebhookDelivery(input: ExecuteWebhookInput): Promise<WebhookExecutionResult> {
  const { event, subscription, attempt, credential_resolver: resolver, transport } = input;
  validateWebhookSubscription(subscription);
  assertAllowedWebhookTarget(subscription.target_url, subscription.allowed_hosts);
  if (!Number.isSafeInteger(attempt) || attempt <= 0) throw new Error("Invalid delivery attempt");

  const envelope = await buildWebhookEnvelope(event, subscription);
  const body = stableJsonStringify(envelope);
  const credential = await resolver.resolve(subscription);
  const headers = await buildExecutionHeaders(envelope, body, credential);

  if (subscription.auth_kind !== "none" && !hasProviderAuthentication(headers)) {
    throw new Error("Authenticated connector resolved no provider authentication material");
  }

  try {
    const response = await transport.fetch(subscription.target_url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
    });

    // Never follow redirects. Following a provider-controlled redirect would let a
    // previously allowlisted hostname escape the outbound target policy.
    if (response.status >= 300 && response.status < 400) {
      return {
        envelope,
        body,
        attempt,
        http_status: response.status,
        decision: { action: "dead_letter", retry_after_seconds: null, reason: `redirect_blocked_${response.status}` },
      };
    }

    const retryAfter = parseRetryAfterSeconds(response.headers.get("retry-after"), input.now ?? new Date());
    const decision = decideDelivery({
      attempt,
      http_status: response.status,
      ...(retryAfter === undefined ? {} : { retry_after_seconds: retryAfter }),
    }, subscription.retry_policy);
    return {
      envelope,
      body,
      attempt,
      http_status: response.status,
      ...(retryAfter === undefined ? {} : { retry_after_seconds: retryAfter }),
      decision,
    };
  } catch {
    return {
      envelope,
      body,
      attempt,
      transport_error: true,
      decision: decideDelivery({ attempt, transport_error: true }, subscription.retry_policy),
    };
  }
}

export async function buildExecutionHeaders(
  envelope: WebhookDeliveryEnvelope,
  body: string,
  credential: ResolvedWebhookCredential,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "x-cloudforge-delivery-id": envelope.delivery_id,
    "x-cloudforge-event-id": envelope.event_id,
    "x-cloudforge-event-type": envelope.event_type,
    "x-cloudforge-idempotency-key": envelope.delivery_id,
  };

  for (const [rawName, rawValue] of Object.entries(credential.headers ?? {})) {
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim();
    if (!HEADER_NAME_RE.test(name) || !value || value.length > 8_192) throw new Error("Invalid connector credential header");
    if (PROTECTED_HEADERS.has(name) || name.startsWith("x-cloudforge-")) {
      throw new Error(`Connector credential cannot override protected header: ${name}`);
    }
    if (value.includes("\r") || value.includes("\n")) throw new Error("Connector credential header contains a newline");
    headers[name] = value;
  }

  if (credential.signing_secret !== undefined) {
    headers["x-cloudforge-signature-256"] = await signWebhookBody(body, credential.signing_secret);
  }
  return headers;
}

export function parseRetryAfterSeconds(value: string | null, now = new Date()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400 ? seconds : undefined;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  const seconds = Math.ceil((timestamp - now.getTime()) / 1_000);
  return seconds > 0 && seconds <= 86_400 ? seconds : undefined;
}

function hasProviderAuthentication(headers: Readonly<Record<string, string>>): boolean {
  return Object.keys(headers).some((name) => {
    const normalized = name.toLowerCase();
    return normalized === "authorization" || normalized === "x-api-key" || normalized === "api-key" || normalized.endsWith("-api-key");
  });
}
