/**
 * Login, logout and session establishment.
 *
 * These run BEFORE there is an actor, so they are deliberately separate from the
 * authenticated router and take only what they need: the user directory and the
 * session signing secret.
 */

import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { AuthenticatedUser, D1SessionRegistry, D1UserStore } from "../../auth/src/index.js";
import { visitorKey } from "../../frappe-model/src/index.js";
import { readFrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import { assertLoginSecondFactor } from "./login-mfa.js";
import { verifyPassword } from "./password.js";
import {
  assertCsrf, clearedSessionCookie, mintSession, randomToken, readSid, sessionCookie, verifySession, type Session,
} from "./session.js";

export const LOGIN_PATH = "/api/method/login";
export const LOGOUT_PATH = "/api/method/logout";

export function isPublicFrappePath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === LOGOUT_PATH;
}

export interface AuthRouteContext {
  tenantId: string;
  users: D1UserStore;
  sessionSecret: string;
  traceId: string;
  now(): string;
  rateLimit?: { db: D1Database; salt: string; clientAddress: string };
}

export interface EstablishedSession {
  session: Session;
  user: AuthenticatedUser;
  actor: Actor;
  refreshedCookie?: string;
}

/**
 * Resolves the caller's session from the `sid` cookie.
 *
 * The signature proves issuance, the user epoch proves global validity, and a new-style
 * `sessionId` additionally proves this exact session has not been individually revoked.
 * Legacy cookies without `sessionId` keep the pre-registry behavior until they expire.
 */
export async function establishSession(request: Request, context: AuthRouteContext): Promise<EstablishedSession | null> {
  const sid = readSid(request);
  if (!sid) return null;

  const session = await verifySession(sid, context.tenantId, context.sessionSecret, isoSeconds(context.now()));
  const user = await context.users.assertSessionStillValid(context.tenantId, session.actor.user_id, session.epoch);
  if (session.sessionId) {
    const sessions = optionalSessionRegistry(context.users);
    if (!sessions) throw errors.misconfigured("Session registry is unavailable");
    await sessions.assertActive(context.tenantId, user.user_id, session.sessionId, context.now());
  }

  const actor: Actor = {
    user_id: user.user_id,
    roles: user.roles,
    ...(user.language ? { locale: user.language } : {}),
    ...(user.time_zone ? { timezone: user.time_zone } : {}),
  };
  return { session, user, actor };
}

export function assertSessionCsrf(request: Request, established: EstablishedSession): void {
  assertCsrf(request, established.session);
}

export async function routeFrappeAuth(request: Request, url: URL, context: AuthRouteContext): Promise<Response | null> {
  if (!isPublicFrappePath(url.pathname)) return null;
  try {
    if (url.pathname === LOGIN_PATH) return await handleLogin(request, url, context);
    return await handleLogout(request, context);
  } catch (error) {
    return faultResponse(error, context.traceId);
  }
}

async function handleLogin(request: Request, url: URL, context: AuthRouteContext): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") throw errors.validation("Login requires POST");
  const args = await readFrappeArgs(request, url);
  const login = args.text("usr") ?? "";
  const password = args.text("pwd") ?? "";
  if (!login || !password) throw invalidCredentials();
  if (context.rateLimit) await consumeLoginAllowance(context, login);

  const found = await context.users.findByLogin(context.tenantId, login);
  if (!found) {
    await verifyPassword(password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (!found.passwordHash) throw invalidCredentials();
  if (!await verifyPassword(password, found.passwordHash)) throw invalidCredentials();
  if (!found.user.enabled) throw invalidCredentials();

  // MFA is checked only after primary-password proof, and before clearing the successful-login
  // limiter, recording login time or minting any browser session. `mfa_code` is canonical;
  // `otp` is retained as a compatibility alias for Frappe-shaped clients.
  await assertLoginSecondFactor({
    tenantId: context.tenantId,
    userId: found.user.user_id,
    traceId: context.traceId,
    now: context.now(),
    mfa: context.users.mfa,
  }, args.text("mfa_code") ?? args.text("otp") ?? undefined);

  if (context.rateLimit) await clearSuccessfulLoginLimit(context, login);

  const roles = await context.users.listRoles(context.tenantId, found.user.user_id);
  const now = context.now();
  const nowSeconds = isoSeconds(now);
  const sessions = optionalSessionRegistry(context.users);
  // Production D1UserStore always has a registry. Keeping this optional only preserves
  // lightweight unit-test/custom fixtures that predate the registry; they mint a legacy
  // cookie rather than crashing or pretending to have server-side revocation state.
  const sessionId = sessions ? randomToken(18) : undefined;
  const minted = await mintSession({
    tenantId: context.tenantId,
    userId: found.user.user_id,
    roles,
    epoch: found.user.session_epoch,
    secret: context.sessionSecret,
    ...(sessionId ? { sessionId } : {}),
    now: nowSeconds,
    ...(found.user.language ? { language: found.user.language } : {}),
    ...(found.user.time_zone ? { timezone: found.user.time_zone } : {}),
  });
  // The cookie is not returned until registry persistence succeeds, so a failed D1 write
  // cannot create an untracked new-style session in the browser.
  await context.users.recordLogin(context.tenantId, found.user.user_id, now);
  if (sessions && sessionId) {
    await sessions.register(
      context.tenantId,
      found.user.user_id,
      sessionId,
      new Date(nowSeconds * 1000).toISOString(),
      new Date(minted.expiresAt * 1000).toISOString(),
    );
    await sessions.purgeExpired(context.tenantId, now).catch(() => 0);
  }

  return methodResponse("Logged In", 200, {
    "set-cookie": minted.cookie,
    "x-frappe-csrf-token": minted.csrfToken,
  });
}

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_ACCOUNT_ATTEMPTS = 8;
const LOGIN_IP_ATTEMPTS = 30;

function loginWindow(now: string): string {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error("Auth clock did not return an ISO timestamp");
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / LOGIN_WINDOW_MINUTES) * LOGIN_WINDOW_MINUTES, 0, 0);
  return date.toISOString();
}

