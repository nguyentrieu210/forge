CREATE TABLE IF NOT EXISTS control_route_audit_events (
  event_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'route.create',
    'route.update',
    'route.move',
    'tenant.suspend',
    'tenant.reactivate',
    'tenant.plan_change'
  )),
  tenant_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(json_valid(after_json)),
  CHECK(before_json IS NULL OR json_valid(before_json))
);

CREATE INDEX IF NOT EXISTS idx_control_route_audit_tenant_created
  ON control_route_audit_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_control_route_audit_route_created
  ON control_route_audit_events(route_key, created_at DESC);

CREATE TRIGGER IF NOT EXISTS control_route_audit_no_update
BEFORE UPDATE ON control_route_audit_events
BEGIN
  SELECT RAISE(ABORT, 'CONTROL_AUDIT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS control_route_audit_no_delete
BEFORE DELETE ON control_route_audit_events
BEGIN
  SELECT RAISE(ABORT, 'CONTROL_AUDIT_IMMUTABLE');
END;
