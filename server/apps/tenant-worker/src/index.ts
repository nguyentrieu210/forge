import { D1UserStore } from "../../../packages/auth/src/index.js";
import { AppInstaller } from "../../../packages/app-registry/src/index.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  assertSessionCsrf,
  establishSession,
  faultResponse,
  slideSession,
  type AuthRouteContext,
  type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import baseWorker from "./index-base.js";
import type { TenantEnv } from "./env.js";

export * from "./index-base.js";

const CAPABILITY_GET = "/api/method/metaforge.api.get_capability_profile";
const CAPABILITY_PREVIEW = "/api/method/metaforge.api.preview_capability_profile";
const CAPABILITY_APPLY = "/api/method/metaforge.api.apply_capability_profile";

function isCapabilityRoute(pathname: string): boolean {
  return pathname === CAPABILITY_GET || pathname === CAPABILITY_PREVIEW || pathname === CAPABILITY_APPLY;
}

function resolveTenant(request: Request, env: TenantEnv): string {
  const routed = request.headers.get("x-cloudforge-tenant");
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) {
    throw errors.misconfigured("Tenant binding mismatch");
  }
  const tenantId = env.TENANT_ID ?? routed;
  if (!tenantId) throw errors.authentication("Missing tenant context");
  return tenantId;
}

function requireSystemManager(established: EstablishedSession): void {
  const actor = established.actor;
  if (actor.user_id === "Administrator" || actor.roles.includes("Administrator") || actor.roles.includes("System Manager")) return;
  throw errors.permission("System Manager is required");
}

async function capabilityResponse(request: Request, env: TenantEnv): Promise<Response> {
  const traceId = request.headers.get("x-cloudforge-trace-id") ?? crypto.randomUUID();
  const tenantId = resolveTenant(request, env);
  if (!env.SESSION_SECRET && env.AUTH_MODE !== "development") {
    throw errors.misconfigured("Session authentication is not configured");
  }
  const users = new D1UserStore(env.DB);
  const authContext: AuthRouteContext = {
    tenantId,
    users,
    sessionSecret: env.SESSION_SECRET ?? "",
    traceId,
    now: () => new Date().toISOString(),
    rateLimit: {
      db: env.DB,
      salt: env.INTERNAL_AUTH_SECRET,
      clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
    },
  };
  const established = await establishSession(request, authContext);
  if (!established) throw errors.permission("Login to access this resource");
  if (request.method !== "GET") assertSessionCsrf(request, established);
  requireSystemManager(established);

  const db = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;
  const installer = new AppInstaller(db, new D1MetadataStore(db), users);
  const url = new URL(request.url);
  let message: unknown;
  if (url.pathname === CAPABILITY_GET && request.method === "GET") {
    message = await installer.currentCapabilityProfile(tenantId);
  } else if (url.pathname === CAPABILITY_PREVIEW && request.method === "POST") {
    message = await installer.previewCapabilityProfile(tenantId, await readJson<JsonObject>(request, 128_000));
  } else if (url.pathname === CAPABILITY_APPLY && request.method === "POST") {
    message = await installer.applyCapabilityProfile(
      tenantId,
      await readJson<JsonObject>(request, 128_000),
      established.actor.user_id,
      authContext.now(),
    );
  } else {
    throw errors.notFound("Capability profile route not found");
  }

  const response = jsonResponse({ message: message as JsonObject }, 200, { "x-cloudforge-trace-id": traceId });
  const refreshed = await slideSession(established, authContext);
  if (refreshed) response.headers.append("set-cookie", refreshed);
  return response;
}

export default {
  async fetch(request: Request, env: TenantEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!isCapabilityRoute(url.pathname)) return baseWorker.fetch(request, env, ctx);
    try {
      return await capabilityResponse(request, env);
    } catch (error) {
      const traceId = request.headers.get("x-cloudforge-trace-id") ?? "r5-capability-profile";
      return faultResponse(error, traceId);
    }
  },
  scheduled(controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> | void {
    return baseWorker.scheduled?.(controller, env, ctx);
  },
};
