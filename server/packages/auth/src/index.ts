import type { Actor, JsonObject, TrustedIdentity } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

export const IDENTITY_HEADER = "x-cloudforge-identity";
export const IDENTITY_SIGNATURE_HEADER = "x-cloudforge-identity-signature";

/**
 * The gateway's assertion that this request is an app Worker calling back as its caller.
 *
 * The Frappe surface authenticates by cookie session and DELIBERATELY ignores the trusted
 * identity, so that a lost or forged session can never be papered over by an identity the
 * tenant did not check against the live user directory. An app callback carries no cookie
 * — by design, so an app can never replay a user's session — which left it authenticated
 * as nobody and every app read answering `403 Login to access this resource`.
 *
 * This header is the one narrow exception, and it is safe only because of two properties
 * together: it is set by the gateway AFTER `stripUntrustedPlatformHeaders`, so no caller
 * can supply it; and the gateway sets it only once it has verified BOTH the per-(tenant,
 * app) credential and the platform-signed identity the app presented. The tenant still
 * verifies the identity's signature, tenant, trace and expiry itself before using it.
 *
 * It carries the app id so a tenant can attribute the call, not to decide anything.
 */
export const APP_CALLBACK_HEADER = "x-cloudforge-app-callback";

/** Authentication evidence that originated at the identity provider, not token mint time. */
export interface AuthenticationContext {
  /** OIDC-style epoch seconds for the user's actual authentication event. */
  auth_time: number;
  /** Authentication methods, e.g. pwd, otp, mfa or hwk. Informational unless a policy names one. */
  amr?: string[];
  /** Authentication Context Class Reference from the issuer, when one exists. */
  acr?: string;
}

/** Trusted identity plus optional issuer-authenticated evidence for privileged step-up policy. */
export interface SecurityTrustedIdentity extends TrustedIdentity {
  authentication?: AuthenticationContext;
}

export interface JwtVerificationOptions {
  secret: string;
  issuer?: string;
  audience?: string;
  nowSeconds?: number;
}

export interface JwtClaims extends JsonObject {
  sub: string;
  tenant_id: string;
  roles: string[];
  exp: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  locale?: string;
  timezone?: string;
  /** Authentication time is deliberately distinct from JWT iat. */
  auth_time?: number;
  amr?: string[];
  acr?: string;
}

export async function verifyBearerJwt(request: Request, options: JwtVerificationOptions): Promise<JwtClaims> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw errors.authentication();
  return verifyHs256Jwt(authorization.slice(7), options);
}

export async function verifyHs256Jwt(token: string, options: JwtVerificationOptions): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw errors.authentication("Malformed bearer token");
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const header = parseJson(base64UrlDecode(encodedHeader), "JWT header") as JsonObject;
  if (header.alg !== "HS256" || header.typ !== "JWT") throw errors.authentication("Unsupported bearer token algorithm");
  const expected = await hmacSha256(`${encodedHeader}.${encodedPayload}`, options.secret);
  if (!timingSafeEqual(base64UrlDecodeBytes(encodedSignature), expected)) throw errors.authentication("Invalid bearer token signature");
  const claims = parseJson(base64UrlDecode(encodedPayload), "JWT payload") as Partial<JwtClaims>;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof claims.sub !== "string" || !claims.sub) throw errors.authentication("Bearer token is missing subject");
  if (typeof claims.tenant_id !== "string" || !claims.tenant_id) throw errors.authentication("Bearer token is missing tenant");
  if (!Array.isArray(claims.roles) || !claims.roles.every((role) => typeof role === "string" && role.length > 0)) {
    throw errors.authentication("Bearer token roles are invalid");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) throw errors.authentication("Bearer token expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) throw errors.authentication("Bearer token is not active");
  if (claims.auth_time !== undefined && (!Number.isInteger(claims.auth_time) || claims.auth_time <= 0 || claims.auth_time > now + 30)) {
    throw errors.authentication("Bearer token authentication time is invalid");
  }
  if (claims.amr !== undefined && (!Array.isArray(claims.amr) || claims.amr.length > 16 || !claims.amr.every((method) => typeof method === "string" && method.length > 0 && method.length <= 64))) {
    throw errors.authentication("Bearer token authentication methods are invalid");
  }
  if (claims.acr !== undefined && (typeof claims.acr !== "string" || !claims.acr || claims.acr.length > 256)) {
    throw errors.authentication("Bearer token authentication context class is invalid");
  }
  if (options.issuer && claims.iss !== options.issuer) throw errors.authentication("Bearer token issuer mismatch");
  if (options.audience && !audienceMatches(claims.aud, options.audience)) throw errors.authentication("Bearer token audience mismatch");
  return claims as JwtClaims;
}