async function consumeLoginAllowance(context: AuthRouteContext, login: string): Promise<void> {
  const limit = context.rateLimit!;
  const now = context.now();
  const window = loginWindow(now);
  const subjects = [
    { dimension: "ip", hash: await visitorKey(limit.clientAddress || "unknown", "login-ip", limit.salt), max: LOGIN_IP_ATTEMPTS },
    { dimension: "account", hash: await visitorKey(login.trim().toLowerCase(), "login-account", limit.salt), max: LOGIN_ACCOUNT_ATTEMPTS },
  ] as const;
  for (const subject of subjects) {
    const row = await limit.db.prepare(
      `INSERT INTO login_rate_limits(tenant_id,dimension,subject_hash,window_start,attempt_count,modified_at)
       VALUES(?1,?2,?3,?4,1,?5)
       ON CONFLICT(tenant_id,dimension,subject_hash,window_start)
       DO UPDATE SET attempt_count=attempt_count+1,modified_at=excluded.modified_at
       RETURNING attempt_count`,
    ).bind(context.tenantId, subject.dimension, subject.hash, window, now).first<{ attempt_count: number }>();
    if ((row?.attempt_count ?? 0) > subject.max) throw errors.rateLimited();
  }
  const cutoff = new Date(new Date(now).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await limit.db.prepare(
    `DELETE FROM login_rate_limits WHERE tenant_id=?1 AND window_start<?2`,
  ).bind(context.tenantId, cutoff).run();
}

async function clearSuccessfulLoginLimit(context: AuthRouteContext, login: string): Promise<void> {
  const limit = context.rateLimit!;
  const hash = await visitorKey(login.trim().toLowerCase(), "login-account", limit.salt);
  await limit.db.prepare(
    `DELETE FROM login_rate_limits WHERE tenant_id=?1 AND dimension='account' AND subject_hash=?2`,
  ).bind(context.tenantId, hash).run();
}

async function handleLogout(request: Request, context: AuthRouteContext): Promise<Response> {
  const sid = readSid(request);
  if (sid) {
    try {
      const session = await verifySession(sid, context.tenantId, context.sessionSecret, isoSeconds(context.now()));
      assertCsrf(request, session);
      if (session.sessionId) {
        await optionalSessionRegistry(context.users)?.revokeCurrent(
          context.tenantId,
          session.actor.user_id,
          session.sessionId,
          context.now(),
        );
      }
    } catch {
      // Logout stays idempotent even when the session is expired/revoked/malformed.
    }
  }
  return methodResponse("Logged Out", 200, { "set-cookie": clearedSessionCookie() });
}

/** Refreshes the cookie lifetime while preserving auth time, CSRF and session identity. */
export async function slideSession(established: EstablishedSession, context: AuthRouteContext, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const remaining = established.session.expiresAt - nowSeconds;
  if (remaining > 3 * 60 * 60) return null;
  const minted = await mintSession({
    tenantId: context.tenantId,
    userId: established.user.user_id,
    roles: established.user.roles,
    epoch: established.user.session_epoch,
    secret: context.sessionSecret,
    ...(established.user.language ? { language: established.user.language } : {}),
    ...(established.user.time_zone ? { timezone: established.user.time_zone } : {}),
    now: nowSeconds,
    authenticatedAt: established.session.authenticatedAt,
    ...(established.session.sessionId ? { sessionId: established.session.sessionId } : {}),
  });
  if (established.session.sessionId) {
    const sessions = optionalSessionRegistry(context.users);
    if (!sessions) throw errors.misconfigured("Session registry is unavailable");
    await sessions.extend(
      context.tenantId,
      established.user.user_id,
      established.session.sessionId,
      new Date(minted.expiresAt * 1000).toISOString(),
      new Date(nowSeconds * 1000).toISOString(),
    );
  }
  return sessionCookie(minted.sid, minted.expiresAt - nowSeconds);
}

function optionalSessionRegistry(users: D1UserStore): D1SessionRegistry | undefined {
  return (users as D1UserStore & { sessions?: D1SessionRegistry }).sessions;
}

function isoSeconds(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Auth clock did not return an ISO timestamp");
  return Math.floor(parsed / 1000);
}

function invalidCredentials(): Error {
  return errors.authentication("Invalid login credentials");
}

const DUMMY_HASH = "pbkdf2-sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
