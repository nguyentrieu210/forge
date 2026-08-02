import type { JsonObject } from "../../contracts/src/index.js";
import { connectorConnectionFingerprint, type ConnectorConnection } from "./connection.js";
import { validateProviderHealthResult, type ProviderHealthResult } from "./adapter.js";

export interface ConnectorHealthEvidence extends JsonObject {
  schema_version: 1;
  evidence_id: string;
  tenant_id: string;
  connection_id: string;
  connector_key: string;
  connector_version: string;
  connection_fingerprint: string;
  ok: boolean;
  code: string;
  detail?: string;
  checked_at: string;
}

export async function createConnectorHealthEvidence(
  connection: ConnectorConnection,
  resultInput: ProviderHealthResult,
  now: Date,
): Promise<ConnectorHealthEvidence> {
  const result = validateProviderHealthResult(resultInput);
  const fingerprint = await connectorConnectionFingerprint(connection);
  const checkedAt = now.toISOString();
  const evidenceId = `health_${(await sha256Hex([
    connection.tenant_id,
    connection.connection_id,
    fingerprint,
    checkedAt,
    result.ok ? "1" : "0",
    result.code,
  ].join("\n"))).slice(0, 48)}`;
  return {
    schema_version: 1,
    evidence_id: evidenceId,
    tenant_id: connection.tenant_id,
    connection_id: connection.connection_id,
    connector_key: connection.connector_key,
    connector_version: connection.connector_version,
    connection_fingerprint: fingerprint,
    ok: result.ok,
    code: result.code,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
    checked_at: checkedAt,
  };
}

export async function assertConnectionHealthEvidence(
  connection: ConnectorConnection,
  evidence: ConnectorHealthEvidence,
  now: Date,
  maxAgeSeconds: number,
): Promise<void> {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || maxAgeSeconds > 86_400) throw new Error("Invalid health evidence max age");
  if (evidence.schema_version !== 1) throw new Error("Unsupported health evidence schema_version");
  if (!evidence.ok) throw new Error(`Connector health check is not healthy: ${evidence.code}`);
  if (evidence.tenant_id !== connection.tenant_id || evidence.connection_id !== connection.connection_id
    || evidence.connector_key !== connection.connector_key || evidence.connector_version !== connection.connector_version) {
    throw new Error("Connector health evidence identity mismatch");
  }
  const fingerprint = await connectorConnectionFingerprint(connection);
  if (evidence.connection_fingerprint !== fingerprint) throw new Error("Connector health evidence is stale for current configuration");
  const checkedAt = Date.parse(evidence.checked_at);
  if (!Number.isFinite(checkedAt)) throw new Error("Invalid connector health checked_at");
  const ageMs = now.getTime() - checkedAt;
  if (ageMs < -60_000) throw new Error("Connector health evidence is implausibly in the future");
  if (ageMs > maxAgeSeconds * 1_000) throw new Error("Connector health evidence has expired");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
