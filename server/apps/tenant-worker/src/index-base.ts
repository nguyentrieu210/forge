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
  isMfaRoutePath,
  isPublicFrappePath,
  isSessionManagementPath,
  routeFrappeAuth,
  routeMfaApi,
  routeSessionManagementApi,
  slideSession,
  type AuthRouteContext,
  type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import type { Actor, JsonObject, MutationCommand, MutationReceipt } from "../../../packages/contracts/src/index.js";
import { errorResponse, errors, randomId } from "../../../packages/core/src/index.js";
import coreWorker from "./index-core.js";
import {
  isStockOperationalFrappePath,
  matchStockOperationalRoute,
  routeStockOperationalRequest,
} from "./operational-stock-routes.js";
import {
  isManufacturingOperationalFrappePath,
  matchManufacturingOperationalRoute,
  routeManufacturingOperationalRequest,
} from "./operational-manufacturing-routes.js";
import { mfaKeyRingFromEnv } from "./mfa-config.js";
import {
  assertRecentNativeSecurityAuthentication,
  requiresRecentNativeSecurityAuthentication,
} from "./native-security.js";
import type { TenantEnv } from "./env.js";

export * from "./index-core.js";

interface InterceptedRouteAuthentication {
  actor: Actor;
  established?: EstablishedSession;
  authContext?: AuthRouteContext;
}

/**
 * Thin entrypoint wrapper for bounded authenticated report/operation routes, cookie-bound
 * account security, and the privileged native-administration step-up boundary. Existing
 * core route semantics and scheduled tasks remain delegated to index-core.ts.
 */
export default {
  async fetch(request: Request, env: TenantEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const stockOperationalRoute = matchStockOperationalRoute(url.pathname);
    const manufacturingOperationalRoute = matchManufacturingOperationalRoute(url.pathname);
    const sessionManagement = isSessionManagementPath(url.pathname);
    const publicFrappeAuth = isPublicFrappePath(url.pathname);
    const mfaManagement = isMfaRoutePath(url.pathname);
    const nativeSecurity = requiresRecentNativeSecurityAuthentication(request.method, url.pathname);
    if (!stockOperationalRoute && !manufacturingOperationalRoute
      && !sessionManagement && !publicFrappeAuth && !mfaManagement && !nativeSecurity) {
      return coreWorker.fetch(request, env);
    }

    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const tenantId = resolveTenant(request, env);
      if (!tenantId) throw errors.authentication("Missing tenant context");

      if (nativeSecurity) {
        await assertRecentNativeSecurityAuthentication(request, env, tenantId, traceId);
        // The wrapper owns only the step-up invariant. Core still owns System Manager
        // authorization, validation and persistence, so passing step-up must not create a
        // second implementation of any native admin route.
        if (!stockOperationalRoute && !manufacturingOperationalRoute
          && !sessionManagement && !publicFrappeAuth && !mfaManagement) {
          return coreWorker.fetch(request, env);
        }
      }

      if (publicFrappeAuth) {
        const authContext = createAuthContext(request, env, tenantId, traceId);
        const response = await routeFrappeAuth(request, url, authContext);
        if (response) return response;
        return coreWorker.fetch(request, env);
      }

      const authentication = await authenticateInterceptedRoute(request, url, env, tenantId, traceId);
      let response: Response | null;
      if (mfaManagement) {
        const established = authentication.established;
        const authContext = authentication.authContext;
        if (!established || !authContext) throw errors.permission("A browser session is required for MFA management");
        response = await routeMfaApi(request, url, {
          tenantId,
          actor: established.actor,
          traceId,
          authenticatedAt: established.session.authenticatedAt,
          now: authContext.now(),
          mfa: authContext.users.mfa,
        });
      } else if (sessionManagement) {
        const established = authentication.established;
        const authContext = authentication.authContext;
        if (!established || !authContext) throw errors.permission("A browser session is required for session management");
        response = await routeSessionManagementApi(request, url, {
          tenantId,
          userId: established.actor.user_id,
          traceId,
          now: authContext.now(),
          sessions: authContext.users.sessions,
          ...(established.session.sessionId ? { currentSessionId: established.session.sessionId } : {}),
          revokeAllSessions: () => authContext.users.administration.revokeSessions(
            tenantId,
            established.actor.user_id,
            {
              actorUserId: established.actor.user_id,
              traceId,
              source: "metaforge.api.logout_other_sessions",
            },
            authContext.now(),
          ),
        });
      } else if (stockOperationalRoute) {
        response = await routeStockOperationalRequest({
          request,
          url,
          env,
          tenantId,
          actor: authentication.actor,
          traceId,
          route: stockOperationalRoute,
          runCommand: (command) => executeCommandThroughCore(request, env, command),
        });
      } else if (manufacturingOperationalRoute) {
        response = await routeManufacturingOperationalRequest({
          request,
          url,
          env,
          tenantId,
          actor: authentication.actor,
          traceId,
          route: manufacturingOperationalRoute,
          createDocument: (doctype, document) => createDocumentThroughCore(request, env, doctype, document),
        });
      } else {
        return coreWorker.fetch(request, env);
      }
      if (!response) return coreWorker.fetch(request, env);

      if (authentication.established && authentication.authContext) {
        const refreshed = await slideSession(authentication.established, authentication.authContext);
        if (refreshed) response.headers.append("set-cookie", refreshed);
      }
      return response;
    } catch (error) {
      return isStockOperationalFrappePath(url.pathname)
        || isManufacturingOperationalFrappePath(url.pathname)
        || isSessionManagementPath(url.pathname)
        || isPublicFrappePath(url.pathname)
        || isMfaRoutePath(url.pathname)
        ? faultResponse(error, traceId)
        : errorResponse(error, traceId);
    }
  },

  async scheduled(controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    await coreWorker.scheduled(controller, env, ctx);
  },
};

