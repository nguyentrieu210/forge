import type { JsonObject } from "../../contracts/src/index.js";
import { errors, randomId, sha256Hex, timingSafeEqualString } from "../../core/src/index.js";

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 15; // 120 bits, rendered as six groups of four base32 chars.

export interface MfaKey {
  keyId: string;
  kekBase64: string;
}

export interface MfaKeyRing {
  current: MfaKey;
  previous?: MfaKey[];
}

export interface MfaAuditContext {
  actorUserId: string;
  traceId: string;
  source: string;
  reason?: string;
}

export interface MfaStatus extends JsonObject {
  enabled: boolean;
  pending: boolean;
  factor_type: "totp" | null;
  recovery_codes_remaining: number;
}

export interface MfaEnrollment extends JsonObject {
  factor_id: string;
  secret_base32: string;
  otpauth_uri: string;
}

export interface MfaConfirmation extends JsonObject {
  enabled: true;
  recovery_codes: string[];
}

interface FactorRow {
  factor_id: string;
  factor_type: "totp";
  status: "pending" | "enabled" | "disabled";
  secret_ciphertext: string;
  kek_id: string;
  created_at: string;
  confirmed_at: string | null;
  disabled_at: string | null;
  last_used_step: number | null;
}

interface SecretEnvelope {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
}

export class D1MfaService {
  private readonly db: D1Database | D1DatabaseSession;
  private readonly keys?: MfaKeyRing;

  constructor(db: D1Database, keys?: MfaKeyRing) {
    this.db = db.withSession?.("first-primary") ?? db;
    this.keys = keys;
  }

  async hasEnabledFactor(tenantId: string, userId: string): Promise<boolean> {
    return Boolean(await this.db.prepare(
      `SELECT 1 AS enabled FROM user_mfa_factors
        WHERE tenant_id=?1 AND user_id=?2 AND factor_type='totp' AND status='enabled'
        LIMIT 1`,
    ).bind(tenantId, userId).first<{ enabled: number }>());
  }

  async status(tenantId: string, userId: string): Promise<MfaStatus> {
    const factor = await this.currentFactor(tenantId, userId);
    if (!factor) return { enabled: false, pending: false, factor_type: null, recovery_codes_remaining: 0 };
    const recovery = factor.status === "enabled"
      ? await this.db.prepare(
        `SELECT COUNT(*) AS total FROM user_mfa_recovery_codes
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND used_at IS NULL`,
      ).bind(tenantId, userId, factor.factor_id).first<{ total: number }>()
      : null;
    return {
      enabled: factor.status === "enabled",
      pending: factor.status === "pending",
      factor_type: "totp",
      recovery_codes_remaining: Number(recovery?.total ?? 0),
    };
  }

