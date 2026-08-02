import {
  APP_CALLBACK_HEADER,
  D1UserStore,
  staticDevelopmentActor,
  verifyTrustedIdentity,
  type TrustedIdentityKey,
} from "../../../packages/auth/src/index.js";
import {
  assertSessionCsrf,
  establishSession,
  faultResponse,
  slideSession,
  type AuthRouteContext,
  type EstablishedSession,
} from "../../../packages/frappe-api/src/index.js";
import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { errorResponse, errors, randomId } from "../../../packages/core/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  MetadataPermissionService,
} from "../../../packages/frappe-model/src/index.js";
import coreWorker from "./index-core.js";
import {
  isDailyLedgerApiPath,
  isDailyLedgerFrappePath,
  routeDailyLedgerApi,
} from "./daily-ledger-api.js";
import {
  isManufacturingBomBulkApiPath,
  isManufacturingBomBulkFrappePath,
  routeManufacturingBomBulkApi,
} from "./manufacturing-bom-bulk-api.js";
import {
  isPhysicalStockApiPath,
  isPhysicalStockFrappePath,
  routePhysicalStockApi,
} from "./physical-stock-api.js";
import type { TenantEnv } from "./env.js";

export * from "./index-core.js";

interface InterceptedRouteAuthentication {
  actor: Actor;
  established?: EstablishedSession;
  authContext?: AuthRouteContext;
}

/**
 * Thin entrypoint wrapper for bounded authenticated report/operation routes.
 * Existing core routes and scheduled tasks remain delegated to index-core.ts.
 */
export default {
  async fetch(request: Request, env: TenantEnv, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const physicalStock = isPhysicalStockApiPath(url.pathname);
    const dailyLedger = isDailyLedgerApiPath(url.pathname);
    const manufacturingBomBulk = isManufacturingBomBulkApiPath(url.pathname);
    if (!physicalStock && !dailyLedger && !manufacturingBomBulk) return coreWorker.fetch(request, env);

    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const tenantId = resolveTenant(request, env);
      if (!tenantId) throw errors.authentication("Missing tenant context");
      const authentication = await authenticateInterceptedRoute(request, url, env, tenantId, traceId);
      const requestDb = (env.DB.withSession?.("first-primary") ?? env.DB) as D1Database;

      let response: Response | null;
      if (physicalStock) {
        const metadata = new D1MetadataStore(requestDb);
        const access = new D1DocumentAccessStore(requestDb);
        const permissions = new MetadataPermissionService(metadata, undefined, access);
        response = await routePhysicalStockApi(request, url, {
          db: requestDb,
          tenantId,
          actor: authentication.actor,
          permissions,
          traceId,
        });
      } else if (manufacturingBomBulk) {
        const metadata = new D1MetadataStore(requestDb);
        const access = new D1DocumentAccessStore(requestDb);
        const permissions = new MetadataPermissionService(metadata, undefined, access);
        response = await routeManufacturingBomBulkApi(request, url, {
          tenantId,
          actor: authentication.actor,
          permissions,
          traceId,
          findCanonicalRevisions: (document) => findBomRevisionsThroughCore(request, env, document),
          createCanonicalDraft: (document) => createBomDraftThroughCore(request, env, document),
        });
      } else {
        response = await routeDailyLedgerApi(request, url, {
          db: requestDb,
          tenantId,
          actor: authentication.actor,
          traceId,
        });
      }
      if (!response) return coreWorker.fetch(request, env);

      if (authentication.established && authentication.authContext) {
        const refreshed = await slideSession(authentication.established, authentication.authContext);
        if (refreshed) response.headers.append("set-cookie", refreshed);
      }
      return response;
    } catch (error) {
      return isPhysicalStockFrappePath(url.pathname)
        || isDailyLedgerFrappePath(url.pathname)
        || isManufacturingBomBulkFrappePath(url.pathname)
        ? faultResponse(error, traceId)
        : errorResponse(error, traceId);
    }
  },

  async scheduled(controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    await coreWorker.scheduled(controller, env, ctx);
  },
};

function resolveTenant(request: Request, env: TenantEnv): string | null {
  const routed = request.headers.get("x-cloudforge-tenant");
  if (env.TENANT_ID && routed && routed !== env.TENANT_ID) {
    throw errors.misconfigured("Tenant binding mismatch");
  }
  return env.TENANT_ID ?? routed;
}

