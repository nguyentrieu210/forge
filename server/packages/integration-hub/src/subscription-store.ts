import type { CanonicalDocument, DomainEvent, JsonObject, JsonValue } from "../../contracts/src/index.js";
import {
  selectWebhookSubscriptions,
  validateWebhookSubscription,
  type ConnectorAuthKind,
  type IntegrationMappingRule,
  type IntegrationStatus,
  type WebhookSubscription,
} from "./index.js";

const ACTIVE_SUBSCRIPTION_SCAN_LIMIT = 5_000;

export interface ActiveSubscriptionDocumentReader {
  listActiveSubscriptionDocuments(tenantId: string): Promise<Array<CanonicalDocument<JsonObject>>>;
}

export class IntegrationSubscriptionService {
  constructor(private readonly reader: ActiveSubscriptionDocumentReader) {}

  async listActive(tenantId: string): Promise<WebhookSubscription[]> {
    assertTenant(tenantId);
    const documents = await this.reader.listActiveSubscriptionDocuments(tenantId);
    if (documents.length > ACTIVE_SUBSCRIPTION_SCAN_LIMIT) {
      throw new Error("Integration Subscription active scan exceeds safe bound");
    }
    const subscriptions: WebhookSubscription[] = [];
    for (const document of documents) {
      if (document.tenant_id !== tenantId || document.doctype !== "Integration Subscription" || document.status !== "active") {
        throw new Error("Integration Subscription reader returned cross-scope or inactive document");
      }
      if (document.docstatus !== 0) throw new Error("Integration Subscription reader returned invalid docstatus");
      const subscription = subscriptionFromDocument(document);
      if (subscription.status !== "active") throw new Error("Integration Subscription document status mismatch");
      subscriptions.push(subscription);
    }
    return subscriptions;
  }

  async subscriptionsForEvent(event: DomainEvent): Promise<WebhookSubscription[]> {
    assertTenant(event.tenant_id);
    return selectWebhookSubscriptions(event, await this.listActive(event.tenant_id));
  }
}

interface SubscriptionRow {
  tenant_id: string;
  doctype: string;
  name: string;
  owner: string;
  docstatus: number;
  status: string;
  version: number;
  created_at: string;
  modified_at: string;
  modified_by: string | null;
  amended_from: string | null;
  payload_json: string;
}

class D1ActiveSubscriptionDocumentReader implements ActiveSubscriptionDocumentReader {
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async listActiveSubscriptionDocuments(tenantId: string): Promise<Array<CanonicalDocument<JsonObject>>> {
    assertTenant(tenantId);
    const rows = await this.reader.prepare(
      `SELECT tenant_id, doctype, name, owner, docstatus, status, version, created_at, modified_at,
              modified_by, amended_from, payload_json
       FROM documents
       WHERE tenant_id=?1 AND doctype='Integration Subscription' AND status='active'
       ORDER BY name LIMIT ?2`,
    ).bind(tenantId, ACTIVE_SUBSCRIPTION_SCAN_LIMIT + 1).all<SubscriptionRow>();
    const results = rows.results ?? [];
    if (results.length > ACTIVE_SUBSCRIPTION_SCAN_LIMIT) {
      throw new Error("Integration Subscription active scan exceeds safe bound; add a narrower indexed dispatch reader");
    }
    return results.map((row): CanonicalDocument<JsonObject> => ({
      tenant_id: row.tenant_id,
      doctype: row.doctype,
      name: row.name,
      owner: row.owner,
      docstatus: requireDocStatus(row.docstatus),
      status: row.status,
      version: row.version,
      created_at: row.created_at,
      modified_at: row.modified_at,
      ...(row.modified_by ? { modified_by: row.modified_by } : {}),
      ...(row.amended_from ? { amended_from: row.amended_from } : {}),
      data: parsePayload(row.payload_json),
      children: [],
    }));
  }
}

export class D1IntegrationSubscriptionService extends IntegrationSubscriptionService {
  constructor(db: D1Database) {
    super(new D1ActiveSubscriptionDocumentReader(db));
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
    ...(data.mapping === undefined || data.mapping === null || data.mapping === ""
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

function parsePayload(value: string): JsonObject {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new Error("Integration Subscription payload is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Integration Subscription payload is invalid");
  return parsed as JsonObject;
}

function requireMapping(value: JsonValue): IntegrationMappingRule[] {
  const parsed = parseStructuredJson(value, "mapping");
  if (!Array.isArray(parsed) || parsed.length > 128) throw new Error("Invalid Integration Subscription mapping");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Invalid mapping[${index}]`);
    const record = item as JsonObject;
    const source = requireText(record.source, `mapping[${index}].source`, 128);
    const target = requireText(record.target, `mapping[${index}].target`, 128);
    if (record.required !== undefined && typeof record.required !== "boolean") throw new Error(`Invalid mapping[${index}].required`);
    return { source, target, ...(record.required === undefined ? {} : { required: record.required }) };
  });
}

function requireStringArray(value: JsonValue | undefined, field: string, maxItems: number, maxLength: number): string[] {
  const parsed = parseStructuredJson(value, field);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > maxItems) throw new Error(`Invalid ${field}`);
  const result = parsed.map((item, index) => requireText(item, `${field}[${index}]`, maxLength).toLowerCase());
  if (new Set(result).size !== result.length) throw new Error(`Duplicate ${field}`);
  return result;
}

function parseStructuredJson(value: JsonValue | undefined, field: string): JsonValue | undefined {
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) throw new Error(`Invalid ${field}`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { throw new Error(`Invalid ${field} JSON`); }
  if (!isJsonValue(parsed)) throw new Error(`Invalid ${field} JSON value`);
  return parsed;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((item) => item === undefined || isJsonValue(item));
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

function requireDocStatus(value: number): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) throw new Error("Integration Subscription row has invalid docstatus");
  return value;
}

function assertTenant(value: string): void {
  if (!value || value.length > 128 || /[\r\n\0]/.test(value)) throw new Error("Invalid tenant_id");
}