function resolveTenant(request: Request, env: TenantEnv): string | null {
  const routed = request.headers.get("x-cloudforge-tenant");
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) {
    throw errors.misconfigured("Tenant binding mismatch");
  }
  return env.TENANT_ID ?? routed;
}

function createAuthContext(
  request: Request,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): AuthRouteContext {
  return {
    tenantId,
    users: new D1UserStore(env.DB, mfaKeyRingFromEnv(env)),
    sessionSecret: env.SESSION_SECRET ?? "",
    traceId,
    now: () => new Date().toISOString(),
    rateLimit: {
      db: env.DB,
      salt: env.INTERNAL_AUTH_SECRET,
      clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
    },
  };
}

async function authenticateInterceptedRoute(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<InterceptedRouteAuthentication> {
  const cookieBound = isStockOperationalFrappePath(url.pathname)
    || isManufacturingOperationalFrappePath(url.pathname)
    || isSessionManagementPath(url.pathname)
    || isMfaRoutePath(url.pathname);
  if (!cookieBound) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  const sessionSecret = env.SESSION_SECRET;
  const appCallback = request.headers.get(APP_CALLBACK_HEADER);
  const authContext = createAuthContext(request, env, tenantId, traceId);

  if (sessionSecret && !appCallback) {
    const established = await establishSession(request, authContext);
    if (established) {
      assertSessionCsrf(request, established);
      return { actor: established.actor, established, authContext };
    }
  }

  if (isSessionManagementPath(url.pathname) || isMfaRoutePath(url.pathname)) {
    // Account-security administration cannot borrow an app callback identity.
    throw errors.permission("A browser session is required for account security management");
  }

  if (appCallback) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  if (!sessionSecret && env.AUTH_MODE === "development") {
    return { actor: staticDevelopmentActor(env.DEV_ACTOR_JSON) };
  }

  throw errors.permission("Login to access this resource");
}

function createDocumentThroughCore(
  request: Request,
  env: TenantEnv,
  doctype: string,
  document: JsonObject,
): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = `/api/resource/${encodeURIComponent(doctype)}`;
  url.search = "";
  const headers = forwardedHeaders(request);
  headers.set("content-type", "application/json");
  return coreWorker.fetch(new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(document),
  }), env);
}

async function executeCommandThroughCore(
  request: Request,
  env: TenantEnv,
  command: MutationCommand,
): Promise<MutationReceipt> {
  const url = new URL(request.url);
  url.pathname = "/api/v1/commands";
  url.search = "";
  const headers = forwardedHeaders(request);
  headers.set("content-type", "application/json");
  const input = { ...command } as Record<string, unknown>;
  delete input.actor;
  const response = await coreWorker.fetch(new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  }), env);
  const raw = await response.text();
  if (!response.ok) {
    let message = `Migration command failed with HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
      if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) message = parsed.error.message;
    } catch {
      if (raw.trim()) message = raw.slice(0, 1000);
    }
    throw new Error(message);
  }
  return JSON.parse(raw) as MutationReceipt;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return headers;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
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
