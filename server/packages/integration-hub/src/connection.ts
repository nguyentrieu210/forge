import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { assertConnectorSupportsAuth, validateConnectorManifest, type ConnectorManifest } from "./catalog.js";
import type { ConnectorAuthKind, IntegrationStatus } from "./index.js";

export interface ConnectorConnection {
  schema_version: 1;
  connection_id: string;
  tenant_id: string;
  connector_key: string;
  connector_version: string;
  auth_kind: ConnectorAuthKind;
  secret_ref?: string;
  status: IntegrationStatus;
  config: JsonObject;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const FORBIDDEN_CONFIG_KEYS = new Set([
  "password", "secret", "client_secret", "access_token", "refresh_token", "api_key", "private_key", "service_account_key",
]);

export function validateConnectorConnection(connection: ConnectorConnection, manifest: ConnectorManifest): ConnectorConnection {
  validateConnectorManifest(manifest);
  if (connection.schema_version !== 1) throw new Error("Unsupported connector connection schema_version");
  assertId(connection.connection_id, "connection_id");
  assertId(connection.tenant_id, "tenant_id");
  if (connection.connector_key !== manifest.connector_key || connection.connector_version !== manifest.version) {
    throw new Error("Connector connection does not match manifest identity");
  }
  assertConnectorSupportsAuth(manifest, connection.auth_kind);
  if (connection.auth_kind !== "none" && !connection.secret_ref) throw new Error("Authenticated connector connection requires secret_ref");
  if (connection.auth_kind === "none" && connection.secret_ref) throw new Error("Unauthenticated connector connection must not carry secret_ref");
  if (connection.secret_ref !== undefined) requireText(connection.secret_ref, "secret_ref", 320);
  if (!["draft", "active", "disabled", "error"].includes(connection.status)) throw new Error("Invalid connector connection status");
  validateConnectionConfig(connection.config);
  return connection;
}

export function validateConnectionConfig(config: JsonObject): JsonObject {
  const encoded = JSON.stringify(config);
  if (encoded.length > 32_768) throw new Error("Connector config exceeds size limit");
  walkConfig(config, "config", 0);
  return config;
}

export function assertConnectionConfigUpdateAllowed(current: ConnectorConnection, candidate: ConnectorConnection): void {
  if (current.connection_id !== candidate.connection_id || current.tenant_id !== candidate.tenant_id) throw new Error("Connector connection identity cannot change");
  if (current.status === "active" && stableConfigIdentity(current) !== stableConfigIdentity(candidate)) {
    throw new Error("Disable connector connection before changing connector, auth, secret reference or config");
  }
  if (current.status !== candidate.status && candidate.status === "active" && stableConfigIdentity(current) !== stableConfigIdentity(candidate)) {
    throw new Error("Save connector connection configuration before activating it");
  }
}

export async function connectorConnectionFingerprint(connection: ConnectorConnection): Promise<string> {
  const canonical = stableConfigIdentity(connection);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableConfigIdentity(connection: ConnectorConnection): string {
  return stableJson({
    connector_key: connection.connector_key,
    connector_version: connection.connector_version,
    auth_kind: connection.auth_kind,
    secret_ref: connection.secret_ref ?? null,
    config: connection.config,
  });
}

function walkConfig(value: JsonValue, path: string, depth: number): void {
  if (depth > 16) throw new Error("Connector config nesting exceeds limit");
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error("Connector config array exceeds limit");
    value.forEach((item, index) => walkConfig(item, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`Unsafe connector config key: ${path}.${key}`);
    if (FORBIDDEN_CONFIG_KEYS.has(normalized)) throw new Error(`Plaintext credential field is forbidden in connector config: ${path}.${key}`);
    if (child !== undefined) walkConfig(child, `${path}.${key}`, depth + 1);
  }
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key] as JsonValue)}`).join(",")}}`;
}

function assertId(value: string, field: string): void {
  if (!ID_RE.test(value)) throw new Error(`Invalid ${field}`);
}

function requireText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`Invalid ${field}`);
  return normalized;
}
