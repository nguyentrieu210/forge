import type { DomainEvent } from "../../../packages/contracts/src/index.js";

interface TenantRoute {
  tenant_id: string;
  worker_name: string;
  status: "active" | "suspended" | "provisioning";
  routing_version: number;
}

interface JobsEnv {
  JOBS_DB: D1Database;
  /** Legacy/local test binding. Production resolves the tenant script through ROUTES + DISPATCHER. */
  TENANT_CALLBACK?: Fetcher;
  ROUTES?: KVNamespace;
  DISPATCHER?: DispatchNamespace;
  INTERNAL_SERVICE_TOKEN: string;
}

export default {
  async queue(batch: MessageBatch<DomainEvent>, env: JobsEnv): Promise<void> {
    for (const message of batch.messages) {
      let eventId = "unknown";
      let tenantId = "unknown";
      try {
        const event = assertDomainEvent(message.body);
        eventId = event.event_id;
        tenantId = event.tenant_id;
        const existing = await env.JOBS_DB.prepare(
          "SELECT event_id FROM processed_events WHERE tenant_id=?1 AND event_id=?2",
        ).bind(event.tenant_id, event.event_id).first<{ event_id: string }>();
        if (existing) {
          message.ack();
          continue;
        }

        // Fail closed: an event is never marked processed unless a tenant worker
        // durably confirms the idempotent inbound-event write. The old optional
        // callback path could otherwise acknowledge and discard events when the
        // binding was missing.
        const callback = await resolveTenantCallback(env, event.tenant_id);
        const response = await callback.fetch("https://tenant.internal/internal/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${requireSecret(env.INTERNAL_SERVICE_TOKEN, "INTERNAL_SERVICE_TOKEN")}`,
            "x-cloudforge-tenant": event.tenant_id,
            "x-cloudforge-idempotency-key": event.event_id,
          },
          body: JSON.stringify(event),
        });
        if (!response.ok) throw new Error(`Tenant callback failed with ${response.status}`);
        if (response.headers.get("x-cloudforge-event-committed") !== event.event_id) {
          throw new Error("Tenant callback did not confirm idempotent commit");
        }

        await env.JOBS_DB.prepare(
          `INSERT INTO processed_events(tenant_id,event_id,event_type,processed_at)
           VALUES(?1,?2,?3,?4) ON CONFLICT(tenant_id,event_id) DO NOTHING`,
        ).bind(event.tenant_id, event.event_id, event.event_type, new Date().toISOString()).run();
        message.ack();
      } catch (error) {
        const delaySeconds = Math.min(300, 2 ** Math.min(message.attempts, 8));
        console.error(JSON.stringify({
          level: "error",
          service: "jobs-worker",
          code: "DOMAIN_EVENT_RETRY",
          tenant_id: tenantId,
          event_id: eventId,
          attempts: message.attempts,
          retry_delay_seconds: delaySeconds,
          error_name: error instanceof Error ? error.name : "UnknownError",
        }));
        message.retry({ delaySeconds });
      }
    }
  },

  /**
   * Runs each active tenant's periodic maintenance.
   *
   * This lives here, and not in the tenant Worker that owns the work, because a
   * Worker uploaded into a dispatch namespace never runs its own cron: it is only
   * reachable through the dispatcher. Its `triggers.crons` are accepted at deploy
   * time and silently ignored, so the tenant outbox filled up and nothing ever
   * drained it — no error, just events stuck at `pending` indefinitely.
   *
   * This Worker is deployed normally, so its cron does fire. It holds the only two
   * bindings needed to reach every tenant: the route index in KV and the dispatcher.
   */
  async scheduled(_controller: unknown, env: JobsEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sweepTenantMaintenance(env).then((result) => {
      const level = result.failed > 0 ? "warn" : "info";
      console.log(JSON.stringify({
        level,
        service: "jobs-worker",
        code: "TENANT_MAINTENANCE_SWEEP",
        swept: result.swept,
        failed: result.failed,
      }));
    }).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        service: "jobs-worker",
        code: "TENANT_MAINTENANCE_SWEEP_FAILED",
        error_name: error instanceof Error ? error.name : "UnknownError",
      }));
      throw error;
    }));
  },
};

