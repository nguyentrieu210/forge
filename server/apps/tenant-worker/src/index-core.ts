import { D1UserStore } from "../../../packages/auth/src/index.js";
import {
  AppHookDispatcher,
  AppInstaller,
  hookMatches,
  subscribersFor,
  type AppManifest,
  type HookDeliveryOutcome,
  type HookTarget,
} from "../../../packages/app-registry/src/index.js";
import type { DomainEvent, JsonObject } from "../../../packages/contracts/src/index.js";
import { errorResponse, jsonResponse } from "../../../packages/core/src/index.js";
import {
  runWorkplaceScheduledNotifications,
  type WorkplaceMaintenanceResult,
} from "../../../packages/frappe-api/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import baseWorker, {
  runMaintenance as runBaseMaintenance,
} from "./index-core-base.js";
import type { TenantEnv } from "./env.js";

export { AggregateCoordinator, runAlumdoorMaintenance } from "./index-core-base.js";

function withoutDispatcher(env: TenantEnv): TenantEnv {
  const clone = { ...env } as TenantEnv & { DISPATCHER?: DispatchNamespace };
  delete clone.DISPATCHER;
  return clone;
}

function hookResolver(env: TenantEnv): (tenantId: string, appId: string, eventType: string) => Promise<HookTarget | null> {
  const installer = new AppInstaller(
    env.DB,
    new D1MetadataStore(env.DB),
    new D1UserStore(env.DB),
  );
  return async (tenantId, appId, eventType) => {
    const row = await env.DB.prepare(
      "SELECT manifest_json FROM installed_apps WHERE tenant_id=?1 AND app_id=?2",
    ).bind(tenantId, appId).first<{ manifest_json: string }>();
    if (!row) return null;
    const manifest = JSON.parse(row.manifest_json) as AppManifest;
    if (!manifest.worker) return null;
    for (const hook of manifest.hooks) {
      if (!hookMatches(hook.event, eventType)) continue;
      if (await installer.isCapabilitySurfaceEnabled(tenantId, appId, "hooks", hook.event)) {
        return { appId, worker: manifest.worker };
      }
    }
    return null;
  };
}

function dispatcherFor(env: TenantEnv): AppHookDispatcher {
  return new AppHookDispatcher(env.DB, {
    ...(env.DISPATCHER ? { DISPATCHER: env.DISPATCHER } : {}),
    ...(env.INTERNAL_AUTH_SECRET ? { INTERNAL_AUTH_SECRET: env.INTERNAL_AUTH_SECRET } : {}),
    resolveTarget: hookResolver(env),
  });
}

async function fanOutEffectiveHooks(
  env: TenantEnv,
  tenantId: string,
  event: DomainEvent,
): Promise<HookDeliveryOutcome[]> {
  if (!env.DISPATCHER) return [];
  const rows = await env.DB.prepare(
    "SELECT app_id,manifest_json FROM installed_apps WHERE tenant_id=?1",
  ).bind(tenantId).all<{ app_id: string; manifest_json: string }>();
  const manifests = (rows.results ?? []).map((row) => ({
    app_id: row.app_id,
    manifest: JSON.parse(row.manifest_json) as AppManifest,
  }));
  return dispatcherFor(env).fanOut(
    tenantId,
    event,
    subscribersFor(manifests, event.event_type),
    new Date().toISOString(),
  );
}

async function recordExtensionFailure(db: D1Database, tenantId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.prepare(
    `UPDATE maintenance_runs SET last_error=?3
     WHERE tenant_id=?1 AND job_name=?2`,
  ).bind(tenantId, "tenant-maintenance", message.slice(0, 1000)).run().catch(() => undefined);
}

export async function runMaintenance(
  env: TenantEnv,
  tenantId: string,
): Promise<Awaited<ReturnType<typeof runBaseMaintenance>> & {
  workplace: WorkplaceMaintenanceResult;
}> {
  const base = await runBaseMaintenance(withoutDispatcher(env), tenantId);
  try {
    const now = new Date().toISOString();
    const hooks = env.DISPATCHER
      ? (await dispatcherFor(env).sweep(tenantId, now)).length
      : 0;
    const workplace = await runWorkplaceScheduledNotifications(env.DB, tenantId, now);
    return { ...base, hooks, workplace };
  } catch (error) {
    await recordExtensionFailure(env.DB, tenantId, error);
    throw error;
  }
}

function jsonResponseFrom(base: Response, body: JsonObject): Response {
  const headers = new Headers(base.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(body), {
    status: base.status,
    statusText: base.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: TenantEnv): Promise<Response> {
    const url = new URL(request.url);
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? "r5-maintenance";
    try {
      if (request.method === "POST" && url.pathname === "/internal/events") {
        const eventRequest = request.clone();
        // The unchanged core remains the authority for internal authentication,
        // tenant binding, event durability and notification rules. Suppress only its
        // legacy raw-manifest hook fan-out, then perform capability-aware fan-out once.
        const response = await baseWorker.fetch(request, withoutDispatcher(env));
        if (!response.ok || !env.DISPATCHER) return response;
        const event = await eventRequest.json() as DomainEvent;
        const body = await response.json() as JsonObject;
        const hooks = await fanOutEffectiveHooks(env, event.tenant_id, event);
        return jsonResponseFrom(response, { ...body, hooks } as JsonObject);
      }

      if (request.method === "POST" && url.pathname === "/internal/maintenance") {
        // Core validates the internal-service credential and performs every existing
        // maintenance family with hook dispatch disabled. R5 then adds the two shared
        // runtime families that must obey effective capability state.
        const response = await baseWorker.fetch(request, withoutDispatcher(env));
        if (!response.ok) return response;
        const body = await response.json() as JsonObject;
        const tenantId = env.TENANT_ID ?? request.headers.get("x-cloudforge-tenant");
        if (!tenantId) return response;
        const now = new Date().toISOString();
        const hooks = env.DISPATCHER
          ? (await dispatcherFor(env).sweep(tenantId, now)).length
          : 0;
        const workplace = await runWorkplaceScheduledNotifications(env.DB, tenantId, now);
        return jsonResponseFrom(response, { ...body, hooks, workplace } as JsonObject);
      }

      return baseWorker.fetch(request, env);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },

  async scheduled(_controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    if (!env.TENANT_ID) return;
    ctx.waitUntil(runMaintenance(env, env.TENANT_ID).then(() => undefined));
  },
};
