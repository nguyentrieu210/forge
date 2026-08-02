import { errors } from "../../../packages/core/src/index.js";

export const ROUTE_STATUSES = ["active", "suspended", "provisioning"] as const;
export const ROUTE_PLANS = ["free", "pro", "enterprise"] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];
export type RoutePlan = (typeof ROUTE_PLANS)[number];

export interface GovernedTenantRoute {
  route_key: string;
  tenant_id: string;
  worker_name: string;
  status: RouteStatus;
  plan: RoutePlan;
  routing_version: number;
}

export interface RequestedTenantRoute {
  route_key: string;
  tenant_id: string;
  worker_name: string;
  status: RouteStatus;
  plan: RoutePlan;
}

export type ControlRouteAuditAction =
  | "route.create"
  | "route.update"
  | "route.move"
  | "tenant.suspend"
  | "tenant.reactivate"
  | "tenant.plan_change";

const ALLOWED_STATUS_TRANSITIONS = new Set([
  "provisioning:active",
  "provisioning:suspended",
  "active:suspended",
  "suspended:active",
]);

export function assertGovernedRouteMutation(
  currentAtKey: GovernedTenantRoute | null,
  currentForTenant: GovernedTenantRoute | null,
  requested: RequestedTenantRoute,
  reason: string,
): { changed: boolean; action: ControlRouteAuditAction; baseline: GovernedTenantRoute | null } {
  const baseline = currentForTenant ?? currentAtKey;
  const normalizedReason = reason.trim();

  if (currentAtKey && currentAtKey.tenant_id !== requested.tenant_id) {
    throw errors.validation("Cannot move a tenant onto a route key already assigned to another tenant");
  }

  if (baseline && baseline.status !== requested.status) {
    const transition = `${baseline.status}:${requested.status}`;
    if (!ALLOWED_STATUS_TRANSITIONS.has(transition)) {
      throw errors.validation(`Tenant route status transition ${transition} is not allowed`);
    }
  }

  const changed = !baseline
    || baseline.route_key !== requested.route_key
    || baseline.tenant_id !== requested.tenant_id
    || baseline.worker_name !== requested.worker_name
    || baseline.status !== requested.status
    || baseline.plan !== requested.plan;

  if (changed && !normalizedReason) {
    throw errors.validation("reason is required for tenant route changes");
  }

  let action: ControlRouteAuditAction = "route.update";
  if (!baseline) action = "route.create";
  else if (baseline.route_key !== requested.route_key || baseline.tenant_id !== requested.tenant_id) action = "route.move";
  else if (baseline.status === "active" && requested.status === "suspended") action = "tenant.suspend";
  else if (baseline.status === "suspended" && requested.status === "active") action = "tenant.reactivate";
  else if (baseline.plan !== requested.plan) action = "tenant.plan_change";

  return { changed, action, baseline };
}

export function nextRoutingVersion(
  currentAtKey: GovernedTenantRoute | null,
  currentForTenant: GovernedTenantRoute | null,
): number {
  return Math.max(currentAtKey?.routing_version ?? 0, currentForTenant?.routing_version ?? 0) + 1;
}

export function routeAuditJson(route: GovernedTenantRoute | RequestedTenantRoute, routingVersion?: number): string {
  return JSON.stringify({
    route_key: route.route_key,
    tenant_id: route.tenant_id,
    worker_name: route.worker_name,
    status: route.status,
    plan: route.plan,
    routing_version: routingVersion ?? route.routing_version,
  });
}
