import type { CanonicalDocument, DomainEvent, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { D1MutationStore } from "../../document-kernel/src/index.js";
import {
  selectWebhookSubscriptions,
  validateWebhookSubscription,
  type ConnectorAuthKind,
  type IntegrationMappingRule,
  type IntegrationStatus,
  type WebhookSubscription,
} from "./index.js";

export interface SubscriptionDocumentReader {
  listDocumentsByDoctype<T extends JsonObject>(tenantId: string, doctype: string): Promise<Array<CanonicalDocument<T>>>;
}

export class IntegrationSubscriptionService {
  constructor(private readonly reader: SubscriptionDocumentReader) {}

  async listActive(tenantId: string): Promise<WebhookSubscription[]> {
    assertTenant(tenantId);
    const documents = await this.reader.listDocumentsByDoctype<JsonObject>(tenantId, "Integration Subscription");
    const subscriptions: WebhookSubscription[] = [];
    for (const document of documents) {
      if (document.tenant_id !== tenantId || document.doctype !== "Integration Subscription") {
        throw new Error("Integration Subscription reader returned cross-scope document");
      }
      const subscription = subscriptionFromDocument(document);
      if (subscription.status === "active") subscriptions.push(subscription);
    }
    return subscriptions;
  }

  async subscriptionsForEvent(event: DomainEvent): Promise<WebhookSubscription[]> {
    assertTenant(event.tenant_id);
    return selectWebhookSubscriptions(event, await this.listActive(event.tenant_id));
  }
}

export class D1IntegrationSubscriptionService extends IntegrationSubscriptionService {
  constructor(db: D1Database) {
    super(new D1MutationStore(db));
  }
}

export function subscriptionFromDocument(document: CanonicalDocument<JsonObject>): WebhookSubscription {
  const data = document.data;
  const status = requireEnum(data.status, ["draft", "active", "disabled", "error"] as const, "status");
  const authKind = requireEnum(data.auth_kind, ["none", "api_key", "oauth2", "service_account"] as const, "auth_kind");
  const subscription: WebhookSubscription = {
    subscription_id: document.name,
    tenant_id: document.tenant_id,
    event_pattern: requireText(data.event_pattern, "event_pattern", 160),
    target_url: requireText(data.target_url, "target_url", 2_048),
    status: status as IntegrationStatus,
    auth_kind: authKind as ConnectorAuthKind,
    allowed_hosts: requireStringArray(data.allowed_hosts, "allowed_hosts", 64, 253),
    ...(data.secret_ref === undefined || data.secret_ref === null || data.secret_ref === ""
      ? {}
      : { secret_ref: requireText(data.secret_ref, "secret_ref", 320) }),
    ...(data.mapping === undefined || data.mapping === null
      ? {}
      : { mapping: requireMapping(data.mapping) }),
    retry_policy: {
      ...optionalPositiveInteger("max_attempts", data.max_attempts),
      ...optionalPositiveInteger("base_delay_seconds", data.base_delay_seconds),
      ...optionalPositiveInteger("max_delay_seconds", data.max_delay_seconds),
    },
  };
  return validateWebhookSubscription(subscription);
}

function requireMapping(value: JsonValue): IntegrationMappingRule[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Invalid Integration Subscription mapping");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Invalid mapping[${index}]`);
    const source = requireText(item.source, `mapping[${index}].source`, 128);
    const target = requireText(item.target, `mapping[${index}].target`, 128);
    if (item.required !== undefined && typeof item.required !== "boolean") throw new Error(`Invalid mapping[${index}].required`);
    return { source, target, ...(item.required === undefined ? {} : { required: item.required }) };
  });
}

function requireStringArray(value: JsonValue | undefined, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) throw new Error(`Invalid ${field}`);
  const result = value.map((item, index) => requireText(item, `${field}[${index}]`, maxLength).toLowerCase());
  if (new Set(result).size !== result.length) throw new Error(`Duplicate ${field}`);
  return result;
}

function optionalPositiveInteger<K extends "max_attempts" | "base_delay_seconds" | "max_delay_seconds">(
  key: K,
  value: JsonValue | undefined,
): Partial<Record<K, number>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${key}`);
  return { [key]: value } as Partial<Record<K, number>>;
}

function requireText(value: JsonValue | undefined, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}

function requireEnum<const T extends readonly string[]>(value: JsonValue | undefined, allowed: T, field: string): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`Invalid ${field}`);
  return value as T[number];
}

function assertTenant(value: string): void {
  if (!value || value.length > 128 || /[\r\n\0]/.test(value)) throw new Error("Invalid tenant_id");
}
