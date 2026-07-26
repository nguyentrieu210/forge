import {
  createTrustedIdentity,
  IDENTITY_HEADER,
  IDENTITY_SIGNATURE_HEADER,
  staticDevelopmentActor,
  stripUntrustedPlatformHeaders,
  verifyBearerJwt,
} from "../../../packages/auth/src/index.js";
import { errorResponse, errors, jsonResponse, randomId } from "../../../packages/core/src/index.js";

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

      const actor = env.AUTH_MODE === "development"
        ? staticDevelopmentActor(env.DEV_ACTOR_JSON)
        : claimsToActor(await verifyBearerJwt(request, {
          secret: requireSecret(env.JWT_SECRET, "JWT_SECRET"),
          // Issuer and audience are mandatory in production: without them a token
          // minted for another audience under a shared secret would be accepted.
          issuer: requireSecret(env.JWT_ISSUER, "JWT_ISSUER"),
          audience: requireSecret(env.JWT_AUDIENCE, "JWT_AUDIENCE"),
        }), route.tenant_id);
      const trusted = await createTrustedIdentity({
        tenantId: route.tenant_id,
        actor,
        traceId,
        masterSecret: env.INTERNAL_AUTH_SECRET,
        keyId: env.INTERNAL_AUTH_KEY_ID ?? "k1",
      });
      const forwarded = withPlatformHeaders(request, route.tenant_id, traceId, trusted.encoded, trusted.signature);
      if (env.FALLBACK_TENANT && route.worker_name === "__fallback__") return env.FALLBACK_TENANT.fetch(forwarded);
      const worker = env.DISPATCHER.get(route.worker_name, {}, { limits: limitsFor(route.plan) });
      return worker.fetch(forwarded);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};

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

function limitsFor(plan: TenantRoute["plan"]): { cpuMs: number; subRequests: number } {
  if (plan === "enterprise") return { cpuMs: 200, subRequests: 1000 };
  if (plan === "pro") return { cpuMs: 100, subRequests: 500 };
  return { cpuMs: 50, subRequests: 100 };
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
