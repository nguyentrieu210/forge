import {
  createTrustedIdentity,
  deriveAppCallKey,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
  staticDevelopmentActor,
  stripUntrustedPlatformHeaders,
  verifyBearerJwt,
  verifyTrustedIdentity,
} from "../../../packages/auth/src/index.js";
import { errorResponse, errors, jsonResponse, randomId, timingSafeEqualString } from "../../../packages/core/src/index.js";
import { isFrappePath, LOGIN_PATH } from "../../../packages/frappe-api/src/index.js";

interface GatewayEnv {
  ROUTES: KVNamespace;
  DISPATCHER: DispatchNamespace;
  FALLBACK_TENANT?: Fetcher;
  PLATFORM_SUFFIX?: string;
  AUTH_MODE?: "development" | "production";
  DEV_ACTOR_JSON?: string;
  JWT_SECRET?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  INTERNAL_AUTH_SECRET: string;
  INTERNAL_AUTH_KEY_ID?: string;
}

interface TenantRoute {
  tenant_id: string;
  worker_name: string;
  status: "active" | "suspended" | "provisioning";
  routing_version: number;
  plan?: "free" | "pro" | "enterprise";
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return jsonResponse({ ok: true, service: "gateway-worker" });
      const routeKey = routeKeyFromRequest(url, env.PLATFORM_SUFFIX ?? "cloudforge.local", env.AUTH_MODE === "development");
      const raw = await env.ROUTES.get(routeKey);
      if (!raw) return jsonResponse({ error: { code: "TENANT_ROUTE_NOT_FOUND" }, trace_id: traceId }, 404);
      const route = JSON.parse(raw) as TenantRoute;
      if (route.status !== "active") return jsonResponse({ error: { code: "TENANT_NOT_ACTIVE", status: route.status }, trace_id: traceId }, 423);

      // An app Worker calling back into the platform on behalf of the user who invoked
      // it. Null for every ordinary request, so nothing about the normal path changes.
      const callback = await resolveAppCallback(request, env, url, route.tenant_id);

      const actor = callback ? callback.actor : await resolveActor(request, env, url, route.tenant_id);
      const inbound = callback ? new Request(callback.url, request) : request;
      const trusted = await createTrustedIdentity({
        tenantId: route.tenant_id,
        actor,
        traceId,
        masterSecret: env.INTERNAL_AUTH_SECRET,
        keyId: env.INTERNAL_AUTH_KEY_ID ?? "k1",
      });
      // Freshly minted, and `withPlatformHeaders` strips whatever the caller sent — so
      // the identity the tenant sees is one this gateway just issued, never one an app
      // handed us. The app's copy is only ever an assertion we re-verify above.
      const forwarded = withPlatformHeaders(inbound, route.tenant_id, traceId, trusted.encoded, trusted.signature);
      if (env.FALLBACK_TENANT && route.worker_name === "__fallback__") return env.FALLBACK_TENANT.fetch(forwarded);
      const worker = env.DISPATCHER.get(route.worker_name, {}, { limits: limitsFor(route.plan, url.pathname) });
      return worker.fetch(forwarded);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};

/**
 * The one path an app Worker may use to call back into the platform.
 *
 * Deliberately a distinct prefix rather than a header on the normal API path: the
 * decision "trust the identity in this request" must be visible in the URL, not hidden
 * in a header that an ordinary caller could also set.
 */
const APP_CALLBACK_PREFIX = "/_app/";

/**
 * Resolves an app's callback into the user it may act as, or null for a normal request.
 *
 * This is the only inbound path where the gateway accepts an identity it did not mint,
 * so it is also the only place a mistake becomes privilege escalation. Three proofs are
 * required, and each closes a different hole:
 *
 * 1. A credential derived for (this tenant, this app). Proves the caller is an app the
 *    platform installed HERE — an app on another tenant holds a different key, so it
 *    cannot reach into this one.
 * 2. A signed trusted identity. `verifyTrustedIdentity` checks the signature against
 *    the master, that the identity names THIS tenant, and that it has not expired —
 *    the platform issues it with a TTL barely longer than the app's call budget, so a
 *    captured one is useless within seconds.
 * 3. Nothing else. The actor comes from the verified identity, never from a header the
 *    app chose, so an app cannot name a user it was not invoked by.
 *
 * The result is that an app can do exactly what the user who invoked it could do, for
 * as long as that call lasts, and no more. It never gains rights of its own.
 */
