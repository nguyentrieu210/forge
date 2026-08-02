import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { assertSubscriptionStatusTransition, type SubscriptionStatusChange } from "./api-contract.js";
import { validateWebhookSubscription, type ConnectorAuthKind, type IntegrationStatus } from "./index.js";

type IntegrationMappingRuleData = JsonObject & {
  source: string;
  target: string;
  required?: boolean;
};

interface IntegrationSubscriptionData extends JsonObject {
  event_pattern: string;
  target_url: string;
  auth_kind: ConnectorAuthKind;
  secret_ref?: string;
  allowed_hosts: string[];
  mapping?: IntegrationMappingRuleData[];
  max_attempts?: number;
  base_delay_seconds?: number;
  max_delay_seconds?: number;
  status: IntegrationStatus;
  status_reason?: string;
}

const STATUS_VALUES = new Set<IntegrationStatus>(["draft", "active", "disabled", "error"]);
const CONFIG_FIELDS = ["event_pattern", "target_url", "auth_kind", "secret_ref", "allowed_hosts", "mapping", "max_attempts", "base_delay_seconds", "max_delay_seconds"] as const;

export class IntegrationSubscriptionController implements DocumentController<IntegrationSubscriptionData> {
  readonly doctype = "Integration Subscription";

  buildPlan(context: ControllerContext<IntegrationSubscriptionData>): MutationPlan<IntegrationSubscriptionData> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("Integration Subscription is lifecycle-managed, not submittable");
    }
    const existing = context.existing as CanonicalDocument<IntegrationSubscriptionData> | null;
    const input = context.command.document;
    const data = normalizeSubscriptionData(context, existing, input);
    const statusChanged = existing !== null && existing.data.status !== data.status;
    const eventType = context.command.action === "create"
      ? "integration_subscription.created"
      : statusChanged
        ? `integration_subscription.${data.status}`
        : "integration_subscription.updated";
    const document: CanonicalDocument<IntegrationSubscriptionData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: existing?.owner ?? context.command.actor.user_id,
      docstatus: 0,
      status: data.status,
      version: context.nextVersion,
      created_at: existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: [],
    };
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      events: [domainEvent({
        type: eventType,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: {
          action: context.command.action,
          status: data.status,
          ...(statusChanged && data.status_reason ? { reason: data.status_reason } : {}),
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        status: data.status,
      },
    };
  }
}

