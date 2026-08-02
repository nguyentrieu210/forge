import test from "node:test";
import assert from "node:assert/strict";
import {
  assertGovernedRouteMutation,
  nextRoutingVersion,
  routeAuditJson,
} from "../dist/apps/control-plane-worker/src/route-governance.js";

const ACTIVE = {
  route_key: "demo.example.com",
  tenant_id: "demo",
  worker_name: "cloudforge-tenant-demo",
  status: "active",
  plan: "pro",
  routing_version: 7,
};

function requested(overrides = {}) {
  return {
    route_key: ACTIVE.route_key,
    tenant_id: ACTIVE.tenant_id,
    worker_name: ACTIVE.worker_name,
    status: ACTIVE.status,
    plan: ACTIVE.plan,
    ...overrides,
  };
}

test("route governance allows idempotent replay without inventing a new reason", () => {
  const result = assertGovernedRouteMutation(ACTIVE, ACTIVE, requested(), "");
  assert.equal(result.changed, false);
  assert.equal(result.action, "route.update");
});

test("every effective route mutation requires an operator reason", () => {
  assert.throws(
    () => assertGovernedRouteMutation(ACTIVE, ACTIVE, requested({ plan: "enterprise" }), " "),
    /reason is required/,
  );
  assert.throws(
    () => assertGovernedRouteMutation(null, null, requested({ status: "provisioning" }), ""),
    /reason is required/,
  );
});

test("route lifecycle only permits forward provisioning and suspend-reactivate transitions", () => {
  const suspended = assertGovernedRouteMutation(ACTIVE, ACTIVE, requested({ status: "suspended" }), "security hold");
  assert.equal(suspended.action, "tenant.suspend");

  const suspendedRoute = { ...ACTIVE, status: "suspended" };
  const reactivated = assertGovernedRouteMutation(suspendedRoute, suspendedRoute, requested(), "incident cleared");
  assert.equal(reactivated.action, "tenant.reactivate");

  const provisioning = { ...ACTIVE, status: "provisioning" };
  assert.equal(
    assertGovernedRouteMutation(provisioning, provisioning, requested(), "provisioning complete").action,
    "route.update",
  );
  assert.throws(
    () => assertGovernedRouteMutation(ACTIVE, ACTIVE, requested({ status: "provisioning" }), "try to rewind"),
    /not allowed/,
  );
});

test("plan changes and hostname moves have explicit audit classifications", () => {
  assert.equal(
    assertGovernedRouteMutation(ACTIVE, ACTIVE, requested({ plan: "enterprise" }), "contract upgrade").action,
    "tenant.plan_change",
  );

  const moved = requested({ route_key: "new.example.com" });
  const move = assertGovernedRouteMutation(null, ACTIVE, moved, "approved domain move");
  assert.equal(move.action, "route.move");
});

test("a tenant cannot move onto a route key held by another tenant", () => {
  const other = { ...ACTIVE, tenant_id: "other" };
  assert.throws(
    () => assertGovernedRouteMutation(other, ACTIVE, requested(), "unsafe reassignment"),
    /already assigned/,
  );
});

test("routing version remains monotonic when the hostname changes", () => {
  assert.equal(nextRoutingVersion(null, ACTIVE), 8);
  assert.equal(nextRoutingVersion({ ...ACTIVE, routing_version: 11 }, ACTIVE), 12);
});

test("audit snapshots contain the complete governed routing contract", () => {
  assert.deepEqual(JSON.parse(routeAuditJson(ACTIVE)), ACTIVE);
  assert.equal(JSON.parse(routeAuditJson(requested({ plan: "enterprise" }), 8)).routing_version, 8);
});
