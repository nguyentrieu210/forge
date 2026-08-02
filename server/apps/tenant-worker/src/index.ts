import {
  APP_CALLBACK_HEADER,
  D1UserStore,
  staticDevelopmentActor,
  verifyTrustedIdentity,
  type TrustedIdentityKey,
} from "../../../packages/auth/src/index.js";
import {
  assertSessionCsrf,
  establishSession,
  faultResponse,
  methodResponse,
  readFrappeArgs,
  slideSession,
  type AuthRouteContext,
  type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import type { Actor } from "../../../packages/contracts/src/index.js";
import { errorResponse, errors, randomId } from "../../../packages/core/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  MetadataPermissionService,
} from "../../../packages/frappe-model/src/index.js";
import coreWorker from "./index-core.js";
import {
  isDailyLedgerApiPath,
  isDailyLedgerFrappePath,
  routeDailyLedgerApi,
} from "./daily-ledger-api.js";
import {
  assertRecentNativeSecurityAuthentication,
  requiresRecentNativeSecurityAuthentication,
} from "./native-security.js";
import {
  isPhysicalStockApiPath,
  isPhysicalStockFrappePath,
  routePhysicalStockApi,
} from "./physical-stock-api.js";
import type { TenantEnv } from "./env.js";

export * from "./index-core.js";

const LIST_SESSIONS_PATH = "/api/method/metaforge.api.list_sessions";
const REVOKE_SESSION_PATH = "/api/method/metaforge.api.revoke_session";
const LOGOUT_OTHER_SESSIONS_PATH = "/api/method/metaforge.api.logout_other_sessions";
const SESSION_MANAGEMENT_PATHS = new Set([
  LIST_SESSIONS_PATH,
  REVOKE_SESSION_PATH,
  LOGOUT_OTHER_SESSIONS_PATH,
]);

interface InterceptedRouteAuthentication {
  actor: Actor;
  established?: EstablishedSession;
  authContext?: AuthRouteContext;
}

/**
 * Thin entrypoint wrapper for bounded authenticated report/operation routes, cookie-bound
 * session management, and the privileged native-administration step-up boundary. Existing
 * core route semantics and scheduled tasks remain delegated to index-core.ts.
 */
export default {
  async fetch(request: Request, env: TenantEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const physicalStock = isPhysicalStockApiPath(url.pathname);
    const dailyLedger = isDailyLedgerApiPath(url.pathname);
    const sessionManagement = SESSION_MANAGEMENT_PATHS.has(url.pathname);
    const nativeSecurity = requiresRecentNativeSecurityAuthentication(request.method, url.pathname);
    if (!physicalStock && !dailyLedger && !sessionManagement && !nativeSecurity) return coreWorker.fetch(request, env);

    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const tenantId = resolveTenant(request, env);
      if (!tenantId) throw errors.authentication("Missing tenant context");

      if (nativeSecurity) {
        await assertRecentNativeSecurityAuthentication(request, env, tenantId, traceId);
        // The wrapper owns only the step-up invariant. Core still owns System Manager
        // authorization, validation and persistence, so passing step-up must not create a
        // second implementation of any native admin route.
        if (!physicalStock && !dailyLedger && !sessionManagement) return coreWorker.fetch(request, env);
      }

      const authentication = await authenticateInterceptedRoute(request, url, env, tenantId, traceId);
      const requestDb = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;

      let response: Response | null;
      if (sessionManagement) {
        response = await routeSessionManagement(request, url, tenantId, traceId, authentication);
      } else if (physicalStock) {
        const metadata = new D1MetadataStore(requestDb);
        const access = new D1DocumentAccessStore(requestDb);
        const permissions = new MetadataPermissionService(metadata, undefined, access);
        response = await routePhysicalStockApi(request, url, {
          db: requestDb,
          tenantId,
          actor: authentication.actor,
          permissions,
          traceId,
        });
      } else {
        response = await routeDailyLedgerApi(request, url, {
          db: requestDb,
          tenantId,
          actor: authentication.actor,
          traceId,
        });
      }
      if (!response) return coreWorker.fetch(request, env);

      if (authentication.established && authentication.authContext) {
        const refreshed = await slideSession(authentication.established, authentication.authContext);
        if (refreshed) response.headers.append("set-cookie", refreshed);
      }
      return response;
    } catch (error) {
      return isPhysicalStockFrappePath(url.pathname)
        || isDailyLedgerFrappePath(url.pathname)
        || SESSION_MANAGEMENT_PATHS.has(url.pathname)
        ? faultResponse(error, traceId)
        : errorResponse(error, traceId);
    }
  },

  async scheduled(controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    await coreWorker.scheduled(controller, env, ctx);
  },
};

