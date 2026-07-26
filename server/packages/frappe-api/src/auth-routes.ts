/**
 * Login, logout and session establishment.
 *
 * These run BEFORE there is an actor, so they are deliberately separate from the
 * authenticated router and take only what they need: the user directory and the
 * session signing secret.
 *
 * The session cookie is verified here, in the tenant worker, rather than at the
 * gateway. The platform rule is that the tenant worker must never trust
 * client-supplied identity — a signed cookie it verifies itself with a
 * tenant-derived key is not client-supplied identity, it is server-issued and
 * cryptographically checked. Keeping it here also means revocation (epoch,
 * disabled account) is checked against the live user directory on every request,
 * which a gateway holding no database binding could not do.
 */

import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { AuthenticatedUser, D1UserStore } from "../../auth/src/index.js";
import { readFrappeArgs } from "./args.js";
import { faultResponse, methodResponse } from "./envelope.js";
import { verifyPassword } from "./password.js";
import {
  assertCsrf, clearedSessionCookie, mintSession, readSid, sessionCookie, verifySession, type Session,
} from "./session.js";

export const LOGIN_PATH = "/api/method/login";
export const LOGOUT_PATH = "/api/method/logout";

/** Paths that must work without an established session. */
export function isPublicFrappePath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === LOGOUT_PATH;
}

export interface AuthRouteContext {
  tenantId: string;
  users: D1UserStore;
  sessionSecret: string;
  traceId: string;
  now(): string;
}

export interface EstablishedSession {
  session: Session;
  user: AuthenticatedUser;
  actor: Actor;
  /** Set when the cookie should be refreshed on the response. */
  refreshedCookie?: string;
}

/**
 * Resolves the caller's session from the `sid` cookie.
 *
 * Returns null when there is no session at all, so the caller can answer as
 * Frappe does for a guest. Throws when a session exists but is no longer usable
 * (expired, revoked, disabled account) — that is a different situation from never
 * having logged in, and the client distinguishes them.
 */
export async function establishSession(request: Request, context: AuthRouteContext): Promise<EstablishedSession | null> {
  const sid = readSid(request);
  if (!sid) return null;

  const session = await verifySession(sid, context.tenantId, context.sessionSecret);
  // A valid signature proves only that we issued the token. Everything that can
  // have changed since is re-checked against the directory.
  const user = await context.users.assertSessionStillValid(context.tenantId, session.actor.user_id, session.epoch);

  // Roles come from the directory, not from the token: revoking a role must take
  // effect immediately rather than when the session expires.
  const actor: Actor = {
    user_id: user.user_id,
    roles: user.roles,
    ...(user.language ? { locale: user.language } : {}),
    ...(user.time_zone ? { timezone: user.time_zone } : {}),
  };
  return { session, user, actor };
}

/** Enforces CSRF for an established session. Read-only methods are exempt. */
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
  // Absent credentials are refused with the same message as wrong ones, so the
  // shape of the request cannot be used to probe.
  if (!login || !password) throw invalidCredentials();

  const found = await context.users.findByLogin(context.tenantId, login);
  if (!found) {
    // Still spend the hashing cost on a nonexistent user. Returning immediately
    // would make "user does not exist" measurably faster than "wrong password",
    // turning login timing into a user-enumeration oracle.
    await verifyPassword(password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (!found.passwordHash) throw invalidCredentials();
  if (!await verifyPassword(password, found.passwordHash)) throw invalidCredentials();
  // Checked after the password so a disabled account is not distinguishable from
  // a wrong password by an unauthenticated caller.
  if (!found.user.enabled) throw invalidCredentials();

  const roles = await context.users.listRoles(context.tenantId, found.user.user_id);
  const now = context.now();
  const minted = await mintSession({
    tenantId: context.tenantId,
    userId: found.user.user_id,
    roles,
    epoch: found.user.session_epoch,
    secret: context.sessionSecret,
    ...(found.user.language ? { language: found.user.language } : {}),
    ...(found.user.time_zone ? { timezone: found.user.time_zone } : {}),
  });
  await context.users.recordLogin(context.tenantId, found.user.user_id, now);

  return methodResponse("Logged In", 200, {
    "set-cookie": minted.cookie,
    // Frappe returns the CSRF token in the boot payload; exposing it on the login
    // response too lets a client make its first write without a boot round-trip.
    "x-frappe-csrf-token": minted.csrfToken,
  });
}

async function handleLogout(request: Request, context: AuthRouteContext): Promise<Response> {
  // Logout is idempotent and must work even with an unusable session: a user
  // whose session was revoked still needs the cookie cleared.
  const sid = readSid(request);
  if (sid) {
    try {
      const session = await verifySession(sid, context.tenantId, context.sessionSecret);
      assertCsrf(request, session);
    } catch {
      // Nothing to revoke server-side; clearing the cookie is still correct.
    }
  }
  return methodResponse("Logged Out", 200, { "set-cookie": clearedSessionCookie() });
}

/** Refreshes the cookie's lifetime without re-issuing the CSRF nonce. */
export async function slideSession(established: EstablishedSession, context: AuthRouteContext, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const remaining = established.session.expiresAt - nowSeconds;
  // Only slide in the last quarter of the lifetime, so a busy client does not
  // mint a new cookie on every request.
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
  });
  return sessionCookie(minted.sid, minted.expiresAt - nowSeconds);
}

function invalidCredentials(): Error {
  return errors.authentication("Invalid login credentials");
}

/**
 * A real, well-formed hash of a value nobody can supply. Used only to keep the
 * failure path's cost equal to the success path's.
 */
const DUMMY_HASH = "pbkdf2-sha256$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
