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
import { D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import type { ProductionPlanData, VersionedBomData } from "../../../packages/clouderp-erpnext/src/index.js";
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
  isManufacturingMrpApiPath,
  isManufacturingMrpFrappePath,
  routeManufacturingMrpApi,
} from "./manufacturing-mrp-api.js";
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
    const manufacturingMrp = isManufacturingMrpApiPath(url.pathname);
    if (!physicalStock && !dailyLedger && !manufacturingBomBulk && !manufacturingMrp) return coreWorker.fetch(request, env);

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
        const documents = new D1MutationStore(env.DB);
        response = await routeManufacturingBomBulkApi(request, url, {
          tenantId,
          actor: authentication.actor,
          permissions,
          traceId,
          findCanonicalRevisions: async (document) => {
            const company = text(document.company);
            const item = text(document.item);
            const revision = integer(document.revision);
            const all = await documents.listDocumentsByDoctype<JsonObject>(tenantId, "Bill of Materials");
            const matches = all.filter((candidate) => candidate.data.company === company
              && candidate.data.item === item
              && integer(candidate.data.revision) === revision);
            const readable = [];
            for (const candidate of matches) {
              if (await permissions.canReadDocument(authentication.actor, tenantId, candidate)) readable.push(candidate);
            }
            if (readable.length !== matches.length) throw errors.permission("A matching BOM revision is outside the current read scope");
            return readable.map((candidate) => ({
              name: candidate.name,
              docstatus: candidate.docstatus,
              status: candidate.status,
              ...candidate.data,
            }));
          },
          createCanonicalDraft: (document) => createDocumentThroughCore(request, env, "Bill of Materials", document),
        });
      } else if (manufacturingMrp) {
        const metadata = new D1MetadataStore(requestDb);
        const access = new D1DocumentAccessStore(requestDb);
        const permissions = new MetadataPermissionService(metadata, undefined, access);
        const documents = new D1MutationStore(env.DB);
        response = await routeManufacturingMrpApi(request, url, {
          tenantId,
          actor: authentication.actor,
          permissions,
          traceId,
          loadProductionPlan: (name) => documents.getDocument<ProductionPlanData>(tenantId, "Production Plan", name),
          listBomDocuments: () => documents.listDocumentsByDoctype<VersionedBomData>(tenantId, "Bill of Materials"),
          listMaterialRequests: () => documents.listDocumentsByDoctype<JsonObject>(tenantId, "Material Request"),
          createCanonicalMaterialRequest: (document) => createDocumentThroughCore(request, env, "Material Request", document),
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
        || isManufacturingMrpFrappePath(url.pathname)
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
    && !isManufacturingBomBulkFrappePath(url.pathname)
    && !isManufacturingMrpFrappePath(url.pathname)) {
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
 * Every bounded Manufacturing create still goes through the ordinary Frappe resource
 * route. The app endpoint owns planning/replay coordination, not document authority.
 */
function createDocumentThroughCore(request: Request, env: TenantEnv, doctype: string, document: JsonObject): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = `/api/resource/${encodeURIComponent(doctype)}`;
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

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function integer(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
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
