import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import {
  assertConnectionConfigUpdateAllowed,
  validateConnectorConnection,
  type ConnectorConnection,
} from "./connection.js";
import type { ConnectorAuthKind, IntegrationStatus } from "./index.js";
import { marketplaceAdapter } from "./marketplace-runtime.js";

interface MarketplaceConnectionData extends JsonObject {
  connector_key: string;
  connector_version: string;
  auth_kind: ConnectorAuthKind;
  secret_ref: string;
  config: JsonObject;
  status: IntegrationStatus;
  status_reason?: string;
}

const STATUS_VALUES = new Set<IntegrationStatus>(["draft", "active", "disabled", "error"]);
const STATUS_TRANSITIONS: Readonly<Record<IntegrationStatus, ReadonlySet<IntegrationStatus>>> = {
  draft: new Set(["active", "disabled"]),
  active: new Set(["disabled", "error"]),
  disabled: new Set(["active"]),
  error: new Set(["active", "disabled"]),
};

/**
 * Canonical tenant-owned reference to one marketplace provider connection.
 *
 * Credential material never enters this document: only secret_ref crosses into WS11.
 * Connector config is non-secret and immutable while active, so a running sync cannot
 * silently switch shops, provider hosts or cursor semantics underneath the scheduler.
 */
export class MarketplaceConnectionController implements DocumentController<MarketplaceConnectionData> {
  readonly doctype = "Marketplace Connection";

  buildPlan(context: ControllerContext<MarketplaceConnectionData>): MutationPlan<MarketplaceConnectionData> {
    if (context.command.action === "submit" || context.command.action === "cancel") {
      throw errors.lifecycle("Marketplace Connection is lifecycle-managed, not submittable");
    }
    const existing = context.existing as CanonicalDocument<MarketplaceConnectionData> | null;
    const data = normalizeConnectionData(existing, context.command.document);
    const candidate = asConnection(context.command.tenant_id, context.command.aggregate.name, data);

    try {
      const adapter = marketplaceAdapter(candidate.connector_key, candidate.connector_version);
      validateConnectorConnection(candidate, adapter.manifest);
      if (existing) {
        assertConnectionConfigUpdateAllowed(
          asConnection(context.command.tenant_id, context.command.aggregate.name, existing.data),
          candidate,
        );
      }
    } catch (error) {
      throw errors.validation(error instanceof Error ? error.message : "Invalid marketplace connection");
    }

    const statusChanged = existing !== null && existing.data.status !== data.status;
    if (statusChanged) {
      if (!data.status_reason) throw errors.validation("status_reason is required for Marketplace Connection status changes");
      if (!STATUS_TRANSITIONS[existing.data.status].has(data.status)) {
        throw errors.validation(`Marketplace Connection cannot transition ${existing.data.status} -> ${data.status}`);
      }
    }

    const document: CanonicalDocument<MarketplaceConnectionData> = {
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
    const eventType = context.command.action === "create"
      ? "marketplace_connection.created"
      : statusChanged
        ? `marketplace_connection.${data.status}`
        : "marketplace_connection.updated";
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
          connector_key: data.connector_key,
          connector_version: data.connector_version,
          status: data.status,
          ...(statusChanged && data.status_reason ? { reason: data.status_reason } : {}),
        },
      })],
      result: {
        doctype: this.doctype,
        name: document.name,
        version: document.version,
        connector_key: data.connector_key,
        connector_version: data.connector_version,
        status: data.status,
      },
    };
  }
}

function normalizeConnectionData(
  existing: CanonicalDocument<MarketplaceConnectionData> | null,
  input: MarketplaceConnectionData,
): MarketplaceConnectionData {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw errors.validation("Marketplace Connection document is invalid");
  const status = normalizeStatus(input.status ?? existing?.data.status ?? "draft");
  if (!existing && status !== "draft") throw errors.validation("Marketplace Connection must be created as draft");
  const reason = optionalText(input.status_reason, "status_reason", 1_000);
  return {
    connector_key: requireText(input.connector_key ?? existing?.data.connector_key, "connector_key", 80),
    connector_version: requireText(input.connector_version ?? existing?.data.connector_version, "connector_version", 80),
    auth_kind: normalizeAuth(input.auth_kind ?? existing?.data.auth_kind ?? "oauth2"),
    secret_ref: requireText(input.secret_ref ?? existing?.data.secret_ref, "secret_ref", 320),
    config: normalizeConfig(input.config ?? existing?.data.config),
    status,
    ...(reason ? { status_reason: reason } : existing?.data.status_reason ? { status_reason: existing.data.status_reason } : {}),
  };
}

function asConnection(tenantId: string, connectionId: string, data: MarketplaceConnectionData): ConnectorConnection {
  return {
    schema_version: 1,
    connection_id: connectionId,
    tenant_id: tenantId,
    connector_key: data.connector_key,
    connector_version: data.connector_version,
    auth_kind: data.auth_kind,
    secret_ref: data.secret_ref,
    status: data.status,
    config: structuredClone(data.config),
  };
}

function normalizeConfig(value: unknown): JsonObject {
  let parsed = value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) throw errors.validation("config must be a non-empty JSON object");
    try { parsed = JSON.parse(raw) as unknown; }
    catch { throw errors.validation("config must be valid JSON"); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.validation("config must be a JSON object");
  return structuredClone(parsed as JsonObject);
}

function normalizeStatus(value: unknown): IntegrationStatus {
  if (typeof value !== "string" || !STATUS_VALUES.has(value as IntegrationStatus)) throw errors.validation("Invalid Marketplace Connection status");
  return value as IntegrationStatus;
}

function normalizeAuth(value: unknown): ConnectorAuthKind {
  if (value !== "none" && value !== "api_key" && value !== "oauth2" && value !== "service_account") {
    throw errors.validation("Invalid Marketplace Connection auth_kind");
  }
  return value;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireText(value, field, max);
}
