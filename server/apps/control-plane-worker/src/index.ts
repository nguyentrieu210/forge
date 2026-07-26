
import { errorResponse, errors, jsonResponse, randomId, readJson, timingSafeEqualString } from "../../../packages/core/src/index.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { requireIdentifier, requireString } from "../../../packages/contracts/src/index.js";

interface ControlEnv {
  CONTROL_DB: D1Database;
  ROUTES: KVNamespace;
  CONTROL_TOKEN?: string;
}

const ROUTE_STATUSES = ["active", "suspended", "provisioning"] as const;
const ROUTE_PLANS = ["free", "pro", "enterprise"] as const;

interface TenantRouteRow {
  tenant_id: string;
  worker_name: string;
  status: (typeof ROUTE_STATUSES)[number];
  plan: (typeof ROUTE_PLANS)[number];
  routing_version: number;
}

export default {
  async fetch(request: Request, env: ControlEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      if (!env.CONTROL_TOKEN || !timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${env.CONTROL_TOKEN}`)) {
        return jsonResponse({ error: { code: "CONTROL_AUTH_REQUIRED" }, trace_id: traceId }, 401);
      }
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/v1/routes/rebuild-index") {
        const body = await readJson<JsonObject>(request, 4_000);
        const after = body.after_tenant_id === undefined ? "" : requireIdentifier(body.after_tenant_id, "after_tenant_id");
        const limitValue = body.limit === undefined ? 250 : body.limit;
        if (typeof limitValue !== "number" || !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 1_000) {
          throw errors.validation("limit must be an integer from 1 to 1000");
        }
        const page = await env.CONTROL_DB.prepare(
          `SELECT tenant_id, worker_name, status, plan, routing_version
           FROM tenant_routes WHERE tenant_id>?1 ORDER BY tenant_id ASC LIMIT ?2`,
        ).bind(after, limitValue + 1).all<TenantRouteRow>();
        const rows = page.results ?? [];
        const selected = rows.slice(0, limitValue);
        for (const row of selected) {
          await env.ROUTES.put(`__tenant__:${row.tenant_id}`, JSON.stringify({
            tenant_id: row.tenant_id,
            worker_name: row.worker_name,
            status: row.status,
            plan: row.plan,
            routing_version: row.routing_version,
          }));
        }
        return jsonResponse({
          rebuilt: selected.length,
          next_after_tenant_id: rows.length > limitValue ? selected.at(-1)?.tenant_id ?? null : null,
        });
      }
      if (request.method === "PUT" && url.pathname.startsWith("/v1/routes/")) {
        const routeKey = requireString(decodeURIComponent(url.pathname.slice("/v1/routes/".length)), "route_key", 253);
        const bodyObject = await readJson<JsonObject>(request, 16_000);
        const tenant_id = requireIdentifier(bodyObject.tenant_id, "tenant_id");
        const worker_name = requireIdentifier(bodyObject.worker_name, "worker_name");
        const status = requireString(bodyObject.status, "status", 32);
        if (!ROUTE_STATUSES.includes(status as (typeof ROUTE_STATUSES)[number])) throw errors.validation("status must be active, suspended or provisioning");
        const plan = bodyObject.plan === undefined ? undefined : requireString(bodyObject.plan, "plan", 32);
        if (plan !== undefined && !ROUTE_PLANS.includes(plan as (typeof ROUTE_PLANS)[number])) throw errors.validation("plan must be free, pro or enterprise");
        const body = { tenant_id, worker_name, status, ...(plan !== undefined ? { plan } : {}) };
        const now = new Date().toISOString();
        const current = await env.CONTROL_DB.prepare("SELECT tenant_id, routing_version FROM tenant_routes WHERE route_key=?1")
          .bind(routeKey).first<{ tenant_id: string; routing_version: number }>();

        /**
         * A tenant has exactly one route — `idx_tenant_routes_tenant` is UNIQUE, because
         * the reverse index `__tenant__:<id>` is one key and two routes would make it
         * ambiguous. So a PUT naming a route key this tenant does not currently hold is
         * unambiguously a MOVE: the tenant is changing hostname.
         *
         * Handled explicitly rather than left to the constraint. The bare insert failed
         * with `DATABASE_ERROR: Storage operation failed` — an opaque internal fault for
         * a condition the operator can act on, and one with no way out: without this,
         * a tenant's hostname could never be changed at all, and a wrong one would be
         * permanent.
         */
        const previous = await env.CONTROL_DB.prepare("SELECT route_key FROM tenant_routes WHERE tenant_id=?1 AND route_key<>?2")
          .bind(tenant_id, routeKey).first<{ route_key: string }>();
        let moved: string | null = null;
        if (previous?.route_key) {
          await env.CONTROL_DB.prepare("DELETE FROM tenant_routes WHERE route_key=?1").bind(previous.route_key).run();
          // The stale hostname must stop resolving to this tenant in the same breath,
          // or the old name keeps serving the tenant it was supposedly moved off.
          await env.ROUTES.delete(previous.route_key);
          moved = previous.route_key;
        }

        const version = (current?.routing_version ?? 0) + 1;
        await env.CONTROL_DB.prepare(
          `INSERT INTO tenant_routes(route_key, tenant_id, worker_name, status, plan, routing_version, modified_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(route_key) DO UPDATE SET tenant_id=excluded.tenant_id, worker_name=excluded.worker_name,
           status=excluded.status, plan=excluded.plan, routing_version=excluded.routing_version, modified_at=excluded.modified_at`,
        ).bind(routeKey, body.tenant_id, body.worker_name, body.status, body.plan ?? "free", version, now).run();
        const routeRecord = JSON.stringify({ ...body, routing_version: version });
        await env.ROUTES.put(routeKey, routeRecord);
        // Reverse index used by the Jobs Worker: domain events carry tenant_id,
        // while the public route key may be a hostname. Keep it in the same KV so
        // event delivery can resolve the correct dispatch script without trusting
        // event payload routing hints.
        if (current?.tenant_id && current.tenant_id !== tenant_id) {
          await env.ROUTES.delete(`__tenant__:${current.tenant_id}`);
        }
        await env.ROUTES.put(`__tenant__:${tenant_id}`, routeRecord);
        // `moved_from` is reported rather than left silent: deleting a hostname is not
        // something an operator should discover afterwards from a 404.
        return jsonResponse({ route_key: routeKey, routing_version: version, ...(moved ? { moved_from: moved } : {}) });
      }
      return jsonResponse({ error: { code: "ROUTE_NOT_FOUND" } }, 404);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};
