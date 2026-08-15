import { assertInternalService } from "../../../packages/auth/src/index.js";
import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import { ingestFacebookMessage, storeFacebookOAuthPages, type FacebookOAuthPage } from "../../../packages/social-commerce/src/tenant-handler.js";
import type { SocialQueueMessage } from "../../../packages/social-commerce/src/index.js";
import { routeSocialCommerceApi } from "../../../packages/social-commerce/src/api.js";
import type { TenantEnv } from "./env.js";

type TenantResolver = (request: Request, env: TenantEnv) => string | null;
type SystemManagerGuard = (actor: Actor) => void;

export async function routeInternalSocialRequest(
  request: Request,
  url: URL,
  env: TenantEnv,
  traceId: string,
  resolveTenant: TenantResolver,
): Promise<Response | undefined> {
  if (request.method === "POST" && url.pathname === "/internal/social/events") {
    assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
    const tenant = resolveTenant(request, env);
    if (!tenant) throw new Error("Missing tenant context");
    const message = await readJson<JsonObject>(request, 1_100_000) as unknown as SocialQueueMessage;
    const idempotencyKey = request.headers.get("x-cloudforge-idempotency-key");
    if (!idempotencyKey || idempotencyKey !== message.event_id) throw new Error("Social event idempotency key mismatch");
    const result = await ingestFacebookMessage(env.DB, tenant, message);
    return jsonResponse({ committed: true, event_id: message.event_id, ...result }, 200, {
      "x-cloudforge-social-event-committed": message.event_id,
      "x-cloudforge-trace-id": traceId,
    });
  }

  if (request.method === "POST" && url.pathname === "/internal/social/oauth/facebook") {
    assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
    const tenant = resolveTenant(request, env);
    if (!tenant) throw new Error("Missing tenant context");
    if (!env.SOCIAL_CREDENTIAL_KEK) throw new Error("SOCIAL_CREDENTIAL_KEK is not configured");
    const body = await readJson<JsonObject>(request, 1_000_000) as unknown as { actor_id: string; pages: FacebookOAuthPage[] };
    const result = await storeFacebookOAuthPages(env.DB, tenant, body.actor_id, body.pages, env.SOCIAL_CREDENTIAL_KEK);
    return jsonResponse({ committed: true, ...result });
  }
  return undefined;
}

export async function routeAuthenticatedSocialRequest(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  actor: Actor,
  requireSystemManager: SystemManagerGuard,
): Promise<Response | null> {
  if (request.method === "POST" && url.pathname === "/api/v1/social/facebook/oauth/start") {
    requireSystemManager(actor);
    if (!env.SOCIAL_INGRESS || !env.PUBLIC_ORIGIN) throw errors.misconfigured("Facebook OAuth service is not configured");
    const response = await env.SOCIAL_INGRESS.fetch("https://social-ingress.internal/internal/oauth/facebook/start", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      body: JSON.stringify({ tenant_id: tenantId, actor_id: actor.user_id, return_url: `${env.PUBLIC_ORIGIN}/x/social-commerce` }),
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  }
  return routeSocialCommerceApi(request, url, env.DB, tenantId, actor);
}