async function resolveAppCallback(
  request: Request,
  env: GatewayEnv,
  url: URL,
  tenantId: string,
): Promise<{ actor: Awaited<ReturnType<typeof verifyTrustedIdentity>>["actor"]; url: URL } | null> {
  if (!url.pathname.startsWith(APP_CALLBACK_PREFIX)) return null;

  const appId = request.headers.get("x-cloudforge-app") ?? "";
  if (!appId) throw errors.authentication("App callback is missing its app id");

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expected = await deriveAppCallKey(env.INTERNAL_AUTH_SECRET, tenantId, appId);
  if (!timingSafeEqualString(presented, expected)) {
    throw errors.authentication("App callback credential is not valid for this tenant");
  }

  const identity = await verifyTrustedIdentity(request, { tenantId, masterSecret: env.INTERNAL_AUTH_SECRET });

  const target = new URL(url);
  target.pathname = `/api/${url.pathname.slice(APP_CALLBACK_PREFIX.length)}`;
  return { actor: identity.actor, url: target };
}

function routeKeyFromRequest(url: URL, suffix: string, allowTenantOverride: boolean): string {
  // The ?tenant override is a development convenience only. In production the
  // tenant is derived from the authenticated vhost (and re-bound to the JWT),
  // so we never let a query parameter influence routing.
  const explicit = allowTenantOverride ? url.searchParams.get("tenant") : null;
  if (explicit) return explicit;
  if (url.hostname.endsWith(`.${suffix}`)) return url.hostname.slice(0, -(suffix.length + 1));
  return url.hostname;
}

function claimsToActor(claims: Awaited<ReturnType<typeof verifyBearerJwt>>, tenantId: string) {
  if (claims.tenant_id !== tenantId) throw errors.authentication("Authenticated tenant does not match route tenant");
  return {
    user_id: claims.sub,
    roles: [...claims.roles],
    ...(claims.locale ? { locale: claims.locale } : {}),
    ...(claims.timezone ? { timezone: claims.timezone } : {}),
  };
}

function withPlatformHeaders(request: Request, tenantId: string, traceId: string, identity: string, signature: string): Request {
  const headers = new Headers(request.headers);
  stripUntrustedPlatformHeaders(headers);
  headers.delete("authorization");
  headers.set("x-cloudforge-tenant", tenantId);
  headers.set("x-cloudforge-trace-id", traceId);
  headers.set(IDENTITY_HEADER, identity);
  headers.set(IDENTITY_SIGNATURE_HEADER, signature);
  return new Request(request, { headers });
}

/**
 * Resolves the actor for a request.
 *
 * A Frappe-shaped request may legitimately arrive with no bearer token: the Desk
 * authenticates with a `sid` cookie that the tenant worker verifies itself
 * (it holds the user directory, so it alone can check revocation). The gateway
 * therefore forwards those as GUEST rather than rejecting them — the identity it
 * asserts is deliberately the lowest one, so a tenant worker that ever fell back
 * to the trusted identity on a session path would fail closed rather than
 * inherit somebody's privileges.
 */
async function resolveActor(request: Request, env: GatewayEnv, url: URL, tenantId: string) {
  if (env.AUTH_MODE === "development") return staticDevelopmentActor(env.DEV_ACTOR_JSON);
  if (isFrappePath(url.pathname) && !request.headers.get("authorization")) {
    return { user_id: "Guest", roles: ["Guest"] };
  }
  return claimsToActor(await verifyBearerJwt(request, {
    secret: requireSecret(env.JWT_SECRET, "JWT_SECRET"),
    // Issuer and audience are mandatory in production: without them a token
    // minted for another audience under a shared secret would be accepted.
    issuer: requireSecret(env.JWT_ISSUER, "JWT_ISSUER"),
    audience: requireSecret(env.JWT_AUDIENCE, "JWT_AUDIENCE"),
  }), tenantId);
}

function limitsFor(plan: TenantRoute["plan"], pathname: string): { cpuMs: number; subRequests: number } {
  const base = plan === "enterprise"
    ? { cpuMs: 200, subRequests: 1000 }
    : plan === "pro"
      ? { cpuMs: 100, subRequests: 500 }
      : { cpuMs: 50, subRequests: 100 };
  // Password verification is deliberately expensive (PBKDF2), and the free-plan
  // budget is smaller than one hash. Without a larger allowance here the login
  // would be killed mid-derivation and read as a server fault rather than a slow
  // but correct login. Raised only for this one path, which is unauthenticated
  // and therefore also the one that must stay rate-limited upstream.
  if (pathname === LOGIN_PATH) return { cpuMs: Math.max(base.cpuMs, 400), subRequests: base.subRequests };
  return base;
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