export function authenticationContextFromJwtClaims(claims: JwtClaims): AuthenticationContext | undefined {
  if (claims.auth_time === undefined) return undefined;
  return {
    auth_time: claims.auth_time,
    ...(claims.amr ? { amr: [...claims.amr] } : {}),
    ...(claims.acr ? { acr: claims.acr } : {}),
  };
}

export function assertRecentAuthenticationContext(
  authentication: AuthenticationContext | undefined,
  nowSeconds: number,
  maxAgeSeconds = 15 * 60,
  futureClockSkewSeconds = 60,
): void {
  const authTime = authentication?.auth_time;
  if (!Number.isInteger(authTime) || !authTime || authTime <= 0) {
    throw errors.authentication("Recent authentication is required for this privileged action");
  }
  const ageSeconds = nowSeconds - authTime;
  if (ageSeconds < -futureClockSkewSeconds || ageSeconds > maxAgeSeconds) {
    throw errors.authentication("Recent authentication is required for this privileged action");
  }
}

/** A per-tenant verification key (the derived key, not the platform master). */
export interface TrustedIdentityKey {
  key_id: string;
  secret: string;
}

/**
 * Derives a per-tenant, per-generation signing key from the platform master
 * secret. The derived key is bound to both the tenant and the key id, so a
 * signature is only valid for the tenant it was issued for, and so tenant
 * workers can be provisioned with only their own derived key — a leaked tenant
 * key cannot forge identities for any other tenant.
 */
export async function deriveIdentityKey(masterSecret: string, tenantId: string, keyId: string): Promise<string> {
  return bytesToHex(await hmacSha256(`cf-trusted-identity:v1:${keyId}:${tenantId}`, masterSecret));
}

/**
 * The credential the platform presents to an APP's Worker, so the app can tell a real
 * platform call from anything else that reaches it.
 *
 * Derived per (tenant, app) and NOT shared with anything else. It previously was
 * `INTERNAL_SERVICE_TOKEN` — the platform's own service credential, the one that
 * authenticates `/internal/events`, `/internal/maintenance`, `/internal/outbox/flush`
 * and `/internal/reconciliation` on every tenant Worker, and which this deployment
 * shares across all tenants. Handing that to third-party app code inverts the trust
 * direction: a credential meant to prove "the platform is calling you" also grants
 * "you may call the platform's internals", on every tenant, as the platform.
 *
 * Domain-separated from `deriveIdentityKey` by the label, so an app credential can
 * never be replayed as a trusted identity. Per-app, so one leaked app key does not
 * let its holder impersonate the platform to a DIFFERENT app.
 */
export async function deriveAppCallKey(masterSecret: string, tenantId: string, appId: string): Promise<string> {
  return bytesToHex(await hmacSha256(`cf-app-call:v1:${tenantId}:${appId}`, masterSecret));
}

export async function createTrustedIdentity(input: {
  tenantId: string;
  actor: Actor;
  traceId: string;
  masterSecret: string;
  keyId: string;
  authentication?: AuthenticationContext;
  nowSeconds?: number;
  ttlSeconds?: number;
}): Promise<{ encoded: string; signature: string; identity: SecurityTrustedIdentity }> {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (input.authentication) validateAuthenticationContext(input.authentication, issuedAt);
  const identity: SecurityTrustedIdentity = {
    tenant_id: input.tenantId,
    actor: input.actor,
    trace_id: input.traceId,
    issued_at: issuedAt,
    expires_at: issuedAt + (input.ttlSeconds ?? 60),
    key_id: input.keyId,
    ...(input.authentication ? { authentication: cloneAuthenticationContext(input.authentication) } : {}),
  };
  const encoded = base64UrlEncode(JSON.stringify(identity));
  const signingKey = await deriveIdentityKey(input.masterSecret, input.tenantId, input.keyId);
  const signature = base64UrlEncodeBytes(await hmacSha256(encoded, signingKey));
  return { encoded, signature, identity };
}

