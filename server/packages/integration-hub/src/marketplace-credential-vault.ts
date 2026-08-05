import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { decryptCredentialEnvelope, encryptCredentialEnvelope } from "./credential-envelope.js";
import {
  createLazadaSignedRequestExecutor,
  createShopeeSignedRequestExecutor,
  createTikTokShopSignedRequestExecutor,
} from "./marketplace-signing.js";
import type {
  MarketplaceCredentialMaterial,
  MarketplaceCredentialResolver,
} from "./marketplace-runtime.js";

interface MarketplaceCredentialRow {
  secret_ref: string;
  connection_id: string;
  provider: MarketplaceCredentialMaterial["provider"];
  envelope_json: string;
  vault_status: "active" | "revoked";
}

export interface PutMarketplaceCredentialInput {
  tenant_id: string;
  connection_id: string;
  secret_ref: string;
  material: MarketplaceCredentialMaterial;
  actor_id: string;
  now?: Date;
}

/**
 * D1-backed encrypted implementation of the WS11 credential boundary.
 *
 * The only cleartext return path is MarketplaceCredentialResolver.resolve(), consumed
 * immediately by prepareMarketplaceSyncRuntime to construct a signer closure. No list or
 * read API exposes the material, and the encrypted envelope is bound to tenant,
 * connection, secret_ref and provider through AES-GCM additional authenticated data.
 */
export class D1MarketplaceCredentialVault implements MarketplaceCredentialResolver {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(db: D1Database, private readonly kekBase64: string) {
    this.db = db.withSession?.("first-primary") ?? db;
  }

  async put(input: PutMarketplaceCredentialInput): Promise<{ secret_ref: string; provider: MarketplaceCredentialMaterial["provider"]; rotated: boolean }> {
    const tenantId = token(input.tenant_id, "tenant_id", 128);
    const connectionId = token(input.connection_id, "connection_id", 160);
    const secretRef = secretReference(input.secret_ref);
    const actorId = token(input.actor_id, "actor_id", 320);
    const material = validateMaterial(input.material);
    const now = (input.now ?? new Date()).toISOString();
    const aad = credentialAad(tenantId, connectionId, secretRef, material.provider);
    const envelope = await encryptCredentialEnvelope(
      JSON.stringify(material),
      this.kekBase64,
      aad,
      "MARKETPLACE_CREDENTIAL_KEK",
    );

    const before = await this.db.prepare(`
      SELECT secret_ref,connection_id,provider,envelope_json,vault_status
      FROM marketplace_credential_vault
      WHERE tenant_id=?1 AND secret_ref=?2
      LIMIT 1
    `).bind(tenantId, secretRef).first<MarketplaceCredentialRow>();
    if (before && (before.connection_id !== connectionId || before.provider !== material.provider)) {
      throw new Error("Marketplace secret_ref is already bound to another connection scope");
    }

    const result = await this.db.prepare(`
      INSERT INTO marketplace_credential_vault(
        tenant_id,secret_ref,connection_id,provider,envelope_json,vault_status,
        created_by,modified_by,created_at,modified_at
      ) VALUES(?1,?2,?3,?4,?5,'active',?6,?6,?7,?7)
      ON CONFLICT(tenant_id,secret_ref) DO UPDATE SET
        envelope_json=excluded.envelope_json,vault_status='active',
        modified_by=excluded.modified_by,modified_at=excluded.modified_at
      WHERE marketplace_credential_vault.connection_id=excluded.connection_id
        AND marketplace_credential_vault.provider=excluded.provider
    `).bind(
      tenantId,
      secretRef,
      connectionId,
      material.provider,
      envelope,
      actorId,
      now,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) {
      throw new Error("Marketplace credential write did not preserve connection scope");
    }
    return { secret_ref: secretRef, provider: material.provider, rotated: Boolean(before) };
  }

  async resolve(input: {
    tenant_id: string;
    connection_id: string;
    secret_ref: string;
    provider: MarketplaceCredentialMaterial["provider"];
  }): Promise<MarketplaceCredentialMaterial> {
    const tenantId = token(input.tenant_id, "tenant_id", 128);
    const connectionId = token(input.connection_id, "connection_id", 160);
    const secretRef = secretReference(input.secret_ref);
    const provider = marketplaceProvider(input.provider);
    const row = await this.db.prepare(`
      SELECT secret_ref,connection_id,provider,envelope_json,vault_status
      FROM marketplace_credential_vault
      WHERE tenant_id=?1 AND secret_ref=?2
      LIMIT 1
    `).bind(tenantId, secretRef).first<MarketplaceCredentialRow>();
    if (!row || row.vault_status !== "active") throw new Error("Marketplace credential is unavailable");
    if (row.connection_id !== connectionId || row.provider !== provider) {
      throw new Error("Marketplace credential scope does not match connection");
    }
    const clear = await decryptCredentialEnvelope(
      row.envelope_json,
      this.kekBase64,
      credentialAad(tenantId, connectionId, secretRef, provider),
      "MARKETPLACE_CREDENTIAL_KEK",
    );
    let parsed: unknown;
    try { parsed = JSON.parse(clear) as unknown; }
    catch { throw new Error("Marketplace credential payload is invalid"); }
    const material = validateMaterial(parsed);
    if (material.provider !== provider) throw new Error("Marketplace credential payload provider mismatch");
    return material;
  }

