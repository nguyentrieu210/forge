import type { D1SessionRegistry } from "../../auth/src/index.js";
import { errors } from "../../core/src/index.js";
import { readFrappeArgs } from "./args.js";
import { methodResponse } from "./envelope.js";

export const LIST_SESSIONS_PATH = "/api/method/metaforge.api.list_sessions";
export const REVOKE_SESSION_PATH = "/api/method/metaforge.api.revoke_session";
export const LOGOUT_OTHER_SESSIONS_PATH = "/api/method/metaforge.api.logout_other_sessions";

const SESSION_MANAGEMENT_PATHS = new Set([
  LIST_SESSIONS_PATH,
  REVOKE_SESSION_PATH,
  LOGOUT_OTHER_SESSIONS_PATH,
]);

export interface SessionManagementContext {
  tenantId: string;
  userId: string;
  traceId: string;
  now: string;
  sessions: D1SessionRegistry;
  currentSessionId?: string;
  /** Legacy fallback when the caller's cookie predates per-session ids. */
  revokeAllSessions?: () => Promise<number>;
}

export function isSessionManagementPath(pathname: string): boolean {
  return SESSION_MANAGEMENT_PATHS.has(pathname);
}

/**
 * Frappe-shaped session inventory/revocation methods.
 *
 * Authentication is intentionally outside this function: tenant-worker and the generic
 * Frappe wrapper both require a real cookie session before calling it. This function owns
 * only the one canonical session lifecycle behavior.
 */
export async function routeSessionManagementApi(
  request: Request,
  url: URL,
  context: SessionManagementContext,
): Promise<Response | null> {
  if (!isSessionManagementPath(url.pathname)) return null;

  if (url.pathname === LIST_SESSIONS_PATH) {
    if (request.method.toUpperCase() !== "GET") throw errors.validation("list_sessions requires GET");
    const args = await readFrappeArgs(request, url);
    const limitText = args.text("limit")?.trim();
    const limit = limitText === undefined ? 100 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw errors.validation("limit must be an integer from 1 to 250");
    return methodResponse({
      sessions: await context.sessions.list(
        context.tenantId,
        context.userId,
        context.now,
        context.currentSessionId,
        limit,
      ),
    });
  }

  if (url.pathname === REVOKE_SESSION_PATH) {
    if (request.method.toUpperCase() !== "POST") throw errors.validation("revoke_session requires POST");
    const args = await readFrappeArgs(request, url);
    const sessionId = args.requireText("session_id", 128);
    const reason = args.text("reason")?.trim() ?? "";
    if (reason.length > 500) throw errors.validation("reason must be at most 500 characters");
    const revoked = await context.sessions.revokeOne(
      context.tenantId,
      context.userId,
      sessionId,
      {
        actorUserId: context.userId,
        traceId: context.traceId,
        source: "session-manager",
        ...(reason ? { reason } : {}),
      },
      context.now,
    );
    return methodResponse({ session_id: sessionId, revoked });
  }

  if (request.method.toUpperCase() !== "POST") throw errors.validation("logout_other_sessions requires POST");
  if (context.currentSessionId) {
    const revokedSessions = await context.sessions.revokeOthers(
      context.tenantId,
      context.userId,
      context.currentSessionId,
      {
        actorUserId: context.userId,
        traceId: context.traceId,
        source: "metaforge.api.logout_other_sessions",
        reason: "logout other sessions",
      },
      context.now,
    );
    return methodResponse({
      revoked: true,
      revoked_sessions: revokedSessions,
      reauthenticate_required: false,
    });
  }

  if (!context.revokeAllSessions) throw errors.misconfigured("Legacy session revocation fallback is unavailable");
  const epoch = await context.revokeAllSessions();
  return methodResponse({ revoked: true, session_epoch: epoch, reauthenticate_required: true });
}
