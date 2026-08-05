import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { jsonResponse, readJson } from "../../../packages/core/src/index.js";
import { D1MarketplaceCredentialVault } from "../../../packages/integration-hub/src/marketplace-credential-vault.js";
import { resolveMarketplaceConnection } from "../../../packages/social-commerce/src/index.js";
import baseWorker from "./index-core-base.js";
import type { TenantEnv } from "./env.js";

interface WhoAmI {
  tenant_id: string;
  actor_id: string;
  roles: string[];
}

interface ConnectionNameRow { name: string }

/**
 * Browser-facing marketplace connection/OAuth bridge.
 *
 * Authentication and tenant binding are delegated back to the unchanged tenant core
 * through /api/v1/whoami. The browser never supplies actor, role, tenant, provider,
 * shop scope or secret_ref; only a canonical Marketplace Connection name can be chosen.
 */
export async function routeMarketplaceOAuthStart(
  request: Request,
  url: URL,
  env: TenantEnv,
): Promise<Response | null> {
  const isStart = request.method === "POST" && url.pathname === "/api/v1/social/marketplace/oauth/start";
  const isList = request.method === "GET" && url.pathname === "/api/v1/social/marketplace/connections";
  if (!isStart && !isList) return null;

  const identityResponse = await baseWorker.fetch(new Request(new URL("/api/v1/whoami", request.url), {
    method: "GET",
    headers: request.headers,
  }), env);
  if (!identityResponse.ok) return identityResponse;
  const identity = await parseWhoAmI(identityResponse);
  if (!identity.roles.includes("System Manager")) {
    return jsonResponse({ error: { code: "PERMISSION_DENIED" } }, 403);
  }

  if (isList) return listMarketplaceConnections(env, identity.tenant_id);
  if (!env.SOCIAL_INGRESS || !env.PUBLIC_ORIGIN) {
    return jsonResponse({ error: { code: "MARKETPLACE_OAUTH_NOT_CONFIGURED" } }, 503);
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

async function listMarketplaceConnections(env: TenantEnv, tenantId: string): Promise<Response> {
  const rows = await env.DB.prepare(`
    SELECT name FROM documents
    WHERE tenant_id=?1 AND doctype='Marketplace Connection' AND docstatus<>2
    ORDER BY name ASC LIMIT 100
  `).bind(tenantId).all<ConnectionNameRow>();
  const vault = env.MARKETPLACE_CREDENTIAL_KEK
    ? new D1MarketplaceCredentialVault(env.DB, env.MARKETPLACE_CREDENTIAL_KEK)
    : null;
  const connections = [];
  for (const row of rows.results ?? []) {
    try {
      const resolved = await resolveMarketplaceConnection(env.DB, tenantId, row.name);
      const secretRef = resolved.connection.secret_ref;
      const status = vault && secretRef
        ? await vault.status({
          tenant_id: tenantId,
          connection_id: resolved.connection.connection_id,
          secret_ref: secretRef,
          provider: resolved.provider,
        })
        : null;
      connections.push({
        connection_id: resolved.connection.connection_id,
        provider: resolved.provider,
        connection_status: resolved.connection.status,
        credential_status: !status?.active
          ? "unavailable"
          : status.reauthorization_required
            ? "reauthorization_required"
            : "active",
        refresh_managed: status?.refresh_managed ?? false,
        access_expires_at: status?.access_expires_at,
        refresh_expires_at: status?.refresh_expires_at,
      });
    } catch {
      connections.push({
        connection_id: row.name,
        provider: null,
        connection_status: "invalid",
        credential_status: "unavailable",
        refresh_managed: false,
      });
    }
  }
  return jsonResponse({ connections }, 200, { "cache-control": "no-store" });
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