/** Prefix of the reverse route index — see `tenantRouteIndexKey`. */
const TENANT_INDEX_PREFIX = "__tenant__:";

export async function sweepTenantMaintenance(env: JobsEnv): Promise<{ swept: number; failed: number }> {
  if (!env.ROUTES || !env.DISPATCHER) return { swept: 0, failed: 0 };
  let swept = 0;
  let failed = 0;
  let cursor: string | undefined;

  // Paginated, because a platform with more tenants than one KV page would
  // otherwise silently maintain only the first page of them.
  do {
    const page = await env.ROUTES.list({ prefix: TENANT_INDEX_PREFIX, ...(cursor ? { cursor } : {}) });
    for (const key of page.keys) {
      const raw = await env.ROUTES.get(key.name);
      if (!raw) continue;
      let route: TenantRoute;
      try {
        route = JSON.parse(raw) as TenantRoute;
      } catch {
        failed += 1;
        continue;
      }
      // A suspended tenant is deliberately left alone: draining its outbox would
      // deliver events for an account that is supposed to be inert.
      if (route.status !== "active" || !route.worker_name) continue;
      try {
        const response = await env.DISPATCHER.get(route.worker_name).fetch(
          "https://tenant.internal/internal/maintenance",
          {
            method: "POST",
            headers: {
              "authorization": `Bearer ${requireSecret(env.INTERNAL_SERVICE_TOKEN, "INTERNAL_SERVICE_TOKEN")}`,
              "x-cloudforge-tenant": route.tenant_id,
            },
          },
        );
        if (!response.ok) throw new Error(`maintenance returned ${response.status}`);
        swept += 1;
      } catch {
        // One unreachable tenant must not stop the others; the next tick retries it.
        failed += 1;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return { swept, failed };
}

export async function resolveTenantCallback(env: JobsEnv, tenantId: string): Promise<Fetcher> {
  if (env.TENANT_CALLBACK) return env.TENANT_CALLBACK;
  if (!env.ROUTES || !env.DISPATCHER) throw new Error("ROUTES and DISPATCHER bindings are required");

  // Control Plane maintains a reverse index because the public route key may be
  // a hostname while domain events carry only the trusted tenant id.
  const raw = await env.ROUTES.get(tenantRouteIndexKey(tenantId));
  if (!raw) throw new Error(`No dispatch route exists for tenant ${tenantId}`);
  let route: TenantRoute;
  try {
    route = JSON.parse(raw) as TenantRoute;
  } catch {
    throw new Error(`Dispatch route for tenant ${tenantId} is invalid JSON`);
  }
  if (route.tenant_id !== tenantId || !route.worker_name) throw new Error("Dispatch route tenant mismatch");
  if (route.status !== "active") throw new Error(`Tenant ${tenantId} is not active`);
  return env.DISPATCHER.get(route.worker_name);
}

export function tenantRouteIndexKey(tenantId: string): string {
  return `__tenant__:${tenantId}`;
}

export function assertDomainEvent(value: unknown): DomainEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid domain event");
  const event = value as Partial<DomainEvent>;
  if (
    typeof event.event_id !== "string" || !event.event_id
    || typeof event.tenant_id !== "string" || !event.tenant_id
    || typeof event.event_type !== "string" || !event.event_type
    || typeof event.command_id !== "string" || !event.command_id
    || typeof event.actor !== "string" || !event.actor
    || typeof event.occurred_at !== "string" || !event.occurred_at
    || event.schema_version !== 1
    || !event.aggregate || typeof event.aggregate.doctype !== "string" || typeof event.aggregate.name !== "string"
    || !Number.isInteger(event.aggregate_version) || (event.aggregate_version ?? 0) <= 0
    || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)
  ) {
    throw new Error("Invalid domain event");
  }
  return event as DomainEvent;
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
