import { assertInternalService } from "../../../packages/auth/src/index.js";
import { errors, jsonResponse } from "../../../packages/core/src/index.js";
import { resolveMarketplaceConnection } from "../../../packages/social-commerce/src/index.js";
import type { TenantEnv } from "./env.js";

/**
 * Read-only OAuth descriptor for the control-plane broker.
 *
 * The broker is never allowed to infer provider/shop scope from a browser payload.
 * It names only a canonical Marketplace Connection; this endpoint resolves the provider
 * and the minimum non-secret scope needed to validate the eventual callback.
 */
export async function routeMarketplaceOAuthDescriptor(
  request: Request,
  url: URL,
  env: TenantEnv,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/internal\/marketplace\/connections\/([^/]+)\/oauth-descriptor$/);
  if (!match || request.method !== "GET") return null;
  assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
  const tenantId = internalTenant(request, env);
  const connectionId = decodedId(match[1]!, "connection_id", 160);
  const resolved = await resolveMarketplaceConnection(env.DB, tenantId, connectionId);
  const scope = resolved.provider === "shopee"
    ? { shop_id: scalarText(resolved.connection.config.shop_id, "Shopee shop_id", 200) }
    : resolved.provider === "tiktok_shop"
      ? { shop_cipher: scalarText(resolved.connection.config.shop_cipher, "TikTok Shop shop_cipher", 400) }
      : {};
  return jsonResponse({
    connection_id: connectionId,
    provider: resolved.provider,
    connector_key: resolved.connection.connector_key,
    connector_version: resolved.connection.connector_version,
    connection_status: resolved.connection.status,
    scope,
  }, 200, { "cache-control": "no-store" });
}

function internalTenant(request: Request, env: TenantEnv): string {
  const routed = request.headers.get("x-cloudforge-tenant")?.trim() || null;
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) throw errors.misconfigured("Tenant binding mismatch");
  return text(env.TENANT_ID ?? routed, "tenant_id", 128);
}

function decodedId(value: string, field: string, max: number): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); }
  catch { throw errors.validation(`${field} is invalid`); }
  return text(decoded, field, max);
}

function scalarText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.reference(`${field} is required`);
  return text(String(value), field, max);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}
