/**
 * Frappe-shaped sessions: a `sid` cookie plus an `X-Frappe-CSRF-Token` header.
 *
 * The kernel authenticates with a bearer JWT, which a browser-based Desk cannot
 * use safely (any script on the page can read a token held in JS, and a token in
 * `localStorage` survives logout). Frappe clients expect a cookie session, so
 * this is a real security boundary rather than a shape translation.
 *
 * Design:
 *
 * - The `sid` is a signed, stateless token: `payload.signature`, HMAC-SHA256
 *   under a key derived per tenant. Nothing is looked up on the hot path.
 * - The cookie is `HttpOnly`, so a cookie session cannot be exfiltrated by
 *   injected script the way a readable token can.
 * - CSRF uses double-submit WITH BINDING: a nonce is minted inside the signed
 *   payload and must be echoed in the header. An attacker's cross-site form can
 *   send the cookie but cannot read the nonce to set the header, and — unlike a
 *   plain double-submit — cannot substitute a nonce of their own choosing
 *   because it must match the one sealed inside this exact session.
 * - `epoch` is carried in the payload and compared against the user's stored
 *   epoch, which is what makes "log out other sessions" and forced revocation
 *   possible without a session table.
 */

import type { Actor } from "../../contracts/src/index.js";
import { errors, timingSafeEqualString } from "../../core/src/index.js";

export const SESSION_COOKIE = "sid";
export const CSRF_HEADER = "x-frappe-csrf-token";
/** Frappe's value for "not logged in"; clients treat it as the guest session. */
export const GUEST_SID = "Guest";

const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

interface SessionPayload {
  /** Format version, so the token shape can change without accepting old forms. */
  v: 1;
  /** Tenant the session belongs to. */
  t: string;
  /** User id. */
  u: string;
  /** Roles, resolved at login. */
  r: string[];
  /** Credential epoch; a bump invalidates every session for the user. */
  e: number;
  /** Expiry, epoch seconds. */
  x: number;
  /** Last successful primary authentication, epoch seconds. Sliding a session must preserve it. */
  i: number;
  /** CSRF nonce, echoed by the client in the header. */
  c: string;
  /** Optional user preferences carried for the boot payload. */
  l?: string;
  z?: string;
}

export interface Session {
  tenantId: string;
  actor: Actor;
  epoch: number;
  csrfToken: string;
  expiresAt: number;
  authenticatedAt: number;
}

export interface MintSessionInput {
  tenantId: string;
  userId: string;
  roles: string[];
  epoch: number;
  secret: string;
  ttlSeconds?: number;
  language?: string;
  timezone?: string;
  now?: number;
  /** Preserved when extending a session; omitted only for a real password login. */
  authenticatedAt?: number;
}

export interface MintedSession {
  sid: string;
  csrfToken: string;
  expiresAt: number;
  cookie: string;
}

export async function mintSession(input: MintSessionInput): Promise<MintedSession> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: SessionPayload = {
    v: 1,
    t: input.tenantId,
    u: input.userId,
    r: [...input.roles],
    e: input.epoch,
    x: expiresAt,
    i: input.authenticatedAt ?? now,
    c: randomToken(),
    ...(input.language ? { l: input.language } : {}),
    ...(input.timezone ? { z: input.timezone } : {}),
  };
  const encoded = b64urlEncode(JSON.stringify(payload));
  const signature = await sign(encoded, input.secret, input.tenantId);
  const sid = `${encoded}.${signature}`;
  return { sid, csrfToken: payload.c, expiresAt, cookie: sessionCookie(sid, expiresAt - now) };
}

/**
 * Verifies a `sid`, returning the session it encodes.
 *
 * Signature is checked BEFORE the payload is trusted for anything, and the
 * tenant inside the token must match the tenant the request was routed to —
 * otherwise a valid session for one tenant would be replayable against another.
 */
export async function verifySession(sid: string, tenantId: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<Session> {
  const separator = sid.lastIndexOf(".");
  if (separator <= 0) throw errors.authentication("Session is invalid");
  const encoded = sid.slice(0, separator);
  const provided = sid.slice(separator + 1);
  const expected = await sign(encoded, secret, tenantId);
  if (!timingSafeEqualString(provided, expected)) throw errors.authentication("Session is invalid");

  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(encoded)) as SessionPayload;
  } catch {
    throw errors.authentication("Session is invalid");
  }
  if (payload.v !== 1) throw errors.authentication("Session is invalid");
  // The signing key is already tenant-derived, but an explicit check keeps the
  // failure legible instead of surfacing as a signature mismatch.
  if (payload.t !== tenantId) throw errors.authentication("Session does not belong to this tenant");
  if (!Number.isFinite(payload.x) || payload.x <= now) throw errors.authentication("Session has expired");
  if (!Number.isFinite(payload.i) || payload.i <= 0 || payload.i > now + 60) throw errors.authentication("Session is invalid");
  if (typeof payload.u !== "string" || !payload.u) throw errors.authentication("Session is invalid");
  if (!Array.isArray(payload.r) || payload.r.some((role) => typeof role !== "string")) throw errors.authentication("Session is invalid");

  return {
    tenantId: payload.t,
    actor: {
      user_id: payload.u,
      roles: [...payload.r],
      ...(payload.l ? { locale: payload.l } : {}),
      ...(payload.z ? { timezone: payload.z } : {}),
    },
    epoch: typeof payload.e === "number" ? payload.e : 0,
    csrfToken: typeof payload.c === "string" ? payload.c : "",
    expiresAt: payload.x,
    authenticatedAt: payload.i,
  };
}

/**
 * Enforces CSRF on state-changing requests.
 *
 * Read-only methods are exempt because they cannot be used to change state, and
 * requiring a header on them would break plain navigation. Everything else must
 * echo the nonce sealed inside this session.
 */
export function assertCsrf(request: Request, session: Session): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const provided = request.headers.get(CSRF_HEADER) ?? "";
  if (!provided || !session.csrfToken || !timingSafeEqualString(provided, session.csrfToken)) {
    throw errors.permission("CSRF token is missing or does not match this session");
  }
}

/** Reads the `sid` cookie. Returns null for a missing or guest session. */
export function readSid(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value && value !== GUEST_SID ? value : null;
  }
  return null;
}

export function sessionCookie(sid: string, maxAgeSeconds: number): string {
  // Lax rather than Strict: the Desk is a single-origin app, and Strict would
  // drop the cookie on a top-level navigation back into the app (e.g. following
  // a link from an email), logging the user out for no security gain here.
  return `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(maxAgeSeconds, 0)}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=${GUEST_SID}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(bytes = 24): string {
  return b64urlEncodeBytes(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sign(value: string, secret: string, tenantId: string): Promise<string> {
  // Key is bound to the tenant so a session minted for one tenant cannot verify
  // against another even if the platform secret is shared.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${secret}:session:${tenantId}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return b64urlEncodeBytes(new Uint8Array(signature));
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncode(text: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(text));
}

function b64urlDecode(value: string): string {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