async function routeSessionManagement(
  request: Request,
  url: URL,
  tenantId: string,
  traceId: string,
  authentication: InterceptedRouteAuthentication,
): Promise<Response> {
  const established = authentication.established;
  const authContext = authentication.authContext;
  if (!established || !authContext) throw errors.permission("A browser session is required for session management");
  const sessions = authContext.users.sessions;
  const userId = established.actor.user_id;
  const now = authContext.now();

  if (url.pathname === LIST_SESSIONS_PATH) {
    if (request.method.toUpperCase() !== "GET") throw errors.validation("list_sessions requires GET");
    const args = await readFrappeArgs(request, url);
    const limitText = args.text("limit")?.trim();
    const limit = limitText === undefined ? 100 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw errors.validation("limit must be an integer from 1 to 250");
    return methodResponse({
      sessions: await sessions.list(tenantId, userId, now, established.session.sessionId, limit),
    });
  }

  if (url.pathname === REVOKE_SESSION_PATH) {
    if (request.method.toUpperCase() !== "POST") throw errors.validation("revoke_session requires POST");
    const args = await readFrappeArgs(request, url);
    const sessionId = args.requireText("session_id", 128);
    const reason = args.text("reason")?.trim() ?? "";
    if (reason.length > 500) throw errors.validation("reason must be at most 500 characters");
    const revoked = await sessions.revokeOne(
      tenantId,
      userId,
      sessionId,
      {
        actorUserId: userId,
        traceId,
        source: "session-manager",
        ...(reason ? { reason } : {}),
      },
      now,
    );
    return methodResponse({ session_id: sessionId, revoked });
  }

  if (request.method.toUpperCase() !== "POST") throw errors.validation("logout_other_sessions requires POST");
  if (established.session.sessionId) {
    const revokedSessions = await sessions.revokeOthers(
      tenantId,
      userId,
      established.session.sessionId,
      {
        actorUserId: userId,
        traceId,
        source: "metaforge.api.logout_other_sessions",
        reason: "logout other sessions",
      },
      now,
    );
    return methodResponse({
      revoked: true,
      revoked_sessions: revokedSessions,
      reauthenticate_required: false,
    });
  }

  // Backward-compatible legacy session: there is no individual registry identity to keep.
  // Preserve the old fail-safe epoch bump, which revokes every cookie including this one.
  const epoch = await authContext.users.administration.revokeSessions(
    tenantId,
    userId,
    {
      actorUserId: userId,
      traceId,
      source: "metaforge.api.logout_other_sessions",
    },
    now,
  );
  return methodResponse({ revoked: true, session_epoch: epoch, reauthenticate_required: true });
}

function resolveTenant(request: Request, env: TenantEnv): string | null {
  const routed = request.headers.get("x-cloudforge-tenant");
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) {
    throw errors.misconfigured("Tenant binding mismatch");
  }
  return env.TENANT_ID ?? routed;
}

async function authenticateInterceptedRoute(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<InterceptedRouteAuthentication> {
  const cookieBound = isPhysicalStockFrappePath(url.pathname)
    || isDailyLedgerFrappePath(url.pathname)
    || SESSION_MANAGEMENT_PATHS.has(url.pathname);
  if (!cookieBound) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  const sessionSecret = env.SESSION_SECRET;
  const appCallback = request.headers.get(APP_CALLBACK_HEADER);
  const users = new D1UserStore(env.DB);
  const authContext: AuthRouteContext = {
    tenantId,
    users,
    sessionSecret: sessionSecret ?? "",
    traceId,
    now: () => new Date().toISOString(),
    rateLimit: {
      db: env.DB,
      salt: env.INTERNAL_AUTH_SECRET,
      clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
    },
  };

  if (sessionSecret && !appCallback) {
    const established = await establishSession(request, authContext);
    if (established) {
      assertSessionCsrf(request, established);
      return { actor: established.actor, established, authContext };
    }
  }

  if (SESSION_MANAGEMENT_PATHS.has(url.pathname)) {
    // Session administration is account-security authority. App callbacks deliberately
    // cannot borrow the user's actor identity for it.
    throw errors.permission("A browser session is required for session management");
  }

  if (appCallback) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  if (!sessionSecret && env.AUTH_MODE === "development") {
    return { actor: staticDevelopmentActor(env.DEV_ACTOR_JSON) };
  }

  throw errors.permission("Login to access this resource");
}

async function authenticateTrustedIdentity(
  request: Request,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<Actor> {
  if (env.AUTH_MODE === "development") return staticDevelopmentActor(env.DEV_ACTOR_JSON);
  const keys = trustedIdentityKeys(env);
  const identity = await verifyTrustedIdentity(request, {
    tenantId,
    traceId,
    ...(keys.length > 0 ? { keys } : { masterSecret: env.INTERNAL_AUTH_SECRET }),
  });
  return identity.actor;
}

function trustedIdentityKeys(env: TenantEnv): TrustedIdentityKey[] {
  const keys: TrustedIdentityKey[] = [];
  if (env.INTERNAL_AUTH_KEY_ID) {
    keys.push({ key_id: env.INTERNAL_AUTH_KEY_ID, secret: env.INTERNAL_AUTH_SECRET });
  }
  if (env.INTERNAL_AUTH_KEY_ID_PREVIOUS && env.INTERNAL_AUTH_SECRET_PREVIOUS) {
    keys.push({
      key_id: env.INTERNAL_AUTH_KEY_ID_PREVIOUS,
      secret: env.INTERNAL_AUTH_SECRET_PREVIOUS,
    });
  }
  return keys;
}
