import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { jsonResponse, readJson } from "../../../packages/core/src/index.js";
import baseWorker from "./index-core-base.js";
import type { TenantEnv } from "./env.js";

interface WhoAmI {
  tenant_id: string;
  actor_id: string;
  roles: string[];
}

/**
 * Browser-facing start bridge. Authentication and tenant binding are delegated back to
 * the unchanged tenant core through /api/v1/whoami; this extension never trusts actor,
 * role, tenant or provider fields from the request body.
 */
export async function routeMarketplaceOAuthStart(
  request: Request,
  url: URL,
  env: TenantEnv,
): Promise<Response | null> {
  if (request.method !== "POST" || url.pathname !== "/api/v1/social/marketplace/oauth/start") return null;
  if (!env.SOCIAL_INGRESS || !env.PUBLIC_ORIGIN) {
    return jsonResponse({ error: { code: "MARKETPLACE_OAUTH_NOT_CONFIGURED" } }, 503);
  }

  const whoamiUrl = new URL("/api/v1/whoami", request.url);
  const identityResponse = await baseWorker.fetch(new Request(whoamiUrl, {
    method: "GET",
    headers: request.headers,
  }), env);
  if (!identityResponse.ok) return identityResponse;
  const identity = await parseWhoAmI(identityResponse);
  if (!identity.roles.includes("System Manager")) {
    return jsonResponse({ error: { code: "PERMISSION_DENIED" } }, 403);
  }

  const body = await readJson<JsonObject>(request, 16_000);
  const connectionId = text(body.connection_id, "connection_id", 160);
  const returnUrl = new URL("/x/social-commerce", origin(env.PUBLIC_ORIGIN));
  const response = await env.SOCIAL_INGRESS.fetch("https://social-ingress.internal/internal/oauth/marketplace/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      tenant_id: identity.tenant_id,
      actor_id: identity.actor_id,
      connection_id: connectionId,
      return_url: returnUrl.toString(),
    }),
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

async function parseWhoAmI(response: Response): Promise<WhoAmI> {
  const raw = await response.json() as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Authenticated identity response is invalid");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.roles) || value.roles.some((role) => typeof role !== "string")) {
    throw new Error("Authenticated identity roles are invalid");
  }
  return {
    tenant_id: text(value.tenant_id, "tenant_id", 128),
    actor_id: text(value.actor_id, "actor_id", 320),
    roles: [...value.roles] as string[],
  };
}

function origin(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("PUBLIC_ORIGIN is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("PUBLIC_ORIGIN is invalid");
  return url.origin;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
}
