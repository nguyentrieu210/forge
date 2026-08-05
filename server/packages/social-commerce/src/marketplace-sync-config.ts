import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  validateConnectorConnection,
  type ConnectorAuthKind,
  type ConnectorConnection,
} from "../../integration-hub/src/connection.js";
import { marketplaceAdapter } from "../../integration-hub/src/marketplace-runtime.js";
import type { MarketplaceProvider } from "./marketplace-order.js";

interface DocumentRow {
  docstatus: number;
  payload_json: string;
}

export interface ConfiguredMarketplaceSync {
  channel_profile: string;
  provider: MarketplaceProvider;
  external_shop_id: string;
  connection: ConnectorConnection;
}

/**
 * Resolve one runnable marketplace sync exclusively from canonical tenant metadata.
 *
 * The caller supplies only the Channel Profile name. Provider, connection id, secret_ref
 * and provider config are server-loaded; a manual/internal trigger cannot switch a sync
 * to another shop or credential scope through request fields.
 */
export async function resolveConfiguredMarketplaceSync(
  db: D1Database,
  tenantId: string,
  channelProfile: string,
): Promise<ConfiguredMarketplaceSync> {
  const profileName = text(channelProfile, "channel_profile", 240);
  const profileRow = await readDocument(db, tenantId, "Commerce Channel Profile", profileName);
  if (!profileRow || profileRow.docstatus === 2) throw errors.reference(`Commerce Channel Profile ${profileName} not found`);
  const profile = payload(profileRow.payload_json, "Commerce Channel Profile");
  if (truthy(profile.disabled)) throw errors.lifecycle(`Commerce Channel Profile ${profileName} is disabled`);
  if (!truthy(profile.sync_orders)) throw errors.lifecycle(`Order synchronization is disabled for ${profileName}`);

  const provider = marketplaceProvider(profile.provider);
  const connectionId = textValue(profile.connection_id, "connection_id", 160);
  const externalShopId = textValue(profile.external_shop_id, "external_shop_id", 200);
  const connectionRow = await readDocument(db, tenantId, "Marketplace Connection", connectionId);
  if (!connectionRow || connectionRow.docstatus === 2) throw errors.reference(`Marketplace Connection ${connectionId} not found`);
  const connectionData = payload(connectionRow.payload_json, "Marketplace Connection");
  const connectionStatus = integrationStatus(connectionData.connection_status);
  if (connectionStatus !== "active") throw errors.lifecycle(`Marketplace Connection ${connectionId} is not active`);

  const connection: ConnectorConnection = {
    schema_version: 1,
    connection_id: connectionId,
    tenant_id: tenantId,
    connector_key: textValue(connectionData.connector_key, "connector_key", 80),
    connector_version: textValue(connectionData.connector_version, "connector_version", 80),
    auth_kind: authKind(connectionData.auth_kind),
    secret_ref: textValue(connectionData.secret_ref, "secret_ref", 320),
    status: connectionStatus,
    config: jsonObject(connectionData.config, "config"),
  };

  let adapter;
  try {
    adapter = marketplaceAdapter(connection.connector_key, connection.connector_version);
    validateConnectorConnection(connection, adapter.manifest);
    adapter.validateConfig(connection.config);
  } catch (error) {
    throw errors.reference(error instanceof Error ? error.message : "Marketplace Connection is invalid");
  }
  if (adapter.manifest.provider !== provider) {
    throw errors.reference(`Commerce Channel Profile ${profileName} provider does not match Marketplace Connection`);
  }
  if (provider === "shopee") {
    const scopedShop = textValue(connection.config.shop_id, "shop_id", 200);
    if (scopedShop !== externalShopId) throw errors.reference("Shopee Channel Profile shop does not match Marketplace Connection scope");
  }

  return {
    channel_profile: profileName,
    provider,
    external_shop_id: externalShopId,
    connection,
  };
}

async function readDocument(db: D1Database, tenantId: string, doctype: string, name: string): Promise<DocumentRow | null> {
  return db.prepare(
    "SELECT docstatus,payload_json FROM documents WHERE tenant_id=?1 AND doctype=?2 AND name=?3 LIMIT 1",
  ).bind(tenantId, doctype, name).first<DocumentRow>();
}

function payload(raw: string, label: string): JsonObject {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid object");
    return parsed as JsonObject;
  } catch {
    throw errors.reference(`${label} payload is invalid`);
  }
}

function jsonObject(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.reference(`Marketplace Connection ${field} is invalid`);
  return structuredClone(value as JsonObject);
}

function marketplaceProvider(value: unknown): MarketplaceProvider {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw errors.reference("Commerce Channel Profile provider is invalid");
}

function integrationStatus(value: unknown): ConnectorConnection["status"] {
  if (value === "draft" || value === "active" || value === "disabled" || value === "error") return value;
  throw errors.reference("Marketplace Connection connection_status is invalid");
}

function authKind(value: unknown): ConnectorAuthKind {
  if (value === "none" || value === "api_key" || value === "oauth2" || value === "service_account") return value;
  throw errors.reference("Marketplace Connection auth_kind is invalid");
}

function textValue(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.reference(`Commerce metadata ${field} is invalid`);
  return text(String(value), field, max);
}

function text(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
