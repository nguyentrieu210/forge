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
      try {
        const event = assertDomainEvent(message.body);
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
      } catch {
        message.retry({ delaySeconds: Math.min(300, 2 ** Math.min(message.attempts, 8)) });
      }
    }
  },
};

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
