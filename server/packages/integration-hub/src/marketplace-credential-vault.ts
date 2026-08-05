import type { JsonObject, JsonValue } from "../../contracts/src/index.js";
import { decryptCredentialEnvelope, encryptCredentialEnvelope } from "./credential-envelope.js";
import { refreshShopeeAccessToken } from "./marketplace-authorization.js";
import {
  createLazadaSignedRequestExecutor,
  createShopeeSignedRequestExecutor,
  createTikTokShopSignedRequestExecutor,
  refreshLazadaAccessToken,
  refreshTikTokShopAccessToken,
  type MarketplaceHttpClient,
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

export interface MarketplaceCredentialRefreshState {
  refresh_token?: string;
  access_expires_at?: string;
  refresh_expires_at?: string;
  refresh_before_seconds: number;
}

export interface MarketplaceStoredCredential {
  schema_version: 2;
  material: MarketplaceCredentialMaterial;
  refresh?: MarketplaceCredentialRefreshState;
}

export interface PutMarketplaceCredentialInput {
  tenant_id: string;
  connection_id: string;
  secret_ref: string;
  material: MarketplaceCredentialMaterial;
  refresh?: MarketplaceCredentialRefreshState;
  actor_id: string;
  now?: Date;
}

export interface MarketplaceCredentialVaultOptions {
  now?: () => Date;
  http?: MarketplaceHttpClient;
}

export interface MarketplaceCredentialStatus {
  active: boolean;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  refresh_managed: boolean;
  reauthorization_required: boolean;
}

/**
 * D1-backed encrypted implementation of the WS11 credential boundary.
 *
 * The only cleartext return path is MarketplaceCredentialResolver.resolve(), consumed
 * immediately by prepareMarketplaceSyncRuntime to construct a signer closure. No list or
 * read API exposes material or refresh_token. The encrypted envelope is bound to tenant,
 * connection, secret_ref and provider through AES-GCM additional authenticated data.
 *
 * resolve() also owns token refresh: an expiring access token is refreshed before the
 * signer sees it, and the replacement encrypted envelope is compare-and-swapped against
 * the ciphertext read at the start so a concurrent admin rotation can never be overwritten.
 */
export class D1MarketplaceCredentialVault implements MarketplaceCredentialResolver {
  private readonly db: D1Database | D1DatabaseSession;
  private readonly now: () => Date;
  private readonly http?: MarketplaceHttpClient;

  constructor(db: D1Database, private readonly kekBase64: string, options: MarketplaceCredentialVaultOptions = {}) {
    this.db = db.withSession?.("first-primary") ?? db;
    this.now = options.now ?? (() => new Date());
    this.http = options.http;
  }

  async put(input: PutMarketplaceCredentialInput): Promise<{ secret_ref: string; provider: MarketplaceCredentialMaterial["provider"]; rotated: boolean; refresh_managed: boolean }> {
    const tenantId = token(input.tenant_id, "tenant_id", 128);
    const connectionId = token(input.connection_id, "connection_id", 160);
    const secretRef = secretReference(input.secret_ref);
    const actorId = token(input.actor_id, "actor_id", 320);
    const material = validateMaterial(input.material);
    const stored = validateStoredCredential({
      schema_version: 2,
      material,
      ...(input.refresh ? { refresh: validateRefreshState(input.refresh) } : {}),
    });
    const now = (input.now ?? this.now()).toISOString();
    const aad = credentialAad(tenantId, connectionId, secretRef, material.provider);
    const envelope = await encryptCredentialEnvelope(
      JSON.stringify(stored),
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
    return {
      secret_ref: secretRef,
      provider: material.provider,
      rotated: Boolean(before),
      refresh_managed: Boolean(stored.refresh?.refresh_token && stored.refresh?.access_expires_at),
    };
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
    const row = await this.readActiveRow(tenantId, connectionId, secretRef, provider);
    const stored = await this.decryptStored(row, tenantId, connectionId, secretRef, provider);
    const fresh = await refreshStoredMarketplaceCredential(stored, {
      now: this.now(),
      ...(this.http ? { http: this.http } : {}),
    });
    if (!fresh.refreshed) return fresh.credential.material;

    const encrypted = await encryptCredentialEnvelope(
      JSON.stringify(fresh.credential),
      this.kekBase64,
      credentialAad(tenantId, connectionId, secretRef, provider),
      "MARKETPLACE_CREDENTIAL_KEK",
    );
    const modifiedAt = this.now().toISOString();
    const result = await this.db.prepare(`
      UPDATE marketplace_credential_vault
      SET envelope_json=?1,modified_by='system:marketplace-refresh',modified_at=?2
      WHERE tenant_id=?3 AND secret_ref=?4 AND connection_id=?5 AND provider=?6
        AND vault_status='active' AND envelope_json=?7
    `).bind(
      encrypted,
      modifiedAt,
      tenantId,
      secretRef,
      connectionId,
      provider,
      row.envelope_json,
    ).run();
    if ((result.meta?.changes ?? 0) !== 1) {
      throw new Error("Marketplace credential changed concurrently during refresh");
    }
    return fresh.credential.material;
  }

  async status(input: {
    tenant_id: string;
    connection_id: string;
    secret_ref: string;
    provider: MarketplaceCredentialMaterial["provider"];
  }): Promise<MarketplaceCredentialStatus> {
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
    if (!row || row.vault_status !== "active") {
      return { active: false, access_expires_at: null, refresh_expires_at: null, refresh_managed: false, reauthorization_required: false };
    }
    if (row.connection_id !== connectionId || row.provider !== provider) throw new Error("Marketplace credential scope does not match connection");
    const stored = await this.decryptStored(row, tenantId, connectionId, secretRef, provider);
    const refresh = stored.refresh;
    return {
      active: true,
      access_expires_at: refresh?.access_expires_at ?? null,
      refresh_expires_at: refresh?.refresh_expires_at ?? null,
      refresh_managed: Boolean(refresh?.refresh_token && refresh?.access_expires_at),
      reauthorization_required: credentialRequiresReauthorization(stored, this.now()),
    };
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
    `).bind(actorId, (input.now ?? this.now()).toISOString(), tenantId, secretRef, connectionId).run();
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

  private async readActiveRow(
    tenantId: string,
    connectionId: string,
    secretRef: string,
    provider: MarketplaceCredentialMaterial["provider"],
  ): Promise<MarketplaceCredentialRow> {
    const row = await this.db.prepare(`
      SELECT secret_ref,connection_id,provider,envelope_json,vault_status
      FROM marketplace_credential_vault
      WHERE tenant_id=?1 AND secret_ref=?2
      LIMIT 1
    `).bind(tenantId, secretRef).first<MarketplaceCredentialRow>();
    if (!row || row.vault_status !== "active") throw new Error("Marketplace credential is unavailable");
    if (row.connection_id !== connectionId || row.provider !== provider) throw new Error("Marketplace credential scope does not match connection");
    return row;
  }

  private async decryptStored(
    row: MarketplaceCredentialRow,
    tenantId: string,
    connectionId: string,
    secretRef: string,
    provider: MarketplaceCredentialMaterial["provider"],
  ): Promise<MarketplaceStoredCredential> {
    const clear = await decryptCredentialEnvelope(
      row.envelope_json,
      this.kekBase64,
      credentialAad(tenantId, connectionId, secretRef, provider),
      "MARKETPLACE_CREDENTIAL_KEK",
    );
    let parsed: unknown;
    try { parsed = JSON.parse(clear) as unknown; }
    catch { throw new Error("Marketplace credential payload is invalid"); }
    const stored = normalizeStoredCredential(parsed);
    if (stored.material.provider !== provider) throw new Error("Marketplace credential payload provider mismatch");
    return stored;
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

/** Build encrypted-only lifecycle metadata from a provider token response or admin import. */
export function buildMarketplaceCredentialRefreshState(
  providerInput: string,
  input: JsonObject,
  now: Date = new Date(),
): MarketplaceCredentialRefreshState | undefined {
  const provider = marketplaceProvider(providerInput);
  const refreshToken = optionalSecretText(input.refresh_token, `${provider} refresh_token`);
  let accessExpiresAt = optionalIso(input.access_expires_at, "access_expires_at");
  let refreshExpiresAt = optionalIso(input.refresh_expires_at, "refresh_expires_at");

  if (!accessExpiresAt) {
    accessExpiresAt = provider === "tiktok_shop"
      ? optionalEpochExpiry(input.access_token_expire_in, "TikTok Shop access_token_expire_in")
      : provider === "lazada"
        ? optionalDurationExpiry(input.expires_in, "Lazada expires_in", now)
        : optionalDurationExpiry(input.expire_in, "Shopee expire_in", now);
  }
  if (!refreshExpiresAt) {
    refreshExpiresAt = provider === "tiktok_shop"
      ? optionalEpochExpiry(input.refresh_token_expire_in, "TikTok Shop refresh_token_expire_in")
      : provider === "lazada"
        ? optionalDurationExpiry(input.refresh_expires_in, "Lazada refresh_expires_in", now)
        : undefined;
  }
  if (!refreshToken && !accessExpiresAt && !refreshExpiresAt) return undefined;
  return validateRefreshState({
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(accessExpiresAt ? { access_expires_at: accessExpiresAt } : {}),
    ...(refreshExpiresAt ? { refresh_expires_at: refreshExpiresAt } : {}),
    refresh_before_seconds: 1_800,
  });
}

export async function refreshStoredMarketplaceCredential(
  input: MarketplaceStoredCredential,
  options: { now?: Date; http?: MarketplaceHttpClient } = {},
): Promise<{ credential: MarketplaceStoredCredential; refreshed: boolean }> {
  const stored = validateStoredCredential(input);
  const now = options.now ?? new Date();
  const refresh = stored.refresh;
  if (!refresh?.access_expires_at) return { credential: stored, refreshed: false };
  const accessExpiresAt = Date.parse(refresh.access_expires_at);
  if (accessExpiresAt - now.getTime() > refresh.refresh_before_seconds * 1_000) {
    return { credential: stored, refreshed: false };
  }
  if (!refresh.refresh_token) throw new Error("Marketplace credential requires reauthorization");
  if (refresh.refresh_expires_at && Date.parse(refresh.refresh_expires_at) <= now.getTime()) {
    throw new Error("Marketplace credential requires reauthorization");
  }

  const response = stored.material.provider === "shopee"
    ? await refreshShopeeAccessToken({
      partner_id: stored.material.partner_id,
      partner_key: stored.material.partner_key,
      refresh_token: refresh.refresh_token,
      shop_id: stored.material.shop_id,
    }, { ...(options.http ? { http: options.http } : {}), now: () => now.getTime() })
    : stored.material.provider === "lazada"
      ? await refreshLazadaAccessToken({
        app_key: stored.material.app_key,
        app_secret: stored.material.app_secret,
        refresh_token: refresh.refresh_token,
      }, { ...(options.http ? { http: options.http } : {}), now: () => now.getTime() })
      : await refreshTikTokShopAccessToken({
        app_key: stored.material.app_key,
        app_secret: stored.material.app_secret,
        refresh_token: refresh.refresh_token,
      }, { ...(options.http ? { http: options.http } : {}), now: () => now.getTime() });

  return {
    credential: applyMarketplaceRefreshResponse(stored, response, now),
    refreshed: true,
  };
}

export function applyMarketplaceRefreshResponse(
  storedInput: MarketplaceStoredCredential,
  response: Record<string, unknown>,
  now: Date,
): MarketplaceStoredCredential {
  const stored = validateStoredCredential(storedInput);
  const provider = stored.material.provider;
  const source = provider === "tiktok_shop" ? objectRecord(response.data, "TikTok Shop refresh data") : response;
  const accessToken = secretText(source.access_token as JsonValue | undefined, `${provider} refreshed access_token`);
  const refreshToken = secretText(source.refresh_token as JsonValue | undefined, `${provider} refreshed refresh_token`);
  const currentRefresh = stored.refresh;

  const nextAccessExpiry = provider === "tiktok_shop"
    ? requiredEpochExpiry(source.access_token_expire_in as JsonValue | undefined, "TikTok Shop access_token_expire_in")
    : provider === "lazada"
      ? requiredDurationExpiry(source.expires_in as JsonValue | undefined, "Lazada expires_in", now)
      : requiredDurationExpiry(source.expire_in as JsonValue | undefined, "Shopee expire_in", now);

  let nextRefreshExpiry = currentRefresh?.refresh_expires_at;
  if (provider === "tiktok_shop" && source.refresh_token_expire_in !== undefined) {
    nextRefreshExpiry = requiredEpochExpiry(source.refresh_token_expire_in as JsonValue, "TikTok Shop refresh_token_expire_in");
  } else if (provider === "lazada" && source.refresh_expires_in !== undefined) {
    const candidate = requiredDurationExpiry(source.refresh_expires_in as JsonValue, "Lazada refresh_expires_in", now);
    nextRefreshExpiry = earlierExpiry(currentRefresh?.refresh_expires_at, candidate);
  }

  const material = validateMaterial({ ...stored.material, access_token: accessToken });
  return validateStoredCredential({
    schema_version: 2,
    material,
    refresh: {
      refresh_token: refreshToken,
      access_expires_at: nextAccessExpiry,
      ...(nextRefreshExpiry ? { refresh_expires_at: nextRefreshExpiry } : {}),
      refresh_before_seconds: currentRefresh?.refresh_before_seconds ?? 1_800,
    },
  });
}

export function credentialRequiresReauthorization(storedInput: MarketplaceStoredCredential, now: Date = new Date()): boolean {
  const stored = validateStoredCredential(storedInput);
  const refresh = stored.refresh;
  if (!refresh?.access_expires_at) return false;
  if (Date.parse(refresh.access_expires_at) > now.getTime()) return false;
  if (!refresh.refresh_token) return true;
  return Boolean(refresh.refresh_expires_at && Date.parse(refresh.refresh_expires_at) <= now.getTime());
}

function normalizeStoredCredential(value: unknown): MarketplaceStoredCredential {
  if (value && typeof value === "object" && !Array.isArray(value) && (value as { schema_version?: unknown }).schema_version === 2) {
    return validateStoredCredential(value);
  }
  // Backward-compatible with pre-lifecycle encrypted envelopes already created on this candidate branch.
  return { schema_version: 2, material: validateMaterial(value) };
}

function validateStoredCredential(value: unknown): MarketplaceStoredCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Marketplace credential payload is invalid");
  const source = value as Partial<MarketplaceStoredCredential>;
  if (source.schema_version !== 2) throw new Error("Marketplace credential payload schema_version is invalid");
  const material = validateMaterial(source.material);
  return {
    schema_version: 2,
    material,
    ...(source.refresh ? { refresh: validateRefreshState(source.refresh) } : {}),
  };
}

function validateRefreshState(value: MarketplaceCredentialRefreshState): MarketplaceCredentialRefreshState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Marketplace credential refresh state is invalid");
  const refreshToken = value.refresh_token === undefined ? undefined : secretText(value.refresh_token, "refresh_token");
  const accessExpiresAt = value.access_expires_at === undefined ? undefined : isoText(value.access_expires_at, "access_expires_at");
  const refreshExpiresAt = value.refresh_expires_at === undefined ? undefined : isoText(value.refresh_expires_at, "refresh_expires_at");
  const refreshBefore = Number(value.refresh_before_seconds);
  if (!Number.isSafeInteger(refreshBefore) || refreshBefore < 60 || refreshBefore > 86_400) throw new Error("refresh_before_seconds is invalid");
  return {
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(accessExpiresAt ? { access_expires_at: accessExpiresAt } : {}),
    ...(refreshExpiresAt ? { refresh_expires_at: refreshExpiresAt } : {}),
    refresh_before_seconds: refreshBefore,
  };
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

function optionalSecretText(value: JsonValue | undefined, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return secretText(value, field);
}

function optionalIso(value: JsonValue | undefined, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} is invalid`);
  return isoText(value, field);
}

function isoText(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} is invalid`);
  return new Date(parsed).toISOString();
}

function optionalEpochExpiry(value: JsonValue | undefined, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredEpochExpiry(value, field);
}

function requiredEpochExpiry(value: JsonValue | undefined, field: string): string {
  const seconds = integerNumber(value, field, 1, 4_102_444_800);
  return new Date(seconds * 1_000).toISOString();
}

function optionalDurationExpiry(value: JsonValue | undefined, field: string, now: Date): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredDurationExpiry(value, field, now);
}

function requiredDurationExpiry(value: JsonValue | undefined, field: string, now: Date): string {
  const seconds = integerNumber(value, field, 1, 31_536_000);
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function integerNumber(value: JsonValue | undefined, field: string, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${field} is invalid`);
  return parsed;
}

function objectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} is invalid`);
  return value as Record<string, unknown>;
}

function earlierExpiry(existing: string | undefined, candidate: string): string {
  if (!existing) return candidate;
  return Date.parse(existing) <= Date.parse(candidate) ? existing : candidate;
}

function token(value: string, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
