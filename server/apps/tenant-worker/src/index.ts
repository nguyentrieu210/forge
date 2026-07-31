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
  isPhysicalStockApiPath,
  isPhysicalStockFrappePath,
  routePhysicalStockApi,
} from "./physical-stock-api.js";
import type { TenantEnv } from "./env.js";

export * from "./index-core.js";

interface PhysicalStockAuthentication {
  actor: Actor;
  established?: EstablishedSession;
  authContext?: AuthRouteContext;
}

/**
 * Thin entrypoint wrapper for Slice D report routes.
 *
 * The original tenant Worker remains byte-for-byte in index-core.ts. Only the physical
 * stock report routes are intercepted here; every existing route and scheduled task is
 * delegated unchanged. This keeps the security-sensitive main router out of a giant
 * hand-edited patch while still sharing its trusted-identity and cookie-session rules.
 */
export default {
  async fetch(request: Request, env: TenantEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!isPhysicalStockApiPath(url.pathname)) return coreWorker.fetch(request, env);

    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const tenantId = resolveTenant(request, env);
      if (!tenantId) throw errors.authentication("Missing tenant context");
      const authentication = await authenticatePhysicalStock(request, url, env, tenantId, traceId);
      const requestDb = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;
      const metadata = new D1MetadataStore(requestDb);
      const access = new D1DocumentAccessStore(requestDb);
      const permissions = new MetadataPermissionService(metadata, undefined, access);
      const response = await routePhysicalStockApi(request, url, {
        db: requestDb,
        tenantId,
        actor: authentication.actor,
        permissions,
        traceId,
      });
      if (!response) return coreWorker.fetch(request, env);

      if (authentication.established && authentication.authContext) {
        const refreshed = await slideSession(authentication.established, authentication.authContext);
        if (refreshed) response.headers.append("set-cookie", refreshed);
      }
      return response;
    } catch (error) {
      return isPhysicalStockFrappePath(url.pathname)
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

async function authenticatePhysicalStock(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<PhysicalStockAuthentication> {
  if (!isPhysicalStockFrappePath(url.pathname)) {
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