  async beginTotpEnrollment(
    tenantId: string,
    userId: string,
    now: string,
    issuer = "Forge",
  ): Promise<MfaEnrollment> {
    assertIso(now, "now");
    const existing = await this.currentFactor(tenantId, userId);
    if (existing?.status === "enabled") throw errors.validation("Multi-factor authentication is already enabled");
    const key = this.requireCurrentKey();
    const factorId = randomId("mfa");
    const secretBase32 = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    const aad = secretAad(tenantId, userId, factorId, key.keyId);
    const ciphertext = await encryptSecret(secretBase32, key.kekBase64, aad);

    await this.db.batch([
      this.db.prepare(
        `DELETE FROM user_mfa_factors
          WHERE tenant_id=?1 AND user_id=?2 AND factor_type='totp' AND status='pending'`,
      ).bind(tenantId, userId),
      this.db.prepare(
        `INSERT INTO user_mfa_factors(
           tenant_id,user_id,factor_id,factor_type,status,secret_ciphertext,kek_id,created_at
         ) VALUES(?1,?2,?3,'totp','pending',?4,?5,?6)`,
      ).bind(tenantId, userId, factorId, ciphertext, key.keyId, now),
    ]);

    const label = `${issuer}:${userId}`;
    const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secretBase32)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
    return { factor_id: factorId, secret_base32: secretBase32, otpauth_uri: otpauth };
  }

  async confirmTotpEnrollment(
    tenantId: string,
    userId: string,
    code: string,
    audit: MfaAuditContext,
    now: string,
  ): Promise<MfaConfirmation> {
    const nowSeconds = isoSeconds(now);
    const factor = await this.pendingFactor(tenantId, userId);
    if (!factor) throw errors.validation("No pending MFA enrollment was found");
    const secret = await this.decryptFactorSecret(tenantId, userId, factor);
    const matchedStep = await matchTotpStep(secret, code, nowSeconds, undefined);
    if (matchedStep === null) throw errors.authentication("Multi-factor authentication code is invalid");

    const eventId = randomId("rbac");
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    const recoveryHashes = await Promise.all(recoveryCodes.map((value) => sha256Hex(normalizeRecoveryCode(value))));
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `UPDATE user_mfa_factors
            SET status='enabled',confirmed_at=?4,activation_event_id=?5,last_used_step=?6
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND status='pending'`,
      ).bind(tenantId, userId, factor.factor_id, now, eventId, matchedStep),
    ];
    for (const hash of recoveryHashes) {
      statements.push(this.db.prepare(
        `INSERT INTO user_mfa_recovery_codes(
           tenant_id,user_id,factor_id,code_hash,created_at
         )
         SELECT ?1,?2,?3,?4,?5
           FROM user_mfa_factors
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND activation_event_id=?6`,
      ).bind(tenantId, userId, factor.factor_id, hash, now, eventId));
    }
    statements.push(this.db.prepare(
      `INSERT INTO rbac_audit_events(
         tenant_id,event_id,event_type,actor_user_id,target_user_id,
         before_json,after_json,reason,source,trace_id,created_at
       )
       SELECT ?1,?2,'mfa.enable',?3,?4,
              json_object('mfa_enabled',0),
              json_object('mfa_enabled',1,'factor_type','totp','recovery_codes',?5),
              ?6,?7,?8,?9
         FROM user_mfa_factors
        WHERE tenant_id=?1 AND user_id=?4 AND factor_id=?10 AND activation_event_id=?2`,
    ).bind(
      tenantId,
      eventId,
      audit.actorUserId,
      userId,
      RECOVERY_CODE_COUNT,
      audit.reason ?? null,
      audit.source,
      audit.traceId,
      now,
      factor.factor_id,
    ));
    const results = await this.db.batch(statements);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw errors.validation("MFA enrollment is no longer pending");
    return { enabled: true, recovery_codes: recoveryCodes };
  }

  async verifySecondFactor(
    tenantId: string,
    userId: string,
    code: string,
    audit: MfaAuditContext,
    now: string,
  ): Promise<{ method: "totp" | "recovery" }> {
    const factor = await this.enabledFactor(tenantId, userId);
    if (!factor) throw errors.authentication("Multi-factor authentication is not enabled");
    const normalized = code.trim();
    if (!normalized) throw errors.authentication("Multi-factor authentication code is required");

    if (/^\d{6}$/.test(normalized)) {
      const secret = await this.decryptFactorSecret(tenantId, userId, factor);
      const step = await matchTotpStep(secret, normalized, isoSeconds(now), factor.last_used_step ?? undefined);
      if (step === null) throw errors.authentication("Multi-factor authentication code is invalid or already used");
      const updated = await this.db.prepare(
        `UPDATE user_mfa_factors SET last_used_step=?4
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND status='enabled'
            AND (last_used_step IS NULL OR last_used_step<?4)
          RETURNING factor_id`,
      ).bind(tenantId, userId, factor.factor_id, step).first<{ factor_id: string }>();
      if (!updated) throw errors.authentication("Multi-factor authentication code is invalid or already used");
      return { method: "totp" };
    }

    const recoveryHash = await sha256Hex(normalizeRecoveryCode(normalized));
    const eventId = randomId("rbac");
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE user_mfa_recovery_codes
            SET used_at=?5,use_event_id=?6
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND code_hash=?4 AND used_at IS NULL`,
      ).bind(tenantId, userId, factor.factor_id, recoveryHash, now, eventId),
      this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         )
         SELECT ?1,?2,'mfa.recovery_used',?3,?4,
                json_object('recovery_code_unused',1),json_object('recovery_code_used',1),
                ?5,?6,?7,?8
           FROM user_mfa_recovery_codes
          WHERE tenant_id=?1 AND user_id=?4 AND factor_id=?9 AND code_hash=?10 AND use_event_id=?2`,
      ).bind(
        tenantId,
        eventId,
        audit.actorUserId,
        userId,
        audit.reason ?? null,
        audit.source,
        audit.traceId,
        now,
        factor.factor_id,
        recoveryHash,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw errors.authentication("Multi-factor authentication code is invalid or already used");
    return { method: "recovery" };
  }

  async disable(
    tenantId: string,
    userId: string,
    code: string,
    audit: MfaAuditContext,
    now: string,
  ): Promise<boolean> {
    // Prove possession first. A recovery code is accepted and consumed exactly once.
    await this.verifySecondFactor(tenantId, userId, code, audit, now);
    const factor = await this.enabledFactor(tenantId, userId);
    if (!factor) return false;
    const eventId = randomId("rbac");
    const reason = audit.reason ?? "self-service MFA disable";
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE user_mfa_factors
            SET status='disabled',disabled_at=?4,disable_event_id=?5
          WHERE tenant_id=?1 AND user_id=?2 AND factor_id=?3 AND status='enabled'`,
      ).bind(tenantId, userId, factor.factor_id, now, eventId),
      this.db.prepare(
        `INSERT INTO rbac_audit_events(
           tenant_id,event_id,event_type,actor_user_id,target_user_id,
           before_json,after_json,reason,source,trace_id,created_at
         )
         SELECT ?1,?2,'mfa.disable',?3,?4,
                json_object('mfa_enabled',1,'factor_type','totp'),
                json_object('mfa_enabled',0),?5,?6,?7,?8
           FROM user_mfa_factors
          WHERE tenant_id=?1 AND user_id=?4 AND factor_id=?9 AND disable_event_id=?2`,
      ).bind(
        tenantId,
        eventId,
        audit.actorUserId,
        userId,
        reason,
        audit.source,
        audit.traceId,
        now,
        factor.factor_id,
      ),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  private async currentFactor(tenantId: string, userId: string): Promise<FactorRow | null> {
    return this.db.prepare(
      `SELECT factor_id,factor_type,status,secret_ciphertext,kek_id,created_at,
              confirmed_at,disabled_at,last_used_step
         FROM user_mfa_factors
        WHERE tenant_id=?1 AND user_id=?2 AND factor_type='totp'
          AND status IN ('pending','enabled')
        ORDER BY status='enabled' DESC,created_at DESC LIMIT 1`,
    ).bind(tenantId, userId).first<FactorRow>();
  }

  private async pendingFactor(tenantId: string, userId: string): Promise<FactorRow | null> {
    const factor = await this.currentFactor(tenantId, userId);
    return factor?.status === "pending" ? factor : null;
  }

  private async enabledFactor(tenantId: string, userId: string): Promise<FactorRow | null> {
    const factor = await this.currentFactor(tenantId, userId);
    return factor?.status === "enabled" ? factor : null;
  }

  private requireCurrentKey(): MfaKey {
    const key = this.keys?.current;
    if (!key) throw errors.misconfigured("MFA encryption key is not configured");
    assertKey(key);
    return key;
  }

  private resolveKey(keyId: string): MfaKey {
    const candidates = [this.keys?.current, ...(this.keys?.previous ?? [])].filter(Boolean) as MfaKey[];
    const key = candidates.find((entry) => entry.keyId === keyId);
    if (!key) throw errors.misconfigured("MFA encryption key generation is unavailable");
    assertKey(key);
    return key;
  }

  private async decryptFactorSecret(tenantId: string, userId: string, factor: FactorRow): Promise<string> {
    const key = this.resolveKey(factor.kek_id);
    return decryptSecret(
      factor.secret_ciphertext,
      key.kekBase64,
      secretAad(tenantId, userId, factor.factor_id, factor.kek_id),
    );
  }
}

async function matchTotpStep(
  secretBase32: string,
  code: string,
  nowSeconds: number,
  lastUsedStep?: number,
): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(nowSeconds / TOTP_PERIOD_SECONDS);
  const candidates = [current - 1, current, current + 1];
  for (const step of candidates) {
    if (lastUsedStep !== undefined && step <= lastUsedStep) continue;
    const expected = await totpCode(secretBase32, step);
    if (timingSafeEqualString(code, expected)) return step;
  }
  return null;
}

async function totpCode(secretBase32: string, counter: number): Promise<string> {
  const secret = base32Decode(secretBase32);
  const counterBytes = new Uint8Array(8);
  let value = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24)
    | (digest[offset + 1]! << 16)
    | (digest[offset + 2]! << 8)
    | digest[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function generateRecoveryCode(): string {
  const raw = base32Encode(crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES)));
  return raw.match(/.{1,4}/g)!.join("-");
}

function normalizeRecoveryCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (normalized.length < 20 || normalized.length > 64) throw errors.authentication("Multi-factor authentication code is invalid or already used");
  return normalized;
}

function secretAad(tenantId: string, userId: string, factorId: string, keyId: string): string {
  return `forge-mfa:v1:${tenantId}:${userId}:${factorId}:${keyId}`;
}

async function encryptSecret(value: string, kekBase64: string, aad: string): Promise<string> {
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw errors.misconfigured("MFA_KEK must decode to exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    version: 1,
    algorithm: "AES-GCM",
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  } satisfies SecretEnvelope);
}

async function decryptSecret(envelopeJson: string, kekBase64: string, aad: string): Promise<string> {
  let envelope: Partial<SecretEnvelope>;
  try { envelope = JSON.parse(envelopeJson) as Partial<SecretEnvelope>; }
  catch { throw errors.misconfigured("MFA secret envelope is invalid"); }
  if (envelope.version !== 1 || envelope.algorithm !== "AES-GCM" || !envelope.iv || !envelope.ciphertext) {
    throw errors.misconfigured("MFA secret envelope is invalid");
  }
  const keyBytes = decodeBase64(kekBase64);
  if (keyBytes.byteLength !== 32) throw errors.misconfigured("MFA_KEK must decode to exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  try {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(envelope.iv), additionalData: new TextEncoder().encode(aad) },
      key,
      decodeBase64(envelope.ciphertext),
    );
    return new TextDecoder().decode(clear);
  } catch {
    throw errors.misconfigured("MFA secret could not be decrypted with the configured key generation");
  }
}

function assertKey(key: MfaKey): void {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(key.keyId)) throw errors.misconfigured("MFA key id is invalid");
  if (decodeBase64(key.kekBase64).byteLength !== 32) throw errors.misconfigured("MFA_KEK must decode to exactly 32 bytes");
}

function assertIso(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw errors.validation(`${field} must be an ISO timestamp`);
  return parsed;
}

function isoSeconds(value: string): number {
  return Math.floor(assertIso(value, "now") / 1000);
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!;
  return output;
}

function base32Decode(value: string): Uint8Array {
  const normalized = value.toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw errors.misconfigured("MFA secret encoding is invalid");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try { binary = atob(value); }
  catch { throw errors.misconfigured("MFA_KEK is not valid base64"); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
