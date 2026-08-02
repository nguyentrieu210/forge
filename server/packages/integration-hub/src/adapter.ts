import type { JsonObject } from "../../contracts/src/index.js";
import type { ConnectorManifest } from "./catalog.js";
import { validateConnectorManifest } from "./catalog.js";
import type { ExternalSyncPage } from "./sync.js";

export interface ProviderInboundContext {
  tenant_id: string;
  connection_id: string;
  received_at: string;
}

export interface NormalizedProviderEvent {
  external_event_id: string;
  event_type: string;
  occurred_at: string;
  payload: JsonObject;
}

export interface ProviderSyncContext {
  tenant_id: string;
  connection_id: string;
  stream: string;
  cursor: string | null;
  limit: number;
  /** Resolved provider headers are supplied ephemerally by the credential boundary. */
  credential_headers: Readonly<Record<string, string>>;
}

export interface ProviderHealthContext {
  tenant_id: string;
  connection_id: string;
  credential_headers: Readonly<Record<string, string>>;
}

export interface ProviderHealthResult {
  ok: boolean;
  code: string;
  detail?: string;
}

export interface ConnectorProviderAdapter {
  manifest: ConnectorManifest;
  validateConfig(config: JsonObject): void;
  normalizeInbound?(rawBody: string, context: ProviderInboundContext): Promise<readonly NormalizedProviderEvent[]>;
  fetchPage?(context: ProviderSyncContext): Promise<ExternalSyncPage<JsonObject>>;
  healthCheck?(context: ProviderHealthContext): Promise<ProviderHealthResult>;
}

export interface AdapterConformance {
  connector_key: string;
  version: string;
  inbound: boolean;
  sync: boolean;
  health: boolean;
}

export function assertProviderAdapterConformance(adapter: ConnectorProviderAdapter): AdapterConformance {
  const manifest = validateConnectorManifest(adapter.manifest);
  if (typeof adapter.validateConfig !== "function") throw new Error("Connector adapter requires validateConfig");

  const needsInbound = manifest.capabilities.includes("inbound_webhook");
  if (needsInbound !== (typeof adapter.normalizeInbound === "function")) {
    throw new Error(needsInbound ? "Inbound webhook connector requires normalizeInbound" : "normalizeInbound requires inbound_webhook capability");
  }

  const needsSync = manifest.capabilities.includes("poll") || manifest.capabilities.includes("pull_records") || manifest.capabilities.includes("cursor_sync");
  if (needsSync !== (typeof adapter.fetchPage === "function")) {
    throw new Error(needsSync ? "Polling connector requires fetchPage" : "fetchPage requires poll/pull_records capability");
  }

  const needsHealth = manifest.capabilities.includes("health_check");
  if (needsHealth !== (typeof adapter.healthCheck === "function")) {
    throw new Error(needsHealth ? "Health-capable connector requires healthCheck" : "healthCheck requires health_check capability");
  }

  return {
    connector_key: manifest.connector_key,
    version: manifest.version,
    inbound: needsInbound,
    sync: needsSync,
    health: needsHealth,
  };
}

export function validateNormalizedProviderEvents(events: readonly NormalizedProviderEvent[], maxEvents = 1_000): readonly NormalizedProviderEvent[] {
  if (!Array.isArray(events) || events.length > maxEvents) throw new Error("Invalid normalized provider event batch");
  const ids = new Set<string>();
  for (const event of events) {
    requireText(event.external_event_id, "external_event_id", 320);
    requireText(event.event_type, "event_type", 160);
    if (!Number.isFinite(Date.parse(event.occurred_at))) throw new Error("Invalid provider event occurred_at");
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) throw new Error("Invalid provider event payload");
    if (ids.has(event.external_event_id)) throw new Error("Duplicate normalized provider event id");
    ids.add(event.external_event_id);
  }
  return events;
}

export function validateProviderHealthResult(result: ProviderHealthResult): ProviderHealthResult {
  if (typeof result.ok !== "boolean") throw new Error("Invalid provider health ok");
  requireText(result.code, "provider health code", 160);
  if (result.detail !== undefined) requireText(result.detail, "provider health detail", 2_000);
  return result;
}

function requireText(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}