export async function verifyTrustedIdentity(request: Request, input: {
  tenantId: string;
  /** Pre-derived per-tenant keys (hardened tenant worker holds only these). */
  keys?: TrustedIdentityKey[];
  /** Platform master secret to derive from (dev / gateway-colocated). */
  masterSecret?: string;
  traceId?: string;
  nowSeconds?: number;
}): Promise<SecurityTrustedIdentity> {
  const encoded = request.headers.get(IDENTITY_HEADER);
  const signature = request.headers.get(IDENTITY_SIGNATURE_HEADER);
  if (!encoded || !signature) throw errors.authentication("Missing trusted identity context");
  // Read (untrusted) to select the key by id; the value is not trusted until the
  // signature is verified below, and the key is always bound to the caller-
  // supplied tenant, never to the tenant claimed inside the envelope.
  const identity = parseJson(base64UrlDecode(encoded), "trusted identity") as Partial<SecurityTrustedIdentity>;
  if (typeof identity.key_id !== "string" || !identity.key_id) throw errors.authentication("Trusted identity is missing key id");
  const verificationKey = await resolveIdentityKey(input, identity.key_id);
  if (!verificationKey) throw errors.authentication("Trusted identity key id is not recognized");
  const expected = await hmacSha256(encoded, verificationKey);
  if (!timingSafeEqual(base64UrlDecodeBytes(signature), expected)) throw errors.authentication("Invalid trusted identity signature");
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (identity.tenant_id !== input.tenantId) throw errors.authentication("Trusted identity tenant mismatch");
  if (typeof identity.issued_at !== "number" || typeof identity.expires_at !== "number" || identity.expires_at <= now || identity.issued_at > now + 30) {
    throw errors.authentication("Trusted identity context expired or invalid");
  }
  if (input.traceId && identity.trace_id !== input.traceId) throw errors.authentication("Trusted identity trace mismatch");
  if (!identity.actor || typeof identity.actor.user_id !== "string" || !Array.isArray(identity.actor.roles)) {
    throw errors.authentication("Trusted identity actor is invalid");
  }
  if (identity.authentication !== undefined) validateAuthenticationContext(identity.authentication, now);
  return identity as SecurityTrustedIdentity;
}

function validateAuthenticationContext(authentication: AuthenticationContext, nowSeconds: number): void {
  if (!Number.isInteger(authentication.auth_time) || authentication.auth_time <= 0 || authentication.auth_time > nowSeconds + 60) {
    throw errors.authentication("Trusted authentication time is invalid");
  }
  if (authentication.amr !== undefined && (!Array.isArray(authentication.amr) || authentication.amr.length > 16 || !authentication.amr.every((method) => typeof method === "string" && method.length > 0 && method.length <= 64))) {
    throw errors.authentication("Trusted authentication methods are invalid");
  }
  if (authentication.acr !== undefined && (typeof authentication.acr !== "string" || !authentication.acr || authentication.acr.length > 256)) {
    throw errors.authentication("Trusted authentication context class is invalid");
  }
}

function cloneAuthenticationContext(authentication: AuthenticationContext): AuthenticationContext {
  return {
    auth_time: authentication.auth_time,
    ...(authentication.amr ? { amr: [...authentication.amr] } : {}),
    ...(authentication.acr ? { acr: authentication.acr } : {}),
  };
}

async function resolveIdentityKey(
  input: { tenantId: string; keys?: TrustedIdentityKey[]; masterSecret?: string },
  keyId: string,
): Promise<string | undefined> {
  if (input.keys) {
    return input.keys.find((candidate) => candidate.key_id === keyId)?.secret;
  }
  if (input.masterSecret) return deriveIdentityKey(input.masterSecret, input.tenantId, keyId);
  return undefined;
}

export function staticDevelopmentActor(serialized?: string): Actor {
  if (!serialized) return { user_id: "Administrator", roles: ["System Manager"] };
  const parsed = parseJson(serialized, "DEV_ACTOR_JSON") as Partial<Actor>;
  if (typeof parsed.user_id !== "string" || !Array.isArray(parsed.roles) || !parsed.roles.every((role) => typeof role === "string")) {
    throw errors.authentication("DEV_ACTOR_JSON is invalid");
  }
  return parsed as Actor;
}

export function stripUntrustedPlatformHeaders(headers: Headers): void {
  for (const name of [
    IDENTITY_HEADER,
    IDENTITY_SIGNATURE_HEADER,
    APP_CALLBACK_HEADER,
    "x-cloudforge-tenant",
    "x-cloudforge-trace-id",
    "x-cloudforge-actor",
    "x-cloudforge-roles",
    "x-cloudforge-auth-mode",
  ]) headers.delete(name);
}

export function assertInternalService(request: Request, expectedToken?: string): void {
  if (!expectedToken) throw errors.authentication("Internal service token is not configured");
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  const provided = authorization.startsWith(prefix) ? authorization.slice(prefix.length) : "";
  const encoder = new TextEncoder();
  if (!timingSafeEqual(encoder.encode(provided), encoder.encode(expectedToken))) {
    throw errors.authentication("Internal service authentication failed");
  }
}

async function hmacSha256(value: string, secret: string): Promise<Uint8Array> {
  if (!secret || secret.length < 32) throw errors.authentication("Authentication secret must contain at least 32 characters");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

function audienceMatches(value: string | string[] | undefined, expected: string): boolean {
  return typeof value === "string" ? value === expected : Array.isArray(value) && value.includes(expected);
}

function parseJson(value: string, name: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw errors.authentication(`${name} is not valid JSON`); }
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try { binary = atob(normalized); }
  catch { throw errors.authentication("Invalid base64url value"); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export * from "./user-store.js";