function normalizeSubscriptionData(
  context: ControllerContext<IntegrationSubscriptionData>,
  existing: CanonicalDocument<IntegrationSubscriptionData> | null,
  input: IntegrationSubscriptionData,
): IntegrationSubscriptionData {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.validation("Integration Subscription document is invalid");
  const status = normalizeStatus(input.status ?? existing?.data.status ?? "draft");
  if (!existing && status !== "draft") throw errors.validation("Integration Subscription must be created as draft");

  if (existing && existing.data.status === "active" && configChanged(existing.data, input)) {
    throw errors.validation("Disable Integration Subscription before changing target, auth, mapping or retry policy");
  }

  const reason = optionalText(input.status_reason, "status_reason", 1_000);
  if (existing && existing.data.status !== status) {
    if (!reason) throw errors.validation("status_reason is required for Integration Subscription status changes");
    const change: SubscriptionStatusChange = {
      schema_version: 1,
      subscription_id: context.command.aggregate.name,
      expected_status: existing.data.status,
      next_status: status,
      reason,
    };
    try { assertSubscriptionStatusTransition(existing.data.status, change); }
    catch (error) { throw errors.validation(error instanceof Error ? error.message : "Invalid Integration Subscription status transition"); }
  }

  const data: IntegrationSubscriptionData = {
    event_pattern: requireText(input.event_pattern ?? existing?.data.event_pattern, "event_pattern", 160),
    target_url: requireText(input.target_url ?? existing?.data.target_url, "target_url", 2_048),
    auth_kind: normalizeAuth(input.auth_kind ?? existing?.data.auth_kind),
    allowed_hosts: normalizeStringArray(input.allowed_hosts ?? existing?.data.allowed_hosts, "allowed_hosts", 64, 253),
    status,
    ...(input.secret_ref !== undefined || existing?.data.secret_ref !== undefined
      ? { secret_ref: requireText(input.secret_ref ?? existing?.data.secret_ref, "secret_ref", 320) }
      : {}),
    ...(input.mapping !== undefined || existing?.data.mapping !== undefined
      ? { mapping: normalizeMapping(input.mapping ?? existing?.data.mapping) }
      : {}),
    ...optionalPositiveInt("max_attempts", input.max_attempts ?? existing?.data.max_attempts),
    ...optionalPositiveInt("base_delay_seconds", input.base_delay_seconds ?? existing?.data.base_delay_seconds),
    ...optionalPositiveInt("max_delay_seconds", input.max_delay_seconds ?? existing?.data.max_delay_seconds),
    ...(reason ? { status_reason: reason } : existing?.data.status_reason ? { status_reason: existing.data.status_reason } : {}),
  };

  try {
    validateWebhookSubscription({
      subscription_id: context.command.aggregate.name,
      tenant_id: context.command.tenant_id,
      event_pattern: data.event_pattern,
      target_url: data.target_url,
      status: data.status,
      auth_kind: data.auth_kind,
      allowed_hosts: data.allowed_hosts,
      ...(data.secret_ref ? { secret_ref: data.secret_ref } : {}),
      ...(data.mapping ? { mapping: data.mapping } : {}),
      retry_policy: {
        ...(data.max_attempts === undefined ? {} : { max_attempts: data.max_attempts }),
        ...(data.base_delay_seconds === undefined ? {} : { base_delay_seconds: data.base_delay_seconds }),
        ...(data.max_delay_seconds === undefined ? {} : { max_delay_seconds: data.max_delay_seconds }),
      },
    });
  } catch (error) {
    throw errors.validation(error instanceof Error ? error.message : "Invalid Integration Subscription");
  }
  return data;
}

function configChanged(existing: IntegrationSubscriptionData, input: IntegrationSubscriptionData): boolean {
  for (const field of CONFIG_FIELDS) {
    if (input[field] !== undefined && JSON.stringify(input[field]) !== JSON.stringify(existing[field])) return true;
  }
  return false;
}

function normalizeStatus(value: unknown): IntegrationStatus {
  if (typeof value !== "string" || !STATUS_VALUES.has(value as IntegrationStatus)) throw errors.validation("Invalid Integration Subscription status");
  return value as IntegrationStatus;
}

function normalizeAuth(value: unknown): ConnectorAuthKind {
  if (value !== "none" && value !== "api_key" && value !== "oauth2" && value !== "service_account") throw errors.validation("Invalid Integration Subscription auth_kind");
  return value;
}

function normalizeStringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) throw errors.validation(`${field} must be a non-empty array`);
  const normalized = value.map((item, index) => requireText(item, `${field}[${index}]`, maxLength).toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw errors.validation(`${field} contains duplicates`);
  return normalized;
}

function normalizeMapping(value: unknown): IntegrationMappingRuleData[] {
  if (!Array.isArray(value) || value.length > 128) throw errors.validation("mapping must be an array with at most 128 rules");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw errors.validation(`mapping[${index}] is invalid`);
    const record = item as Record<string, unknown>;
    const source = requireText(record.source, `mapping[${index}].source`, 128);
    const target = requireText(record.target, `mapping[${index}].target`, 128);
    if (record.required !== undefined && typeof record.required !== "boolean") throw errors.validation(`mapping[${index}].required is invalid`);
    return { source, target, ...(record.required === undefined ? {} : { required: record.required }) } as IntegrationMappingRuleData;
  });
}

function optionalPositiveInt<K extends "max_attempts" | "base_delay_seconds" | "max_delay_seconds">(key: K, value: unknown): Partial<Record<K, number>> {
  if (value === undefined) return {};
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw errors.validation(`${key} must be a positive integer`);
  return { [key]: value as number } as Partial<Record<K, number>>;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, field, max);
}
