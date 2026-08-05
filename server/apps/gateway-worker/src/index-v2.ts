import baseGateway from "./index.js";
import { deriveTenantAuthSecretV2 } from "../../../packages/auth/src/security-v2.js";

type BaseGatewayEnv = Parameters<typeof baseGateway.fetch>[1];
type GatewayV2Env = BaseGatewayEnv & { INTERNAL_AUTH_SECRET_V2?: string };

interface SecurityProfile {
  tenant_id: string;
  generation: number;
  key_id: string;
  worker_name?: string;
}

/**
 * Security Generation V2 is opt-in per tenant. No profile means legacy generation 1.
 * The platform V2 master never leaves this shared Worker. We derive a tenant-scoped
 * auth root first, then delegate to the existing gateway so trusted-identity and app-call
 * derivation stay exactly aligned with the tenant without exposing the platform master.
 */
export default {
  async fetch(request: Request, env: GatewayV2Env): Promise<Response> {
    const profile = await resolveSecurityProfile(request, env);
    if (!profile || profile.generation !== 2) return baseGateway.fetch(request, env);

    const v2Master = env.INTERNAL_AUTH_SECRET_V2?.trim();
    if (!v2Master) return securityUnavailable("INTERNAL_AUTH_SECRET_V2");
    if (profile.key_id !== "k2") return securityUnavailable("unsupported V2 key id");

    const tenantAuthRoot = await deriveTenantAuthSecretV2(v2Master, profile.tenant_id);
    return baseGateway.fetch(request, {
      ...env,
      INTERNAL_AUTH_SECRET: tenantAuthRoot,
      INTERNAL_AUTH_KEY_ID: profile.key_id,
    });
  },
};

export async function resolveSecurityProfile(
  request: Request,
  env: Pick<GatewayV2Env, "ROUTES" | "PLATFORM_SUFFIX" | "AUTH_MODE">,
): Promise<SecurityProfile | null> {
  const url = new URL(request.url);
  const routeKey = routeKeyFromRequest(url, env.PLATFORM_SUFFIX ?? "cloudforge.local", env.AUTH_MODE === "development");
  const rawRoute = await env.ROUTES.get(routeKey);
  if (!rawRoute) return null;

  let tenantId = "";
  try {
    tenantId = String((JSON.parse(rawRoute) as { tenant_id?: unknown }).tenant_id ?? "").trim();
  } catch {
    return null;
  }
  if (!tenantId) return null;

  const rawProfile = await env.ROUTES.get(`__security__:${tenantId}`);
  if (!rawProfile) return null;
  try {
    const profile = JSON.parse(rawProfile) as Partial<SecurityProfile>;
    if (profile.tenant_id !== tenantId || profile.generation !== 2 || profile.key_id !== "k2") return null;
    return profile as SecurityProfile;
  } catch {
    return null;
  }
}

function routeKeyFromRequest(url: URL, suffix: string, allowTenantOverride: boolean): string {
  const explicit = allowTenantOverride ? url.searchParams.get("tenant") : null;
  if (explicit) return explicit;
  if (url.hostname.endsWith(`.${suffix}`)) return url.hostname.slice(0, -(suffix.length + 1));
  return url.hostname;
}

function securityUnavailable(detail: string): Response {
  return new Response(JSON.stringify({ error: { code: "SECURITY_V2_NOT_CONFIGURED", detail } }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