async function authenticateInterceptedRoute(
  request: Request,
  url: URL,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<InterceptedRouteAuthentication> {
  if (!isPhysicalStockFrappePath(url.pathname)
    && !isDailyLedgerFrappePath(url.pathname)
    && !isManufacturingBomBulkFrappePath(url.pathname)) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  const sessionSecret = env.SESSION_SECRET;
  const appCallback = request.headers.get(APP_CALLBACK_HEADER);
  const users = new D1UserStore(env.DB);
  const authContext: AuthRouteContext = {
    tenantId,
    users,
    sessionSecret: sessionSecret ?? "",
    traceId,
    now: () => new Date().toISOString(),
    rateLimit: {
      db: env.DB,
      salt: env.INTERNAL_AUTH_SECRET,
      clientAddress: request.headers.get("CF-Connecting-IP") ?? "unknown",
    },
  };

  if (sessionSecret && !appCallback) {
    const established = await establishSession(request, authContext);
    if (established) {
      assertSessionCsrf(request, established);
      return { actor: established.actor, established, authContext };
    }
  }

  if (appCallback) {
    return { actor: await authenticateTrustedIdentity(request, env, tenantId, traceId) };
  }

  if (!sessionSecret && env.AUTH_MODE === "development") {
    return { actor: staticDevelopmentActor(env.DEV_ACTOR_JSON) };
  }

  throw errors.permission("Login to access this resource");
}

/**
 * Replay lookup follows the ordinary BOM list/get routes so User Permission scope and
 * document read rules are identical to Desk. The bulk path never scans D1 behind the
 * permission layer just because doing so would be convenient.
 */
async function findBomRevisionsThroughCore(request: Request, env: TenantEnv, document: JsonObject): Promise<JsonObject[]> {
  const company = text(document.company);
  const item = text(document.item);
  const revision = integer(document.revision);
  if (!company || !item || revision <= 0) throw errors.validation("Bulk BOM revision lookup requires company, item and revision");

  const listUrl = new URL(request.url);
  listUrl.pathname = `/api/resource/${encodeURIComponent("Bill of Materials")}`;
  listUrl.search = "";
  listUrl.searchParams.set("fields", JSON.stringify(["name", "docstatus"]));
  listUrl.searchParams.set("filters", JSON.stringify([
    ["company", "=", company],
    ["item", "=", item],
    ["revision", "=", revision],
  ]));
  listUrl.searchParams.set("limit_page_length", "3");
  const listResponse = await coreWorker.fetch(new Request(listUrl, {
    method: "GET",
    headers: forwardedHeaders(request),
  }), env);
  const listPayload = await requireCoreJson(listResponse, "BOM revision lookup");
  const rows = Array.isArray(listPayload.data) ? listPayload.data.filter(isJsonObject) : [];
  if (rows.length !== 1) return rows;

  const name = text(rows[0]!.name);
  if (!name) throw errors.database("Canonical BOM lookup returned a row without name");
  const docUrl = new URL(request.url);
  docUrl.pathname = `/api/resource/${encodeURIComponent("Bill of Materials")}/${encodeURIComponent(name)}`;
  docUrl.search = "";
  const docResponse = await coreWorker.fetch(new Request(docUrl, {
    method: "GET",
    headers: forwardedHeaders(request),
  }), env);
  const docPayload = await requireCoreJson(docResponse, "BOM replay read");
  return isJsonObject(docPayload.data) ? [docPayload.data] : [];
}

/**
 * Commit stays on the ordinary Frappe resource route. The bulk endpoint owns only
 * transport/replay coordination; the existing BOM controller remains the sole write
 * authority for naming, normalized UOM, checksums and lifecycle invariants.
 */
function createBomDraftThroughCore(request: Request, env: TenantEnv, document: JsonObject): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = `/api/resource/${encodeURIComponent("Bill of Materials")}`;
  url.search = "";
  const headers = forwardedHeaders(request);
  headers.set("content-type", "application/json");
  return coreWorker.fetch(new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(document),
  }), env);
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return headers;
}

async function requireCoreJson(response: Response, operation: string): Promise<JsonObject> {
  if (!response.ok) {
    if (response.status === 401) throw errors.authentication(`${operation} requires authentication`);
    if (response.status === 403) throw errors.permission(`${operation} is not permitted`);
    if (response.status === 404) return { data: [] };
    throw errors.database(`${operation} failed through the canonical resource API`);
  }
  try {
    const payload = await response.json() as unknown;
    if (isJsonObject(payload)) return payload;
  } catch {
    // Stable platform error below.
  }
  throw errors.database(`${operation} returned an invalid response`);
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function authenticateTrustedIdentity(
  request: Request,
  env: TenantEnv,
  tenantId: string,
  traceId: string,
): Promise<Actor> {
  if (env.AUTH_MODE === "development") return staticDevelopmentActor(env.DEV_ACTOR_JSON);
  const keys = trustedIdentityKeys(env);
  const identity = await verifyTrustedIdentity(request, {
    tenantId,
    traceId,
    ...(keys.length > 0 ? { keys } : { masterSecret: env.INTERNAL_AUTH_SECRET }),
  });
  return identity.actor;
}

function trustedIdentityKeys(env: TenantEnv): TrustedIdentityKey[] {
  const keys: TrustedIdentityKey[] = [];
  if (env.INTERNAL_AUTH_KEY_ID) {
    keys.push({ key_id: env.INTERNAL_AUTH_KEY_ID, secret: env.INTERNAL_AUTH_SECRET });
  }
  if (env.INTERNAL_AUTH_KEY_ID_PREVIOUS && env.INTERNAL_AUTH_SECRET_PREVIOUS) {
    keys.push({
      key_id: env.INTERNAL_AUTH_KEY_ID_PREVIOUS,
      secret: env.INTERNAL_AUTH_SECRET_PREVIOUS,
    });
  }
  return keys;
}
