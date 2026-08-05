import { assertInternalService, D1UserStore } from "../../../packages/auth/src/index.js";
import {
  AppHookDispatcher,
  AppInstaller,
  hookMatches,
  subscribersFor,
  type AppManifest,
  type HookDeliveryOutcome,
  type HookTarget,
} from "../../../packages/app-registry/src/index.js";
import type { DomainEvent, JsonObject, JsonValue } from "../../../packages/contracts/src/index.js";
import { errorResponse, errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";
import {
  runWorkplaceScheduledNotifications,
  type WorkplaceMaintenanceResult,
} from "../../../packages/frappe-api/src/index.js";
import { D1MetadataStore } from "../../../packages/frappe-model/src/index.js";
import {
  buildMarketplaceCredentialMaterial,
  D1MarketplaceCredentialVault,
} from "../../../packages/integration-hub/src/marketplace-credential-vault.js";
import {
  resolveMarketplaceConnection,
  runMarketplaceMaintenance,
} from "../../../packages/social-commerce/src/index.js";
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

function marketplaceDisabled() {
  return {
    enabled: false as const,
    reason: "credential_key_unconfigured" as const,
    selected: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    pages: 0,
    records: 0,
    idempotent_replays: 0,
    failures: [],
  };
}

async function runMarketplaceMaintenanceExtension(env: TenantEnv, tenantId: string) {
  if (!env.MARKETPLACE_CREDENTIAL_KEK) return marketplaceDisabled();
  return runMarketplaceMaintenance(
    env.DB,
    tenantId,
    new D1MarketplaceCredentialVault(env.DB, env.MARKETPLACE_CREDENTIAL_KEK),
  );
}

export async function runMaintenance(
  env: TenantEnv,
  tenantId: string,
): Promise<Awaited<ReturnType<typeof runBaseMaintenance>> & {
  workplace: WorkplaceMaintenanceResult;
  marketplace: Awaited<ReturnType<typeof runMarketplaceMaintenanceExtension>>;
}> {
  const base = await runBaseMaintenance(withoutDispatcher(env), tenantId);
  try {
    const now = new Date().toISOString();
    const hooks = env.DISPATCHER
      ? (await dispatcherFor(env).sweep(tenantId, now)).length
      : 0;
    const workplace = await runWorkplaceScheduledNotifications(env.DB, tenantId, now);
    const marketplace = await runMarketplaceMaintenanceExtension(env, tenantId);
    return { ...base, hooks, workplace, marketplace };
  } catch (error) {
    await recordExtensionFailure(env.DB, tenantId, error);
    throw error;
  }
}

function jsonSafe(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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

async function routeMarketplaceCredentialAdmin(
  request: Request,
  url: URL,
  env: TenantEnv,
): Promise<Response | null> {
  const match = url.pathname.match(/^\/internal\/marketplace\/connections\/([^/]+)\/credential$/);
  if (!match || !["GET", "PUT", "DELETE"].includes(request.method)) return null;
  assertInternalService(request, env.INTERNAL_SERVICE_TOKEN);
  if (!env.MARKETPLACE_CREDENTIAL_KEK) throw errors.misconfigured("Marketplace credential vault is not configured");
  const tenantId = internalTenant(request, env);
  const connectionId = decodedId(match[1]!, "connection_id", 160);
  const resolved = await resolveMarketplaceConnection(env.DB, tenantId, connectionId);
  const secretRef = resolved.connection.secret_ref;
  if (!secretRef) throw errors.misconfigured("Marketplace Connection has no secret_ref");
  const vault = new D1MarketplaceCredentialVault(env.DB, env.MARKETPLACE_CREDENTIAL_KEK);

  if (request.method === "GET") {
    const active = await vault.hasActive({ tenant_id: tenantId, connection_id: connectionId, secret_ref: secretRef });
    return jsonResponse({
      connection_id: connectionId,
      provider: resolved.provider,
      secret_ref: secretRef,
      credential_status: active ? "active" : "unavailable",
    });
  }

  const body = await readJson<JsonObject>(request, 64_000);
  const actorId = shortText(body.actor_id, "actor_id", 320);
  if (request.method === "DELETE") {
    const revoked = await vault.revoke({
      tenant_id: tenantId,
      connection_id: connectionId,
      secret_ref: secretRef,
      actor_id: actorId,
    });
    return jsonResponse({
      committed: true,
      connection_id: connectionId,
      provider: resolved.provider,
      secret_ref: secretRef,
      credential_status: revoked ? "revoked" : "already_inactive",
    });
  }

  const material = buildMarketplaceCredentialMaterial(
    resolved.provider,
    resolved.connection.config,
    objectField(body.credentials, "credentials"),
  );
  const result = await vault.put({
    tenant_id: tenantId,
    connection_id: connectionId,
    secret_ref: secretRef,
    material,
    actor_id: actorId,
  });
  return jsonResponse({
    committed: true,
    connection_id: connectionId,
    provider: result.provider,
    secret_ref: result.secret_ref,
    credential_status: "active",
    rotated: result.rotated,
  }, result.rotated ? 200 : 201);
}

function internalTenant(request: Request, env: TenantEnv): string {
  const routed = request.headers.get("x-cloudforge-tenant")?.trim() || null;
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) throw errors.misconfigured("Tenant binding mismatch");
  return shortText(env.TENANT_ID ?? routed, "tenant_id", 128);
}

function decodedId(value: string, field: string, max: number): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); }
  catch { throw errors.validation(`${field} is invalid`); }
  return shortText(decoded, field, max);
}

function shortText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} is required`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > max || /[\r\n\0]/.test(normalized)) throw errors.validation(`${field} is invalid`);
  return normalized;
}

function objectField(value: JsonValue | undefined, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${field} must be a JSON object`);
  return value as JsonObject;
}

export default {
  async fetch(request: Request, env: TenantEnv): Promise<Response> {
    const url = new URL(request.url);
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? "r5-maintenance";
    try {
      const marketplaceCredentialResponse = await routeMarketplaceCredentialAdmin(request, url, env);
      if (marketplaceCredentialResponse) return marketplaceCredentialResponse;

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
        return jsonResponseFrom(response, { ...body, hooks: jsonSafe(hooks) });
      }

      if (request.method === "POST" && url.pathname === "/internal/maintenance") {
        // Core validates the internal-service credential and performs every existing
        // maintenance family with hook dispatch disabled. R5 then adds the shared
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
        const marketplace = await runMarketplaceMaintenanceExtension(env, tenantId);
        return jsonResponseFrom(response, {
          ...body,
          hooks,
          workplace: jsonSafe(workplace),
          marketplace: jsonSafe(marketplace),
        });
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