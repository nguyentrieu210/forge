import {
  APP_CALLBACK_HEADER,
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
  /**
   * The generic client bundle, served from THIS origin.
   *
   * Same-origin is not a convenience. The session cookie is `Secure`+`SameSite=Lax`, so
   * a browser will not send it to a different host — a client hosted anywhere else can
   * authenticate only by having a developer run a local proxy that forwards cookies,
   * which is exactly the dependency this removes. Serving the bundle here is what makes
   * "install an app, open the URL" true without a second deploy per app.
   *
   * Optional so a gateway deployed without a bundle still routes the API; a client route
   * then answers with a plain explanation rather than a silent 404.
   */
  ASSETS?: Fetcher;
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

      // Deliberately AFTER the route lookup: a hostname with no tenant gets a 404, not
      // an app shell whose login could never succeed. And before actor resolution,
      // because a page load carries no bearer token and must not be asked for one.
      if (isClientRoute(request, url)) return serveClientShell(env, url, traceId);

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
      //
      // `callback.appId` travels as the one header a caller cannot forge, and it is what
      // tells the tenant's Frappe surface to authenticate from the identity rather than
      // from a cookie it will never have. See APP_CALLBACK_HEADER.
      const forwarded = withPlatformHeaders(inbound, route.tenant_id, traceId, trusted.encoded, trusted.signature, callback?.appId);
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
): Promise<{ actor: Awaited<ReturnType<typeof verifyTrustedIdentity>>["actor"]; url: URL; appId: string } | null> {
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
  return { actor: identity.actor, url: target, appId };
}

/**
 * Client routes the runtime bundle owns, as an ALLOWLIST.
 *
 * An allowlist rather than "anything that is not an API path", and the direction matters.
 * With a denylist, a backend prefix added later and forgotten here would start answering
 * with HTML where its caller expects JSON — a failure that surfaces as an unrelated parse
 * error somewhere else. With an allowlist, the same mistake is a 404 on one client route:
 * obvious, local, and harmless to everything else.
 *
 * The cost is that a new top-level client route must be added here too. That is a change
 * to the runtime bundle, which is deployed alongside this Worker anyway — unlike an app,
 * which is data and needs neither.
 */
const CLIENT_ROUTE_PREFIXES = [
  "/app/", "/x/", "/overview/", "/process/", "/workspace/", "/report/", "/page/", "/dashboard/",
];
const CLIENT_ROUTE_EXACT = new Set([
  "/",
  "/login",
  "/catalog",
  "/permissions",
  "/import",
  "/features",
  "/pricing",
  "/faq",
  "/privacy",
  "/terms",
  "/security",
  "/facebook/data-deletion",
  "/index.html",
]);

function isClientRoute(request: Request, url: URL): boolean {
  // Only navigations. A POST to a client path is a mistake somewhere, and answering it
  // with a page body would hide that.
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (CLIENT_ROUTE_EXACT.has(url.pathname)) return true;
  return CLIENT_ROUTE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/**
 * The SPA shell for a client route.
 *
 * Hashed assets (`/assets/*`) never reach this Worker — the assets runtime serves them
 * before the Worker is invoked, with its own immutable caching. Only the shell is served
 * here, and it must NOT be cached, because it names the hashed bundles: a stale shell
 * after a deploy points at files that no longer exist, and the app fails to boot with a
 * blank screen and a 404 in the console.
 */
async function serveClientShell(env: GatewayEnv, url: URL, traceId: string): Promise<Response> {
  if (!env.ASSETS) {
    return jsonResponse({ error: { code: "CLIENT_BUNDLE_NOT_DEPLOYED", message: "This gateway routes the API but was deployed without a client bundle." }, trace_id: traceId }, 501);
  }
  const shell = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), { method: "GET" }));
  const headers = new Headers(shell.headers);
  headers.set("cache-control", "no-cache");
  return new Response(shell.body, { status: shell.status, headers });
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

function withPlatformHeaders(request: Request, tenantId: string, traceId: string, identity: string, signature: string, appCallbackId?: string): Request {
  const headers = new Headers(request.headers);
  stripUntrustedPlatformHeaders(headers);
  headers.delete("authorization");
  // An app callback carries no session, and must not be able to smuggle one: the app
  // never receives the user's cookie, so a cookie arriving on this path came from
  // somewhere it should not have.
  if (appCallbackId) headers.delete("cookie");
  headers.set("x-cloudforge-tenant", tenantId);
  headers.set("x-cloudforge-trace-id", traceId);
  headers.set(IDENTITY_HEADER, identity);
  headers.set(IDENTITY_SIGNATURE_HEADER, signature);
  if (appCallbackId) headers.set(APP_CALLBACK_HEADER, appCallbackId);
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