  async revoke(input: {
    tenant_id: string;
    connection_id: string;
    secret_ref: string;
    actor_id: string;
    now?: Date;
  }): Promise<boolean> {
    const tenantId = token(input.tenant_id, "tenant_id", 128);
    const connectionId = token(input.connection_id, "connection_id", 160);
    const secretRef = secretReference(input.secret_ref);
    const actorId = token(input.actor_id, "actor_id", 320);
    const result = await this.db.prepare(`
      UPDATE marketplace_credential_vault
      SET vault_status='revoked',modified_by=?1,modified_at=?2
      WHERE tenant_id=?3 AND secret_ref=?4 AND connection_id=?5 AND vault_status='active'
    `).bind(actorId, (input.now ?? new Date()).toISOString(), tenantId, secretRef, connectionId).run();
    return (result.meta?.changes ?? 0) === 1;
  }

  async hasActive(input: { tenant_id: string; connection_id: string; secret_ref: string }): Promise<boolean> {
    const row = await this.db.prepare(`
      SELECT 1 AS found FROM marketplace_credential_vault
      WHERE tenant_id=?1 AND connection_id=?2 AND secret_ref=?3 AND vault_status='active'
      LIMIT 1
    `).bind(
      token(input.tenant_id, "tenant_id", 128),
      token(input.connection_id, "connection_id", 160),
      secretReference(input.secret_ref),
    ).first<{ found: number }>();
    return row?.found === 1;
  }
}

/**
 * Build signer credential material from a canonical connection scope plus a write-only
 * credential payload. Provider and shop scope are not accepted from the caller.
 */
export function buildMarketplaceCredentialMaterial(
  providerInput: string,
  connectionConfig: JsonObject,
  input: JsonObject,
): MarketplaceCredentialMaterial {
  const provider = marketplaceProvider(providerInput);
  if (provider === "shopee") {
    return validateMaterial({
      provider,
      partner_id: scalarText(input.partner_id, "Shopee partner_id", 80),
      partner_key: secretText(input.partner_key, "Shopee partner_key"),
      access_token: secretText(input.access_token, "Shopee access_token"),
      shop_id: scalarText(connectionConfig.shop_id, "Shopee config shop_id", 80),
    });
  }
  if (provider === "lazada") {
    return validateMaterial({
      provider,
      app_key: scalarText(input.app_key, "Lazada app_key", 240),
      app_secret: secretText(input.app_secret, "Lazada app_secret"),
      access_token: secretText(input.access_token, "Lazada access_token"),
    });
  }
  return validateMaterial({
    provider,
    app_key: scalarText(input.app_key, "TikTok Shop app_key", 240),
    app_secret: secretText(input.app_secret, "TikTok Shop app_secret"),
    access_token: secretText(input.access_token, "TikTok Shop access_token"),
  });
}

function validateMaterial(value: unknown): MarketplaceCredentialMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Marketplace credential material is invalid");
  const material = value as MarketplaceCredentialMaterial;
  if (material.provider === "shopee") {
    createShopeeSignedRequestExecutor(material);
    return structuredClone(material);
  }
  if (material.provider === "lazada") {
    createLazadaSignedRequestExecutor(material);
    return structuredClone(material);
  }
  if (material.provider === "tiktok_shop") {
    createTikTokShopSignedRequestExecutor(material);
    return structuredClone(material);
  }
  throw new Error("Marketplace credential provider is invalid");
}

function credentialAad(
  tenantId: string,
  connectionId: string,
  secretRef: string,
  provider: MarketplaceCredentialMaterial["provider"],
): string {
  return `marketplace-credential/v1:${tenantId}:${connectionId}:${provider}:${secretRef}`;
}

function marketplaceProvider(value: string): MarketplaceCredentialMaterial["provider"] {
  if (value === "shopee" || value === "lazada" || value === "tiktok_shop") return value;
  throw new Error("Marketplace credential provider is invalid");
}

function secretReference(value: string): string {
  const normalized = token(value, "secret_ref", 320);
  if (!/^(?:vault|secret|marketplace):[A-Za-z0-9_./:@+-]{3,300}$/.test(normalized)) {
    throw new Error("Marketplace secret_ref is invalid");
  }
  return normalized;
}

function scalarText(value: JsonValue | undefined, field: string, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${field} is required`);
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}

function secretText(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || value.length < 4 || value.length > 8_192 || /[\r\n\0]/.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function token(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
